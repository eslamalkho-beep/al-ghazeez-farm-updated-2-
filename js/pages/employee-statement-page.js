// js/pages/employee-statement-page.js
// كشف حساب موظف واحد: رصيد أول المدة + كل الحركات (عهد صادرة + تسويات) مع رصيد جارٍ (البند 3)

let _employeesForStatement = [];
let _allCustodyItemsForStatement = [];
let _allSettlementsForStatement = [];
let _currentExportColumns = null;
let _currentExportRows = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('custody');
  renderSidebar('custody-statement');
  renderHeader('كشف حساب موظف');

  const [employees, items, settlements] = await Promise.all([
    dbGetAll('Employees'),
    getAllCustodyItems(),
    getAllCustodySettlements(),
  ]);
  _employeesForStatement = employees.filter(e => e.status !== 'deleted');
  _allCustodyItemsForStatement = items;
  _allSettlementsForStatement = settlements;

  document.getElementById('f-employeeId').innerHTML = _employeesForStatement.length
    ? _employeesForStatement.map(e => `<option value="${e.id}">${e.fullName}</option>`).join('')
    : '<option value="">-- لا يوجد موظفون --</option>';

  const urlParams = new URLSearchParams(window.location.search);
  const presetEmployeeId = urlParams.get('employeeId');
  if (presetEmployeeId) document.getElementById('f-employeeId').value = presetEmployeeId;

  document.getElementById('f-employeeId').addEventListener('change', _renderStatement);
  document.getElementById('f-from').addEventListener('change', _renderStatement);
  document.getElementById('f-to').addEventListener('change', _renderStatement);
  document.getElementById('print-btn').addEventListener('click', () => window.print());
  document.getElementById('export-excel-btn').addEventListener('click', () => {
    if (_currentExportColumns) exportRowsToExcel('كشف_حساب_عهدة_موظف', _currentExportColumns, _currentExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    if (_currentExportColumns) exportRowsToPdf('كشف حساب عهدة موظف', _currentExportColumns, _currentExportRows);
  });

  _renderStatement();
});

// يبني كل "أحداث" العهدة لموظف واحد (إصدار + كل أنواع التسوية) كقائمة موحّدة مرتّبة زمنيًا
function _buildEmployeeEvents(employeeId) {
  const items = _allCustodyItemsForStatement.filter(i => Number(i.employeeId) === Number(employeeId) && i.status !== 'cancelled');
  const events = [];

  items.forEach(item => {
    events.push({
      date: item.date || item.createdAt?.slice(0, 10),
      id: `issue-${item.id}`,
      reference: item.custodyNumber || item.reference || ('#' + item.id),
      label: `إصدار عهدة ${item.custodyNumber || item.reference || ('#' + item.id)} (${CUSTODY_TYPE_LABELS[item.custodyType] || 'نقدية'})`,
      debit: Number(item.amount || 0),
      credit: 0,
    });

    const settlements = _allSettlementsForStatement.filter(s => Number(s.custodyItemId) === item.id);
    settlements.forEach(s => {
      events.push({
        date: s.date,
        id: `settle-${s.id}`,
        reference: s.voucherNumber || ('#' + s.id),
        label: `${CUSTODY_SETTLEMENT_TYPE_LABELS[s.settlementType] || s.settlementType} - عهدة ${item.custodyNumber || item.reference || ('#' + item.id)}`,
        debit: 0,
        credit: Number(s.amount || 0),
      });
    });
  });

  return events.sort((a, b) => (a.date === b.date ? 0 : (a.date < b.date ? -1 : 1)));
}

function _renderStatement() {
  const employeeId = document.getElementById('f-employeeId').value;
  const from = document.getElementById('f-from').value;
  const to = document.getElementById('f-to').value;

  const container = document.getElementById('statement-table');
  const kpisContainer = document.getElementById('statement-kpis');
  if (!employeeId) {
    container.innerHTML = '';
    kpisContainer.innerHTML = '';
    _currentExportColumns = null;
    return;
  }

  const allEvents = _buildEmployeeEvents(employeeId);
  const openingEvents = from ? allEvents.filter(e => e.date && e.date < from) : [];
  const openingBalance = openingEvents.reduce((s, e) => s + e.debit - e.credit, 0);

  const periodEvents = allEvents.filter(e => (!from || !e.date || e.date >= from) && (!to || !e.date || e.date <= to));

  let running = openingBalance;
  const rows = periodEvents.map(e => {
    running += e.debit - e.credit;
    return {
      dateLabel: formatDateArabic(e.date),
      reference: e.reference || '-',
      label: e.label,
      debitLabel: e.debit > 0 ? formatCurrency(e.debit) : '-',
      creditLabel: e.credit > 0 ? formatCurrency(e.credit) : '-',
      balanceLabel: formatCurrency(running),
    };
  });

  const currentBalance = running;

  kpisContainer.innerHTML = kpiGrid([
    { value: formatCurrency(openingBalance), label: 'رصيد أول المدة', tone: 'blue' },
    { value: formatNumber(periodEvents.length), label: 'عدد الحركات خلال الفترة', tone: 'blue' },
    { value: formatCurrency(currentBalance), label: 'الرصيد الحالي', tone: currentBalance > 0.01 ? 'red' : 'green' },
  ]);

  _currentExportColumns = [
    { key: 'dateLabel', label: 'التاريخ' },
    { key: 'reference', label: 'المرجع' },
    { key: 'label', label: 'البيان' },
    { key: 'debitLabel', label: 'مدين (عهد)' },
    { key: 'creditLabel', label: 'دائن (تسويات)' },
    { key: 'balanceLabel', label: 'الرصيد' },
  ];
  _currentExportRows = rows;

  renderDataTable('statement-table', _currentExportColumns.map(c => ({ ...c, sortable: false })), rows, {
    emptyMessage: 'لا توجد حركات خلال هذه الفترة',
  });
}
