// js/pages/supplier-payment-page.js
// سندات الصرف للموردين — append-only (بلا تعديل/حذف)، كل سند يُنشئ قيدًا محاسبيًا تلقائيًا عبر createPayment
// في party-service.js (مدين 2000 ذمم دائنة، دائن الصندوق/البنك)

let _allSuppliersForPayment = [];
let _allRevenuesForPayment = [];
let _allPurchasesForPayment = [];
let _allPartyTransactionsForPayment = [];
let _paymentsExportColumns = [];
let _paymentsExportRows = [];

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('parties');
  renderSidebar('parties-payment');
  renderHeader('السداد للموردين');

  document.getElementById('date').value = todayIso();

  await _loadSuppliers();

  document.getElementById('partyId').addEventListener('change', _updateBalanceHint);
  document.getElementById('payment-form').addEventListener('submit', _handleSubmit);

  document.getElementById('export-excel-btn').addEventListener('click', () => {
    exportRowsToExcel('سندات_الصرف', _paymentsExportColumns, _paymentsExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    exportRowsToPdf('سندات الصرف للموردين', _paymentsExportColumns, _paymentsExportRows);
  });

  await _refreshTable();
});

async function _loadSuppliers() {
  [_allSuppliersForPayment, _allRevenuesForPayment, _allPurchasesForPayment, _allPartyTransactionsForPayment] = await Promise.all([
    getAllParties('supplier'), getAllRevenues(), getAllPurchases(), getAllPartyTransactions(),
  ]);
  const select = document.getElementById('partyId');
  select.innerHTML = _allSuppliersForPayment.length
    ? `<option value="">-- اختر مورّدًا --</option>` + _allSuppliersForPayment.map(s => `<option value="${s.id}">${s.name} (${s.partyCode || ''})</option>`).join('')
    : `<option value="">لا يوجد موردون مكوَّدون بعد</option>`;
  _updateBalanceHint();
}

function _updateBalanceHint() {
  const hint = document.getElementById('party-balance-hint');
  const partyId = Number(document.getElementById('partyId').value);
  const party = _allSuppliersForPayment.find(s => s.id === partyId);
  if (!party) { hint.textContent = ''; return; }
  const balance = computePartyBalance(party, _allRevenuesForPayment, _allPurchasesForPayment, _allPartyTransactionsForPayment);
  if (balance < -0.01) {
    hint.textContent = `الرصيد الحالي: ${formatCurrency(Math.abs(balance))} دائن (مستحق له)`;
  } else if (balance > 0.01) {
    hint.textContent = `الرصيد الحالي: ${formatCurrency(balance)} مدين (رصيد لك لديه)`;
  } else {
    hint.textContent = 'الرصيد الحالي: صفر';
  }
}

async function _handleSubmit(e) {
  e.preventDefault();

  const isValid = validateForm([
    { fieldId: 'date', validatorFn: isValidDate, message: 'التاريخ مطلوب' },
    { fieldId: 'partyId', validatorFn: isRequired, message: 'يرجى اختيار المورّد' },
    { fieldId: 'amount', validatorFn: isPositiveNumber, message: 'أدخل مبلغًا صحيحًا' },
  ]);
  if (!isValid) return;

  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'جاري الحفظ...';

  try {
    await createPayment({
      date: document.getElementById('date').value,
      partyId: Number(document.getElementById('partyId').value),
      method: document.getElementById('method').value,
      amount: Number(document.getElementById('amount').value),
      description: document.getElementById('description').value.trim(),
    });

    showToast('تم حفظ سند الصرف بنجاح', 'success');
    document.getElementById('payment-form').reset();
    document.getElementById('date').value = todayIso();
    await _loadSuppliers();
    await _refreshTable();
  } catch (err) {
    showToast(err.message || 'حدث خطأ أثناء الحفظ', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'حفظ سند الصرف';
  }
}

async function _refreshTable() {
  const all = await getAllPartyTransactions(null, 'payment');
  const suppliers = _allSuppliersForPayment.length ? _allSuppliersForPayment : await getAllParties('supplier');

  const rows = all.map(t => {
    const party = suppliers.find(s => s.id === t.partyId);
    return {
      ...t,
      dateLabel: formatDateArabic(t.date),
      partyName: party ? party.name : '-',
      methodLabel: PARTY_TRANSACTION_METHOD_LABELS[t.method] || t.method,
      amountLabel: formatCurrency(t.amount),
      attachBtn: `<button type="button" class="btn btn--outline btn--sm" onclick="event.stopPropagation(); openAttachmentsModal('partyTransaction', ${t.id}, '${t.voucherNumber}')">📎 مرفقات</button>`,
    };
  }).reverse();

  _paymentsExportColumns = [
    { key: 'voucherNumber', label: 'رقم السند' },
    { key: 'dateLabel', label: 'التاريخ' },
    { key: 'partyName', label: 'المورّد' },
    { key: 'methodLabel', label: 'طريقة السداد' },
    { key: 'amountLabel', label: 'المبلغ' },
    { key: 'description', label: 'البيان' },
  ];
  _paymentsExportRows = rows;

  renderDataTable('payments-table', [
    { key: 'voucherNumber', label: 'رقم السند', sortable: true },
    { key: 'dateLabel', label: 'التاريخ', sortable: true },
    { key: 'partyName', label: 'المورّد', sortable: true },
    { key: 'methodLabel', label: 'طريقة السداد', sortable: false },
    { key: 'amountLabel', label: 'المبلغ', sortable: false },
    { key: 'description', label: 'البيان', sortable: false },
    { key: 'attachBtn', label: 'مرفقات', sortable: false },
  ], rows, {
    emptyMessage: 'لا توجد سندات صرف مسجّلة بعد',
  });
}
