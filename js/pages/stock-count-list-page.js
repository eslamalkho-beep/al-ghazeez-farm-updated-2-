// js/pages/stock-count-list-page.js

let _allStockCountsCache = [];

const STOCK_COUNT_STATUS_LABELS = { draft: 'مسودة', approved: 'معتمد' };

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('inventory');
  renderSidebar('inventory');
  renderHeader('الجرد');

  await _refreshStockCounts();

  document.getElementById('export-excel-btn').addEventListener('click', () => {
    exportRowsToExcel('سجل_الجرد', _stockCountExportColumns, _stockCountExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    exportRowsToPdf('سجل الجرد', _stockCountExportColumns, _stockCountExportRows);
  });
});

const _stockCountExportColumns = [
  { key: 'dateLabel', label: 'التاريخ' },
  { key: 'itemCountLabel', label: 'عدد الأصناف' },
  { key: 'statusLabelPlain', label: 'الحالة' },
  { key: 'totalConsumedValueLabel', label: 'إجمالي قيمة الاستهلاك' },
];
let _stockCountExportRows = [];

async function _refreshStockCounts() {
  _allStockCountsCache = await getAllStockCounts();
  _drawStockCounts();
}

function _drawStockCounts() {
  const rows = _allStockCountsCache
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map(c => {
      const totalConsumedValue = (c.lines || []).reduce((s, l) => s + Number(l.consumedValue || 0), 0);
      return {
        ...c,
        dateLabel: formatDateArabic(c.date),
        itemCountLabel: formatNumber((c.lines || []).length),
        statusBadge: `<span class="badge ${c.status === 'approved' ? 'badge--green' : 'badge--gray'}">${STOCK_COUNT_STATUS_LABELS[c.status] || c.status}</span>`,
        statusLabelPlain: STOCK_COUNT_STATUS_LABELS[c.status] || c.status,
        totalConsumedValueLabel: formatCurrency(totalConsumedValue),
      };
    });

  _stockCountExportRows = rows;

  renderDataTable('stock-count-table', [
    { key: 'dateLabel', label: 'التاريخ', sortable: true },
    { key: 'itemCountLabel', label: 'عدد الأصناف', sortable: false },
    { key: 'statusBadge', label: 'الحالة', sortable: false },
    { key: 'totalConsumedValueLabel', label: 'إجمالي قيمة الاستهلاك', sortable: false },
  ], rows, {
    onRowClick: (row) => { window.location.href = `stock-count-form.html?id=${row.id}`; },
    emptyMessage: 'لا يوجد جرد مسجّل بعد',
  });
}
