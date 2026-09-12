// js/pages/party-statement-page.js
// كشف حساب طرف واحد: رصيد أول المدة + كل الحركات (فواتير آجلة/سندات قبض أو صرف/مرتجعات وخصومات) مع رصيد
// تراكمي، مبني على getPartyLedgerEntries في party-service.js

let _allClientsForStatement = [];
let _allSuppliersForStatement = [];
let _allPartnersForStatement = [];
let _allRevenuesForStatement = [];
let _allPurchasesForStatement = [];
let _allPartyTransactionsForStatement = [];
let _allFixedAssetsForStatement = [];
let _entryNumberByJournalEntryId = new Map();
let _currentParty = null;
let _currentExportColumns = null;
let _currentExportRows = null;
let _currentExportMeta = null;

// نوع الطرف → قائمة الأطراف المطابقة (لتفادي تكرار ternary ثنائي عبر الملف بعد إضافة الشريك)
function _partyListForType(type) {
  if (type === 'supplier') return _allSuppliersForStatement;
  if (type === 'partner') return _allPartnersForStatement;
  return _allClientsForStatement;
}
const _PARTY_TYPE_PLURAL_LABEL = { client: 'عملاء', supplier: 'موردون', partner: 'شركاء' };

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('parties');
  renderSidebar('parties-statement');
  renderHeader('كشف حساب عميل/مورّد/شريك');

  let allJournalEntriesForStatement;
  [_allClientsForStatement, _allSuppliersForStatement, _allPartnersForStatement, _allRevenuesForStatement, _allPurchasesForStatement, _allPartyTransactionsForStatement, _allFixedAssetsForStatement, allJournalEntriesForStatement] = await Promise.all([
    getAllParties('client'), getAllParties('supplier'), getAllParties('partner'),
    getAllRevenues(), getAllPurchases(), getAllPartyTransactions(), getAllFixedAssets(), getAllJournalEntries(),
  ]);
  _entryNumberByJournalEntryId = new Map(allJournalEntriesForStatement.map(e => [e.id, e.entryNumber]));

  const params = new URLSearchParams(window.location.search);
  const typeParam = ['supplier', 'partner'].includes(params.get('type')) ? params.get('type') : 'client';
  const partyIdParam = params.get('partyId');

  document.getElementById('filter-type').value = typeParam;
  _populatePartySelect();
  if (partyIdParam) document.getElementById('filter-party').value = partyIdParam;

  document.getElementById('filter-type').addEventListener('change', () => { _populatePartySelect(); _render(); });
  document.getElementById('filter-party').addEventListener('change', _render);
  document.getElementById('filter-from').addEventListener('change', _render);
  document.getElementById('filter-to').addEventListener('change', _render);
  document.getElementById('print-btn').addEventListener('click', () => window.print());
  document.getElementById('export-excel-btn').addEventListener('click', () => {
    if (_currentExportColumns) exportRowsToExcel('كشف_حساب', _currentExportColumns, _currentExportRows, _currentExportMeta);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    if (_currentExportColumns) exportRowsToPdf('كشف حساب', _currentExportColumns, _currentExportRows, _currentExportMeta);
  });

  _render();
});

function _populatePartySelect() {
  const type = document.getElementById('filter-type').value;
  const list = _partyListForType(type);
  const select = document.getElementById('filter-party');
  select.innerHTML = list.length
    ? list.map(p => `<option value="${p.id}">${p.name} (${p.partyCode || ''})</option>`).join('')
    : `<option value="">لا يوجد ${_PARTY_TYPE_PLURAL_LABEL[type]} مكوَّدون بعد</option>`;
}

const _LEDGER_KIND_ICON = { invoice: '🧾', collection: '💵', payment: '💵', return: '↩️', discount: '➖', capitalIn: '⬆️', capitalOut: '⬇️', assetContribution: '🏗️' };

function _render() {
  const type = document.getElementById('filter-type').value;
  const partyIdValue = document.getElementById('filter-party').value;
  const from = document.getElementById('filter-from').value;
  const to = document.getElementById('filter-to').value;
  const container = document.getElementById('statement-content');

  if (!partyIdValue) {
    container.innerHTML = `<div class="empty-state">لا يوجد ${_PARTY_TYPE_PLURAL_LABEL[type]} مكوَّدون بعد. اذهب لصفحة "العملاء والموردون" لإضافة واحد.</div>`;
    _currentExportColumns = null;
    _currentExportRows = null;
    _currentExportMeta = null;
    _currentParty = null;
    return;
  }

  const partyId = Number(partyIdValue);
  const list = _partyListForType(type);
  const party = list.find(p => p.id === partyId);
  _currentParty = party;
  if (!party) return;

  const full = getPartyLedgerEntries(party, _allRevenuesForStatement, _allPurchasesForStatement, _allPartyTransactionsForStatement, _allFixedAssetsForStatement);

  // "رصيد أول المدة" عند تطبيق فلتر "من": رصيد كل الحركات قبل هذا التاريخ (بما فيها الرصيد الافتتاحي الحقيقي)
  const rowsBeforeFrom = from ? full.rows.filter(r => r.date < from) : [];
  const openingForPeriod = from && rowsBeforeFrom.length ? rowsBeforeFrom[rowsBeforeFrom.length - 1].runningBalance : full.openingBalance;

  const periodRows = full.rows.filter(r => (!from || r.date >= from) && (!to || r.date <= to));

  const rows = periodRows.map(r => ({
    dateLabel: formatDateArabic(r.date),
    entryNumber: r.journalEntryId ? (_entryNumberByJournalEntryId.get(r.journalEntryId) || '-') : '-',
    journalEntryId: r.journalEntryId || null,
    label: `${_LEDGER_KIND_ICON[r.kind] || ''} ${r.label}`,
    debitLabel: r.amount > 0 ? formatCurrency(r.amount) : '-',
    creditLabel: r.amount < 0 ? formatCurrency(Math.abs(r.amount)) : '-',
    balanceLabel: `${formatCurrency(Math.abs(r.runningBalance))} ${r.runningBalance >= 0 ? 'مدين' : 'دائن'}`,
    date: r.date,
  }));

  const closingBalance = periodRows.length ? periodRows[periodRows.length - 1].runningBalance : openingForPeriod;

  container.innerHTML = `
    <div class="card" style="margin-bottom: var(--spacing-3);">
      <div class="card__header"><h3>${party.name} (${party.partyCode || ''}) — ${PARTY_TYPE_LABELS[party.type]}</h3></div>
      <div style="padding: 0 var(--spacing-3) var(--spacing-3); font-size:13px; color: var(--color-text-secondary); display:flex; gap: var(--spacing-4); flex-wrap:wrap;">
        ${party.phone ? `<span>📞 ${party.phone}</span>` : ''}
        ${party.address ? `<span>📍 ${party.address}</span>` : ''}
        ${party.bankAccount ? `<span>🏦 ${party.bankAccount}</span>` : ''}
      </div>
    </div>
    ${kpiGrid([
      { value: `${formatCurrency(Math.abs(openingForPeriod))} ${openingForPeriod >= 0 ? 'مدين' : 'دائن'}`, label: 'رصيد أول المدة', tone: 'blue', icon: '📅' },
      { value: formatNumber(periodRows.length), label: 'عدد الحركات خلال الفترة', tone: 'blue', icon: '🔁' },
      { value: `${formatCurrency(Math.abs(closingBalance))} ${closingBalance >= 0 ? 'مدين' : 'دائن'}`, label: 'الرصيد الحالي', tone: closingBalance >= 0 ? 'red' : 'green', icon: '💰' },
    ])}
    <div id="statement-table"></div>
  `;

  const columns = [
    { key: 'dateLabel', label: 'التاريخ', sortable: true },
    { key: 'entryNumber', label: 'رقم القيد', sortable: false },
    { key: 'label', label: 'البيان', sortable: false },
    { key: 'debitLabel', label: 'مدين', sortable: false },
    { key: 'creditLabel', label: 'دائن', sortable: false },
    { key: 'balanceLabel', label: 'الرصيد', sortable: false },
  ];

  const footerRow = {
    dateLabel: 'رصيد أول المدة',
    entryNumber: '',
    label: '',
    debitLabel: '',
    creditLabel: '',
    balanceLabel: `${formatCurrency(Math.abs(openingForPeriod))} ${openingForPeriod >= 0 ? 'مدين' : 'دائن'}`,
  };

  _currentExportColumns = columns;
  _currentExportRows = [footerRow, ...rows];
  _currentExportMeta = {
    infoLines: [
      `${PARTY_TYPE_LABELS[party.type]}: ${party.name}${party.partyCode ? ` (${party.partyCode})` : ''}`,
      `الفترة: ${from ? formatDateArabic(from) : 'بداية الحساب'} — ${to ? formatDateArabic(to) : 'اليوم'}`,
    ],
  };

  renderDataTable('statement-table', columns, rows, {
    emptyMessage: `لا توجد حركات آجلة مسجّلة لـ "${party.name}" خلال هذه الفترة`,
    // كل سطر بقيد فعلي (journalEntryId) قابل للنقر لفتحه — نفس نمط cash-ledger-page.js؛ سطر بلا قيد
    // (journalEntryId فارغ، مثل سند لم يُرحَّل قيده لسبب ما) لا يستجيب للنقر
    onRowClick: (row) => { if (row.journalEntryId) window.location.href = `../accounting/journal-entry-form.html?id=${row.journalEntryId}`; },
    footerRow: rows.length ? {
      dateLabel: 'الرصيد الحالي',
      entryNumber: '',
      label: '',
      debitLabel: '',
      creditLabel: '',
      balanceLabel: `${formatCurrency(Math.abs(closingBalance))} ${closingBalance >= 0 ? 'مدين' : 'دائن'}`,
    } : null,
  });
}
