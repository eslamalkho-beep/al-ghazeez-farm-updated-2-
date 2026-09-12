// js/pages/custody-settle-page.js

let _employeesForSettle = [];
let _openCustodyItems = [];
let _expenseCategories = [];
let _currentCustodyItem = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('custody');
  renderSidebar('custody-settle');
  renderHeader('تسوية عهدة');

  const [employees, allItems, categoryAccounts] = await Promise.all([
    dbGetAll('Employees'),
    getAllCustodyItems(),
    getCategoryAccounts('expense'),
  ]);
  _employeesForSettle = employees.filter(e => e.status !== 'deleted');
  _openCustodyItems = allItems.filter(i => i.status === 'open' || i.status === 'partially_settled');
  _expenseCategories = categoryAccounts;

  const urlParams = new URLSearchParams(window.location.search);
  const presetCustodyId = urlParams.get('custodyId');

  if (presetCustodyId) {
    document.getElementById('picker-card').style.display = 'none';
    await _loadCustodyItem(Number(presetCustodyId));
  } else {
    document.getElementById('picker-employeeId').innerHTML =
      '<option value="">-- اختر موظفًا --</option>' +
      _employeesForSettle.map(e => `<option value="${e.id}">${e.fullName}</option>`).join('');
    document.getElementById('picker-employeeId').addEventListener('change', _populateCustodySelect);
    document.getElementById('picker-custodyId').addEventListener('change', () => {
      const id = document.getElementById('picker-custodyId').value;
      if (id) _loadCustodyItem(Number(id));
      else document.getElementById('details-card').style.display = 'none';
    });
    _populateCustodySelect();
  }

  document.getElementById('settle-form').addEventListener('submit', _handleSubmit);
});

function _employeeName(id) {
  const emp = _employeesForSettle.find(e => e.id === Number(id));
  return emp ? emp.fullName : 'موظف محذوف';
}

function _populateCustodySelect() {
  const employeeId = document.getElementById('picker-employeeId').value;
  const items = employeeId ? _openCustodyItems.filter(i => Number(i.employeeId) === Number(employeeId)) : [];
  const select = document.getElementById('picker-custodyId');
  select.innerHTML = items.length
    ? '<option value="">-- اختر عهدة --</option>' + items.map(i =>
        `<option value="${i.id}">${i.custodyNumber || i.reference || ('#' + i.id)} — ${CUSTODY_TYPE_LABELS[i.custodyType] || 'نقدية'} — متبقي ${formatCurrency(remainingCustodyAmount(i))}</option>`
      ).join('')
    : '<option value="">-- لا توجد عهد مفتوحة لهذا الموظف --</option>';
  document.getElementById('details-card').style.display = 'none';
}

async function _loadCustodyItem(id) {
  _currentCustodyItem = await getCustodyItemById(id);
  if (!_currentCustodyItem) {
    showToast('العهدة غير موجودة', 'error');
    return;
  }
  const item = _currentCustodyItem;
  const cash = isCashCustody(item);

  document.getElementById('custody-details-box').innerHTML = `
    <div><strong>رقم العهدة:</strong> ${item.custodyNumber || item.reference || ('#' + item.id)}</div>
    <div><strong>الموظف:</strong> ${_employeeName(item.employeeId)}</div>
    <div><strong>النوع:</strong> ${CUSTODY_TYPE_LABELS[item.custodyType] || 'نقدية'}</div>
    <div><strong>${cash ? 'المبلغ الإجمالي' : 'القيمة الإجمالية'}:</strong> ${formatCurrency(item.amount)}</div>
    <div><strong>${cash ? 'المتبقي (مبلغ)' : 'المتبقي (قيمة)'}:</strong> ${formatCurrency(remainingCustodyAmount(item))}</div>
    ${!cash ? `<div><strong>الكمية المتبقية:</strong> ${formatNumber(remainingCustodyQuantity(item))}</div>` : ''}
  `;

  const currentUser = getCurrentUser();
  const isManager = currentUser && resolveRoleKey(currentUser.role) === 'systemAdmin';
  // ⚠️ رد نقدية/رد أصناف/تسوية بفواتير (التصفية الطبيعية) انتقلت إلى custody-liquidate.html — هذه الشاشة
  // مقصورة الآن على معالجة الاستثناءات/الفروقات فقط
  const typeOptions = cash
    ? ['convertToExpense', 'salaryDeduction', 'chargeToEmployee', 'transferOut']
    : ['chargeToEmployee'];
  if (isManager) typeOptions.push('writeOff', 'adminWaiver');

  document.getElementById('s-settlementType').innerHTML = typeOptions
    .map(t => `<option value="${t}">${CUSTODY_SETTLEMENT_TYPE_LABELS[t]}</option>`).join('');
  document.getElementById('s-date').value = todayIso();
  document.getElementById('s-expenseCategory').innerHTML = _expenseCategories
    .map(a => `<option value="${a.id}">${a.code} - ${a.name}</option>`).join('');
  document.getElementById('s-targetEmployeeId').innerHTML = _employeesForSettle
    .map(e => `<option value="${e.id}"${e.id === item.employeeId ? ' selected' : ''}>${e.fullName}${e.id === item.employeeId ? ' (نفس الموظف)' : ''}</option>`).join('');

  document.getElementById('s-settlementType').removeEventListener('change', _toggleSettleFields);
  document.getElementById('s-settlementType').addEventListener('change', _toggleSettleFields);
  _toggleSettleFields();

  document.getElementById('details-card').style.display = '';
}

function _toggleSettleFields() {
  const item = _currentCustodyItem;
  if (!item) return;
  const cash = isCashCustody(item);
  const type = document.getElementById('s-settlementType').value;
  const isTransfer = type === 'transferOut';

  const showAmount = cash && !isTransfer;
  const showQuantity = !cash;
  const showCategory = type === 'convertToExpense';
  const showTargetEmployee = isTransfer;
  const showTransferAmount = isTransfer;

  document.getElementById('s-amount-group').style.display = (showAmount || showTransferAmount) ? '' : 'none';
  document.getElementById('s-quantity-group').style.display = showQuantity ? '' : 'none';
  document.getElementById('s-category-group').style.display = showCategory ? '' : 'none';
  document.getElementById('s-target-employee-group').style.display = showTargetEmployee ? '' : 'none';

  if (showAmount || showTransferAmount) {
    const remaining = remainingCustodyAmount(item);
    const input = document.getElementById('s-amount');
    input.max = remaining;
    if (!input.value) input.value = remaining;
  }
  if (showQuantity) {
    const remaining = remainingCustodyQuantity(item);
    const input = document.getElementById('s-quantity');
    input.max = remaining;
    if (!input.value) input.value = remaining;
  }
}

async function _handleSubmit(e) {
  e.preventDefault();
  if (!_currentCustodyItem) return;

  const date = document.getElementById('s-date').value;
  if (!isValidDate(date)) {
    showToast('التاريخ مطلوب', 'error');
    return;
  }

  const settlementType = document.getElementById('s-settlementType').value;
  const notes = document.getElementById('s-notes').value.trim();

  try {
    if (settlementType === 'transferOut') {
      await transferCustodyBalance(_currentCustodyItem.id, {
        date,
        targetEmployeeId: document.getElementById('s-targetEmployeeId').value,
        amount: document.getElementById('s-amount').value,
        notes,
      });
      showToast('تم نقل/تسوية الرصيد بنجاح', 'success');
    } else {
      const input = {
        date,
        settlementType,
        amount: document.getElementById('s-amount').value,
        quantity: document.getElementById('s-quantity').value,
        expenseCategoryAccountId: document.getElementById('s-expenseCategory').value,
        notes,
      };
      await settleCustody(_currentCustodyItem.id, input);
      showToast('تمت التسوية بنجاح', 'success');
    }
    window.location.href = 'custody-list.html';
  } catch (err) {
    showToast(err.message || 'تعذّر تنفيذ التسوية', 'error');
  }
}
