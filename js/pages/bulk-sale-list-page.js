// js/pages/bulk-sale-list-page.js
// قائمة عمليات بيع الجملة — كل عملية بيع سجل مستقل بقيد محاسبي خاص بها (إيراد + تكلفة البضاعة المباعة معًا)

let _allBulkSalesCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('bulk');
  renderSidebar('bulk-sales');
  renderHeader('مبيعات الجملة');

  if (!hasActionPermission('bulk', 'add')) {
    document.getElementById('add-bulk-sale-btn').style.display = 'none';
  }
  if (!hasActionPermission('bulk', 'export')) {
    document.getElementById('export-excel-btn').style.display = 'none';
  }
  if (!hasActionPermission('bulk', 'export') || !hasActionPermission('bulk', 'print')) {
    document.getElementById('export-pdf-btn').style.display = 'none';
  }

  await _refreshBulkSales();

  document.getElementById('export-excel-btn').addEventListener('click', () => {
    exportRowsToExcel('مبيعات_الجملة', _bulkSaleExportColumns, _bulkSaleExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    exportRowsToPdf('مبيعات الجملة', _bulkSaleExportColumns, _bulkSaleExportRows);
  });
});

const _bulkSaleExportColumns = [
  { key: 'code', label: 'الكود' },
  { key: 'dateLabel', label: 'التاريخ' },
  { key: 'countLabel', label: 'العدد' },
  { key: 'revenueLabel', label: 'إيراد البيع' },
  { key: 'cogsLabel', label: 'تكلفة البضاعة المباعة' },
  { key: 'profitLabel', label: 'إجمالي الربح' },
  { key: 'notes', label: 'ملاحظات' },
];
let _bulkSaleExportRows = [];

async function _refreshBulkSales() {
  _allBulkSalesCache = await getAllBulkSales();
  _drawBulkSales();
}

function _drawBulkSales() {
  const rows = _allBulkSalesCache.map(s => {
    const count = (s.lines || []).reduce((sum, l) => sum + Number(l.count || 0), 0);
    const revenue = (s.lines || []).reduce((sum, l) => sum + Number(l.count || 0) * Number(l.unitPrice || 0), 0);
    const cogs = (s.lines || []).reduce((sum, l) => sum + Number(l.cogsAmount || 0), 0);
    const profit = revenue - cogs;
    return {
      ...s,
      dateLabel: formatDateArabic(s.date),
      countLabel: formatNumber(count),
      revenueLabel: formatCurrency(revenue),
      cogsLabel: formatCurrency(cogs),
      profitLabel: `<strong style="color: ${profit >= 0 ? 'var(--color-primary-green-dark)' : 'var(--color-primary-red)'};">${formatCurrency(profit)}</strong>`,
      notes: s.notes || '-',
      attachBtn: `<button type="button" class="btn btn--outline" style="padding:4px 10px; font-size:12px;" onclick="event.stopPropagation(); openAttachmentsModal('bulkSale', ${s.id}, '${s.code}')">📎 مرفقات</button>`,
      _count: count, _revenue: revenue, _cogs: cogs, _profit: profit,
    };
  });

  _bulkSaleExportRows = rows.map(r => ({ ...r, profitLabel: formatCurrency(r._profit) }));

  const totalCount = rows.reduce((s, r) => s + r._count, 0);
  const totalRevenue = rows.reduce((s, r) => s + r._revenue, 0);
  const totalCogs = rows.reduce((s, r) => s + r._cogs, 0);
  const totalProfit = rows.reduce((s, r) => s + r._profit, 0);

  renderDataTable('bulk-sale-table', [
    { key: 'code', label: 'الكود', sortable: true },
    { key: 'dateLabel', label: 'التاريخ', sortable: true },
    { key: 'countLabel', label: 'العدد', sortable: false },
    { key: 'revenueLabel', label: 'إيراد البيع', sortable: false },
    { key: 'cogsLabel', label: 'تكلفة البضاعة المباعة', sortable: false },
    { key: 'profitLabel', label: 'إجمالي الربح', sortable: false },
    { key: 'notes', label: 'ملاحظات', sortable: false },
    { key: 'attachBtn', label: 'الفاتورة', sortable: false },
  ], rows, {
    onRowClick: (row) => { window.location.href = `bulk-sale-form.html?id=${row.id}`; },
    emptyMessage: 'لا توجد عمليات بيع مسجّلة بعد',
    footerRow: {
      code: 'الإجمالي', dateLabel: '',
      countLabel: formatNumber(totalCount),
      revenueLabel: formatCurrency(totalRevenue),
      cogsLabel: formatCurrency(totalCogs),
      profitLabel: formatCurrency(totalProfit),
      notes: '', attachBtn: '',
    },
  });
}
