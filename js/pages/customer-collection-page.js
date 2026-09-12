// js/pages/customer-collection-page.js
// سندات القبض من العملاء — append-only (بلا تعديل/حذف، بنفس مبدأ CustodySettlements)، كل سند يُنشئ قيدًا
// محاسبيًا تلقائيًا عبر createCollection في party-service.js (مدين الصندوق/البنك، دائن 1050)

let _allClientsForCollection = [];
let _allRevenuesForCollection = [];
let _allPurchasesForCollection = [];
let _allPartyTransactionsForCollection = [];
let _collectionsExportColumns = [];
let _collectionsExportRows = [];

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('parties');
  renderSidebar('parties-collection');
  renderHeader('التحصيل من العملاء');

  document.getElementById('date').value = todayIso();

  await _loadClients();

  document.getElementById('partyId').addEventListener('change', _updateBalanceHint);
  document.getElementById('collection-form').addEventListener('submit', _handleSubmit);

  document.getElementById('export-excel-btn').addEventListener('click', () => {
    exportRowsToExcel('سندات_القبض', _collectionsExportColumns, _collectionsExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    exportRowsToPdf('سندات القبض من العملاء', _collectionsExportColumns, _collectionsExportRows);
  });

  await _refreshTable();
});

async function _loadClients() {
  [_allClientsForCollection, _allRevenuesForCollection, _allPurchasesForCollection, _allPartyTransactionsForCollection] = await Promise.all([
    getAllParties('client'), getAllRevenues(), getAllPurchases(), getAllPartyTransactions(),
  ]);
  const select = document.getElementById('partyId');
  select.innerHTML = _allClientsForCollection.length
    ? `<option value="">-- اختر عميلاً --</option>` + _allClientsForCollection.map(c => `<option value="${c.id}">${c.name} (${c.partyCode || ''})</option>`).join('')
    : `<option value="">لا يوجد عملاء مكوَّدون بعد</option>`;
  _updateBalanceHint();
}

function _updateBalanceHint() {
  const hint = document.getElementById('party-balance-hint');
  const partyId = Number(document.getElementById('partyId').value);
  const party = _allClientsForCollection.find(c => c.id === partyId);
  if (!party) { hint.textContent = ''; return; }
  const balance = computePartyBalance(party, _allRevenuesForCollection, _allPurchasesForCollection, _allPartyTransactionsForCollection);
  if (balance > 0.01) {
    hint.textContent = `الرصيد الحالي: ${formatCurrency(balance)} مدين`;
  } else if (balance < -0.01) {
    hint.textContent = `الرصيد الحالي: ${formatCurrency(Math.abs(balance))} دائن (رصيد له لديك)`;
  } else {
    hint.textContent = 'الرصيد الحالي: صفر';
  }
}

async function _handleSubmit(e) {
  e.preventDefault();

  const isValid = validateForm([
    { fieldId: 'date', validatorFn: isValidDate, message: 'التاريخ مطلوب' },
    { fieldId: 'partyId', validatorFn: isRequired, message: 'يرجى اختيار العميل' },
    { fieldId: 'amount', validatorFn: isPositiveNumber, message: 'أدخل مبلغًا صحيحًا' },
  ]);
  if (!isValid) return;

  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'جاري الحفظ...';

  try {
    await createCollection({
      date: document.getElementById('date').value,
      partyId: Number(document.getElementById('partyId').value),
      method: document.getElementById('method').value,
      amount: Number(document.getElementById('amount').value),
      description: document.getElementById('description').value.trim(),
    });

    showToast('تم حفظ سند القبض بنجاح', 'success');
    document.getElementById('collection-form').reset();
    document.getElementById('date').value = todayIso();
    await _loadClients();
    await _refreshTable();
  } catch (err) {
    showToast(err.message || 'حدث خطأ أثناء الحفظ', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'حفظ سند القبض';
  }
}

async function _refreshTable() {
  const all = await getAllPartyTransactions(null, 'collection');
  const clients = _allClientsForCollection.length ? _allClientsForCollection : await getAllParties('client');

  const rows = all.map(t => {
    const party = clients.find(c => c.id === t.partyId);
    return {
      ...t,
      dateLabel: formatDateArabic(t.date),
      partyName: party ? party.name : '-',
      methodLabel: PARTY_TRANSACTION_METHOD_LABELS[t.method] || t.method,
      amountLabel: formatCurrency(t.amount),
      attachBtn: `<button type="button" class="btn btn--outline btn--sm" onclick="event.stopPropagation(); openAttachmentsModal('partyTransaction', ${t.id}, '${t.voucherNumber}')">📎 مرفقات</button>`,
    };
  }).reverse();

  _collectionsExportColumns = [
    { key: 'voucherNumber', label: 'رقم السند' },
    { key: 'dateLabel', label: 'التاريخ' },
    { key: 'partyName', label: 'العميل' },
    { key: 'methodLabel', label: 'طريقة التحصيل' },
    { key: 'amountLabel', label: 'المبلغ' },
    { key: 'description', label: 'البيان' },
  ];
  _collectionsExportRows = rows;

  renderDataTable('collections-table', [
    { key: 'voucherNumber', label: 'رقم السند', sortable: true },
    { key: 'dateLabel', label: 'التاريخ', sortable: true },
    { key: 'partyName', label: 'العميل', sortable: true },
    { key: 'methodLabel', label: 'طريقة التحصيل', sortable: false },
    { key: 'amountLabel', label: 'المبلغ', sortable: false },
    { key: 'description', label: 'البيان', sortable: false },
    { key: 'attachBtn', label: 'مرفقات', sortable: false },
  ], rows, {
    emptyMessage: 'لا توجد سندات قبض مسجّلة بعد',
  });
}
