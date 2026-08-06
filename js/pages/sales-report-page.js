// js/pages/sales-report-page.js
// قسمان: (1) المبيعات الموحّدة — بيع حيوان فردي (Revenues) + بيع جملة (BulkBatches.saleLines) في تقرير واحد،
// (2) تكلفة الرأس — لكل حيوان: تكلفة الاقتناء (سعر الشراء أو صفر لو مولود) + تكلفة السجل الصحي المرتبط به،
// مقارنة بسعر بيعه الفردي إن وُجد. تبسيط معروف ومقصود: لا توزيع تناسبي لمصروفات الأعلاف العامة على كل رأس
// (لا يوجد ربط مباشر بين مصروف علف عام وحيوان بعينه في النظام الحالي) — التكلفة هنا فقط ما هو متتبَّع فعليًا
// لكل حيوان تحديدًا (الشراء + السجل الصحي)

let _srAnimals = [];
let _srRevenues = [];
let _srBulkBatches = [];
let _srHealthRecords = [];

let _currentExportColumns = null;
let _currentExportRows = null;
let _costExportColumns = null;
let _costExportRows = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('reports');
  renderSidebar('reports');
  renderHeader('تقرير المبيعات وتكلفة الرأس');

  [_srAnimals, _srRevenues, _srBulkBatches, _srHealthRecords] = await Promise.all([
    getAllAnimals(), getAllRevenues(), getAllBulkBatches(), getAllHealthRecords(),
  ]);

  document.getElementById('report-from').addEventListener('change', _renderReport);
  document.getElementById('report-to').addEventListener('change', _renderReport);

  document.getElementById('export-excel-btn').addEventListener('click', () => {
    exportSectionsToExcel('تقرير المبيعات وتكلفة الرأس', [
      { title: 'المبيعات الموحّدة', columns: _currentExportColumns, rows: _currentExportRows },
      { title: 'تكلفة الرأس', columns: _costExportColumns, rows: _costExportRows },
    ]);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    exportSectionsToPdf('تقرير المبيعات وتكلفة الرأس', [
      { title: 'المبيعات الموحّدة', columns: _currentExportColumns, rows: _currentExportRows },
      { title: 'تكلفة الرأس', columns: _costExportColumns, rows: _costExportRows },
    ]);
  });

  _renderReport();
});

function _dateInRange(dateStr, from, to) {
  if (!dateStr) return false;
  if (from && dateStr < from) return false;
  if (to && dateStr > to) return false;
  return true;
}

function _renderReport() {
  const from = document.getElementById('report-from').value;
  const to = document.getElementById('report-to').value;

  // ===== المبيعات الموحّدة =====
  const individualSales = _srRevenues
    .filter(r => r.category === 'بيع حيوان' && ((!from && !to) || _dateInRange(r.date, from, to)))
    .map(r => {
      const animal = _srAnimals.find(a => a.id === r.animalId);
      return {
        date: r.date,
        typeLabel: animal ? (ANIMAL_TYPE_LABELS[animal.type] || animal.type) : '-',
        detailLabel: animal ? `${animal.code} (${animal.breed})` : '-',
        countLabel: '1',
        amount: Number(r.amount || 0),
        sourceLabel: 'بيع فردي',
      };
    });

  const bulkSales = [];
  _srBulkBatches.forEach(batch => {
    (batch.saleLines || []).forEach(line => {
      const amount = Number(line.count || 0) * Number(line.unitPrice || 0);
      // أسطر بيع بسعر صفر هي تحويلات داخلية من مخزون التجارة للقطيع (انظر transfer-service.js) وليست بيعًا فعليًا
      if (amount <= 0) return;
      if (!((!from && !to) || _dateInRange(line.date, from, to))) return;
      bulkSales.push({
        date: line.date,
        typeLabel: ANIMAL_TYPE_LABELS[line.type] || line.type,
        detailLabel: `${line.breed || '-'} — دفعة ${batch.code}`,
        countLabel: formatNumber(line.count),
        amount,
        sourceLabel: 'بيع جماعي',
      });
    });
  });

  const allSales = [...individualSales, ...bulkSales].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const salesRows = allSales.map(s => ({ ...s, dateLabel: formatDateArabic(s.date), amountLabel: formatCurrency(s.amount) }));

  const totalIndividualRevenue = individualSales.reduce((s, r) => s + r.amount, 0);
  const totalBulkRevenue = bulkSales.reduce((s, r) => s + r.amount, 0);
  const totalSalesRevenue = totalIndividualRevenue + totalBulkRevenue;

  // ===== تكلفة الرأس (تراكمي، بمعزل عن فلتر الفترة) =====
  const nonDeletedAnimals = _srAnimals.filter(a => a.status !== 'deleted');
  const costRows = nonDeletedAnimals.map(a => {
    const acquisitionCost = Number(a.purchasePrice || 0);
    const healthCost = _srHealthRecords
      .filter(h => h.animalId === a.id && !h.isDeleted)
      .reduce((s, h) => s + Number(h.cost || 0), 0);
    const totalCost = acquisitionCost + healthCost;

    const saleRecord = _srRevenues.find(r => r.category === 'بيع حيوان' && r.animalId === a.id);
    const salePrice = saleRecord ? Number(saleRecord.amount || 0) : null;
    const profit = salePrice !== null ? salePrice - totalCost : null;

    return {
      code: a.code,
      typeLabel: ANIMAL_TYPE_LABELS[a.type] || a.type,
      breed: a.breed || '-',
      statusBadge: `<span class="badge ${a.status === 'sold' ? 'badge--blue' : a.status === 'dead' ? 'badge--red' : a.status === 'movedToTrade' ? 'badge--gray' : 'badge--green'}">${ANIMAL_STATUS_LABELS[a.status] || a.status}</span>`,
      acquisitionCostLabel: formatCurrency(acquisitionCost),
      healthCostLabel: formatCurrency(healthCost),
      totalCostLabel: formatCurrency(totalCost),
      salePriceLabel: salePrice !== null ? formatCurrency(salePrice) : '-',
      profitLabel: profit !== null
        ? `<strong style="color: var(--color-primary-${profit >= 0 ? 'green' : 'red'}-dark);">${formatCurrency(profit)}</strong>`
        : '-',
      _totalCost: totalCost,
      _profit: profit,
    };
  });

  const soldWithProfit = costRows.filter(r => r._profit !== null);
  const avgCost = costRows.length ? costRows.reduce((s, r) => s + r._totalCost, 0) / costRows.length : 0;
  const avgProfit = soldWithProfit.length ? soldWithProfit.reduce((s, r) => s + r._profit, 0) / soldWithProfit.length : 0;

  const container = document.getElementById('report-content');
  container.innerHTML = `
    <div class="overview-section-title">ملخّص المبيعات خلال الفترة المحدّدة</div>
    ${kpiGrid([
      { value: formatCurrency(totalIndividualRevenue), label: 'إيراد البيع الفردي', tone: 'blue', icon: '🐑' },
      { value: formatCurrency(totalBulkRevenue), label: 'إيراد البيع الجماعي', tone: 'blue', icon: '📦' },
      { value: formatCurrency(totalSalesRevenue), label: 'إجمالي المبيعات', tone: 'green', icon: '💰' },
      { value: formatNumber(allSales.length), label: 'عدد عمليات البيع', tone: 'blue' },
    ])}

    <div class="overview-section-title">سجل المبيعات</div>
    <div id="sales-table"></div>

    <div class="overview-section-title">تكلفة الرأس <span style="font-size:12px; font-weight:400; color: var(--color-text-secondary);">(رصيد تراكمي لكل حيوان — تكلفة الشراء/السجل الصحي المتتبَّعة فعليًا فقط، بلا توزيع مصروفات عامة)</span></div>
    ${kpiGrid([
      { value: formatNumber(costRows.length), label: 'عدد الرؤوس المحتسبة', tone: 'blue' },
      { value: formatCurrency(avgCost), label: 'متوسط تكلفة الرأس', tone: 'red' },
      { value: formatCurrency(avgProfit), label: 'متوسط ربح الرأس المباع', tone: avgProfit >= 0 ? 'green' : 'red' },
    ], 3)}
    <div id="cost-table"></div>
  `;

  renderDataTable('sales-table', [
    { key: 'dateLabel', label: 'التاريخ', sortable: true },
    { key: 'typeLabel', label: 'النوع', sortable: false },
    { key: 'detailLabel', label: 'التفاصيل', sortable: false },
    { key: 'countLabel', label: 'العدد', sortable: false },
    { key: 'amountLabel', label: 'المبلغ', sortable: false },
    { key: 'sourceLabel', label: 'المصدر', sortable: false },
  ], salesRows, {
    emptyMessage: 'لا توجد عمليات بيع خلال هذه الفترة',
    footerRow: {
      dateLabel: 'الإجمالي', typeLabel: '', detailLabel: '', countLabel: '',
      amountLabel: formatCurrency(totalSalesRevenue), sourceLabel: '',
    },
  });

  renderDataTable('cost-table', [
    { key: 'code', label: 'الكود', sortable: true },
    { key: 'typeLabel', label: 'النوع', sortable: true },
    { key: 'breed', label: 'السلالة', sortable: true },
    { key: 'statusBadge', label: 'الحالة', sortable: false },
    { key: 'acquisitionCostLabel', label: 'تكلفة الاقتناء', sortable: false },
    { key: 'healthCostLabel', label: 'تكلفة السجل الصحي', sortable: false },
    { key: 'totalCostLabel', label: 'إجمالي التكلفة', sortable: false },
    { key: 'salePriceLabel', label: 'سعر البيع', sortable: false },
    { key: 'profitLabel', label: 'الربح/الخسارة', sortable: false },
  ], costRows, {
    emptyMessage: 'لا توجد حيوانات مسجَّلة بعد',
  });

  _currentExportColumns = [
    { key: 'dateLabel', label: 'التاريخ' }, { key: 'typeLabel', label: 'النوع' }, { key: 'detailLabel', label: 'التفاصيل' },
    { key: 'countLabel', label: 'العدد' }, { key: 'amountLabel', label: 'المبلغ' }, { key: 'sourceLabel', label: 'المصدر' },
  ];
  _currentExportRows = salesRows;

  _costExportColumns = [
    { key: 'code', label: 'الكود' }, { key: 'typeLabel', label: 'النوع' }, { key: 'breed', label: 'السلالة' },
    { key: 'acquisitionCostLabel', label: 'تكلفة الاقتناء' }, { key: 'healthCostLabel', label: 'تكلفة السجل الصحي' },
    { key: 'totalCostLabel', label: 'إجمالي التكلفة' }, { key: 'salePriceLabel', label: 'سعر البيع' },
  ];
  _costExportRows = costRows;
}
