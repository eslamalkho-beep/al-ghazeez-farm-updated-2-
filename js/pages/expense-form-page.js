// js/pages/expense-form-page.js

let _editingExpenseId = null;
let _originalExpenseStatus = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('expenses');
  renderSidebar('expenses');
  renderHeader('تكويد مصروف جديد');

  const expenseCategories = await getCategoryNames('expense');
  document.getElementById('category').innerHTML = expenseCategories.map(c => `<option value="${c}">${c}</option>`).join('');

  const inventoryItems = await getAllInventoryItems();
  const itemSelect = document.getElementById('linkedInventoryItemId');
  itemSelect.innerHTML = `<option value="">-- بدون ربط بالمخزون --</option>` +
    inventoryItems.map(i => `<option value="${i.id}">${i.name} (${i.unit || '-'})</option>`).join('');
  itemSelect.addEventListener('change', _toggleLinkedQuantityField);

  const params = new URLSearchParams(window.location.search);
  const idParam = params.get('id');

  if (idParam) {
    _editingExpenseId = Number(idParam);
    await _loadExpenseIntoForm(_editingExpenseId);
    document.getElementById('form-title').textContent = 'تعديل مصروف';
    document.getElementById('delete-btn').style.display = 'inline-flex';
  } else {
    document.getElementById('date').value = todayIso();
  }

  document.getElementById('amount').addEventListener('input', _updateTaxBreakdown);
  document.getElementById('hasTaxInvoice').addEventListener('change', _updateTaxBreakdown);
  _updateTaxBreakdown();
  _toggleLinkedQuantityField();

  document.getElementById('expense-form').addEventListener('submit', _handleSubmit);
  document.getElementById('delete-btn').addEventListener('click', _handleDelete);
});

function _toggleLinkedQuantityField() {
  const hasItem = !!document.getElementById('linkedInventoryItemId').value;
  document.getElementById('linked-quantity-group').style.display = hasItem ? '' : 'none';
  if (!hasItem) document.getElementById('linkedQuantity').value = '';
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
  const categorySelect = document.getElementById('category');
  categorySelect.value = expense.category || '';
  if (expense.category && categorySelect.value !== expense.category) {
    const opt = document.createElement('option');
    opt.value = expense.category;
    opt.textContent = `${expense.category} (بند محذوف)`;
    categorySelect.prepend(opt);
    categorySelect.value = expense.category;
  }
  document.getElementById('amount').value = expense.amount ?? '';
  document.getElementById('date').value = expense.date || '';
  document.getElementById('hasTaxInvoice').value = expense.hasTaxInvoice ? 'yes' : 'no';
  document.getElementById('paymentMethod').value = expense.paymentMethod || 'cash';
  document.getElementById('vendor').value = expense.vendor || '';
  document.getElementById('status').value = expense.status || 'approved';
  document.getElementById('notes').value = expense.notes || '';
  _originalExpenseStatus = expense.status || 'approved';

  document.getElementById('linkedInventoryItemId').value = expense.linkedInventoryItemId || '';
  document.getElementById('linkedQuantity').value = expense.linkedQuantity ?? '';
  _toggleLinkedQuantityField();
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

  const data = {
    category: document.getElementById('category').value,
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
    linkedQuantity: linkedItemIdValue ? Number(document.getElementById('linkedQuantity').value) : null,
  };

  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'جاري الحفظ...';

  try {
    const isNewExpense = !_editingExpenseId;
    let savedExpenseId = _editingExpenseId;
    if (_editingExpenseId) {
      await updateExpense(_editingExpenseId, data);
    } else {
      savedExpenseId = await createExpense(data);
    }

    await _syncExpenseInventoryLink(savedExpenseId, data);
    await syncExpenseJournalEntry(savedExpenseId);

    const becamePending = data.status === 'pending' && (isNewExpense || _originalExpenseStatus !== 'pending');
    if (becamePending) {
      await createNotification({
        type: 'finance',
        title: 'مصروف بانتظار الاعتماد',
        message: `مصروف "${data.category}" بمبلغ ${formatCurrency(data.amount)} بانتظار الاعتماد`,
        relatedEntityId: savedExpenseId,
      });
    }

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

  const unitCost = data.linkedQuantity ? Math.round((data.amount / data.linkedQuantity) * 100) / 100 : null;
  const movementData = {
    itemId: data.linkedInventoryItemId,
    direction: 'in',
    quantity: data.linkedQuantity,
    date: data.date,
    reasonType: 'purchase',
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

function _handleDelete() {
  confirmDelete('هل أنت متأكد من حذف هذا المصروف؟ ستُحذف أيضًا حركة المخزون والقيد المحاسبي المرتبطان به إن وُجدا.', async () => {
    const existingMovement = await getInventoryMovementByExpenseId(_editingExpenseId);
    if (existingMovement) await deleteInventoryMovement(existingMovement.id);
    await reverseExpenseJournalEntry(_editingExpenseId);
    await deleteExpense(_editingExpenseId);
    showToast('تم الحذف بنجاح', 'success');
    setTimeout(() => { window.location.href = 'expense-list.html'; }, 400);
  });
}
