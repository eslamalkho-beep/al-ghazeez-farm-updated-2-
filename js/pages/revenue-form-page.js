// js/pages/revenue-form-page.js

let _editingRevenueId = null;
let _saleAnimals = [];
let _revenueCategoryAccountsCache = []; // حسابات الإيرادات القابلة للاختيار كبند (شجرة الحسابات — انظر CLAUDE.md)
let _loadedRevenue = null; // نحتفظ بالسجل الأصلي فقط لحفظ category/categoryAccountId كما هما لو بقي المستخدم على خيار "بند/حساب غير متاح حاليًا"

// حسابات "إيرادات بيع الحيوانات" (411*/412*) — يظهر حقل اختيار الحيوان عند اختيار أي ورقة تحت فرعي الأغنام/
// الماعز من شجرة الحسابات، بدل الفحص القديم بالكود الثابت 4000 (انظر isAnimalSaleAccount في accounting-service.js)
// ويُحدَّد البيع بربطه بحقل animalId، بدل مطابقة نص البند الهش القديم ('بيع حيوان')

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('revenues');
  renderSidebar('revenues');
  renderHeader('تكويد إيراد جديد');

  const _paramsForPermCheck = new URLSearchParams(window.location.search);
  const _requiredAction = _paramsForPermCheck.get('id') ? 'edit' : 'add';
  if (!hasActionPermission('revenues', _requiredAction)) {
    showToast(_paramsForPermCheck.get('id') ? 'ليس لديك صلاحية تعديل الإيرادات' : 'ليس لديك صلاحية إضافة إيراد', 'error');
    window.location.href = 'revenue-list.html';
    return;
  }

  _revenueCategoryAccountsCache = await getCategoryAccounts('revenue');
  document.getElementById('category').innerHTML = _revenueCategoryAccountsCache
    .map(a => `<option value="${a.id}">${a.code} - ${a.name}</option>`).join('');
  document.getElementById('category').addEventListener('change', _toggleAnimalField);
  document.getElementById('animalId').addEventListener('change', _applyAnimalTypeCategorySuggestion);

  const [clients, partners] = await Promise.all([getAllParties('client'), getAllParties('partner')]);
  const partySelect = document.getElementById('partyId');
  partySelect.innerHTML = `<option value="">-- اختر عميلاً مسجّلاً --</option>`
    + `<optgroup label="عملاء">${clients.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</optgroup>`
    + `<optgroup label="شركاء">${partners.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</optgroup>`;
  partySelect.addEventListener('change', _toggleClientManualField);

  const params = new URLSearchParams(window.location.search);
  const idParam = params.get('id');

  if (idParam) {
    _editingRevenueId = Number(idParam);
    await _loadRevenueIntoForm(_editingRevenueId);
    document.getElementById('form-title').textContent = 'تعديل إيراد';
    if (hasActionPermission('revenues', 'delete')) {
      document.getElementById('delete-btn').style.display = 'inline-flex';
    }
  } else {
    document.getElementById('date').value = todayIso();
    await _populateAnimalSelect();

    // قادم من بوابة "بيع حيوان" (herd/animal-sale.html) باختيار "بيع أصل" — تهيئة نوع الإيراد مسبقًا بدل
    // ترك المستخدم يختاره يدويًا من القائمة (يعمل فقط لو الحساب المُمرَّر بالكود لا يزال قابلاً للاختيار)
    const categoryCodeParam = params.get('categoryCode');
    const categorySelect = document.getElementById('category');
    const presetAccount = categoryCodeParam && _revenueCategoryAccountsCache.find(a => a.code === categoryCodeParam);
    if (presetAccount) {
      categorySelect.value = String(presetAccount.id);
    }
  }

  _toggleAnimalField();
  _toggleClientManualField();

  document.getElementById('amount').addEventListener('input', _updateTaxBreakdown);
  document.getElementById('hasTaxInvoice').addEventListener('change', _updateTaxBreakdown);
  _updateTaxBreakdown();

  document.getElementById('revenue-form').addEventListener('submit', _handleSubmit);
  document.getElementById('delete-btn').addEventListener('click', _handleDelete);
});

// لو المستخدم اختار عميلاً مسجّلاً، نعطّل الحقل اليدوي (العميل المسجّل هو المصدر)
function _toggleClientManualField() {
  const hasParty = !!document.getElementById('partyId').value;
  const manualInput = document.getElementById('client');
  manualInput.disabled = hasParty;
  if (hasParty) manualInput.value = '';
}

function _updateTaxBreakdown() {
  const group = document.getElementById('tax-breakdown-group');
  if (document.getElementById('hasTaxInvoice').value !== 'yes') {
    group.style.display = 'none';
    return;
  }
  const { amountBeforeTax, taxAmount } = calculateTaxBreakdown(document.getElementById('amount').value);
  document.getElementById('tax-before-label').textContent = formatCurrency(amountBeforeTax);
  document.getElementById('tax-value-label').textContent = formatCurrency(taxAmount);
  group.style.display = '';
}

async function _populateAnimalSelect(selectedAnimalId = null) {
  const allAnimals = await getAllAnimals();
  _saleAnimals = allAnimals.filter(a => a.status === 'alive' || a.id === selectedAnimalId);

  const select = document.getElementById('animalId');
  select.innerHTML = _saleAnimals.length
    ? _saleAnimals.map(a => `<option value="${a.id}">${a.code} — ${ANIMAL_TYPE_LABELS[a.type] || a.type} (${a.breed})</option>`).join('')
    : `<option value="">لا توجد حيوانات متاحة للبيع</option>`;

  if (selectedAnimalId) select.value = String(selectedAnimalId);
}

// عند اختيار حيوان: يُقترح بند الإيراد تلقائيًا حسب نوع الحيوان من "ربط العمليات بالحسابات"
// (animalSaleSheep/animalSaleGoat — الافتراضي مبيعات أغنام/ماعز)، بشرط أن يكون البند الحالي بند بيع حيوان
// أو فارغًا — أي اختيار يدوي سابق لبند آخر يُحترم ولا يُتجاوز
async function _applyAnimalTypeCategorySuggestion() {
  if (_editingRevenueId) return; // تعديل سجل قائم: لا نغيّر البند المحفوظ
  const animalSelect = document.getElementById('animalId');
  const categorySelect = document.getElementById('category');
  const animal = _saleAnimals.find(a => a.id === Number(animalSelect.value));
  if (!animal) return;

  const currentSelected = _revenueCategoryAccountsCache.find(a => a.id === Number(categorySelect.value));
  const isAnimalSaleSelected = !categorySelect.value || (currentSelected && isAnimalSaleAccount(currentSelected));
  if (!isAnimalSaleSelected) return; // المستخدم اختار بندًا غير بيع الحيوانات يدويًا — نحترمه

  const mappings = await loadAccountMappings();
  const suggestedCode = resolveMappedAccountCode(animal.type === 'goat' ? 'animalSaleGoat' : 'animalSaleSheep', mappings);
  const suggestedAccount = suggestedCode && _revenueCategoryAccountsCache.find(a => a.code === suggestedCode);
  if (suggestedAccount) {
    categorySelect.value = String(suggestedAccount.id);
    _toggleAnimalField();
  }
}

// هل الحساب المختار حاليًا من حسابات "إيرادات بيع الحيوانات" (411*/412*)؟ نفس الفحص يُستخدم في
// _toggleAnimalField و_handleSubmit (انظر isAnimalSaleAccount في accounting-service.js)
function _isAnimalSaleAccountSelected() {
  const selectedId = Number(document.getElementById('category').value);
  const selectedAccount = _revenueCategoryAccountsCache.find(a => a.id === selectedId);
  return isAnimalSaleAccount(selectedAccount);
}

function _toggleAnimalField() {
  document.getElementById('animal-field-group').style.display = _isAnimalSaleAccountSelected() ? '' : 'none';
}

async function _loadRevenueIntoForm(id) {
  const revenue = await dbGet('Revenues', id);
  if (!revenue) {
    showToast('لم يتم العثور على الإيراد', 'error');
    window.location.href = 'revenue-list.html';
    return;
  }
  _loadedRevenue = revenue;
  const categorySelect = document.getElementById('category');
  const categoryMatched = revenue.categoryAccountId && _revenueCategoryAccountsCache.some(a => a.id === revenue.categoryAccountId);
  if (categoryMatched) {
    categorySelect.value = String(revenue.categoryAccountId);
  } else {
    const opt = document.createElement('option');
    opt.value = '-1';
    opt.textContent = `${revenue.category || 'بند غير معروف'} (بند/حساب غير متاح حاليًا)`;
    categorySelect.prepend(opt);
    categorySelect.value = '-1';
  }
  document.getElementById('amount').value = revenue.amount ?? '';
  document.getElementById('date').value = revenue.date || '';
  document.getElementById('hasTaxInvoice').value = revenue.hasTaxInvoice ? 'yes' : 'no';
  document.getElementById('receiveMethod').value = revenue.receiveMethod || 'cash';
  const partySelect = document.getElementById('partyId');
  partySelect.value = revenue.partyId || '';
  const partyStillExists = partySelect.value === String(revenue.partyId || '');
  document.getElementById('client').value = (revenue.partyId && partyStillExists) ? '' : (revenue.client || '');
  document.getElementById('notes').value = revenue.notes || '';
  await _populateAnimalSelect(revenue.animalId || null);
}

async function _handleSubmit(e) {
  e.preventDefault();

  const isSale = _isAnimalSaleAccountSelected();

  const validations = [
    { fieldId: 'amount', validatorFn: isPositiveNumber, message: 'أدخل مبلغًا صحيحًا' },
    { fieldId: 'date', validatorFn: isValidDate, message: 'التاريخ مطلوب' },
  ];
  if (isSale) {
    validations.push({ fieldId: 'animalId', validatorFn: isRequired, message: 'يرجى اختيار الحيوان' });
  }

  const isValid = validateForm(validations);
  if (!isValid) return;

  const isCredit = document.getElementById('receiveMethod').value === 'credit';
  if (isCredit && !document.getElementById('partyId').value) {
    showToast('البيع الآجل يتطلب اختيار عميل أو شريك مسجّل (ليُحسب له كذمة مدينة)', 'error');
    return;
  }

  const animalIdValue = document.getElementById('animalId').value;
  const newAnimalId = isSale && animalIdValue ? Number(animalIdValue) : null;

  const hasTaxInvoice = document.getElementById('hasTaxInvoice').value === 'yes';
  const amount = Number(document.getElementById('amount').value);
  const { amountBeforeTax, taxAmount } = hasTaxInvoice
    ? calculateTaxBreakdown(amount)
    : { amountBeforeTax: null, taxAmount: null };

  const partyIdValue = document.getElementById('partyId').value;
  const partyId = partyIdValue ? Number(partyIdValue) : null;
  const selectedPartyName = partyId ? document.getElementById('partyId').selectedOptions[0].textContent : '';
  const client = partyId ? selectedPartyName : document.getElementById('client').value.trim();

  const categoryAccountIdValue = Number(document.getElementById('category').value);
  const selectedCategoryAccount = _revenueCategoryAccountsCache.find(a => a.id === categoryAccountIdValue);
  // القيمة -1 (بند/حساب محذوف) تعني إبقاء البند كما كان بلا تعديل — انظر _loadRevenueIntoForm
  const category = selectedCategoryAccount ? selectedCategoryAccount.name : (_loadedRevenue ? _loadedRevenue.category : '');
  const categoryAccountId = selectedCategoryAccount ? selectedCategoryAccount.id : (_loadedRevenue ? _loadedRevenue.categoryAccountId : null);

  const data = {
    category,
    categoryAccountId,
    amount,
    date: document.getElementById('date').value,
    hasTaxInvoice,
    amountBeforeTax,
    taxAmount,
    receiveMethod: document.getElementById('receiveMethod').value,
    partyId,
    client,
    notes: document.getElementById('notes').value.trim(),
    animalId: newAnimalId,
  };

  // قفل الفترات المحاسبية: يمنع الحفظ لو تاريخ السجل الأصلي (عند التعديل) أو التاريخ الجديد المُدخَل ضمن فترة مغلقة
  if (_loadedRevenue && !(await guardPeriodOpenForSave(_loadedRevenue.date))) return;
  if (!(await guardPeriodOpenForSave(data.date))) return;

  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'جاري الحفظ...';

  try {
    let previousAnimalId = null;
    let savedRevenueId = _editingRevenueId;
    if (_editingRevenueId) {
      const existing = await dbGet('Revenues', _editingRevenueId);
      previousAnimalId = existing ? existing.animalId : null;
      await updateRevenue(_editingRevenueId, data);
    } else {
      savedRevenueId = await createRevenue(data);
    }

    if (previousAnimalId && previousAnimalId !== newAnimalId) {
      await updateAnimal(previousAnimalId, { status: 'alive' });
    }
    if (newAnimalId) {
      await updateAnimal(newAnimalId, { status: 'sold' });
    }

    await syncRevenueJournalEntry(savedRevenueId);

    showToast('تم الحفظ بنجاح', 'success');
    setTimeout(() => { window.location.href = 'revenue-list.html'; }, 400);
  } catch (err) {
    showToast('حدث خطأ أثناء الحفظ', 'error');
    saveBtn.disabled = false;
    saveBtn.textContent = 'حفظ';
  }
}

async function _handleDelete() {
  const existingForGuard = await dbGet('Revenues', _editingRevenueId);
  if (existingForGuard && !(await guardPeriodOpenForSave(existingForGuard.date))) return;

  confirmDelete('هل أنت متأكد من حذف هذا الإيراد؟ سيُحذف أيضًا القيد المحاسبي المرتبط به إن وُجد.', async () => {
    const existing = await dbGet('Revenues', _editingRevenueId);
    await reverseRevenueJournalEntry(_editingRevenueId);
    await deleteRevenue(_editingRevenueId);
    if (existing && existing.animalId) {
      await updateAnimal(existing.animalId, { status: 'alive' });
    }
    showToast('تم الحذف بنجاح', 'success');
    setTimeout(() => { window.location.href = 'revenue-list.html'; }, 400);
  });
}
