// js/pages/purchase-reports-page.js

let _allPurchasesForReport = [];
let _purchaseCategoriesForReport = [];
let _reportMode = 'period';
let _currentExportColumns = null;
let _currentExportRows = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('reports');
  renderSidebar('reports');
  renderHeader('تقارير المشتريات');

  _allPurchasesForReport = await getAllPurchases();
  _purchaseCategoriesForReport = await getCategoryNames('purchase');

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
    const title = _reportMode === 'period' ? 'تقرير المشتريات حسب البند' : 'مقارنة المشتريات بين فترتين';
    exportRowsToExcel(title, _currentExportColumns, _currentExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    const title = _reportMode === 'period' ? 'تقرير المشتريات حسب البند' : 'مقارنة المشتريات بين فترتين';
    exportRowsToPdf(title, _currentExportColumns, _currentExportRows);
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
      <div class="card__header"><h3>${category ? `تفاصيل بند: ${category}` : 'مقارنة المشتريات حسب البند'}</h3></div>
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

  _currentExportColumns = columns;
  _currentExportRows = footerRow ? [...rows, footerRow] : rows;

  renderDataTable('purchase-report-table', columns, rows, {
    emptyMessage: 'لا توجد مشتريات مسجّلة خلال هذه الفترة',
    footerRow,
    onRowClick: (row) => { window.location.href = buildQueryUrl(listBase, { from, to, category: row.category }); },
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

  _currentExportColumns = columns;
  _currentExportRows = footerRow ? [...rows, footerRow] : rows;

  renderDataTable('purchase-compare-table', columns, rows, {
    emptyMessage: 'حدّد فترتين لعرض المقارنة',
    footerRow,
    onRowClick: (row) => { window.location.href = buildQueryUrl(listBase, { from: p2From, to: p2To, category: row.category }); },
  });
}
