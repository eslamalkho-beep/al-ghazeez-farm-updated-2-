// js/pages/expense-form-page.js

let _editingExpenseId = null;
let _expenseCategoryAccountsCache = []; // حسابات المصروفات القابلة للاختيار كبند (شجرة الحسابات — انظر CLAUDE.md)
let _loadedExpense = null; // نحتفظ بالسجل الأصلي فقط لحفظ category/categoryAccountId كما هما لو بقي المستخدم على خيار "بند/حساب غير متاح حاليًا"
let _allInventoryItemsForExpense = []; // لعرض رصيد الصنف الحالي عند الربط بالمخزون (وارد/صادر)

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('expenses');
  renderSidebar('expenses');
  renderHeader('تكويد مصروف جديد');

  const params = new URLSearchParams(window.location.search);
  const idParam = params.get('id');

  const requiredAction = idParam ? 'edit' : 'add';
  if (!hasActionPermission('expenses', requiredAction)) {
    showToast(idParam ? 'ليس لديك صلاحية تعديل المصروفات' : 'ليس لديك صلاحية إضافة مصروف', 'error');
    window.location.href = 'expense-list.html';
    return;
  }

  _expenseCategoryAccountsCache = await getCategoryAccounts('expense');
  document.getElementById('category').innerHTML = _expenseCategoryAccountsCache
    .map(a => `<option value="${a.id}">${a.code} - ${a.name}</option>`).join('');

  _allInventoryItemsForExpense = await getAllInventoryItems();
  const itemSelect = document.getElementById('linkedInventoryItemId');
  itemSelect.innerHTML = `<option value="">-- بدون ربط بالمخزون --</option>` +
    _allInventoryItemsForExpense.map(i => `<option value="${i.id}">${i.name} (${i.unit || '-'})</option>`).join('');
  itemSelect.addEventListener('change', _toggleLinkedQuantityField);

  const fatteningBatches = await getAllFatteningBatches();
  const activeFatteningBatches = fatteningBatches.filter(b => b.status === 'active');
  const batchSelect = document.getElementById('linkedFatteningBatchId');
  batchSelect.innerHTML = `<option value="">-- بدون ربط بدفعة تسمين --</option>` +
    activeFatteningBatches.map(b => `<option value="${b.id}">${b.batchNumber} — ${formatDateArabic(b.startDate)}${b.notes ? ' (' + b.notes + ')' : ''}</option>`).join('');

  const aliveAnimals = (await getAllAnimals()).filter(a => a.status === 'alive');
  const animalSelect = document.getElementById('linkedAnimalId');
  animalSelect.innerHTML = `<option value="">-- بدون ربط بحيوان --</option>` +
    aliveAnimals.map(a => `<option value="${a.id}">${a.code} — ${ANIMAL_TYPE_LABELS[a.type] || a.type} (${a.breed || '-'})</option>`).join('');

  if (idParam) {
    _editingExpenseId = Number(idParam);
    await _loadExpenseIntoForm(_editingExpenseId);

    // دورة الاعتماد: مصروف معتمد لا يُعدَّل/يُحذف إلا بصلاحية "اعتماد" (نفس من يملك التراجع عن الاعتماد أصلاً)
    if (_loadedExpense.status === 'approved' && !hasActionPermission('expenses', 'approve')) {
      showToast('هذه العملية معتمدة ولا يمكن تعديلها إلا بصلاحية الاعتماد', 'error');
      window.location.href = 'expense-list.html';
      return;
    }

    document.getElementById('form-title').textContent = 'تعديل مصروف';
    if (hasActionPermission('expenses', 'delete') && (_loadedExpense.status !== 'approved' || hasActionPermission('expenses', 'approve'))) {
      document.getElementById('delete-btn').style.display = 'inline-flex';
    }
  } else {
    document.getElementById('date').value = todayIso();
  }

  // بلا صلاحية "اعتماد" يبقى الحقل معطّلاً بقيمته الحالية (أو "قيد الاعتماد" افتراضيًا لمصروف جديد) —
  // القيمة تبقى تُقرأ عبر .value رغم التعطيل عند الحفظ (_handleSubmit)، فلا حاجة لأي تعديل هناك
  if (!hasActionPermission('expenses', 'approve')) {
    const statusSelect = document.getElementById('status');
    if (!idParam) statusSelect.value = 'pending';
    statusSelect.disabled = true;
  }

  document.getElementById('amount').addEventListener('input', _updateTaxBreakdown);
  document.getElementById('hasTaxInvoice').addEventListener('change', _updateTaxBreakdown);
  _updateTaxBreakdown();
  _toggleLinkedQuantityField();

  document.getElementById('expense-form').addEventListener('submit', _handleSubmit);
  document.getElementById('delete-btn').addEventListener('click', _handleDelete);
});

// نفس مبدأ _toggleLinkedQuantityField في purchase-form-page.js — يظهر حقل الكمية/نوع الحركة فقط عند اختيار
// صنف، ويعرض رصيده الحالي (إعلامي فقط) كتذكير قبل تسجيل حركة وارد (شراء) أو صادر (استهلاك)
async function _toggleLinkedQuantityField() {
  const itemSelect = document.getElementById('linkedInventoryItemId');
  const hasItem = !!itemSelect.value;
  document.getElementById('linked-quantity-group').style.display = hasItem ? '' : 'none';
  if (!hasItem) {
    document.getElementById('linkedQuantity').value = '';
    document.getElementById('linked-item-stock-hint').textContent = '';
    return;
  }
  const item = _allInventoryItemsForExpense.find(i => i.id === Number(itemSelect.value));
  if (item) {
    const movements = await getAllInventoryMovements(item.id);
    const { currentQty } = computeItemStockLevel(item, movements);
    document.getElementById('linked-item-stock-hint').textContent = `الرصيد الحالي: ${formatNumber(currentQty)} ${item.unit || ''}`;
  }
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

async function _loadExpenseIntoForm(id) {
  const expense = await dbGet('Expenses', id);
  if (!expense) {
    showToast('لم يتم العثور على المصروف', 'error');
    window.location.href = 'expense-list.html';
    return;
  }
  _loadedExpense = expense;
  const categorySelect = document.getElementById('category');
  const categoryMatched = expense.categoryAccountId && _expenseCategoryAccountsCache.some(a => a.id === expense.categoryAccountId);
  if (categoryMatched) {
    categorySelect.value = String(expense.categoryAccountId);
  } else {
    const opt = document.createElement('option');
    opt.value = '-1';
    opt.textContent = `${expense.category || 'بند غير معروف'} (بند/حساب غير متاح حاليًا)`;
    categorySelect.prepend(opt);
    categorySelect.value = '-1';
  }
  document.getElementById('amount').value = expense.amount ?? '';
  document.getElementById('date').value = expense.date || '';
  document.getElementById('hasTaxInvoice').value = expense.hasTaxInvoice ? 'yes' : 'no';
  document.getElementById('paymentMethod').value = expense.paymentMethod || 'cash';
  document.getElementById('vendor').value = expense.vendor || '';
  document.getElementById('status').value = expense.status || 'approved';
  document.getElementById('notes').value = expense.notes || '';

  document.getElementById('linkedInventoryItemId').value = expense.linkedInventoryItemId || '';
  document.getElementById('linkedInventoryDirection').value = expense.linkedInventoryDirection || 'in';
  document.getElementById('linkedQuantity').value = expense.linkedQuantity ?? '';
  await _toggleLinkedQuantityField();

  const batchSelect = document.getElementById('linkedFatteningBatchId');
  if (expense.linkedFatteningBatchId && !batchSelect.querySelector(`option[value="${expense.linkedFatteningBatchId}"]`)) {
    const closedBatch = await getFatteningBatch(expense.linkedFatteningBatchId);
    if (closedBatch) {
      const opt = document.createElement('option');
      opt.value = String(closedBatch.id);
      opt.textContent = `${closedBatch.batchNumber} — ${formatDateArabic(closedBatch.startDate)} (مغلقة)`;
      batchSelect.appendChild(opt);
    }
  }
  batchSelect.value = expense.linkedFatteningBatchId || '';

  const animalSelect = document.getElementById('linkedAnimalId');
  if (expense.linkedAnimalId && !animalSelect.querySelector(`option[value="${expense.linkedAnimalId}"]`)) {
    const linkedAnimal = await getAnimalById(expense.linkedAnimalId);
    if (linkedAnimal) {
      const opt = document.createElement('option');
      opt.value = String(linkedAnimal.id);
      opt.textContent = `${linkedAnimal.code} — ${ANIMAL_TYPE_LABELS[linkedAnimal.type] || linkedAnimal.type} (${ANIMAL_STATUS_LABELS[linkedAnimal.status] || linkedAnimal.status})`;
      animalSelect.appendChild(opt);
    }
  }
  animalSelect.value = expense.linkedAnimalId || '';
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

  const hasTaxInvoice = document.getElementById('hasTaxInvoice').value === 'yes';
  const amount = Number(document.getElementById('amount').value);
  const { amountBeforeTax, taxAmount } = hasTaxInvoice
    ? calculateTaxBreakdown(amount)
    : { amountBeforeTax: null, taxAmount: null };

  const categoryAccountIdValue = Number(document.getElementById('category').value);
  const selectedCategoryAccount = _expenseCategoryAccountsCache.find(a => a.id === categoryAccountIdValue);
  // القيمة -1 (بند/حساب محذوف) تعني إبقاء البند كما كان بلا تعديل — انظر _loadExpenseIntoForm
  const category = selectedCategoryAccount ? selectedCategoryAccount.name : (_loadedExpense ? _loadedExpense.category : '');
  const categoryAccountId = selectedCategoryAccount ? selectedCategoryAccount.id : (_loadedExpense ? _loadedExpense.categoryAccountId : null);

  const data = {
    category,
    categoryAccountId,
    amount,
    date: document.getElementById('date').value,
    hasTaxInvoice,
    amountBeforeTax,
    taxAmount,
    paymentMethod: document.getElementById('paymentMethod').value,
    vendor: document.getElementById('vendor').value.trim(),
    status: document.getElementById('status').value,
    notes: document.getElementById('notes').value.trim(),
    linkedInventoryItemId: linkedItemIdValue ? Number(linkedItemIdValue) : null,
    linkedInventoryDirection: linkedItemIdValue ? document.getElementById('linkedInventoryDirection').value : null,
    linkedQuantity: linkedItemIdValue ? Number(document.getElementById('linkedQuantity').value) : null,
    linkedFatteningBatchId: document.getElementById('linkedFatteningBatchId').value
      ? Number(document.getElementById('linkedFatteningBatchId').value)
      : null,
    linkedAnimalId: document.getElementById('linkedAnimalId').value
      ? Number(document.getElementById('linkedAnimalId').value)
      : null,
  };

  // استهلاك (صادر) أكبر من الرصيد الحالي المتاح — تنبيه اختياري لا يمنع الحفظ (نفس فلسفة "بلا تحقق آلي مانع"
  // المتّبعة في بيع الجملة الحر)، لكنه يُلفت نظر المستخدم قبل ترك رصيد الصنف سالبًا بالخطأ
  if (data.linkedInventoryItemId && data.linkedInventoryDirection === 'out') {
    const item = _allInventoryItemsForExpense.find(i => i.id === data.linkedInventoryItemId);
    if (item) {
      const existingMovement = _editingExpenseId ? await getInventoryMovementByExpenseId(_editingExpenseId) : null;
      let movements = await getAllInventoryMovements(item.id);
      if (existingMovement) movements = movements.filter(m => m.id !== existingMovement.id);
      const { currentQty } = computeItemStockLevel(item, movements);
      if (data.linkedQuantity > currentQty) {
        const proceed = window.confirm(
          `الكمية المطلوب استهلاكها (${data.linkedQuantity}) أكبر من الرصيد الحالي المتاح (${formatNumber(currentQty)} ${item.unit || ''}) — سيصبح رصيد الصنف سالبًا.\n` +
          'هل تريد المتابعة والحفظ رغم ذلك؟'
        );
        if (!proceed) return;
      }
    }
  }

  // قفل الفترات المحاسبية: يمنع الحفظ لو تاريخ السجل الأصلي (عند التعديل) أو التاريخ الجديد المُدخَل ضمن فترة مغلقة
  if (_loadedExpense && !(await guardPeriodOpenForSave(_loadedExpense.date))) return;
  if (!(await guardPeriodOpenForSave(data.date))) return;

  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'جاري الحفظ...';

  try {
    let savedExpenseId = _editingExpenseId;
    if (_editingExpenseId) {
      await updateExpense(_editingExpenseId, data);
    } else {
      savedExpenseId = await createExpense(data);
    }

    await _syncExpenseInventoryLink(savedExpenseId, data);
    await syncExpenseJournalEntry(savedExpenseId);

    showToast('تم الحفظ بنجاح', 'success');
    setTimeout(() => { window.location.href = 'expense-list.html'; }, 400);
  } catch (err) {
    showToast('حدث خطأ أثناء الحفظ', 'error');
    saveBtn.disabled = false;
    saveBtn.textContent = 'حفظ';
  }
}

// ينشئ/يحدّث/يحذف حركة المخزون المرتبطة بهذا المصروف بما يطابق حالة الربط الحالية (نفس مبدأ ربط animalId بالإيراد في revenue-form-page.js)
async function _syncExpenseInventoryLink(expenseId, data) {
  const existingMovement = await getInventoryMovementByExpenseId(expenseId);

  if (!data.linkedInventoryItemId) {
    if (existingMovement) await deleteInventoryMovement(existingMovement.id);
    return;
  }

  const direction = data.linkedInventoryDirection === 'out' ? 'out' : 'in';
  const unitCost = data.linkedQuantity ? Math.round((data.amount / data.linkedQuantity) * 100) / 100 : null;
  const movementData = {
    itemId: data.linkedInventoryItemId,
    direction,
    quantity: data.linkedQuantity,
    date: data.date,
    reasonType: direction === 'out' ? 'consumption' : 'purchase',
    unitCost,
    notes: `مرتبط تلقائيًا بمصروف رقم ${expenseId}`,
    relatedExpenseId: expenseId,
  };

  if (existingMovement) {
    await updateInventoryMovement(existingMovement.id, movementData);
  } else {
    await createInventoryMovement(movementData);
  }
}

async function _handleDelete() {
  if (_loadedExpense && !(await guardPeriodOpenForSave(_loadedExpense.date))) return;

  confirmDelete('هل أنت متأكد من حذف هذا المصروف؟ ستُحذف أيضًا حركة المخزون والقيد المحاسبي المرتبطان به إن وُجدا.', async () => {
    const existingMovement = await getInventoryMovementByExpenseId(_editingExpenseId);
    if (existingMovement) await deleteInventoryMovement(existingMovement.id);
    await reverseExpenseJournalEntry(_editingExpenseId);
    await deleteExpense(_editingExpenseId);
    showToast('تم الحذف بنجاح', 'success');
    setTimeout(() => { window.location.href = 'expense-list.html'; }, 400);
  });
}
