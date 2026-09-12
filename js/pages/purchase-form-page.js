// js/pages/purchase-form-page.js

let _editingPurchaseId = null;
let _purchaseCategoryAccountsCache = []; // أوراق فرع "113 المخزون" فقط القابلة للترحيل (انظر getPurchaseCategoryAccounts في accounting-service.js) — قابلة للاختيار كبند مشتريات
let _loadedPurchase = null; // نحتفظ بالسجل الأصلي فقط لحفظ category/categoryAccountId كما هما لو بقي المستخدم على خيار "بند/حساب غير متاح حاليًا"
let _allInventoryItemsForPurchase = []; // لربط المشترى بصنف مخزون فعلي (حركة "وارد" تلقائية)، نفس مبدأ expense-form-page.js

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('purchases');
  renderSidebar('purchases');
  renderHeader('تكويد مشترى جديد');

  const _paramsForPermCheck = new URLSearchParams(window.location.search);
  const _requiredAction = _paramsForPermCheck.get('id') ? 'edit' : 'add';
  if (!hasActionPermission('purchases', _requiredAction)) {
    showToast(_paramsForPermCheck.get('id') ? 'ليس لديك صلاحية تعديل المشتريات' : 'ليس لديك صلاحية إضافة مشترى', 'error');
    window.location.href = 'purchase-list.html';
    return;
  }

  // بنود المشتريات مقصورة على فرع "113 المخزون" فقط (أعلاف/أدوية ومستلزمات بيطرية/مواد ومستلزمات المزرعة) —
  // قرار عمل نهائي: كل مشترى يُرسمَل كأصل مخزون، لا كمصروف فوري (بعكس ما كان قبل ذلك)
  _purchaseCategoryAccountsCache = await getPurchaseCategoryAccounts();
  document.getElementById('category').innerHTML = _purchaseCategoryAccountsCache
    .map(a => `<option value="${a.id}">${a.code} - ${a.name}</option>`).join('');

  const [suppliers, partners] = await Promise.all([getAllParties('supplier'), getAllParties('partner')]);
  const partySelect = document.getElementById('partyId');
  partySelect.innerHTML = `<option value="">-- اختر موردًا مسجّلاً --</option>`
    + `<optgroup label="موردون">${suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}</optgroup>`
    + `<optgroup label="شركاء">${partners.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</optgroup>`;
  partySelect.addEventListener('change', _toggleVendorManualField);

  _allInventoryItemsForPurchase = await getAllInventoryItems();
  const itemSelect = document.getElementById('linkedInventoryItemId');
  itemSelect.innerHTML = `<option value="">-- بدون ربط بالمخزون --</option>` +
    _allInventoryItemsForPurchase.map(i => `<option value="${i.id}">${i.name} (${i.unit || '-'})</option>`).join('');
  itemSelect.addEventListener('change', _toggleLinkedQuantityField);

  const params = new URLSearchParams(window.location.search);
  const idParam = params.get('id');

  if (idParam) {
    _editingPurchaseId = Number(idParam);
    await _loadPurchaseIntoForm(_editingPurchaseId);

    // دورة الاعتماد: مشترى معتمد لا يُعدَّل/يُحذف إلا بصلاحية "اعتماد" (نفس مبدأ expense-form-page.js)
    if (_loadedPurchase.status === 'approved' && !hasActionPermission('purchases', 'approve')) {
      showToast('هذه العملية معتمدة ولا يمكن تعديلها إلا بصلاحية الاعتماد', 'error');
      window.location.href = 'purchase-list.html';
      return;
    }

    document.getElementById('form-title').textContent = 'تعديل مشترى';
    if (hasActionPermission('purchases', 'delete') && (_loadedPurchase.status !== 'approved' || hasActionPermission('purchases', 'approve'))) {
      document.getElementById('delete-btn').style.display = 'inline-flex';
    }
  } else {
    document.getElementById('date').value = todayIso();
  }

  // بلا صلاحية "اعتماد" يبقى الحقل معطّلاً بقيمته الحالية — نفس منطق expense-form-page.js
  if (!hasActionPermission('purchases', 'approve')) {
    const statusSelect = document.getElementById('status');
    if (!idParam) statusSelect.value = 'pending';
    statusSelect.disabled = true;
  }

  document.getElementById('amount').addEventListener('input', _updateTaxBreakdown);
  document.getElementById('hasTaxInvoice').addEventListener('change', _updateTaxBreakdown);
  _updateTaxBreakdown();
  _toggleVendorManualField();
  _toggleLinkedQuantityField();

  document.getElementById('purchase-form').addEventListener('submit', _handleSubmit);
  document.getElementById('delete-btn').addEventListener('click', _handleDelete);
});

// لو المستخدم اختار موردًا مسجّلاً، نعطّل الحقل اليدوي (المورّد المسجّل هو المصدر)
function _toggleVendorManualField() {
  const hasParty = !!document.getElementById('partyId').value;
  const manualInput = document.getElementById('vendor');
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

// نفس مبدأ _toggleLinkedQuantityField في expense-form-page.js — يظهر حقل الكمية فقط عند اختيار صنف مخزون،
// ويعرض رصيده الحالي (إعلامي فقط) كتذكير بما هو موجود فعلًا في المخزن قبل تسجيل الوارد الجديد
async function _toggleLinkedQuantityField() {
  const itemSelect = document.getElementById('linkedInventoryItemId');
  const hasItem = !!itemSelect.value;
  document.getElementById('linked-quantity-group').style.display = hasItem ? '' : 'none';
  if (!hasItem) {
    document.getElementById('linkedQuantity').value = '';
    document.getElementById('linked-item-stock-hint').textContent = '';
    return;
  }
  const item = _allInventoryItemsForPurchase.find(i => i.id === Number(itemSelect.value));
  if (item) {
    const movements = await getAllInventoryMovements(item.id);
    const { currentQty } = computeItemStockLevel(item, movements);
    document.getElementById('linked-item-stock-hint').textContent = `الرصيد الحالي: ${formatNumber(currentQty)} ${item.unit || ''}`;
  }
}

async function _loadPurchaseIntoForm(id) {
  const purchase = await dbGet('Purchases', id);
  if (!purchase) {
    showToast('لم يتم العثور على المشترى', 'error');
    window.location.href = 'purchase-list.html';
    return;
  }
  _loadedPurchase = purchase;
  const categorySelect = document.getElementById('category');
  const categoryMatched = purchase.categoryAccountId && _purchaseCategoryAccountsCache.some(a => a.id === purchase.categoryAccountId);
  if (categoryMatched) {
    categorySelect.value = String(purchase.categoryAccountId);
  } else {
    const opt = document.createElement('option');
    opt.value = '-1';
    opt.textContent = `${purchase.category || 'بند غير معروف'} (بند/حساب غير متاح حاليًا)`;
    categorySelect.prepend(opt);
    categorySelect.value = '-1';
  }
  document.getElementById('amount').value = purchase.amount ?? '';
  document.getElementById('date').value = purchase.date || '';
  document.getElementById('hasTaxInvoice').value = purchase.hasTaxInvoice ? 'yes' : 'no';
  document.getElementById('paymentMethod').value = purchase.paymentMethod || 'cash';
  const partySelect = document.getElementById('partyId');
  partySelect.value = purchase.partyId || '';
  const partyStillExists = partySelect.value === String(purchase.partyId || '');
  document.getElementById('vendor').value = (purchase.partyId && partyStillExists) ? '' : (purchase.vendor || '');
  document.getElementById('status').value = purchase.status || 'approved';
  document.getElementById('notes').value = purchase.notes || '';

  document.getElementById('linkedInventoryItemId').value = purchase.linkedInventoryItemId || '';
  document.getElementById('linkedQuantity').value = purchase.linkedQuantity ?? '';
  await _toggleLinkedQuantityField();
}

async function _handleSubmit(e) {
  e.preventDefault();

  const linkedItemIdValue = document.getElementById('linkedInventoryItemId').value;

  const validations = [
    { fieldId: 'amount', validatorFn: isPositiveNumber, message: 'أدخل مبلغًا صحيحًا' },
    { fieldId: 'date', validatorFn: isValidDate, message: 'التاريخ مطلوب' },
  ];
  if (linkedItemIdValue) {
    validations.push({ fieldId: 'linkedQuantity', validatorFn: (v) => Number(v) > 0, message: 'أدخل كمية صحيحة' });
  }
  const isValid = validateForm(validations);
  if (!isValid) return;

  const isCredit = document.getElementById('paymentMethod').value === 'credit';
  if (isCredit && !document.getElementById('partyId').value) {
    showToast('الشراء الآجل يتطلب اختيار مورّد أو شريك مسجّل (ليُحسب له كذمة دائنة)', 'error');
    return;
  }

  const hasTaxInvoice = document.getElementById('hasTaxInvoice').value === 'yes';
  const amount = Number(document.getElementById('amount').value);
  const { amountBeforeTax, taxAmount } = hasTaxInvoice
    ? calculateTaxBreakdown(amount)
    : { amountBeforeTax: null, taxAmount: null };

  const partyIdValue = document.getElementById('partyId').value;
  const partyId = partyIdValue ? Number(partyIdValue) : null;
  const selectedPartyName = partyId ? document.getElementById('partyId').selectedOptions[0].textContent : '';
  const vendor = partyId ? selectedPartyName : document.getElementById('vendor').value.trim();

  const categoryAccountIdValue = Number(document.getElementById('category').value);
  const selectedCategoryAccount = _purchaseCategoryAccountsCache.find(a => a.id === categoryAccountIdValue);
  // القيمة -1 (بند/حساب محذوف) تعني إبقاء البند كما كان بلا تعديل — انظر _loadPurchaseIntoForm
  const category = selectedCategoryAccount ? selectedCategoryAccount.name : (_loadedPurchase ? _loadedPurchase.category : '');
  const categoryAccountId = selectedCategoryAccount ? selectedCategoryAccount.id : (_loadedPurchase ? _loadedPurchase.categoryAccountId : null);

  const data = {
    category,
    categoryAccountId,
    amount,
    date: document.getElementById('date').value,
    hasTaxInvoice,
    amountBeforeTax,
    taxAmount,
    paymentMethod: document.getElementById('paymentMethod').value,
    partyId,
    vendor,
    status: document.getElementById('status').value,
    notes: document.getElementById('notes').value.trim(),
    linkedInventoryItemId: linkedItemIdValue ? Number(linkedItemIdValue) : null,
    linkedQuantity: linkedItemIdValue ? Number(document.getElementById('linkedQuantity').value) : null,
  };

  // قفل الفترات المحاسبية: يمنع الحفظ لو تاريخ السجل الأصلي (عند التعديل) أو التاريخ الجديد المُدخَل ضمن فترة مغلقة
  if (_loadedPurchase && !(await guardPeriodOpenForSave(_loadedPurchase.date))) return;
  if (!(await guardPeriodOpenForSave(data.date))) return;

  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'جاري الحفظ...';

  try {
    let savedPurchaseId = _editingPurchaseId;
    if (_editingPurchaseId) {
      await updatePurchase(_editingPurchaseId, data);
    } else {
      savedPurchaseId = await createPurchase(data);
    }

    await _syncPurchaseInventoryLink(savedPurchaseId, data);
    await syncPurchaseJournalEntry(savedPurchaseId);

    showToast('تم الحفظ بنجاح', 'success');
    setTimeout(() => { window.location.href = 'purchase-list.html'; }, 400);
  } catch (err) {
    showToast('حدث خطأ أثناء الحفظ', 'error');
    saveBtn.disabled = false;
    saveBtn.textContent = 'حفظ';
  }
}

// ينشئ/يحدّث/يحذف حركة المخزون المرتبطة بهذا المشترى بما يطابق حالة الربط الحالية — نفس مبدأ
// _syncExpenseInventoryLink في expense-form-page.js تمامًا، لكن دومًا حركة "وارد" (شراء يزيد رصيد المخزن)
async function _syncPurchaseInventoryLink(purchaseId, data) {
  const existingMovement = await getInventoryMovementByPurchaseId(purchaseId);

  if (!data.linkedInventoryItemId) {
    if (existingMovement) await deleteInventoryMovement(existingMovement.id);
    return;
  }

  const unitCost = data.linkedQuantity ? Math.round((data.amount / data.linkedQuantity) * 100) / 100 : null;
  const movementData = {
    itemId: data.linkedInventoryItemId,
    direction: 'in',
    quantity: data.linkedQuantity,
    date: data.date,
    reasonType: 'purchase',
    unitCost,
    notes: `مرتبط تلقائيًا بمشترى رقم ${purchaseId}`,
    relatedPurchaseId: purchaseId,
  };

  if (existingMovement) {
    await updateInventoryMovement(existingMovement.id, movementData);
  } else {
    await createInventoryMovement(movementData);
  }
}

async function _handleDelete() {
  if (_loadedPurchase && !(await guardPeriodOpenForSave(_loadedPurchase.date))) return;

  confirmDelete('هل أنت متأكد من حذف هذا المشترى؟ ستُحذف أيضًا حركة المخزون والقيد المحاسبي المرتبطان به إن وُجدا.', async () => {
    const existingMovement = await getInventoryMovementByPurchaseId(_editingPurchaseId);
    if (existingMovement) await deleteInventoryMovement(existingMovement.id);
    await reversePurchaseJournalEntry(_editingPurchaseId);
    await deletePurchase(_editingPurchaseId);
    showToast('تم الحذف بنجاح', 'success');
    setTimeout(() => { window.location.href = 'purchase-list.html'; }, 400);
  });
}
