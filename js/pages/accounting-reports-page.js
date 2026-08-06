// js/pages/accounting-reports-page.js
// دفتر الأستاذ / ميزان المراجعة / قائمة الدخل / الميزانية العمومية — كلها محسوبة حيًا من JournalEntries

let _rptAccounts = [];
let _rptEntries = [];
let _activeAccountingTab = 'ledger';
let _selectedLedgerAccountId = null;

const _accountingTabTitles = {
  ledger: 'دفتر الأستاذ',
  trial: 'ميزان المراجعة',
  income: 'قائمة الدخل',
  balance: 'الميزانية العمومية',
};

let _currentExportColumns = null;
let _currentExportRows = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('accounting');
  renderSidebar('accounting');
  renderHeader('التقارير المحاسبية');

  [_rptAccounts, _rptEntries] = await Promise.all([getAllAccounts(), getAllJournalEntries()]);
  _rptAccounts.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
  if (_rptAccounts.length) _selectedLedgerAccountId = _rptAccounts[0].id;

  document.querySelectorAll('.report-tab[data-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.report-tab[data-tab]').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      _activeAccountingTab = tab.dataset.tab;
      _renderActiveAccountingTab();
    });
  });

  document.getElementById('report-from').addEventListener('change', _renderActiveAccountingTab);
  document.getElementById('report-to').addEventListener('change', _renderActiveAccountingTab);

  document.getElementById('export-excel-btn').addEventListener('click', () => {
    if (!_currentExportRows) { showToast('لا يوجد جدول متاح للتصدير في هذا العرض', 'warning'); return; }
    exportRowsToExcel(_accountingTabTitles[_activeAccountingTab] || 'تقرير', _currentExportColumns, _currentExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    if (!_currentExportRows) { showToast('لا يوجد جدول متاح للتصدير في هذا العرض', 'warning'); return; }
    exportRowsToPdf(_accountingTabTitles[_activeAccountingTab] || 'تقرير', _currentExportColumns, _currentExportRows);
  });

  _renderActiveAccountingTab();
});

function _renderActiveAccountingTab() {
  const container = document.getElementById('report-content');
  if (_activeAccountingTab === 'ledger') return _renderLedgerTab(container);
  if (_activeAccountingTab === 'trial') return _renderTrialBalanceTab(container);
  if (_activeAccountingTab === 'income') return _renderIncomeStatementTab(container);
  if (_activeAccountingTab === 'balance') return _renderBalanceSheetTab(container);
}

function _computeOpeningBalance(account, from) {
  if (!from) return 0;
  const priorEntries = _rptEntries.filter(e => e.date < from);
  return computeAccountBalance(account, priorEntries).balance;
}

function _renderLedgerTab(container) {
  const from = document.getElementById('report-from').value;
  const to = document.getElementById('report-to').value;

  container.innerHTML = `
    <div class="card" style="margin-bottom: var(--spacing-3); display:flex; gap: var(--spacing-3); align-items:center; flex-wrap:wrap;">
      <label style="font-size:13px; color:var(--color-text-secondary);">الحساب</label>
      <select id="ledger-account-select" class="form-control" style="max-width:320px;">
        ${_rptAccounts.map(a => `<option value="${a.id}" ${a.id === _selectedLedgerAccountId ? 'selected' : ''}>${a.code} - ${a.name}</option>`).join('')}
      </select>
    </div>
    <div id="ledger-table"></div>
  `;

  if (!_rptAccounts.length) {
    document.getElementById('ledger-table').innerHTML = '<div class="data-table-empty">لا توجد حسابات مكوَّدة بعد</div>';
    _currentExportColumns = null;
    _currentExportRows = null;
    return;
  }

  document.getElementById('ledger-account-select').addEventListener('change', (e) => {
    _selectedLedgerAccountId = Number(e.target.value);
    _renderLedgerTab(container);
  });

  const account = _rptAccounts.find(a => a.id === _selectedLedgerAccountId);
  const opening = _computeOpeningBalance(account, from);

  const lines = [];
  _rptEntries
    .filter(e => (!from || e.date >= from) && (!to || e.date <= to))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .forEach(entry => {
      (entry.lines || []).forEach(line => {
        if (Number(line.accountId) !== Number(account.id)) return;
        lines.push({ entry, line });
      });
    });

  let running = opening;
  const rows = [
    { dateLabel: '-', entryNumber: '-', description: 'رصيد افتتاحي', debitLabel: '-', creditLabel: '-', balanceLabel: formatCurrency(opening) },
  ];
  lines.forEach(({ entry, line }) => {
    const debit = Number(line.debit || 0);
    const credit = Number(line.credit || 0);
    running += account.normalBalance === 'debit' ? (debit - credit) : (credit - debit);
    rows.push({
      dateLabel: formatDateArabic(entry.date),
      entryNumber: entry.entryNumber,
      description: line.lineNote || entry.description,
      debitLabel: debit ? formatCurrency(debit) : '-',
      creditLabel: credit ? formatCurrency(credit) : '-',
      balanceLabel: formatCurrency(running),
    });
  });

  const columns = [
    { key: 'dateLabel', label: 'التاريخ', sortable: false },
    { key: 'entryNumber', label: 'رقم القيد', sortable: false },
    { key: 'description', label: 'الوصف', sortable: false },
    { key: 'debitLabel', label: 'مدين', sortable: false },
    { key: 'creditLabel', label: 'دائن', sortable: false },
    { key: 'balanceLabel', label: 'الرصيد', sortable: false },
  ];

  _currentExportColumns = columns;
  _currentExportRows = rows;

  renderDataTable('ledger-table', columns, rows, {
    searchable: false,
    pageSize: rows.length || 1,
    emptyMessage: 'لا توجد حركات على هذا الحساب خلال الفترة',
  });
}

function _renderTrialBalanceTab(container) {
  const to = document.getElementById('report-to').value;
  const { rows, totalDebit, totalCredit } = computeTrialBalance(_rptAccounts, _rptEntries, to || null);

  const tableRows = rows
    .filter(r => r.debitBalance !== 0 || r.creditBalance !== 0)
    .map(r => ({
      code: r.account.code,
      name: r.account.name,
      typeLabel: ACCOUNT_TYPE_LABELS[r.account.type] || r.account.type,
      debitLabel: r.debitBalance ? formatCurrency(r.debitBalance) : '-',
      creditLabel: r.creditBalance ? formatCurrency(r.creditBalance) : '-',
    }));

  container.innerHTML = `
    ${kpiGrid([
      { value: formatCurrency(totalDebit), label: 'إجمالي المدين', tone: 'blue' },
      { value: formatCurrency(totalCredit), label: 'إجمالي الدائن', tone: 'green' },
      { value: Math.abs(totalDebit - totalCredit) < 0.01 ? 'متوازن ✓' : 'غير متوازن', label: 'حالة الميزان', tone: Math.abs(totalDebit - totalCredit) < 0.01 ? 'green' : 'red' },
    ], 3)}
    <div id="trial-balance-table"></div>
  `;

  const columns = [
    { key: 'code', label: 'الكود', sortable: true },
    { key: 'name', label: 'اسم الحساب', sortable: true },
    { key: 'typeLabel', label: 'النوع', sortable: true },
    { key: 'debitLabel', label: 'مدين', sortable: false },
    { key: 'creditLabel', label: 'دائن', sortable: false },
  ];

  _currentExportColumns = columns;
  _currentExportRows = tableRows;

  renderDataTable('trial-balance-table', columns, tableRows, {
    searchable: false,
    pageSize: tableRows.length || 1,
    emptyMessage: 'لا توجد أرصدة لعرضها بعد',
    footerRow: {
      code: '', name: '', typeLabel: 'الإجمالي',
      debitLabel: formatCurrency(totalDebit), creditLabel: formatCurrency(totalCredit),
    },
  });
}

function _renderIncomeStatementTab(container) {
  const from = document.getElementById('report-from').value;
  const to = document.getElementById('report-to').value;
  const { revenueRows, expenseRows, totalRevenue, totalExpense, netIncome } = computeIncomeStatement(_rptAccounts, _rptEntries, from || null, to || null);

  const rows = [
    ...revenueRows.map(r => ({ code: r.account.code, name: r.account.name, sectionLabel: 'إيرادات', amountLabel: formatCurrency(r.amount) })),
    ...expenseRows.map(r => ({ code: r.account.code, name: r.account.name, sectionLabel: 'مصروفات', amountLabel: formatCurrency(r.amount) })),
  ];

  container.innerHTML = `
    ${kpiGrid([
      { value: formatCurrency(totalRevenue), label: 'إجمالي الإيرادات', tone: 'green' },
      { value: formatCurrency(totalExpense), label: 'إجمالي المصروفات', tone: 'red' },
      { value: formatCurrency(netIncome), label: 'صافي الدخل', tone: netIncome >= 0 ? 'green' : 'red' },
    ], 3)}
    <div id="income-statement-table"></div>
  `;

  const columns = [
    { key: 'code', label: 'الكود', sortable: false },
    { key: 'name', label: 'اسم الحساب', sortable: false },
    { key: 'sectionLabel', label: 'القسم', sortable: true },
    { key: 'amountLabel', label: 'المبلغ', sortable: false },
  ];

  _currentExportColumns = columns;
  _currentExportRows = rows;

  renderDataTable('income-statement-table', columns, rows, {
    searchable: false,
    pageSize: rows.length || 1,
    emptyMessage: 'لا توجد حركات إيرادات أو مصروفات خلال الفترة',
    footerRow: { code: '', name: '', sectionLabel: 'صافي الدخل', amountLabel: formatCurrency(netIncome) },
  });
}

function _renderBalanceSheetTab(container) {
  const to = document.getElementById('report-to').value || todayIso();
  const { assetRows, liabilityRows, equityRows, netIncome, totalAssets, totalLiabilities, totalEquity } = computeBalanceSheet(_rptAccounts, _rptEntries, to);

  const rows = [
    ...assetRows.map(r => ({ code: r.account.code, name: r.account.name, sectionLabel: 'أصول', amountLabel: formatCurrency(r.amount) })),
    ...liabilityRows.map(r => ({ code: r.account.code, name: r.account.name, sectionLabel: 'خصوم', amountLabel: formatCurrency(r.amount) })),
    ...equityRows.map(r => ({ code: r.account.code, name: r.account.name, sectionLabel: 'حقوق ملكية', amountLabel: formatCurrency(r.amount) })),
    { code: '-', name: 'أرباح غير مرحّلة (صافي الدخل حتى هذا التاريخ)', sectionLabel: 'حقوق ملكية', amountLabel: formatCurrency(netIncome) },
  ];

  const isBalanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01;

  container.innerHTML = `
    ${kpiGrid([
      { value: formatCurrency(totalAssets), label: `إجمالي الأصول (كما في ${formatDateArabic(to)})`, tone: 'blue' },
      { value: formatCurrency(totalLiabilities + totalEquity), label: 'إجمالي الخصوم وحقوق الملكية', tone: 'green' },
      { value: isBalanced ? 'متوازنة ✓' : 'غير متوازنة', label: 'حالة الميزانية', tone: isBalanced ? 'green' : 'red' },
    ], 3)}
    <div id="balance-sheet-table"></div>
  `;

  const columns = [
    { key: 'code', label: 'الكود', sortable: false },
    { key: 'name', label: 'اسم الحساب', sortable: false },
    { key: 'sectionLabel', label: 'القسم', sortable: true },
    { key: 'amountLabel', label: 'المبلغ', sortable: false },
  ];

  _currentExportColumns = columns;
  _currentExportRows = rows;

  renderDataTable('balance-sheet-table', columns, rows, {
    searchable: false,
    pageSize: rows.length || 1,
    emptyMessage: 'لا توجد أرصدة لعرضها بعد',
  });
}
