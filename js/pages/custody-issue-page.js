// js/pages/custody-issue-page.js

let _employeesForIssue = [];
let _inventoryItemsForIssue = [];
let _inventoryMovementsForIssue = [];

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('custody');
  renderSidebar('custody-issue');
  renderHeader('إصدار عهدة');

  if (!hasActionPermission('custody', 'add')) {
    showToast('ليس لديك صلاحية إصدار عهدة', 'error');
    window.location.href = 'custody-list.html';
    return;
  }

  const [employees, custodyItems, invItems, invMovements, accounts, mappings] = await Promise.all([
    dbGetAll('Employees'),
    getAllCustodyItems(),
    getAllInventoryItems(),
    getAllInventoryMovements(),
    getAllAccounts(),
    loadAccountMappings(),
  ]);
  _employeesForIssue = employees.filter(e => e.status !== 'deleted');
  _inventoryItemsForIssue = invItems;
  _inventoryMovementsForIssue = invMovements;

  document.getElementById('custodyNumber').value = await generateNextCustodyNumber();
  document.getElementById('date').value = todayIso();

  // خيارا الصندوق/البنك يُشتقان من "ربط العمليات بالحسابات" — الافتراضي 11101/11102
  document.getElementById('cashAccountCode').innerHTML = [
    getMappedAccount('cash', accounts, mappings),
    getMappedAccount('bank', accounts, mappings),
  ].filter(Boolean)
    .map(a => `<option value="${a.code}">${a.code} - ${a.name}</option>`)
    .join('');

  document.getElementById('employeeId').innerHTML = _employeesForIssue.length
    ? _employeesForIssue.map(e => `<option value="${e.id}">${e.fullName}</option>`).join('')
    : '<option value="">-- لا يوجد موظفون مكوَّدون --</option>';

  document.getElementById('inventoryItemId').innerHTML = _inventoryItemsForIssue.length
    ? _inventoryItemsForIssue.map(i => `<option value="${i.id}">${i.name} (${INVENTORY_CATEGORY_LABELS[i.category] || i.category})</option>`).join('')
    : '<option value="">-- لا توجد أصناف مخزون مكوَّدة --</option>';

  document.getElementById('custodyType').addEventListener('change', _toggleTypeGroups);
  document.getElementById('inventoryItemId').addEventListener('change', _fillItemDefaults);
  ['quantity', 'unitValue'].forEach(id => document.getElementById(id).addEventListener('input', _updateItemTotal));

  _toggleTypeGroups();
  _fillItemDefaults();

  document.getElementById('issue-form').addEventListener('submit', _handleSubmit);
});

function _toggleTypeGroups() {
  const cash = document.getElementById('custodyType').value === 'cash';
  document.getElementById('cash-group').style.display = cash ? '' : 'none';
  document.getElementById('cash-account-group').style.display = cash ? '' : 'none';
  document.getElementById('cash-amount-group').style.display = cash ? '' : 'none';
  document.getElementById('item-group').style.display = cash ? 'none' : '';
  document.getElementById('item-select-group').style.display = cash ? 'none' : '';
  document.getElementById('item-quantity-group').style.display = cash ? 'none' : '';
  document.getElementById('item-value-group').style.display = cash ? 'none' : '';
  document.getElementById('item-serial-group').style.display = cash ? 'none' : '';
  document.getElementById('item-total-group').style.display = cash ? 'none' : '';
}

function _fillItemDefaults() {
  const item = _inventoryItemsForIssue.find(i => i.id === Number(document.getElementById('inventoryItemId').value));
  const hint = document.getElementById('item-stock-hint');
  if (!item) { hint.textContent = ''; return; }
  const { currentQty } = computeItemStockLevel(item, _inventoryMovementsForIssue);
  hint.textContent = `الرصيد الحالي: ${formatNumber(currentQty)} ${item.unit || ''}`;
  const lastPrice = getLastPurchasePrice(item, _inventoryMovementsForIssue);
  if (lastPrice !== null) document.getElementById('unitValue').value = lastPrice;
  _updateItemTotal();
}

function _updateItemTotal() {
  const qty = Number(document.getElementById('quantity').value || 0);
  const unitValue = Number(document.getElementById('unitValue').value || 0);
  document.getElementById('item-total-label').textContent = formatCurrency(qty * unitValue);
}

async function _handleSubmit(e) {
  e.preventDefault();
  const cash = document.getElementById('custodyType').value === 'cash';
  const employeeId = document.getElementById('employeeId').value;

  const rules = [
    { fieldId: 'date', validatorFn: isValidDate, message: 'التاريخ مطلوب' },
    { fieldId: 'employeeId', validatorFn: isRequired, message: 'اختر الموظف' },
  ];
  if (cash) {
    rules.push({ fieldId: 'amount', validatorFn: (v) => isPositiveNumber(v) && Number(v) > 0, message: 'أدخل مبلغًا صحيحًا' });
  } else {
    rules.push({ fieldId: 'inventoryItemId', validatorFn: isRequired, message: 'اختر الصنف' });
    rules.push({ fieldId: 'quantity', validatorFn: (v) => isPositiveNumber(v) && Number(v) > 0, message: 'أدخل كمية صحيحة' });
  }

  if (!validateForm(rules) || !employeeId) {
    showToast('يرجى تعبئة الحقول المطلوبة بشكل صحيح', 'error');
    return;
  }

  if (!cash) {
    const item = _inventoryItemsForIssue.find(i => i.id === Number(document.getElementById('inventoryItemId').value));
    const { currentQty } = computeItemStockLevel(item, _inventoryMovementsForIssue);
    const qty = Number(document.getElementById('quantity').value || 0);
    if (qty > currentQty) {
      showToast(`الكمية المطلوبة أكبر من الرصيد المتوفر (${formatNumber(currentQty)})`, 'error');
      return;
    }
  }

  const data = {
    date: document.getElementById('date').value,
    employeeId: Number(employeeId),
    custodyType: document.getElementById('custodyType').value,
    purpose: document.getElementById('purpose').value.trim(),
    notes: document.getElementById('notes').value.trim(),
    expectedReturnDate: document.getElementById('expectedReturnDate').value || null,
    cashAccountCode: document.getElementById('cashAccountCode').value,
    amount: document.getElementById('amount').value,
    inventoryItemId: document.getElementById('inventoryItemId').value,
    quantity: document.getElementById('quantity').value,
    unitValue: document.getElementById('unitValue').value,
    serialNumber: document.getElementById('serialNumber').value.trim(),
  };

  await createCustodyIssue(data);
  showToast('تم إصدار العهدة بنجاح', 'success');
  window.location.href = 'custody-list.html';
}
