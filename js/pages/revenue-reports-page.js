// js/pages/revenue-reports-page.js

let _allRevenuesForReport = [];
let _revenueCategoriesForReport = [];
let _reportMode = 'period';
let _currentExportColumns = null;
let _currentExportRows = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('reports');
  renderSidebar('reports-revenue');
  renderHeader('تقارير الإيرادات');

  _allRevenuesForReport = await getAllRevenues();
  _revenueCategoriesForReport = await getCategoryAccountNames('revenue');

  document.getElementById('compare-category').innerHTML += _revenueCategoriesForReport.map(c => `<option value="${c}">${c}</option>`).join('');

  document.getElementById('report-from').addEventListener('change', _renderReport);
  document.getElementById('report-to').addEventListener('change', _renderReport);

  document.getElementById('mode-period-btn').addEventListener('click', () => _switchMode('period'));
  document.getElementById('mode-compare-btn').addEventListener('click', () => _switchMode('compare'));

  ['compare-category', 'period1-from', 'period1-to', 'period2-from', 'period2-to'].forEach(id => {
    document.getElementById(id).addEventListener('change', _renderCompareReport);
  });

  document.getElementById('export-excel-btn').addEventListener('click', () => {
    const title = _reportMode === 'period' ? 'تقرير الإيرادات حسب النوع' : 'مقارنة الإيرادات بين فترتين';
    exportRowsToExcel(title, _currentExportColumns, _currentExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    const title = _reportMode === 'period' ? 'تقرير الإيرادات حسب النوع' : 'مقارنة الإيرادات بين فترتين';
    exportRowsToPdf(title, _currentExportColumns, _currentExportRows);
  });

  _renderReport();
});

function _switchMode(mode) {
  _reportMode = mode;
  document.getElementById('mode-period-btn').classList.toggle('active', mode === 'period');
  document.getElementById('mode-compare-btn').classList.toggle('active', mode === 'compare');
  document.getElementById('period-filters').style.display = mode === 'period' ? '' : 'none';
  document.getElementById('compare-filters').style.display = mode === 'compare' ? '' : 'none';
  if (mode === 'period') _renderReport(); else _renderCompareReport();
}

function _renderReport() {
  const from = document.getElementById('report-from').value;
  const to = document.getElementById('report-to').value;

  const filtered = _allRevenuesForReport.filter(r =>
    (!from || r.date >= from) && (!to || r.date <= to)
  );

  const byCategory = {};
  filtered.forEach(r => {
    if (!byCategory[r.category]) byCategory[r.category] = { total: 0, count: 0, tax: 0 };
    byCategory[r.category].total += Number(r.amount || 0);
    byCategory[r.category].count += 1;
    byCategory[r.category].tax += Number(r.taxAmount || 0);
  });

  const categories = Object.keys(byCategory);
  const total = filtered.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalTax = filtered.reduce((s, r) => s + Number(r.taxAmount || 0), 0);

  const rows = categories.map(cat => ({
    category: cat,
    count: byCategory[cat].count,
    totalLabel: formatCurrency(byCategory[cat].total),
    avgLabel: formatCurrency(byCategory[cat].total / byCategory[cat].count),
    taxLabel: formatCurrency(byCategory[cat].tax),
  }));

  const listBase = '../revenues/revenue-list.html';
  const container = document.getElementById('report-content');
  container.innerHTML = `
    ${kpiGrid([
      { value: formatCurrency(total), label: 'إجمالي الإيرادات', tone: 'green', icon: '💰', href: buildQueryUrl(listBase, { from, to }) },
      { value: formatNumber(filtered.length), label: 'عدد المعاملات', tone: 'blue', icon: '🧾', href: buildQueryUrl(listBase, { from, to }) },
      { value: formatCurrency(filtered.length ? total / filtered.length : 0), label: 'متوسط قيمة المعاملة', tone: 'green', icon: '📊' },
      { value: formatCurrency(totalTax), label: 'إجمالي الضريبة (فواتير ضريبية)', tone: 'blue', icon: '🧮', href: buildQueryUrl(listBase, { from, to }) },
    ])}
    <div class="card" style="margin-bottom: var(--spacing-3);">
      <div class="card__header"><h3>مقارنة الإيرادات حسب النوع</h3></div>
      <div class="chart-box"><canvas id="revenue-by-cat-chart"></canvas></div>
    </div>
    <div id="revenue-report-table"></div>
  `;

  renderBarChart('revenue-by-cat-chart', categories, [{
    label: 'الإجمالي (ر.س)', data: categories.map(c => byCategory[c].total), backgroundColor: '#1E9E5A',
  }]);

  const columns = [
    { key: 'category', label: 'نوع الإيراد', sortable: true },
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

  renderDataTable('revenue-report-table', columns, rows, {
    emptyMessage: 'لا توجد إيرادات مسجّلة خلال هذه الفترة',
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
  const matchesCategory = (r) => !category || r.category === category;

  const period1 = _allRevenuesForReport.filter(r => matchesCategory(r) && inRange(r.date, p1From, p1To));
  const period2 = _allRevenuesForReport.filter(r => matchesCategory(r) && inRange(r.date, p2From, p2To));

  const total1 = period1.reduce((s, r) => s + Number(r.amount || 0), 0);
  const total2 = period2.reduce((s, r) => s + Number(r.amount || 0), 0);
  const diff = total2 - total1;
  const pct = total1 ? ((diff / total1) * 100).toFixed(1) : (total2 ? '100.0' : '0.0');

  const categoriesToShow = category ? [category] : _revenueCategoriesForReport;
  const rows = categoriesToShow.map(cat => {
    const t1 = period1.filter(r => r.category === cat).reduce((s, r) => s + Number(r.amount || 0), 0);
    const t2 = period2.filter(r => r.category === cat).reduce((s, r) => s + Number(r.amount || 0), 0);
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

  const listBase = '../revenues/revenue-list.html';
  const container = document.getElementById('report-content');
  container.innerHTML = `
    ${kpiGrid([
      { value: formatCurrency(total1), label: 'إجمالي الفترة الأولى', tone: 'blue', icon: '📅', href: buildQueryUrl(listBase, { from: p1From, to: p1To, category }) },
      { value: formatCurrency(total2), label: 'إجمالي الفترة الثانية', tone: 'blue', icon: '📅', href: buildQueryUrl(listBase, { from: p2From, to: p2To, category }) },
      { value: `${diff >= 0 ? '+' : ''}${formatCurrency(diff)} (${pct}%)`, label: 'الفرق بين الفترتين', tone: diff >= 0 ? 'green' : 'red' },
    ], 3)}
    <div class="card" style="margin-bottom: var(--spacing-3);">
      <div class="card__header"><h3>مقارنة ${category || 'كل الأنواع'} بين الفترتين</h3></div>
      <div class="chart-box"><canvas id="revenue-compare-chart"></canvas></div>
    </div>
    <div id="revenue-compare-table"></div>
  `;

  renderBarChart('revenue-compare-chart', rows.map(r => r.category), [
    { label: 'الفترة الأولى', data: rows.map(r => r.total1), backgroundColor: '#94A3B8' },
    { label: 'الفترة الثانية', data: rows.map(r => r.total2), backgroundColor: '#1E9E5A' },
  ]);

  const columns = [
    { key: 'category', label: 'نوع الإيراد', sortable: true },
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

  renderDataTable('revenue-compare-table', columns, rows, {
    emptyMessage: 'حدّد فترتين لعرض المقارنة',
    footerRow,
    onRowClick: (row) => { window.location.href = buildQueryUrl(listBase, { from: p2From, to: p2To, category: row.category }); },
  });
}
