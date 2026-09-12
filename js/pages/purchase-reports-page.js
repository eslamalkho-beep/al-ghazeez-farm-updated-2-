// js/pages/purchase-reports-page.js

let _allPurchasesForReport = [];
let _purchaseCategoriesForReport = [];
let _reportMode = 'period';
let _currentExportColumns = null;
let _currentExportRows = null;
let _currentExportTitle = 'تقرير المشتريات حسب البند';
// رقم القيد المحاسبي لكل مشترى — نفس نمط _entryNumberByJournalEntryIdForExpenseReport في expense-reports-page.js
let _entryNumberByJournalEntryIdForPurchaseReport = new Map();

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('reports');
  renderSidebar('reports-purchase');
  renderHeader('تقارير المشتريات');

  const [purchases, journalEntries] = await Promise.all([getAllPurchases(), getAllJournalEntries()]);
  _allPurchasesForReport = purchases;
  _entryNumberByJournalEntryIdForPurchaseReport = new Map(journalEntries.map(e => [e.id, e.entryNumber]));
  // ⚠️ لا نستخدم getCategoryAccountNames('expense') هنا: ذلك المجمّع مشترك بين المصروفات والمشتريات معًا
  // (نفس نوع الحساب 'expense' في ChartOfAccounts)، فيعرض بنودًا خاصة بالمصروفات ضمن فلتر تقارير المشتريات.
  // بدلاً من ذلك نشتق القائمة من البنود المستخدمة فعليًا في سجلات المشتريات نفسها.
  _purchaseCategoriesForReport = [...new Set(_allPurchasesForReport.map(p => p.category).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'ar'));

  const categoryOptionsHtml = _purchaseCategoriesForReport.map(c => `<option value="${c}">${c}</option>`).join('');
  document.getElementById('compare-category').innerHTML += categoryOptionsHtml;
  document.getElementById('period-category').innerHTML += categoryOptionsHtml;

  document.getElementById('period-category').addEventListener('change', _renderPurchaseReport);
  document.getElementById('report-from').addEventListener('change', _renderPurchaseReport);
  document.getElementById('report-to').addEventListener('change', _renderPurchaseReport);

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

  _renderPurchaseReport();
});

function _switchMode(mode) {
  _reportMode = mode;
  document.getElementById('mode-period-btn').classList.toggle('active', mode === 'period');
  document.getElementById('mode-compare-btn').classList.toggle('active', mode === 'compare');
  document.getElementById('period-filters').style.display = mode === 'period' ? '' : 'none';
  document.getElementById('compare-filters').style.display = mode === 'compare' ? '' : 'none';
  if (mode === 'period') _renderPurchaseReport(); else _renderCompareReport();
}

function _renderPurchaseReport() {
  const category = document.getElementById('period-category').value;
  const from = document.getElementById('report-from').value;
  const to = document.getElementById('report-to').value;

  const filtered = _allPurchasesForReport.filter(purchase =>
    (!category || purchase.category === category) &&
    (!from || purchase.date >= from) && (!to || purchase.date <= to)
  );

  // بند محدد بعينه: بدل جدول "مقارنة حسب البند" (بلا معنى لصف واحد) نعرض سجلاته التفصيلية مباشرة —
  // نفس نمط _renderExpenseCategoryRecords في expense-reports-page.js
  if (category) {
    _renderPurchaseCategoryRecords(category, filtered, from, to);
    return;
  }

  const byCategory = {};
  filtered.forEach(purchase => {
    if (!byCategory[purchase.category]) byCategory[purchase.category] = { total: 0, count: 0, tax: 0 };
    byCategory[purchase.category].total += Number(purchase.amount || 0);
    byCategory[purchase.category].count += 1;
    byCategory[purchase.category].tax += Number(purchase.taxAmount || 0);
  });

  const categories = Object.keys(byCategory);
  const total = filtered.reduce((sum, purchase) => sum + Number(purchase.amount || 0), 0);
  const totalTax = filtered.reduce((sum, purchase) => sum + Number(purchase.taxAmount || 0), 0);
  const pendingCount = filtered.filter(purchase => purchase.status === 'pending').length;

  const rows = categories.map(category => ({
    category,
    count: byCategory[category].count,
    totalLabel: formatCurrency(byCategory[category].total),
    avgLabel: formatCurrency(byCategory[category].total / byCategory[category].count),
    taxLabel: formatCurrency(byCategory[category].tax),
  }));

  const listBase = '../purchases/purchase-list.html';
  const container = document.getElementById('report-content');
  container.innerHTML = `
    ${kpiGrid([
      { value: formatCurrency(total), label: 'إجمالي المشتريات', tone: 'red', icon: '💸', href: buildQueryUrl(listBase, { from, to, category }) },
      { value: formatNumber(filtered.length), label: 'عدد المعاملات', tone: 'blue', icon: '🧾', href: buildQueryUrl(listBase, { from, to, category }) },
      { value: formatNumber(pendingCount), label: 'مشتريات قيد الاعتماد', tone: 'red', icon: '⏳', href: buildQueryUrl(listBase, { from, to, category, status: 'pending' }) },
      { value: formatCurrency(totalTax), label: 'إجمالي الضريبة (فواتير ضريبية)', tone: 'blue', icon: '🧮', href: buildQueryUrl(listBase, { from, to, category }) },
    ])}
    <div class="card" style="margin-bottom: var(--spacing-3);">
      <div class="card__header"><h3>مقارنة المشتريات حسب البند</h3></div>
      <div class="chart-box"><canvas id="purchase-by-cat-chart"></canvas></div>
    </div>
    <div id="purchase-report-table"></div>
  `;

  renderBarChart('purchase-by-cat-chart', categories, [{
    label: 'الإجمالي (ر.س)',
    data: categories.map(category => byCategory[category].total),
    backgroundColor: '#D6362E',
  }]);

  const columns = [
    { key: 'category', label: 'بند المشترى', sortable: true },
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

  _currentExportTitle = 'تقرير المشتريات حسب البند';
  _currentExportColumns = columns;
  _currentExportRows = footerRow ? [...rows, footerRow] : rows;

  renderDataTable('purchase-report-table', columns, rows, {
    emptyMessage: 'لا توجد مشتريات مسجّلة خلال هذه الفترة',
    footerRow,
    onRowClick: (row) => { window.location.href = buildQueryUrl(listBase, { from, to, category: row.category }); },
  });
}

// سجلات بند واحد بالتفصيل (التاريخ/البيان/المبلغ/رقم القيد) — تحل محل جدول "مقارنة حسب البند" (بلا معنى
// لصف واحد فقط) عند اختيار بند معيّن من `period-category`؛ نسخة طبق الأصل من
// _renderExpenseCategoryRecords في expense-reports-page.js
function _renderPurchaseCategoryRecords(category, filtered, from, to) {
  const total = filtered.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const totalTax = filtered.reduce((sum, p) => sum + Number(p.taxAmount || 0), 0);
  const pendingCount = filtered.filter(p => p.status === 'pending').length;

  const listBase = '../purchases/purchase-list.html';
  const container = document.getElementById('report-content');
  container.innerHTML = `
    ${kpiGrid([
      { value: formatCurrency(total), label: `إجمالي بند "${category}"`, tone: 'red', icon: '💸', href: buildQueryUrl(listBase, { from, to, category }) },
      { value: formatNumber(filtered.length), label: 'عدد المعاملات', tone: 'blue', icon: '🧾', href: buildQueryUrl(listBase, { from, to, category }) },
      { value: formatNumber(pendingCount), label: 'قيد الاعتماد', tone: 'red', icon: '⏳', href: buildQueryUrl(listBase, { from, to, category, status: 'pending' }) },
      { value: formatCurrency(totalTax), label: 'إجمالي الضريبة', tone: 'blue', icon: '🧮', href: buildQueryUrl(listBase, { from, to, category }) },
    ])}
    <div class="overview-section-title" style="font-size:15px; font-weight:800; margin-bottom: var(--spacing-2);">سجلات بند "${category}"</div>
    <div id="purchase-report-table"></div>
  `;

  const rows = [...filtered]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map(p => {
      // البيان: ملاحظات المشترى إن وُجدت، وإلا المورّد، وإلا اسم البند نفسه كحد أدنى
      const statementLabel = p.notes || p.vendor || category;
      const entryNumber = p.journalEntryId ? (_entryNumberByJournalEntryIdForPurchaseReport.get(p.journalEntryId) || null) : null;
      return {
        id: p.id,
        dateLabel: formatDateArabic(p.date),
        statementLabel,
        amountLabel: formatCurrency(p.amount),
        entryNumberLink: entryNumber
          ? `<a href="../accounting/journal-entry-form.html?id=${p.journalEntryId}" onclick="event.stopPropagation();">${entryNumber}</a>`
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

  renderDataTable('purchase-report-table', columns, rows, {
    emptyMessage: 'لا توجد سجلات لهذا البند خلال هذه الفترة',
    footerRow,
    onRowClick: (row) => { window.location.href = `../purchases/purchase-form.html?id=${row.id}`; },
  });
}

function _renderCompareReport() {
  const category = document.getElementById('compare-category').value;
  const p1From = document.getElementById('period1-from').value;
  const p1To = document.getElementById('period1-to').value;
  const p2From = document.getElementById('period2-from').value;
  const p2To = document.getElementById('period2-to').value;

  const inRange = (date, from, to) => (!from || date >= from) && (!to || date <= to);
  const matchesCategory = (purchase) => !category || purchase.category === category;

  const period1 = _allPurchasesForReport.filter(p => matchesCategory(p) && inRange(p.date, p1From, p1To));
  const period2 = _allPurchasesForReport.filter(p => matchesCategory(p) && inRange(p.date, p2From, p2To));

  const total1 = period1.reduce((s, p) => s + Number(p.amount || 0), 0);
  const total2 = period2.reduce((s, p) => s + Number(p.amount || 0), 0);
  const diff = total2 - total1;
  const pct = total1 ? ((diff / total1) * 100).toFixed(1) : (total2 ? '100.0' : '0.0');

  const categoriesToShow = category ? [category] : _purchaseCategoriesForReport;
  const rows = categoriesToShow.map(cat => {
    const t1 = period1.filter(p => p.category === cat).reduce((s, p) => s + Number(p.amount || 0), 0);
    const t2 = period2.filter(p => p.category === cat).reduce((s, p) => s + Number(p.amount || 0), 0);
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

  const listBase = '../purchases/purchase-list.html';
  const container = document.getElementById('report-content');
  container.innerHTML = `
    ${kpiGrid([
      { value: formatCurrency(total1), label: 'إجمالي الفترة الأولى', tone: 'blue', icon: '📅', href: buildQueryUrl(listBase, { from: p1From, to: p1To, category }) },
      { value: formatCurrency(total2), label: 'إجمالي الفترة الثانية', tone: 'blue', icon: '📅', href: buildQueryUrl(listBase, { from: p2From, to: p2To, category }) },
      { value: `${diff >= 0 ? '+' : ''}${formatCurrency(diff)} (${pct}%)`, label: 'الفرق بين الفترتين', tone: diff >= 0 ? 'red' : 'green' },
    ], 3)}
    <div class="card" style="margin-bottom: var(--spacing-3);">
      <div class="card__header"><h3>مقارنة ${category || 'كل البنود'} بين الفترتين</h3></div>
      <div class="chart-box"><canvas id="purchase-compare-chart"></canvas></div>
    </div>
    <div id="purchase-compare-table"></div>
  `;

  renderBarChart('purchase-compare-chart', rows.map(r => r.category), [
    { label: 'الفترة الأولى', data: rows.map(r => r.total1), backgroundColor: '#94A3B8' },
    { label: 'الفترة الثانية', data: rows.map(r => r.total2), backgroundColor: '#D6362E' },
  ]);

  const columns = [
    { key: 'category', label: 'بند المشترى', sortable: true },
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

  _currentExportTitle = 'مقارنة المشتريات بين فترتين';
  _currentExportColumns = columns;
  _currentExportRows = footerRow ? [...rows, footerRow] : rows;

  renderDataTable('purchase-compare-table', columns, rows, {
    emptyMessage: 'حدّد فترتين لعرض المقارنة',
    footerRow,
    onRowClick: (row) => { window.location.href = buildQueryUrl(listBase, { from: p2From, to: p2To, category: row.category }); },
  });
}
