// js/pages/bulk-batch-list-page.js
// قائمة دفعات الشراء والبيع الجماعي — كل دفعة تحوي بنود شراء (يوم واحد) وبنود بيع/مصاريف (كل بند بتاريخه)

let _allBulkBatchesCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('bulk');
  renderSidebar('bulk');
  renderHeader('الشراء والبيع الجماعي');

  await _refreshBulkBatches();

  document.getElementById('export-excel-btn').addEventListener('click', () => {
    exportRowsToExcel('دفعات_الشراء_والبيع_الجماعي', _bulkBatchExportColumns, _bulkBatchExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    exportRowsToPdf('دفعات الشراء والبيع الجماعي', _bulkBatchExportColumns, _bulkBatchExportRows);
  });
});

const _bulkBatchExportColumns = [
  { key: 'code', label: 'الكود' },
  { key: 'dateLabel', label: 'تاريخ الشراء' },
  { key: 'purchaseCountLabel', label: 'عدد الشراء' },
  { key: 'purchaseCostLabel', label: 'تكلفة الشراء' },
  { key: 'saleCountLabel', label: 'عدد البيع' },
  { key: 'saleRevenueLabel', label: 'إيراد البيع' },
  { key: 'expensesLabel', label: 'المصاريف' },
  { key: 'netRevenueLabel', label: 'صافي الإيراد' },
  { key: 'remainingCountLabel', label: 'العدد المتبقي' },
];
let _bulkBatchExportRows = [];

async function _refreshBulkBatches() {
  _allBulkBatchesCache = await getAllBulkBatches();
  _drawBulkBatches();
}

function _drawBulkBatches() {
  const rows = _allBulkBatchesCache.map(b => {
    const totals = computeBulkBatchTotals(b);
    const isNegative = totals.remainingCount < 0;
    return {
      ...b,
      dateLabel: formatDateArabic(b.purchaseDate),
      purchaseCountLabel: formatNumber(totals.totalPurchaseCount),
      purchaseCostLabel: formatCurrency(totals.totalPurchaseCost),
      saleCountLabel: formatNumber(totals.totalSaleCount),
      saleRevenueLabel: formatCurrency(totals.totalSaleRevenue),
      expensesLabel: formatCurrency(totals.totalExpenses),
      netRevenueLabel: `<strong style="color: ${totals.netRevenue >= 0 ? 'var(--color-primary-green-dark)' : 'var(--color-primary-red)'};">${formatCurrency(totals.netRevenue)}</strong>`,
      remainingCountLabel: isNegative
        ? `<strong style="color: var(--color-primary-red);">${formatNumber(totals.remainingCount)}</strong>`
        : formatNumber(totals.remainingCount),
      attachBtn: `<button type="button" class="btn btn--outline" style="padding:4px 10px; font-size:12px;" onclick="event.stopPropagation(); openAttachmentsModal('bulkBatch', ${b.id}, '${b.code}')">📎 مرفقات</button>`,
      _totals: totals,
    };
  });

  _bulkBatchExportRows = rows.map(r => ({
    ...r,
    netRevenueLabel: formatCurrency(r._totals.netRevenue),
    remainingCountLabel: formatNumber(r._totals.remainingCount),
  }));

  const totalPurchaseCount = rows.reduce((s, r) => s + r._totals.totalPurchaseCount, 0);
  const totalPurchaseCost = rows.reduce((s, r) => s + r._totals.totalPurchaseCost, 0);
  const totalSaleCount = rows.reduce((s, r) => s + r._totals.totalSaleCount, 0);
  const totalSaleRevenue = rows.reduce((s, r) => s + r._totals.totalSaleRevenue, 0);
  const totalExpenses = rows.reduce((s, r) => s + r._totals.totalExpenses, 0);
  const totalNetRevenue = rows.reduce((s, r) => s + r._totals.netRevenue, 0);
  const totalRemaining = rows.reduce((s, r) => s + r._totals.remainingCount, 0);

  renderDataTable('bulk-batch-table', [
    { key: 'code', label: 'الكود', sortable: true },
    { key: 'dateLabel', label: 'تاريخ الشراء', sortable: true },
    { key: 'purchaseCountLabel', label: 'عدد الشراء', sortable: false },
    { key: 'purchaseCostLabel', label: 'تكلفة الشراء', sortable: false },
    { key: 'saleCountLabel', label: 'عدد البيع', sortable: false },
    { key: 'saleRevenueLabel', label: 'إيراد البيع', sortable: false },
    { key: 'expensesLabel', label: 'المصاريف', sortable: false },
    { key: 'netRevenueLabel', label: 'صافي الإيراد', sortable: false },
    { key: 'remainingCountLabel', label: 'العدد المتبقي', sortable: false },
    { key: 'attachBtn', label: 'الفاتورة', sortable: false },
  ], rows, {
    onRowClick: (row) => { window.location.href = `bulk-batch-form.html?id=${row.id}`; },
    emptyMessage: 'لا توجد دفعات مسجّلة بعد',
    footerRow: {
      code: 'الإجمالي',
      dateLabel: '',
      purchaseCountLabel: formatNumber(totalPurchaseCount),
      purchaseCostLabel: formatCurrency(totalPurchaseCost),
      saleCountLabel: formatNumber(totalSaleCount),
      saleRevenueLabel: formatCurrency(totalSaleRevenue),
      expensesLabel: formatCurrency(totalExpenses),
      netRevenueLabel: formatCurrency(totalNetRevenue),
      remainingCountLabel: formatNumber(totalRemaining),
      attachBtn: '',
    },
  });
}
