// js/pages/inventory-reports-page.js

let _allInventoryItemsForReport = [];
let _allInventoryMovementsForReport = [];
let _currentExportColumns = null;
let _currentExportRows = null;
let _currentMovementExportColumns = null;
let _currentMovementExportRows = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('reports');
  renderSidebar('reports');
  renderHeader('تقارير المخزون');

  [_allInventoryItemsForReport, _allInventoryMovementsForReport] = await Promise.all([
    getAllInventoryItems(),
    getAllInventoryMovements(),
  ]);

  document.getElementById('report-from').addEventListener('change', _renderInventoryReport);
  document.getElementById('report-to').addEventListener('change', _renderInventoryReport);

  // التصدير (Excel/PDF) يضم قسمين معًا في نفس الملف: الرصيد لكل صنف + سجل الحركات خلال الفترة
  document.getElementById('export-excel-btn').addEventListener('click', () => {
    exportSectionsToExcel('تقرير المخزون', [
      { title: 'الرصيد لكل صنف', columns: _currentExportColumns, rows: _currentExportRows },
      { title: 'سجل الحركات', columns: _currentMovementExportColumns, rows: _currentMovementExportRows },
    ]);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    exportSectionsToPdf('تقرير المخزون', [
      { title: 'الرصيد لكل صنف', columns: _currentExportColumns, rows: _currentExportRows },
      { title: 'سجل الحركات', columns: _currentMovementExportColumns, rows: _currentMovementExportRows },
    ]);
  });

  _renderInventoryReport();
});

function _renderInventoryReport() {
  const from = document.getElementById('report-from').value;
  const to = document.getElementById('report-to').value;
  const asOfDate = to || todayIso();

  const periodMovements = _allInventoryMovementsForReport.filter(m =>
    (!from || m.date >= from) && (!to || m.date <= to)
  );
  const asOfMovements = _allInventoryMovementsForReport.filter(m => m.date <= asOfDate);

  const incomingCount = periodMovements.filter(m => m.direction === 'in').length;
  const outgoingCount = periodMovements.filter(m => m.direction === 'out').length;

  const itemRows = _allInventoryItemsForReport.map(item => {
    const periodIn = periodMovements.filter(m => m.itemId === item.id && m.direction === 'in').reduce((s, m) => s + Number(m.quantity || 0), 0);
    const periodOut = periodMovements.filter(m => m.itemId === item.id && m.direction === 'out').reduce((s, m) => s + Number(m.quantity || 0), 0);
    const { currentQty, isLowStock } = computeItemStockLevel(item, asOfMovements);
    const lastPrice = getLastPurchasePrice(item, asOfMovements);
    return {
      nameLabel: item.name,
      categoryLabel: INVENTORY_CATEGORY_LABELS[item.category] || item.category,
      unitLabel: item.unit || '-',
      periodInLabel: formatNumber(periodIn),
      periodOutLabel: formatNumber(periodOut),
      balanceLabel: formatNumber(currentQty),
      lastPriceLabel: lastPrice !== null ? formatCurrency(lastPrice) : '-',
      thresholdLabel: isRequired(item.reorderThreshold) ? formatNumber(item.reorderThreshold) : '-',
      statusLabel: isLowStock ? '<span class="badge badge--red">منخفض</span>' : '<span class="badge badge--green">متوفر</span>',
      isLowStock,
    };
  });

  const lowStockCount = itemRows.filter(r => r.isLowStock).length;

  const reasonCounts = {};
  periodMovements.forEach(m => {
    reasonCounts[m.reasonType] = (reasonCounts[m.reasonType] || 0) + 1;
  });
  const reasonKeys = Object.keys(reasonCounts);

  const container = document.getElementById('report-content');
  container.innerHTML = `
    ${kpiGrid([
      { value: formatNumber(_allInventoryItemsForReport.length), label: 'عدد الأصناف المكوَّدة', tone: 'blue', icon: '📦' },
      { value: formatNumber(lowStockCount), label: `أصناف تحت حد الطلب (كما في ${formatDateArabic(asOfDate)})`, tone: lowStockCount > 0 ? 'red' : 'blue', icon: '📉' },
      { value: formatNumber(incomingCount), label: 'حركات وارد خلال الفترة', tone: 'green', icon: '⬇️' },
      { value: formatNumber(outgoingCount), label: 'حركات صادر خلال الفترة', tone: 'red', icon: '⬆️' },
    ])}
    <div class="card" style="margin-bottom: var(--spacing-3);">
      <div class="card__header"><h3>توزيع حركات المخزون حسب السبب خلال الفترة</h3></div>
      <div class="chart-box"><canvas id="inv-reason-chart"></canvas></div>
    </div>

    <div class="overview-section-title" style="font-size:15px; font-weight:800; margin-bottom: var(--spacing-2);">الرصيد لكل صنف <span style="font-size:12px; font-weight:400; color: var(--color-text-secondary);">(كما في ${formatDateArabic(asOfDate)})</span></div>
    <div id="inv-report-table"></div>

    <div class="overview-section-title" style="font-size:15px; font-weight:800; margin: var(--spacing-4) 0 var(--spacing-2);">سجل الحركات خلال الفترة</div>
    <div id="inv-movements-table"></div>
  `;

  renderPieChart(
    'inv-reason-chart',
    reasonKeys.map(k => INVENTORY_REASON_LABELS[k] || k),
    reasonKeys.map(k => reasonCounts[k]),
  );

  const columns = [
    { key: 'nameLabel', label: 'الصنف', sortable: true },
    { key: 'categoryLabel', label: 'التصنيف', sortable: true },
    { key: 'unitLabel', label: 'الوحدة', sortable: false },
    { key: 'periodInLabel', label: 'وارد خلال الفترة', sortable: false },
    { key: 'periodOutLabel', label: 'صادر خلال الفترة', sortable: false },
    { key: 'balanceLabel', label: 'الرصيد', sortable: false },
    { key: 'lastPriceLabel', label: 'آخر سعر شراء (للوحدة)', sortable: false },
    { key: 'thresholdLabel', label: 'حد الطلب', sortable: false },
    { key: 'statusLabel', label: 'الحالة', sortable: false },
  ];

  _currentExportColumns = columns;
  _currentExportRows = itemRows;

  renderDataTable('inv-report-table', columns, itemRows, {
    searchable: false,
    pageSize: itemRows.length || 1,
    emptyMessage: 'لا توجد أصناف مخزون مكوَّدة بعد',
  });

  const movementRows = [...periodMovements]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map(m => {
      const item = _allInventoryItemsForReport.find(i => i.id === m.itemId);
      return {
        dateLabel: formatDateArabic(m.date),
        itemLabel: item ? item.name : 'صنف محذوف',
        directionBadge: m.direction === 'in' ? '<span class="badge badge--green">وارد</span>' : '<span class="badge badge--red">صادر</span>',
        quantityLabel: formatNumber(m.quantity),
        unitCostLabel: isRequired(m.unitCost) ? formatCurrency(m.unitCost) : '-',
        reasonLabel: INVENTORY_REASON_LABELS[m.reasonType] || m.reasonType || '-',
        notes: m.notes || '-',
      };
    });

  const movementColumns = [
    { key: 'dateLabel', label: 'التاريخ', sortable: true },
    { key: 'itemLabel', label: 'الصنف', sortable: true },
    { key: 'directionBadge', label: 'الاتجاه', sortable: false },
    { key: 'quantityLabel', label: 'الكمية', sortable: false },
    { key: 'unitCostLabel', label: 'تكلفة الوحدة', sortable: false },
    { key: 'reasonLabel', label: 'السبب', sortable: true },
    { key: 'notes', label: 'ملاحظات', sortable: false },
  ];

  _currentMovementExportColumns = movementColumns;
  _currentMovementExportRows = movementRows;

  renderDataTable('inv-movements-table', movementColumns, movementRows, {
    emptyMessage: 'لا توجد حركات مسجّلة خلال هذه الفترة',
  });
}
