// js/pages/custody-liquidate-page.js
// تصفية عهدة — الإغلاق الطبيعي المتوقّع (فواتير معتمدة + نقد مرتجع معًا لعهدة نقدية، أو رد أصناف لعهدة
// عينية). كل عهدة نقدية يمكن أن تُصفَّى بالسطرين معًا في نفس العملية، فيشتركان بنفس المرجع (voucherNumber)
// — انظر شرح CUSTODY_LIQUIDATION_TYPES في custody-service.js. بقية أنواع التسوية (استثناءات) في custody-settle.html.
//
// نطاقان: "عهدة واحدة محددة" (السلوك الأصلي، لازم للعهد العينية) أو "إجمالي رصيد الموظف" (نقدي فقط —
// settleCustodyAmountForEmployee في custody-service.js توزّع المبلغ داخليًا بترتيب FIFO على كل عهد الموظف
// النقدية المفتوحة، بلا حاجة لاختيار عهدة بعينها).

let _employeesForLiquidate = [];
let _openCustodyItemsForLiquidate = [];
let _expenseCategoriesForLiquidate = [];
let _currentCustodyItemForLiquidate = null; // نطاق "عهدة واحدة"
let _currentEmployeeIdForLiquidate = null;  // نطاق "إجمالي الرصيد"
let _currentEmployeeCashTotalForLiquidate = 0;
let _isPresetSingleMode = false; // ?custodyId= في الرابط — يفرض نطاق العهدة الواحدة بلا اختيار نطاق

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('custody');
  renderSidebar('custody-liquidate');
  renderHeader('تصفية عهدة');

  const [employees, allItems, categoryAccounts] = await Promise.all([
    dbGetAll('Employees'),
    getAllCustodyItems(),
    getCategoryAccounts('expense'),
  ]);
  _employeesForLiquidate = employees.filter(e => e.status !== 'deleted');
  _openCustodyItemsForLiquidate = allItems.filter(i => i.status === 'open' || i.status === 'partially_settled');
  _expenseCategoriesForLiquidate = categoryAccounts;

  const urlParams = new URLSearchParams(window.location.search);
  const presetCustodyId = urlParams.get('custodyId');

  if (presetCustodyId) {
    _isPresetSingleMode = true;
    document.getElementById('picker-card').style.display = 'none';
    await _loadCustodyItem(Number(presetCustodyId));
  } else {
    document.getElementById('picker-employeeId').innerHTML =
      '<option value="">-- اختر موظفًا --</option>' +
      _employeesForLiquidate.map(e => `<option value="${e.id}">${e.fullName}</option>`).join('');
    document.getElementById('picker-employeeId').addEventListener('change', _onEmployeePicked);
    document.getElementById('picker-custodyId').addEventListener('change', () => {
      const id = document.getElementById('picker-custodyId').value;
      if (id) _loadCustodyItem(Number(id));
      else document.getElementById('details-card').style.display = 'none';
    });
    document.querySelectorAll('input[name="liquidate-mode"]').forEach(r => r.addEventListener('change', _onModeChanged));
    _onModeChanged();
  }

  document.getElementById('liquidate-form').addEventListener('submit', _handleSubmit);
});

function _employeeName(id) {
  const emp = _employeesForLiquidate.find(e => e.id === Number(id));
  return emp ? emp.fullName : 'موظف محذوف';
}

function _isAggregateMode() {
  const el = document.getElementById('mode-aggregate');
  return !!el && el.checked;
}

function _onModeChanged() {
  document.getElementById('picker-custodyId-group').style.display = _isAggregateMode() ? 'none' : '';
  document.getElementById('aggregate-balance-card').style.display = 'none';
  document.getElementById('details-card').style.display = 'none';
  _currentCustodyItemForLiquidate = null;
  _currentEmployeeIdForLiquidate = null;
  _onEmployeePicked();
}

function _onEmployeePicked() {
  if (_isAggregateMode()) _loadAggregateForEmployee();
  else _populateCustodySelect();
}

function _populateCustodySelect() {
  const employeeId = document.getElementById('picker-employeeId').value;
  const items = employeeId ? _openCustodyItemsForLiquidate.filter(i => Number(i.employeeId) === Number(employeeId)) : [];
  const select = document.getElementById('picker-custodyId');
  select.innerHTML = items.length
    ? '<option value="">-- اختر عهدة --</option>' + items.map(i =>
        `<option value="${i.id}">${i.custodyNumber || i.reference || ('#' + i.id)} — ${CUSTODY_TYPE_LABELS[i.custodyType] || 'نقدية'} — متبقي ${formatCurrency(remainingCustodyAmount(i))}</option>`
      ).join('')
    : '<option value="">-- لا توجد عهد مفتوحة لهذا الموظف --</option>';
  document.getElementById('details-card').style.display = 'none';
}

function _loadAggregateForEmployee() {
  const employeeId = document.getElementById('picker-employeeId').value;
  const balanceCard = document.getElementById('aggregate-balance-card');
  document.getElementById('details-card').style.display = 'none';
  _currentEmployeeIdForLiquidate = null;

  if (!employeeId) { balanceCard.style.display = 'none'; return; }

  const { total } = getEmployeeCashBalance(Number(employeeId), _openCustodyItemsForLiquidate);
  document.getElementById('aggregate-balance-box').innerHTML = `
    <div><strong>الموظف:</strong> ${_employeeName(employeeId)}</div>
    <div><strong>إجمالي الرصيد النقدي المتبقي (كل عهده النقدية المفتوحة):</strong> ${formatCurrency(total)}</div>
  `;
  balanceCard.style.display = '';

  if (total <= 0.001) {
    document.getElementById('aggregate-balance-box').innerHTML += `<div style="color:var(--color-primary-red);">لا يوجد رصيد نقدي متبقٍ لهذا الموظف لتصفيته</div>`;
    return;
  }

  _currentEmployeeIdForLiquidate = Number(employeeId);
  _currentEmployeeCashTotalForLiquidate = total;
  _renderAggregateForm();
}

function _renderAggregateForm() {
  document.getElementById('details-card-title').textContent = 'تصفية إجمالي رصيد الموظف';
  document.getElementById('custody-details-box').innerHTML = `
    <div><strong>الموظف:</strong> ${_employeeName(_currentEmployeeIdForLiquidate)}</div>
    <div><strong>إجمالي المتبقي:</strong> ${formatCurrency(_currentEmployeeCashTotalForLiquidate)}</div>
    <div style="color:var(--color-text-secondary);">سيُوزَّع المبلغ المُدخل تلقائيًا على عهد الموظف النقدية المفتوحة (الأقدم أولاً).</div>
  `;

  document.getElementById('l-date').value = todayIso();
  document.getElementById('l-expenseCategory').innerHTML = _expenseCategoriesForLiquidate
    .map(a => `<option value="${a.id}">${a.code} - ${a.name}</option>`).join('');

  document.getElementById('cash-section-title').style.display = '';
  document.getElementById('invoice-amount-group').style.display = '';
  document.getElementById('invoice-category-group').style.display = '';
  document.getElementById('cash-return-group').style.display = '';
  document.getElementById('quantity-group').style.display = 'none';
  document.getElementById('remaining-preview-group').style.display = '';

  document.getElementById('l-invoiceAmount').value = 0;
  document.getElementById('l-cashAmount').value = _currentEmployeeCashTotalForLiquidate;
  document.getElementById('l-quantity').value = '';

  ['l-invoiceAmount', 'l-cashAmount', 'l-quantity'].forEach(id => {
    document.getElementById(id).removeEventListener('input', _updateRemainingPreview);
    document.getElementById(id).addEventListener('input', _updateRemainingPreview);
  });
  _updateRemainingPreview();

  document.getElementById('details-card').style.display = '';
}

async function _loadCustodyItem(id) {
  _currentCustodyItemForLiquidate = await getCustodyItemById(id);
  if (!_currentCustodyItemForLiquidate) {
    showToast('العهدة غير موجودة', 'error');
    return;
  }
  const item = _currentCustodyItemForLiquidate;
  const cash = isCashCustody(item);

  document.getElementById('details-card-title').textContent = 'تفاصيل العهدة';
  document.getElementById('custody-details-box').innerHTML = `
    <div><strong>رقم العهدة:</strong> ${item.custodyNumber || item.reference || ('#' + item.id)}</div>
    <div><strong>الموظف:</strong> ${_employeeName(item.employeeId)}</div>
    <div><strong>النوع:</strong> ${CUSTODY_TYPE_LABELS[item.custodyType] || 'نقدية'}</div>
    <div><strong>${cash ? 'المبلغ الإجمالي' : 'القيمة الإجمالية'}:</strong> ${formatCurrency(item.amount)}</div>
    <div><strong>${cash ? 'المتبقي (مبلغ)' : 'المتبقي (قيمة)'}:</strong> ${formatCurrency(remainingCustodyAmount(item))}</div>
    ${!cash ? `<div><strong>الكمية المتبقية:</strong> ${formatNumber(remainingCustodyQuantity(item))}</div>` : ''}
  `;

  document.getElementById('l-date').value = todayIso();
  document.getElementById('l-expenseCategory').innerHTML = _expenseCategoriesForLiquidate
    .map(a => `<option value="${a.id}">${a.code} - ${a.name}</option>`).join('');

  document.getElementById('cash-section-title').style.display = cash ? '' : 'none';
  document.getElementById('invoice-amount-group').style.display = cash ? '' : 'none';
  document.getElementById('invoice-category-group').style.display = cash ? '' : 'none';
  document.getElementById('cash-return-group').style.display = cash ? '' : 'none';
  document.getElementById('quantity-group').style.display = cash ? 'none' : '';
  document.getElementById('remaining-preview-group').style.display = '';

  document.getElementById('l-invoiceAmount').value = 0;
  document.getElementById('l-cashAmount').value = cash ? remainingCustodyAmount(item) : 0;
  document.getElementById('l-quantity').value = cash ? '' : remainingCustodyQuantity(item);

  ['l-invoiceAmount', 'l-cashAmount', 'l-quantity'].forEach(id => {
    document.getElementById(id).removeEventListener('input', _updateRemainingPreview);
    document.getElementById(id).addEventListener('input', _updateRemainingPreview);
  });
  _updateRemainingPreview();

  document.getElementById('details-card').style.display = '';
}

function _updateRemainingPreview() {
  const aggregate = !_isPresetSingleMode && _isAggregateMode();
  const label = document.getElementById('remaining-preview-label');

  if (aggregate) {
    if (!_currentEmployeeIdForLiquidate) return;
    const invoiceAmount = Number(document.getElementById('l-invoiceAmount').value || 0);
    const cashAmount = Number(document.getElementById('l-cashAmount').value || 0);
    const remaining = _currentEmployeeCashTotalForLiquidate - invoiceAmount - cashAmount;
    label.textContent = formatCurrency(remaining);
    label.style.color = remaining < -0.01 ? 'var(--color-primary-red)' : '';
    return;
  }

  const item = _currentCustodyItemForLiquidate;
  if (!item) return;
  const cash = isCashCustody(item);

  if (cash) {
    const invoiceAmount = Number(document.getElementById('l-invoiceAmount').value || 0);
    const cashAmount = Number(document.getElementById('l-cashAmount').value || 0);
    const remaining = remainingCustodyAmount(item) - invoiceAmount - cashAmount;
    label.textContent = formatCurrency(remaining);
    label.style.color = remaining < -0.01 ? 'var(--color-primary-red)' : '';
  } else {
    const quantity = Number(document.getElementById('l-quantity').value || 0);
    const remaining = remainingCustodyQuantity(item) - quantity;
    label.textContent = `${formatNumber(remaining)} (كمية)`;
    label.style.color = remaining < -0.001 ? 'var(--color-primary-red)' : '';
  }
}

async function _handleSubmit(e) {
  e.preventDefault();
  const aggregate = !_isPresetSingleMode && _isAggregateMode();

  const date = document.getElementById('l-date').value;
  if (!isValidDate(date)) {
    showToast('التاريخ مطلوب', 'error');
    return;
  }
  const notes = document.getElementById('l-notes').value.trim();
  const btn = document.getElementById('save-liquidate-btn');

  if (aggregate) {
    if (!_currentEmployeeIdForLiquidate) return;
    const invoiceAmount = Number(document.getElementById('l-invoiceAmount').value || 0);
    const cashAmount = Number(document.getElementById('l-cashAmount').value || 0);
    const expenseCategoryAccountId = document.getElementById('l-expenseCategory').value;

    if (!(invoiceAmount > 0) && !(cashAmount > 0)) {
      showToast('أدخل قيمة فواتير معتمدة أو نقد مرتجع على الأقل', 'error');
      return;
    }
    if (invoiceAmount + cashAmount > _currentEmployeeCashTotalForLiquidate + 0.01) {
      showToast('مجموع المبلغين أكبر من إجمالي رصيد الموظف', 'error');
      return;
    }
    if (invoiceAmount > 0 && !expenseCategoryAccountId) {
      showToast('اختر بند المصروف للفواتير المعتمدة', 'error');
      return;
    }

    try {
      btn.disabled = true;
      const voucherNumber = await generateNextCustodyVoucherNumber('TSF');
      if (invoiceAmount > 0) {
        await settleCustodyAmountForEmployee(_currentEmployeeIdForLiquidate, invoiceAmount, {
          date, settlementType: 'invoiceSettlement', expenseCategoryAccountId, notes, voucherNumber,
        });
      }
      if (cashAmount > 0) {
        await settleCustodyAmountForEmployee(_currentEmployeeIdForLiquidate, cashAmount, {
          date, settlementType: 'cashReturn', notes, voucherNumber,
        });
      }
      showToast('تمت تصفية رصيد الموظف بنجاح', 'success');
      window.location.href = 'custody-list.html';
    } catch (err) {
      btn.disabled = false;
      showToast(err.message || 'تعذّر تنفيذ التصفية', 'error');
    }
    return;
  }

  const item = _currentCustodyItemForLiquidate;
  if (!item) return;
  const cash = isCashCustody(item);

  try {
    if (cash) {
      const invoiceAmount = Number(document.getElementById('l-invoiceAmount').value || 0);
      const cashAmount = Number(document.getElementById('l-cashAmount').value || 0);
      const expenseCategoryAccountId = document.getElementById('l-expenseCategory').value;

      if (!(invoiceAmount > 0) && !(cashAmount > 0)) {
        showToast('أدخل قيمة فواتير معتمدة أو نقد مرتجع على الأقل', 'error');
        return;
      }
      if (invoiceAmount + cashAmount > remainingCustodyAmount(item) + 0.01) {
        showToast('مجموع المبلغين أكبر من المتبقي على العهدة', 'error');
        return;
      }
      if (invoiceAmount > 0 && !expenseCategoryAccountId) {
        showToast('اختر بند المصروف للفواتير المعتمدة', 'error');
        return;
      }

      btn.disabled = true;
      const voucherNumber = await generateNextCustodyVoucherNumber('TSF');
      if (invoiceAmount > 0) {
        await settleCustody(item.id, {
          date, settlementType: 'invoiceSettlement', amount: invoiceAmount,
          expenseCategoryAccountId, notes, voucherNumber,
        });
      }
      if (cashAmount > 0) {
        await settleCustody(item.id, { date, settlementType: 'cashReturn', amount: cashAmount, notes, voucherNumber });
      }
    } else {
      const quantity = Number(document.getElementById('l-quantity').value || 0);
      if (!(quantity > 0) || quantity > remainingCustodyQuantity(item) + 0.001) {
        showToast('الكمية المرتجعة غير صحيحة', 'error');
        return;
      }
      btn.disabled = true;
      const voucherNumber = await generateNextCustodyVoucherNumber('TSF');
      await settleCustody(item.id, { date, settlementType: 'itemsReturn', quantity, notes, voucherNumber });
    }

    showToast('تمت تصفية العهدة بنجاح', 'success');
    window.location.href = 'custody-list.html';
  } catch (err) {
    btn.disabled = false;
    showToast(err.message || 'تعذّر تنفيذ التصفية', 'error');
  }
}
