// js/pages/cash-ledger-page.js
// دفتر حساب الصندوق/البنك: كل حركة قبض (مدين) أو صرف (دائن) على 1000/1010 مع رصيد جارٍ — نفس مبدأ
// party-statement-page.js لكن للصندوق/البنك بدل طرف، مبني على computeAccountLedgerRows في accounting-service.js

let _allAccountsForLedger = [];
let _allEntriesForLedger = [];
let _journalEntryByIdForLedger = new Map();
// رقم الأرشفة (batchNumber) لكل أرشفة أسبوعية — انظر WeeklyBatches/weekly-batch-service.js، نفس مبدأ
// revenue-list-page.js/expense-list-page.js/purchase-list-page.js
let _batchNumberByWeeklyBatchIdForLedger = new Map();
let _currentExportColumns = null;
let _currentExportRows = null;
let _currentExportMeta = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('accounting');
  renderSidebar('accounting-cash-ledger');
  renderHeader('دفتر الصندوق والبنك');

  [_allAccountsForLedger, _allEntriesForLedger] = await Promise.all([getAllAccounts(), getPostedJournalEntries()]);
  _journalEntryByIdForLedger = new Map(_allEntriesForLedger.map(e => [e.id, e]));
  _batchNumberByWeeklyBatchIdForLedger = new Map((await getAllWeeklyBatches()).map(b => [b.id, b.batchNumber]));
  const mappings = await loadAccountMappings();

  // خيارا الحساب (الصندوق/البنك) يُشتقان من "ربط العمليات بالحسابات" — الافتراضي 11101/11102
  const select = document.getElementById('filter-account');
  select.innerHTML = [
    getMappedAccount('cash', _allAccountsForLedger, mappings),
    getMappedAccount('bank', _allAccountsForLedger, mappings),
  ].filter(Boolean)
    .map(a => `<option value="${a.code}">${a.code} - ${a.name}</option>`)
    .join('');

  document.getElementById('filter-account').addEventListener('change', _render);
  document.getElementById('filter-from').addEventListener('change', _render);
  document.getElementById('filter-to').addEventListener('change', _render);
  document.getElementById('print-btn').addEventListener('click', () => window.print());
  document.getElementById('export-excel-btn').addEventListener('click', () => {
    if (_currentExportColumns) exportRowsToExcel('دفتر_الصندوق', _currentExportColumns, _currentExportRows, _currentExportMeta);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    if (_currentExportColumns) exportRowsToPdf('دفتر الصندوق والبنك', _currentExportColumns, _currentExportRows, _currentExportMeta);
  });

  _render();
});

function _render() {
  const accountCode = document.getElementById('filter-account').value;
  const from = document.getElementById('filter-from').value;
  const to = document.getElementById('filter-to').value;
  const container = document.getElementById('ledger-content');

  const account = getAccountByCode(accountCode, _allAccountsForLedger);
  if (!account) {
    container.innerHTML = `<div class="empty-state">الحساب الأساسي غير موجود في شجرة الحسابات</div>`;
    return;
  }

  const full = computeAccountLedgerRows(account, _allEntriesForLedger);

  const rowsBeforeFrom = from ? full.filter(r => r.date < from) : [];
  const openingForPeriod = from && rowsBeforeFrom.length ? rowsBeforeFrom[rowsBeforeFrom.length - 1].runningBalance : 0;

  const periodRows = full.filter(r => (!from || r.date >= from) && (!to || r.date <= to));

  const rows = periodRows.map(r => {
    // رقم الأرشفة تلقائي بالكامل: مأخوذ من الأرشفة الأسبوعية للقيود (WeeklyBatches) التي يقع ضمنها هذا القيد —
    // نفس منطق عمود "رقم الأرشفة" في expense-list-page.js/revenue-list-page.js/purchase-list-page.js
    const journalEntry = _journalEntryByIdForLedger.get(r.entryId);
    const archiveNumber = journalEntry && journalEntry.weeklyBatchId
      ? (_batchNumberByWeeklyBatchIdForLedger.get(journalEntry.weeklyBatchId) || null)
      : null;
    return {
      entryId: r.entryId,
      dateLabel: formatDateArabic(r.date),
      entryNumber: r.entryNumber,
      description: r.description,
      debitLabel: r.debit > 0 ? formatCurrency(r.debit) : '-',
      creditLabel: r.credit > 0 ? formatCurrency(r.credit) : '-',
      balanceLabel: formatCurrency(r.runningBalance),
      archiveNumberLabel: archiveNumber || '-',
    };
  });

  const closingBalance = periodRows.length ? periodRows[periodRows.length - 1].runningBalance : openingForPeriod;

  container.innerHTML = `
    ${kpiGrid([
      { value: formatCurrency(openingForPeriod), label: 'رصيد أول المدة', tone: 'blue', icon: '📅' },
      { value: formatNumber(periodRows.length), label: 'عدد الحركات خلال الفترة', tone: 'blue', icon: '🔁' },
      { value: formatCurrency(closingBalance), label: 'الرصيد الحالي', tone: closingBalance >= 0 ? 'green' : 'red', icon: '💰' },
    ])}
    <div id="ledger-table"></div>
  `;

  const columns = [
    { key: 'dateLabel', label: 'التاريخ', sortable: true },
    { key: 'entryNumber', label: 'رقم القيد', sortable: false },
    { key: 'description', label: 'البيان', sortable: false },
    { key: 'debitLabel', label: 'قبض', sortable: false },
    { key: 'creditLabel', label: 'صرف', sortable: false },
    { key: 'balanceLabel', label: 'الرصيد', sortable: false },
    { key: 'archiveNumberLabel', label: 'رقم الأرشفة', sortable: false },
  ];

  const footerRow = {
    dateLabel: 'رصيد أول المدة', entryNumber: '', description: '', debitLabel: '', creditLabel: '',
    balanceLabel: formatCurrency(openingForPeriod), archiveNumberLabel: '',
  };

  _currentExportColumns = columns;
  _currentExportRows = [footerRow, ...rows];
  _currentExportMeta = {
    infoLines: [
      `الحساب: ${account.name}`,
      `الفترة: ${from ? formatDateArabic(from) : 'بداية الحساب'} — ${to ? formatDateArabic(to) : 'اليوم'}`,
    ],
  };

  renderDataTable('ledger-table', columns, rows, {
    emptyMessage: `لا توجد حركات على حساب "${account.name}" خلال هذه الفترة`,
    onRowClick: (row) => { window.location.href = `journal-entry-form.html?id=${row.entryId}`; },
    footerRow: rows.length ? {
      dateLabel: 'الرصيد الحالي', entryNumber: '', description: '', debitLabel: '', creditLabel: '',
      balanceLabel: formatCurrency(closingBalance), archiveNumberLabel: '',
    } : null,
  });
}
