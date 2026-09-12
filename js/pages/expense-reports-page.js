// js/pages/expense-reports-page.js

let _allExpensesForReport = [];
let _expenseCategoriesForReport = [];
let _reportMode = 'period';
let _currentExportColumns = null;
let _currentExportRows = null;
let _currentExportTitle = 'تقرير المصروفات حسب البند';
// رقم القيد المحاسبي لكل مصروف — نفس نمط _entryNumberByJournalEntryIdForRevenues في revenue-list-page.js
let _entryNumberByJournalEntryIdForExpenseReport = new Map();

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('reports');
  renderSidebar('reports-expense');
  renderHeader('تقارير المصروفات');

  const [expenses, journalEntries] = await Promise.all([getAllExpenses(), getAllJournalEntries()]);
  _allExpensesForReport = expenses;
  _entryNumberByJournalEntryIdForExpenseReport = new Map(journalEntries.map(e => [e.id, e.entryNumber]));
  // ⚠️ لا نستخدم getCategoryAccountNames('expense') هنا: ذلك المجمّع مشترك بين المصروفات والمشتريات معًا
  // (نفس نوع الحساب 'expense' في ChartOfAccounts)، فيعرض بنودًا خاصة بالمشتريات ضمن فلتر تقارير المصروفات.
  // بدلاً من ذلك نشتق القائمة من البنود المستخدمة فعليًا في سجلات المصروفات نفسها.
  _expenseCategoriesForReport = [...new Set(_allExpensesForReport.map(e => e.category).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'ar'));

  document.getElementById('compare-category').innerHTML += _expenseCategoriesForReport.map(c => `<option value="${c}">${c}</option>`).join('');
  document.getElementById('report-category').innerHTML += _expenseCategoriesForReport.map(c => `<option value="${c}">${c}</option>`).join('');

  document.getElementById('report-category').addEventListener('change', _renderExpenseReport);
  document.getElementById('report-from').addEventListener('change', _renderExpenseReport);
  document.getElementById('report-to').addEventListener('change', _renderExpenseReport);

  document.getElementById('mode-period-btn').addEventListener('click', () => _switchMode('period'));
  document.getElementById('mode-compare-btn').addEventListener('click', () => _switchMode('compare'));

  ['compare-category', 'period1-from', 'period1-to', 'period2-from', 'period2-to'].forEach(id => {
    document.getElementById(id).addEventListener('change', _renderCompareReport);
  });

  document.getElementById('export-excel-btn').addEventListener('click', () => {
    exportRowsToExcel(_currentExportTitle, _currentExportColumns, _currentExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    exportRowsToPdf(_currentExportTitle, _currentExportColumns, _currentExportRows);
  });

  _renderExpenseReport();
});

function _switchMode(mode) {
  _reportMode = mode;
  document.getElementById('mode-period-btn').classList.toggle('active', mode === 'period');
  document.getElementById('mode-compare-btn').classList.toggle('active', mode === 'compare');
  document.getElementById('period-filters').style.display = mode === 'period' ? '' : 'none';
  document.getElementById('compare-filters').style.display = mode === 'compare' ? '' : 'none';
  if (mode === 'period') _renderExpenseReport(); else _renderCompareReport();
}

function _renderExpenseReport() {
  const from = document.getElementById('report-from').value;
  const to = document.getElementById('report-to').value;
  const categoryFilter = document.getElementById('report-category').value;

  const filtered = _allExpensesForReport.filter(expense =>
    (!from || expense.date >= from) && (!to || expense.date <= to) && (!categoryFilter || expense.category === categoryFilter)
  );

  // بند محدد بعينه: بدل جدول "مقارنة حسب البند" (بلا معنى لصف واحد) نعرض سجلاته التفصيلية مباشرة
  if (categoryFilter) {
    _renderExpenseCategoryRecords(categoryFilter, filtered, from, to);
    return;
  }

  const byCategory = {};
  filtered.forEach(expense => {
    if (!byCategory[expense.category]) byCategory[expense.category] = { total: 0, count: 0, tax: 0 };
    byCategory[expense.category].total += Number(expense.amount || 0);
    byCategory[expense.category].count += 1;
    byCategory[expense.category].tax += Number(expense.taxAmount || 0);
  });

  const categories = Object.keys(byCategory);
  const total = filtered.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const totalTax = filtered.reduce((sum, expense) => sum + Number(expense.taxAmount || 0), 0);
  const pendingCount = filtered.filter(expense => expense.status === 'pending').length;

  const rows = categories.map(category => ({
    category,
    count: byCategory[category].count,
    totalLabel: formatCurrency(byCategory[category].total),
    avgLabel: formatCurrency(byCategory[category].total / byCategory[category].count),
    taxLabel: formatCurrency(byCategory[category].tax),
  }));

  const listBase = '../expenses/expense-list.html';
  const container = document.getElementById('report-content');
  container.innerHTML = `
    ${kpiGrid([
      { value: formatCurrency(total), label: 'إجمالي المصروفات', tone: 'red', icon: '💸', href: buildQueryUrl(listBase, { from, to }) },
      { value: formatNumber(filtered.length), label: 'عدد المعاملات', tone: 'blue', icon: '🧾', href: buildQueryUrl(listBase, { from, to }) },
      { value: formatNumber(pendingCount), label: 'مصروفات قيد الاعتماد', tone: 'red', icon: '⏳', href: buildQueryUrl(listBase, { from, to, status: 'pending' }) },
      { value: formatCurrency(totalTax), label: 'إجمالي الضريبة (فواتير ضريبية)', tone: 'blue', icon: '🧮', href: buildQueryUrl(listBase, { from, to }) },
    ])}
    <div class="card" style="margin-bottom: var(--spacing-3);">
      <div class="card__header"><h3>مقارنة المصروفات حسب البند</h3></div>
      <div class="chart-box"><canvas id="expense-by-cat-chart"></canvas></div>
    </div>
    <div id="expense-report-table"></div>
  `;

  renderBarChart('expense-by-cat-chart', categories, [{
    label: 'الإجمالي (ر.س)',
    data: categories.map(category => byCategory[category].total),
    backgroundColor: '#D6362E',
  }]);

  const columns = [
    { key: 'category', label: 'بند المصروف', sortable: true },
    { key: 'count', label: 'عدد المعاملات', sortable: true },
    { key: 'totalLabel', label: 'الإجمالي', sortable: false },
    { key: 'avgLabel', label: 'متوسط المعاملة', sortable: false },
    { key: 'taxLabel', label: 'إجمالي الضريبة', sortable: false },
  ];

  const footerRow = rows.length ? {
    category: 'الإجمالي',
    count: formatNumber(filtered.length),
    totalLabel: formatCurrency(total),
    avgLabel: formatCurrency(filtered.length ? total / filtered.length : 0),
    taxLabel: formatCurrency(totalTax),
  } : null;

  _currentExportTitle = 'تقرير المصروفات حسب البند';
  _currentExportColumns = columns;
  _currentExportRows = footerRow ? [...rows, footerRow] : rows;

  renderDataTable('expense-report-table', columns, rows, {
    emptyMessage: 'لا توجد مصروفات مسجّلة خلال هذه الفترة',
    footerRow,
    onRowClick: (row) => { window.location.href = buildQueryUrl(listBase, { from, to, category: row.category }); },
  });
}

// سجلات بند واحد بالتفصيل (التاريخ/البيان/المبلغ/رقم القيد) — تحل محل جدول "مقارنة حسب البند" (بلا معنى
// لصف واحد فقط) عند اختيار بند معيّن من `report-category`؛ نفس مبدأ عمود "رقم القيد" في revenue-list-page.js
function _renderExpenseCategoryRecords(category, filtered, from, to) {
  const total = filtered.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const totalTax = filtered.reduce((sum, e) => sum + Number(e.taxAmount || 0), 0);
  const pendingCount = filtered.filter(e => e.status === 'pending').length;

  const listBase = '../expenses/expense-list.html';
  const container = document.getElementById('report-content');
  container.innerHTML = `
    ${kpiGrid([
      { value: formatCurrency(total), label: `إجمالي بند "${category}"`, tone: 'red', icon: '💸', href: buildQueryUrl(listBase, { from, to, category }) },
      { value: formatNumber(filtered.length), label: 'عدد المعاملات', tone: 'blue', icon: '🧾', href: buildQueryUrl(listBase, { from, to, category }) },
      { value: formatNumber(pendingCount), label: 'قيد الاعتماد', tone: 'red', icon: '⏳', href: buildQueryUrl(listBase, { from, to, category, status: 'pending' }) },
      { value: formatCurrency(totalTax), label: 'إجمالي الضريبة', tone: 'blue', icon: '🧮', href: buildQueryUrl(listBase, { from, to, category }) },
    ])}
    <div class="overview-section-title" style="font-size:15px; font-weight:800; margin-bottom: var(--spacing-2);">سجلات بند "${category}"</div>
    <div id="expense-report-table"></div>
  `;

  const rows = [...filtered]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map(e => {
      // البيان: ملاحظات المصروف إن وُجدت، وإلا المستفيد/المورّد، وإلا اسم البند نفسه كحد أدنى
      const statementLabel = e.notes || e.vendor || category;
      const entryNumber = e.journalEntryId ? (_entryNumberByJournalEntryIdForExpenseReport.get(e.journalEntryId) || null) : null;
      return {
        id: e.id,
        dateLabel: formatDateArabic(e.date),
        statementLabel,
        amountLabel: formatCurrency(e.amount),
        entryNumberLink: entryNumber
          ? `<a href="../accounting/journal-entry-form.html?id=${e.journalEntryId}" onclick="event.stopPropagation();">${entryNumber}</a>`
          : '-',
      };
    });

  const columns = [
    { key: 'dateLabel', label: 'التاريخ', sortable: true },
    { key: 'statementLabel', label: 'البيان', sortable: false },
    { key: 'amountLabel', label: 'المبلغ', sortable: false },
    { key: 'entryNumberLink', label: 'رقم القيد', sortable: false },
  ];

  const footerRow = rows.length ? {
    dateLabel: 'الإجمالي',
    statementLabel: '',
    amountLabel: formatCurrency(total),
    entryNumberLink: '',
  } : null;

  _currentExportTitle = `سجلات بند ${category}`;
  _currentExportColumns = columns;
  _currentExportRows = footerRow ? [...rows, footerRow] : rows;

  renderDataTable('expense-report-table', columns, rows, {
    emptyMessage: 'لا توجد سجلات لهذا البند خلال هذه الفترة',
    footerRow,
    onRowClick: (row) => { window.location.href = `../expenses/expense-form.html?id=${row.id}`; },
  });
}

function _renderCompareReport() {
  const category = document.getElementById('compare-category').value;
  const p1From = document.getElementById('period1-from').value;
  const p1To = document.getElementById('period1-to').value;
  const p2From = document.getElementById('period2-from').value;
  const p2To = document.getElementById('period2-to').value;

  const inRange = (date, from, to) => (!from || date >= from) && (!to || date <= to);
  const matchesCategory = (expense) => !category || expense.category === category;

  const period1 = _allExpensesForReport.filter(e => matchesCategory(e) && inRange(e.date, p1From, p1To));
  const period2 = _allExpensesForReport.filter(e => matchesCategory(e) && inRange(e.date, p2From, p2To));

  const total1 = period1.reduce((s, e) => s + Number(e.amount || 0), 0);
  const total2 = period2.reduce((s, e) => s + Number(e.amount || 0), 0);
  const diff = total2 - total1;
  const pct = total1 ? ((diff / total1) * 100).toFixed(1) : (total2 ? '100.0' : '0.0');

  const categoriesToShow = category ? [category] : _expenseCategoriesForReport;
  const rows = categoriesToShow.map(cat => {
    const t1 = period1.filter(e => e.category === cat).reduce((s, e) => s + Number(e.amount || 0), 0);
    const t2 = period2.filter(e => e.category === cat).reduce((s, e) => s + Number(e.amount || 0), 0);
    const d = t2 - t1;
    return {
      category: cat,
      total1: t1,
      total2: t2,
      period1Label: formatCurrency(t1),
      period2Label: formatCurrency(t2),
      diffLabel: `${d >= 0 ? '+' : ''}${formatCurrency(d)}`,
    };
  });

  const listBase = '../expenses/expense-list.html';
  const container = document.getElementById('report-content');
  container.innerHTML = `
    ${kpiGrid([
      { value: formatCurrency(total1), label: 'إجمالي الفترة الأولى', tone: 'blue', icon: '📅', href: buildQueryUrl(listBase, { from: p1From, to: p1To, category }) },
      { value: formatCurrency(total2), label: 'إجمالي الفترة الثانية', tone: 'blue', icon: '📅', href: buildQueryUrl(listBase, { from: p2From, to: p2To, category }) },
      { value: `${diff >= 0 ? '+' : ''}${formatCurrency(diff)} (${pct}%)`, label: 'الفرق بين الفترتين', tone: diff >= 0 ? 'red' : 'green' },
    ], 3)}
    <div class="card" style="margin-bottom: var(--spacing-3);">
      <div class="card__header"><h3>مقارنة ${category || 'كل البنود'} بين الفترتين</h3></div>
      <div class="chart-box"><canvas id="expense-compare-chart"></canvas></div>
    </div>
    <div id="expense-compare-table"></div>
  `;

  renderBarChart('expense-compare-chart', rows.map(r => r.category), [
    { label: 'الفترة الأولى', data: rows.map(r => r.total1), backgroundColor: '#94A3B8' },
    { label: 'الفترة الثانية', data: rows.map(r => r.total2), backgroundColor: '#D6362E' },
  ]);

  const columns = [
    { key: 'category', label: 'بند المصروف', sortable: true },
    { key: 'period1Label', label: 'الفترة الأولى', sortable: false },
    { key: 'period2Label', label: 'الفترة الثانية', sortable: false },
    { key: 'diffLabel', label: 'الفرق', sortable: false },
  ];

  const footerRow = rows.length ? {
    category: 'الإجمالي',
    period1Label: formatCurrency(total1),
    period2Label: formatCurrency(total2),
    diffLabel: `${diff >= 0 ? '+' : ''}${formatCurrency(diff)}`,
  } : null;

  _currentExportTitle = 'مقارنة المصروفات بين فترتين';
  _currentExportColumns = columns;
  _currentExportRows = footerRow ? [...rows, footerRow] : rows;

  renderDataTable('expense-compare-table', columns, rows, {
    emptyMessage: 'حدّد فترتين لعرض المقارنة',
    footerRow,
    onRowClick: (row) => { window.location.href = buildQueryUrl(listBase, { from: p2From, to: p2To, category: row.category }); },
  });
}
