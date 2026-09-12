// js/pages/fattening-reports-page.js
// تقرير التسمين: ملخص كل دفعة + تفصيل كل حيوان فيها (التكلفة الموزَّعة من العلف/الأدوية المرتبطة + التكلفة
// الصحية الفردية + الوزن المكتسب + الربح الفعلي عند البيع) — نفس محرك الحساب المستخدم في herd/fattening.html
// (computeFatteningBatchResults من fattening-service.js)، معروض هنا بشكل تقرير قابل للتصدير بقسمين معًا.

let _frAllBatches = [];
let _frAllAnimals = [];
let _frAllExpenses = [];
let _frAllWeights = [];
let _frAllHealth = [];
let _frAllRevenues = [];
let _frAllLocations = [];
let _frAllInventoryMovements = [];
let _frAllDeaths = [];

let _frBatchSummaryColumns = null;
let _frBatchSummaryRows = null;
let _frAnimalDetailColumns = null;
let _frAnimalDetailRows = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('reports');
  renderSidebar('reports-fattening');
  renderHeader('تقرير التسمين');

  [_frAllBatches, _frAllAnimals, _frAllExpenses, _frAllWeights, _frAllHealth, _frAllRevenues, _frAllLocations, _frAllInventoryMovements, _frAllDeaths] = await Promise.all([
    getAllFatteningBatches(),
    getAllAnimals(),
    getAllExpenses(),
    getAllWeightRecords(),
    getAllHealthRecords(),
    getAllRevenues(),
    getAllLocations(),
    getAllInventoryMovements(),
    getAllDeaths(),
  ]);

  const batchSelect = document.getElementById('batch-filter');
  batchSelect.innerHTML = `<option value="">كل الدفعات</option>` +
    _frAllBatches
      .slice()
      .sort((a, b) => new Date(b.startDate) - new Date(a.startDate))
      .map(b => `<option value="${b.id}">${b.batchNumber} — ${formatDateArabic(b.startDate)}</option>`).join('');

  batchSelect.addEventListener('change', _renderFatteningReport);
  document.getElementById('status-filter').addEventListener('change', _renderFatteningReport);

  document.getElementById('export-excel-btn').addEventListener('click', () => {
    exportSectionsToExcel('تقرير_التسمين', [
      { title: 'ملخص الدفعات', columns: _frBatchSummaryColumns, rows: _frBatchSummaryRows },
      { title: 'تفصيل كل حيوان', columns: _frAnimalDetailColumns, rows: _frAnimalDetailRows },
    ]);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    exportSectionsToPdf('تقرير التسمين', [
      { title: 'ملخص الدفعات', columns: _frBatchSummaryColumns, rows: _frBatchSummaryRows },
      { title: 'تفصيل كل حيوان', columns: _frAnimalDetailColumns, rows: _frAnimalDetailRows },
    ]);
  });

  _renderFatteningReport();
});

function _renderFatteningReport() {
  const batchIdFilter = document.getElementById('batch-filter').value;
  const statusFilter = document.getElementById('status-filter').value;

  let batches = _frAllBatches;
  if (batchIdFilter) batches = batches.filter(b => b.id === Number(batchIdFilter));
  if (statusFilter) batches = batches.filter(b => b.status === statusFilter);
  batches = batches.slice().sort((a, b) => new Date(b.startDate) - new Date(a.startDate));

  const batchSummaryRows = [];
  const animalDetailRows = [];

  let grandLinkedCost = 0, grandIndividualCost = 0, grandTotalCost = 0;
  let grandWeightGain = 0, grandSaleRevenue = 0, grandProfit = 0, grandAnimalsCount = 0;

  batches.forEach(batch => {
    const results = computeFatteningBatchResults(batch, {
      expenses: _frAllExpenses,
      weightRecords: _frAllWeights,
      animals: _frAllAnimals,
      revenues: _frAllRevenues,
      healthRecords: _frAllHealth,
      inventoryMovements: _frAllInventoryMovements,
      deathRecords: _frAllDeaths,
    });

    const totalAllocated = results.animalsResults.reduce((s, r) => s + (r.allocatedCost || 0), 0);
    const totalIndividual = results.animalsResults.reduce((s, r) => s + (r.individualCost || 0), 0);
    const totalCost = totalAllocated + totalIndividual;
    const totalSale = results.animalsResults.reduce((s, r) => s + (r.saleRevenue || 0), 0);
    const totalProfit = results.animalsResults.reduce((s, r) => s + (r.netProfit || 0), 0);
    const activeCount = (batch.animals || []).filter(a => !a.exitDate).length;
    const totalCount = (batch.animals || []).length;

    grandLinkedCost += results.totalLinkedCost;
    grandIndividualCost += totalIndividual;
    grandTotalCost += totalCost;
    grandWeightGain += results.totalWeightGain;
    grandSaleRevenue += totalSale;
    grandProfit += totalProfit;
    grandAnimalsCount += totalCount;

    const location = _frAllLocations.find(l => l.id === batch.locationId);

    batchSummaryRows.push({
      batchNumber: batch.batchNumber,
      startDateLabel: formatDateArabic(batch.startDate),
      endDateLabel: batch.endDate ? formatDateArabic(batch.endDate) : '-',
      locationLabel: location ? location.name : '-',
      statusLabel: batch.status === 'closed' ? 'مغلقة' : 'نشطة',
      animalsCountLabel: `${activeCount} نشط / ${totalCount} إجمالي`,
      allocationMethodLabel: FATTENING_ALLOCATION_METHOD_LABELS[results.allocationMethod],
      linkedCostLabel: formatCurrency(results.totalLinkedCost),
      individualCostLabel: formatCurrency(totalIndividual),
      totalCostLabel: formatCurrency(totalCost),
      weightGainLabel: formatNumber(results.totalWeightGain),
      avgCostPerKgLabel: results.avgCostPerKg != null ? `${formatCurrency(results.avgCostPerKg)}/كجم` : '-',
      saleRevenueLabel: totalSale > 0 ? formatCurrency(totalSale) : '-',
      profitLabel: totalProfit !== 0 ? formatCurrency(totalProfit) : '-',
    });

    results.animalsResults
      .slice()
      .sort((a, b) => a.entryDate < b.entryDate ? -1 : 1)
      .forEach(r => {
        animalDetailRows.push({
          batchNumber: batch.batchNumber,
          animalCode: r.animal ? r.animal.code : `#${r.animalId}`,
          entryDateLabel: formatDateArabic(r.entryDate),
          exitDateLabel: r.exitDate ? formatDateArabic(r.exitDate) : 'نشط',
          daysLabel: formatNumber(r.days),
          entryWeightLabel: r.entryWeight != null ? formatNumber(r.entryWeight) : '-',
          exitWeightLabel: r.exitWeight != null ? formatNumber(r.exitWeight) : '-',
          weightGainLabel: r.weightGain != null ? formatNumber(r.weightGain) : '-',
          allocatedCostLabel: formatCurrency(r.allocatedCost),
          individualCostLabel: r.individualCost > 0 ? formatCurrency(r.individualCost) : '-',
          totalCostLabel: formatCurrency(r.totalCost),
          costPerKgLabel: r.costPerKgGain != null ? formatCurrency(r.costPerKgGain) : '-',
          saleRevenueLabel: r.saleRevenue > 0 ? formatCurrency(r.saleRevenue) : '-',
          netProfitLabel: r.netProfit != null ? formatCurrency(r.netProfit) : '-',
        });
      });
  });

  const grandAvgCostPerKg = grandWeightGain > 0 ? Math.round((grandLinkedCost / grandWeightGain) * 100) / 100 : null;

  const container = document.getElementById('report-content');
  container.innerHTML = `
    ${kpiGrid([
      { value: formatNumber(batches.length), label: 'عدد الدفعات المعروضة', tone: 'blue', icon: '📦' },
      { value: formatNumber(grandAnimalsCount), label: 'إجمالي عدد الحيوانات', tone: 'blue', icon: '🐑' },
      { value: formatCurrency(grandLinkedCost), label: 'إجمالي تكلفة العلف والأدوية', tone: 'red', icon: '💰' },
      { value: grandAvgCostPerKg != null ? `${formatCurrency(grandAvgCostPerKg)}/كجم` : '-', label: 'متوسط تكلفة الكيلو الإجمالي', tone: 'red', icon: '⚖️' },
      { value: formatNumber(grandWeightGain), label: 'إجمالي الزيادة في الوزن (كجم)', tone: 'green', icon: '📈' },
      { value: formatCurrency(grandProfit), label: 'إجمالي الربح الفعلي (المُباع فقط)', tone: grandProfit >= 0 ? 'green' : 'red', icon: '✅' },
    ])}

    <div class="overview-section-title" style="font-size:15px; font-weight:800; margin-bottom: var(--spacing-2);">ملخص الدفعات</div>
    <div id="fr-batch-summary-table"></div>

    <div class="overview-section-title" style="font-size:15px; font-weight:800; margin: var(--spacing-4) 0 var(--spacing-2);">تفصيل كل حيوان</div>
    <div id="fr-animal-detail-table"></div>
  `;

  const batchSummaryColumns = [
    { key: 'batchNumber', label: 'كود الدفعة', sortable: true },
    { key: 'startDateLabel', label: 'تاريخ البدء', sortable: true },
    { key: 'endDateLabel', label: 'تاريخ الإغلاق', sortable: false },
    { key: 'locationLabel', label: 'الحظيرة', sortable: false },
    { key: 'statusLabel', label: 'الحالة', sortable: false },
    { key: 'animalsCountLabel', label: 'عدد الحيوانات', sortable: false },
    { key: 'allocationMethodLabel', label: 'طريقة توزيع التكلفة', sortable: false },
    { key: 'linkedCostLabel', label: 'تكلفة العلف والأدوية', sortable: false },
    { key: 'individualCostLabel', label: 'تكلفة فردية مباشرة (صحية + مصروفات)', sortable: false },
    { key: 'totalCostLabel', label: 'إجمالي التكلفة', sortable: false },
    { key: 'weightGainLabel', label: 'إجمالي الزيادة (كجم)', sortable: false },
    { key: 'avgCostPerKgLabel', label: 'متوسط تكلفة الكيلو', sortable: false },
    { key: 'saleRevenueLabel', label: 'إجمالي المبيعات', sortable: false },
    { key: 'profitLabel', label: 'إجمالي الربح', sortable: false },
  ];
  _frBatchSummaryColumns = batchSummaryColumns;
  _frBatchSummaryRows = batchSummaryRows;

  renderDataTable('fr-batch-summary-table', batchSummaryColumns, batchSummaryRows, {
    searchable: false,
    pageSize: batchSummaryRows.length || 1,
    emptyMessage: 'لا توجد دفعات تسمين مطابقة للفلاتر الحالية',
  });

  const animalDetailColumns = [
    { key: 'batchNumber', label: 'كود الدفعة', sortable: true },
    { key: 'animalCode', label: 'كود الحيوان', sortable: true },
    { key: 'entryDateLabel', label: 'تاريخ الدخول', sortable: false },
    { key: 'exitDateLabel', label: 'تاريخ الخروج', sortable: false },
    { key: 'daysLabel', label: 'الأيام', sortable: false },
    { key: 'entryWeightLabel', label: 'وزن الدخول', sortable: false },
    { key: 'exitWeightLabel', label: 'وزن الخروج', sortable: false },
    { key: 'weightGainLabel', label: 'الزيادة (كجم)', sortable: false },
    { key: 'allocatedCostLabel', label: 'تكلفة العلف/الأدوية الموزَّعة', sortable: false },
    { key: 'individualCostLabel', label: 'تكلفة فردية مباشرة (صحية + مصروفات)', sortable: false },
    { key: 'totalCostLabel', label: 'إجمالي التكلفة', sortable: false },
    { key: 'costPerKgLabel', label: 'تكلفة الكيلو', sortable: false },
    { key: 'saleRevenueLabel', label: 'سعر البيع', sortable: false },
    { key: 'netProfitLabel', label: 'الربح', sortable: false },
  ];
  _frAnimalDetailColumns = animalDetailColumns;
  _frAnimalDetailRows = animalDetailRows;

  renderDataTable('fr-animal-detail-table', animalDetailColumns, animalDetailRows, {
    pageSize: 15,
    emptyMessage: 'لا توجد حيوانات ضمن الدفعات المطابقة للفلاتر الحالية',
  });
}
