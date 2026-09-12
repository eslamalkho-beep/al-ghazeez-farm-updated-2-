// js/pages/accounting-reports-page.js
// دفتر الأستاذ / ميزان المراجعة / قائمة الدخل / الميزانية العمومية — كلها محسوبة حيًا من JournalEntries.
// بعد الشجرة الهرمية: القوائم الثلاث تُعرض هرميًا (رؤوس تجميعية بإجمالي شجرتها الفرعية بخط عريض + أوراق
// بقيمها الخاصة)، والمجاميع الكلية تُحسب من الأوراق (أو كل الحسابات بما فيها الرؤوس بقيمها "الخاصة") بلا
// احتساب مزدوج — انظر computeAccountSubtreeTotals/computeAccountOwnTotals في accounting-service.js

let _rptAccounts = [];
let _rptEntries = [];
let _rptHierarchy = null;
let _activeAccountingTab = 'ledger';
let _selectedLedgerAccountId = null;
// حسابات "دفتر الأستاذ" مقصورة على ما عليه حركة فعلية واحدة على الأقل (أي سطر في أي قيد مُرحَّل) — لا كل
// حسابات الشجرة؛ يُحسب مرة واحدة بعد تحميل القيود (بلا فلترة فترة — حساب تحرّك مرة في أي تاريخ يبقى بالقائمة)
let _ledgerEligibleAccounts = [];
// رقم الأرشفة (batchNumber) لكل أرشفة أسبوعية — انظر WeeklyBatches/weekly-batch-service.js، نفس مبدأ
// cash-ledger-page.js/expense-list-page.js/revenue-list-page.js/purchase-list-page.js
let _batchNumberByWeeklyBatchIdForAccReports = new Map();

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
  renderSidebar('reports-accounting');
  renderHeader('التقارير المحاسبية');

  [_rptAccounts, _rptEntries] = await Promise.all([getAllAccounts(), getPostedJournalEntries()]);
  _batchNumberByWeeklyBatchIdForAccReports = new Map((await getAllWeeklyBatches()).map(b => [b.id, b.batchNumber]));
  _rptAccounts.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
  _rptHierarchy = getAccountHierarchy(_rptAccounts);

  // دفتر الأستاذ: قائمة الحساب مقصورة على الأوراق القابلة للترحيل والحركة (isPostable !== false) — كل
  // الحسابات الفرعية القابلة للترحيل، بصرف النظر عن وجود حركة فعلية عليها بعد؛ الرؤوس التجميعية (isPostable
  // === false) مستبعدة لأنه لا يُرحَّل عليها مباشرة أصلاً (نفس قيد getPostableAccounts في accounting-service.js)
  _ledgerEligibleAccounts = _rptAccounts.filter(a => a.isPostable !== false);

  if (_ledgerEligibleAccounts.length) _selectedLedgerAccountId = _ledgerEligibleAccounts[0].id;

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

// ===== أدوات مساعدة للعرض الهرمي =====

// يبني صفوفًا هرمية (أب قبل أبنائه): كل صف يحمل إجمالي شجرته الفرعية subtree {debit, credit} —
// stopAtDifferentType يتوقف عن النزول لأبناء من نوع مختلف (لجذر مختلط مثل 8 "إيرادات ومصروفات أخرى")
function _flattenTreeRows(roots, filteredEntries, stopAtDifferentType) {
  const rows = [];
  const visit = (account, depth) => {
    const subtree = computeAccountSubtreeTotals(account, _rptHierarchy, filteredEntries, null, stopAtDifferentType);
    rows.push({ account, depth, subtree, isHeader: account.isPostable === false });
    (_rptHierarchy.childrenByParentCode.get(account.code) || []).forEach(child => {
      if (stopAtDifferentType && child.type !== account.type) return;
      visit(child, depth + 1);
    });
  };
  roots.forEach(root => visit(root, 0));
  return rows;
}

function _ownTotalsMap(filteredEntries) {
  const map = new Map();
  _rptAccounts.forEach(a => map.set(a.id, computeAccountOwnTotals(a, filteredEntries)));
  return map;
}

// يبقي فقط الصفوف ذات الأثر: ورقة بقيمة خاصة غير صفرية، أو رأس لديه ورقات ظاهرة تحته (سلسلة الآباء محفوظة
// تلقائيًا: الرأس لا يختفي ما دام أحد أحفاده ظاهرًا)
function _visibleTreeRows(rows, ownMap, stopAtDifferentType) {
  const rowIds = new Set(rows.map(r => r.account.id));
  const kept = new Set();
  const decide = (account) => {
    let hasVisibleChild = false;
    (_rptHierarchy.childrenByParentCode.get(account.code) || []).forEach(child => {
      if (!rowIds.has(child.id)) return;
      if (stopAtDifferentType && child.type !== account.type) return;
      if (decide(child)) hasVisibleChild = true;
    });
    const own = ownMap.get(account.id) || { debit: 0, credit: 0 };
    const ownNonZero = Math.abs(own.debit - own.credit) > 0.005;
    const keep = hasVisibleChild || ownNonZero;
    if (keep) kept.add(account.id);
    return keep;
  };
  rows.forEach(r => {
    const parent = _rptHierarchy.byCode.get(r.account.parentCode || '');
    if (parent && rowIds.has(parent.id)) return; // سيزوره أبوه ضمن سلسلة القرار
    decide(r.account);
  });
  return rows.filter(r => kept.has(r.account.id));
}

function _treeNameCell(account, depth, bold) {
  const prefix = depth > 0 ? '— '.repeat(depth) : '';
  return bold ? `<strong>${prefix}${account.name}</strong>` : `${prefix}${account.name}`;
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
      <select id="ledger-account-select" class="form-control" style="min-width:280px; max-width:320px;">
        ${_ledgerEligibleAccounts.map(a => {
          const depth = _rptHierarchy.depthByCode.get(a.code) || 0;
          const prefix = depth > 0 ? '— '.repeat(depth) : '';
          return `<option value="${a.id}" ${a.id === _selectedLedgerAccountId ? 'selected' : ''}>${prefix}${a.code} - ${a.name}</option>`;
        }).join('')}
      </select>
    </div>
    <div id="ledger-table"></div>
  `;

  if (!_ledgerEligibleAccounts.length) {
    document.getElementById('ledger-table').innerHTML = '<div class="data-table-empty">لا توجد حسابات فرعية قابلة للترحيل بعد</div>';
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
    { dateLabel: '-', entryNumber: '-', description: 'رصيد افتتاحي', debitLabel: '-', creditLabel: '-', balanceLabel: formatCurrency(opening), archiveNumberLabel: '' },
  ];
  lines.forEach(({ entry, line }) => {
    const debit = Number(line.debit || 0);
    const credit = Number(line.credit || 0);
    running += account.normalBalance === 'debit' ? (debit - credit) : (credit - debit);
    // رقم الأرشفة تلقائي بالكامل: مأخوذ من الأرشفة الأسبوعية للقيود (WeeklyBatches) التي يقع ضمنها هذا القيد —
    // نفس منطق عمود "رقم الأرشفة" في cash-ledger-page.js/expense-list-page.js/revenue-list-page.js
    const archiveNumber = entry.weeklyBatchId
      ? (_batchNumberByWeeklyBatchIdForAccReports.get(entry.weeklyBatchId) || null)
      : null;
    rows.push({
      dateLabel: formatDateArabic(entry.date),
      entryNumber: entry.entryNumber,
      description: line.lineNote || entry.description,
      debitLabel: debit ? formatCurrency(debit) : '-',
      creditLabel: credit ? formatCurrency(credit) : '-',
      balanceLabel: formatCurrency(running),
      archiveNumberLabel: archiveNumber || '-',
    });
  });

  const columns = [
    { key: 'dateLabel', label: 'التاريخ', sortable: false },
    { key: 'entryNumber', label: 'رقم القيد', sortable: false },
    { key: 'description', label: 'الوصف', sortable: false },
    { key: 'debitLabel', label: 'مدين', sortable: false },
    { key: 'creditLabel', label: 'دائن', sortable: false },
    { key: 'balanceLabel', label: 'الرصيد', sortable: false },
    { key: 'archiveNumberLabel', label: 'رقم الأرشفة', sortable: false },
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
  const filteredEntries = to ? _rptEntries.filter(e => e.date <= to) : _rptEntries;

  const roots = _rptAccounts.filter(a => !a.parentCode || !_rptHierarchy.byCode.has(a.parentCode));
  const treeRows = _flattenTreeRows(roots, filteredEntries, false);
  const ownMap = _ownTotalsMap(filteredEntries);
  const visible = _visibleTreeRows(treeRows, ownMap, false);

  let totalDebit = 0;
  let totalCredit = 0;
  _rptAccounts.forEach(a => {
    const t = ownMap.get(a.id);
    totalDebit += t.debit;
    totalCredit += t.credit;
  });

  const tableRows = visible.map(r => {
    const own = ownMap.get(r.account.id);
    const raw = r.isHeader ? (r.subtree.debit - r.subtree.credit) : (own.debit - own.credit);
    return {
      code: r.account.code,
      name: _treeNameCell(r.account, r.depth, r.isHeader),
      typeLabel: ACCOUNT_TYPE_LABELS[r.account.type] || r.account.type,
      debitLabel: raw > 0.005 ? formatCurrency(raw) : '-',
      creditLabel: raw < -0.005 ? formatCurrency(-raw) : '-',
    };
  });

  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  container.innerHTML = `
    ${kpiGrid([
      { value: formatCurrency(totalDebit), label: 'إجمالي المدين', tone: 'blue' },
      { value: formatCurrency(totalCredit), label: 'إجمالي الدائن', tone: 'green' },
      { value: isBalanced ? 'متوازن ✓' : 'غير متوازن', label: 'حالة الميزان', tone: isBalanced ? 'green' : 'red' },
    ], 3)}
    <div id="trial-balance-table"></div>
  `;

  const columns = [
    { key: 'code', label: 'الكود', sortable: true },
    { key: 'name', label: 'اسم الحساب', sortable: false },
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
  const periodEntries = _rptEntries.filter(e => (!from || e.date >= from) && (!to || e.date <= to));

  const isStatementRoot = (a, type) => (
    a.type === type
    && (!a.parentCode || !_rptHierarchy.byCode.has(a.parentCode) || _rptHierarchy.byCode.get(a.parentCode).type !== type)
  );
  const revenueRoots = _rptAccounts.filter(a => isStatementRoot(a, 'revenue'));
  const expenseRoots = _rptAccounts.filter(a => isStatementRoot(a, 'expense'));

  const revenueTreeRows = _flattenTreeRows(revenueRoots, periodEntries, true);
  const expenseTreeRows = _flattenTreeRows(expenseRoots, periodEntries, true);
  const ownMap = _ownTotalsMap(periodEntries);
  const visibleRevenue = _visibleTreeRows(revenueTreeRows, ownMap, true);
  const visibleExpense = _visibleTreeRows(expenseTreeRows, ownMap, true);

  const toTableRow = (r, sectionLabel) => {
    const own = ownMap.get(r.account.id);
    const creditNature = r.account.type === 'revenue';
    const leafAmount = creditNature ? (own.credit - own.debit) : (own.debit - own.credit);
    const headerAmount = creditNature ? (r.subtree.credit - r.subtree.debit) : (r.subtree.debit - r.subtree.credit);
    return {
      code: r.account.code,
      name: _treeNameCell(r.account, r.depth, r.isHeader),
      sectionLabel,
      amountLabel: formatCurrency(r.isHeader ? headerAmount : leafAmount),
    };
  };

  const rows = [
    ...visibleRevenue.map(r => toTableRow(r, 'إيرادات')),
    ...visibleExpense.map(r => toTableRow(r, 'مصروفات')),
  ];

  // المجاميع من القيم الخاصة لكل الحسابات (بلا احتساب الرؤوس مع أوراقها معًا) — نفس منطق computeIncomeStatement
  let totalRevenue = 0;
  let totalExpense = 0;
  _rptAccounts.forEach(a => {
    const t = ownMap.get(a.id);
    if (a.type === 'revenue') totalRevenue += t.credit - t.debit;
    if (a.type === 'expense') totalExpense += t.debit - t.credit;
  });
  const netIncome = totalRevenue - totalExpense;

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
  const filteredEntries = _rptEntries.filter(e => e.date <= to);

  const rootsOf = (type) => _rptAccounts.filter(a => a.type === type && (!a.parentCode || !_rptHierarchy.byCode.has(a.parentCode)));
  const assetTreeRows = _flattenTreeRows(rootsOf('asset'), filteredEntries, false);
  const liabilityTreeRows = _flattenTreeRows(rootsOf('liability'), filteredEntries, false);
  const equityTreeRows = _flattenTreeRows(rootsOf('equity'), filteredEntries, false);
  const ownMap = _ownTotalsMap(filteredEntries);
  const visibleAssets = _visibleTreeRows(assetTreeRows, ownMap, false);
  const visibleLiabilities = _visibleTreeRows(liabilityTreeRows, ownMap, false);
  const visibleEquity = _visibleTreeRows(equityTreeRows, ownMap, false);

  const toTableRow = (r, sectionLabel, creditNature) => {
    const own = ownMap.get(r.account.id);
    const leafAmount = creditNature ? (own.credit - own.debit) : (own.debit - own.credit);
    const headerAmount = creditNature ? (r.subtree.credit - r.subtree.debit) : (r.subtree.debit - r.subtree.credit);
    return {
      code: r.account.code,
      name: _treeNameCell(r.account, r.depth, r.isHeader),
      sectionLabel,
      amountLabel: formatCurrency(r.isHeader ? headerAmount : leafAmount),
    };
  };

  const rows = [
    ...visibleAssets.map(r => toTableRow(r, 'أصول', false)),
    ...visibleLiabilities.map(r => toTableRow(r, 'خصوم', true)),
    ...visibleEquity.map(r => toTableRow(r, 'حقوق ملكية', true)),
  ];

  const { netIncome, totalAssets, totalLiabilities, totalEquity } = computeBalanceSheet(_rptAccounts, _rptEntries, to);
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
  _currentExportRows = [
    ...rows,
    { code: '-', name: 'أرباح غير مرحّلة (صافي الدخل حتى هذا التاريخ)', sectionLabel: 'حقوق ملكية', amountLabel: formatCurrency(netIncome) },
  ];

  renderDataTable('balance-sheet-table', columns, _currentExportRows, {
    searchable: false,
    pageSize: _currentExportRows.length || 1,
    emptyMessage: 'لا توجد أرصدة لعرضها بعد',
  });
}
