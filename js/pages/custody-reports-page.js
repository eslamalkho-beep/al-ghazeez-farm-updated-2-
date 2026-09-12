// js/pages/custody-reports-page.js
// 9 تبويبات داخلية على نفس مجموعة بيانات CustodyItems (البند 5 من وحدة إدارة العهد)

let _allItemsForCustodyReports = [];
let _employeesForCustodyReports = [];
let _entryNumberByJournalEntryIdForCustody = new Map();
let _activeCustodyReportTab = 'all';
let _currentExportColumns = null;
let _currentExportRows = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('reports');
  renderSidebar('reports-custody');
  renderHeader('تقارير العهد');

  const [items, employees, journalEntries] = await Promise.all([getAllCustodyItems(), dbGetAll('Employees'), getAllJournalEntries()]);
  _allItemsForCustodyReports = items;
  _employeesForCustodyReports = employees.filter(e => e.status !== 'deleted');
  _entryNumberByJournalEntryIdForCustody = new Map(journalEntries.map(e => [e.id, e.entryNumber]));

  document.querySelectorAll('.report-tabs [data-tab]').forEach(btn => {
    btn.addEventListener('click', () => _switchTab(btn.dataset.tab));
  });
  document.getElementById('report-from').addEventListener('change', () => _renderTab());
  document.getElementById('report-to').addEventListener('change', () => _renderTab());

  document.getElementById('export-excel-btn').addEventListener('click', () => {
    if (_currentExportColumns) exportRowsToExcel('تقرير_العهد', _currentExportColumns, _currentExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    if (_currentExportColumns) exportRowsToPdf('تقرير العهد', _currentExportColumns, _currentExportRows);
  });

  _renderTab();
});

function _switchTab(tab) {
  _activeCustodyReportTab = tab;
  document.querySelectorAll('.report-tabs [data-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.getElementById('period-filters').style.display = tab === 'byPeriod' ? '' : 'none';
  _renderTab();
}

function _employeeName(id) {
  const emp = _employeesForCustodyReports.find(e => e.id === Number(id));
  return emp ? emp.fullName : 'موظف محذوف';
}

const _DETAIL_COLUMNS = [
  { key: 'custodyNumber', label: 'رقم العهدة' },
  { key: 'dateLabel', label: 'التاريخ' },
  { key: 'entryNumber', label: 'رقم القيد' },
  { key: 'employeeName', label: 'الموظف' },
  { key: 'typeLabel', label: 'النوع' },
  { key: 'purpose', label: 'البيان' },
  { key: 'amountLabel', label: 'المبلغ/القيمة' },
  { key: 'settledLabel', label: 'المسدد' },
  { key: 'remainingLabel', label: 'المتبقي' },
  { key: 'statusLabel', label: 'الحالة' },
];

function _toDetailRow(item) {
  return {
    custodyNumber: item.custodyNumber || item.reference || ('#' + item.id),
    dateLabel: formatDateArabic(item.date || item.createdAt),
    // قيد إصدار العهدة نفسه فقط (لا قيود التسويات اللاحقة، انظر CustodySettlements) — قد يكون فارغًا لعهدة
    // قديمة قبل الترحيل التلقائي أو منقولة (source:'transfer') بلا أثر نقدي حقيقي
    entryNumber: item.journalEntryId ? (_entryNumberByJournalEntryIdForCustody.get(item.journalEntryId) || '-') : '-',
    journalEntryId: item.journalEntryId || null,
    employeeName: _employeeName(item.employeeId),
    typeLabel: CUSTODY_TYPE_LABELS[item.custodyType] || 'نقدية',
    purpose: item.purpose || item.description || '-',
    amountLabel: formatCurrency(item.amount),
    settledLabel: formatCurrency(item.settledAmount || 0),
    remainingLabel: formatCurrency(remainingCustodyAmount(item)),
    statusLabel: CUSTODY_STATUS_LABELS[getEffectiveCustodyStatus(item)] || '-',
  };
}

function _renderDetailTable(items) {
  const rows = items.map(_toDetailRow);
  _currentExportColumns = _DETAIL_COLUMNS;
  _currentExportRows = rows;
  document.getElementById('report-content').innerHTML = '<div id="custody-report-table"></div>';
  renderDataTable('custody-report-table', _DETAIL_COLUMNS.map(c => ({ ...c, sortable: true })), rows, {
    emptyMessage: 'لا توجد عهد مطابقة',
    onRowClick: (row) => { if (row.journalEntryId) window.location.href = `../accounting/journal-entry-form.html?id=${row.journalEntryId}`; },
  });
}

const _GROUP_COLUMNS = [
  { key: 'groupLabel', label: 'المجموعة' },
  { key: 'countLabel', label: 'عدد العهد' },
  { key: 'issuedLabel', label: 'إجمالي العهد' },
  { key: 'settledLabel', label: 'إجمالي المسدد' },
  { key: 'remainingLabel', label: 'الرصيد المتبقي' },
];

// groupKeyFn: تُرجع مفتاح ونصًا معروضًا لكل عنصر — تُستخدم لتبويبات حسب الموظف/الفرع/القسم/النوع
function _renderGroupedTable(items, groupKeyFn, options = {}) {
  const groups = {};
  items.forEach(item => {
    const { key, label } = groupKeyFn(item);
    if (!groups[key]) groups[key] = { label, count: 0, issued: 0, settled: 0 };
    groups[key].count += 1;
    groups[key].issued += Number(item.amount || 0);
    groups[key].settled += Number(item.settledAmount || 0);
  });

  let rows = Object.values(groups).map(g => ({
    groupLabel: g.label,
    countLabel: formatNumber(g.count),
    issuedLabel: formatCurrency(g.issued),
    settledLabel: formatCurrency(g.settled),
    remainingLabel: formatCurrency(g.issued - g.settled),
    _remaining: g.issued - g.settled,
  }));

  if (options.onlyWithBalance) rows = rows.filter(r => r._remaining > 0.01);
  if (options.sortByRemainingDesc) rows.sort((a, b) => b._remaining - a._remaining);

  _currentExportColumns = _GROUP_COLUMNS;
  _currentExportRows = rows;
  document.getElementById('report-content').innerHTML = '<div id="custody-report-table"></div>';
  renderDataTable('custody-report-table', _GROUP_COLUMNS.map(c => ({ ...c, sortable: true })), rows, {
    emptyMessage: 'لا توجد بيانات',
  });
}

function _renderTab() {
  const all = _allItemsForCustodyReports;

  switch (_activeCustodyReportTab) {
    case 'all':
      return _renderDetailTable(all);
    case 'open':
      return _renderDetailTable(all.filter(i => i.status === 'open' || i.status === 'partially_settled'));
    case 'overdue':
      return _renderDetailTable(all.filter(i => getEffectiveCustodyStatus(i) === 'overdue'));
    case 'byEmployee':
      return _renderGroupedTable(all, i => ({ key: i.employeeId, label: _employeeName(i.employeeId) }));
    case 'byType':
      return _renderGroupedTable(all, i => ({ key: i.custodyType || 'cash', label: CUSTODY_TYPE_LABELS[i.custodyType] || 'نقدية' }));
    case 'byPeriod': {
      const from = document.getElementById('report-from').value;
      const to = document.getElementById('report-to').value;
      return _renderDetailTable(all.filter(i => (!from || i.date >= from) && (!to || i.date <= to)));
    }
    case 'equipment':
      return _renderDetailTable(all.filter(i => !isCashCustody(i)));
    case 'cash':
      return _renderDetailTable(all.filter(i => isCashCustody(i)));
    case 'dueBalances':
      return _renderGroupedTable(all, i => ({ key: i.employeeId, label: _employeeName(i.employeeId) }), { onlyWithBalance: true, sortByRemainingDesc: true });
    default:
      return _renderDetailTable(all);
  }
}
