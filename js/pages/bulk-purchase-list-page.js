// js/pages/bulk-purchase-list-page.js
// قائمة عمليات شراء الجملة — كل عملية شراء سجل مستقل بقيد محاسبي خاص بها (مدين مخزون الجملة/دائن الصندوق)

let _allBulkPurchasesCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('bulk');
  renderSidebar('bulk-purchases');
  renderHeader('مشتريات الجملة');

  if (!hasActionPermission('bulk', 'add')) {
    document.getElementById('add-bulk-purchase-btn').style.display = 'none';
  }
  if (!hasActionPermission('bulk', 'export')) {
    document.getElementById('export-excel-btn').style.display = 'none';
  }
  if (!hasActionPermission('bulk', 'export') || !hasActionPermission('bulk', 'print')) {
    document.getElementById('export-pdf-btn').style.display = 'none';
  }

  await _refreshBulkPurchases();

  document.getElementById('export-excel-btn').addEventListener('click', () => {
    exportRowsToExcel('مشتريات_الجملة', _bulkPurchaseExportColumns, _bulkPurchaseExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    exportRowsToPdf('مشتريات الجملة', _bulkPurchaseExportColumns, _bulkPurchaseExportRows);
  });
});

const _bulkPurchaseExportColumns = [
  { key: 'code', label: 'الكود' },
  { key: 'dateLabel', label: 'التاريخ' },
  { key: 'countLabel', label: 'العدد' },
  { key: 'costLabel', label: 'تكلفة الشراء' },
  { key: 'notes', label: 'ملاحظات' },
];
let _bulkPurchaseExportRows = [];

async function _refreshBulkPurchases() {
  _allBulkPurchasesCache = await getAllBulkPurchases();
  _drawBulkPurchases();
}

function _drawBulkPurchases() {
  const rows = _allBulkPurchasesCache.map(p => {
    const count = (p.lines || []).reduce((s, l) => s + Number(l.count || 0), 0);
    const cost = (p.lines || []).reduce((s, l) => s + Number(l.count || 0) * Number(l.unitPrice || 0), 0);
    return {
      ...p,
      dateLabel: formatDateArabic(p.date),
      countLabel: formatNumber(count),
      costLabel: formatCurrency(cost),
      notes: p.notes || '-',
      attachBtn: `<button type="button" class="btn btn--outline" style="padding:4px 10px; font-size:12px;" onclick="event.stopPropagation(); openAttachmentsModal('bulkPurchase', ${p.id}, '${p.code}')">📎 مرفقات</button>`,
      _count: count, _cost: cost,
    };
  });

  _bulkPurchaseExportRows = rows.map(r => ({ ...r }));

  const totalCount = rows.reduce((s, r) => s + r._count, 0);
  const totalCost = rows.reduce((s, r) => s + r._cost, 0);

  renderDataTable('bulk-purchase-table', [
    { key: 'code', label: 'الكود', sortable: true },
    { key: 'dateLabel', label: 'التاريخ', sortable: true },
    { key: 'countLabel', label: 'العدد', sortable: false },
    { key: 'costLabel', label: 'تكلفة الشراء', sortable: false },
    { key: 'notes', label: 'ملاحظات', sortable: false },
    { key: 'attachBtn', label: 'الفاتورة', sortable: false },
  ], rows, {
    onRowClick: (row) => { window.location.href = `bulk-purchase-form.html?id=${row.id}`; },
    emptyMessage: 'لا توجد عمليات شراء مسجّلة بعد',
    footerRow: {
      code: 'الإجمالي', dateLabel: '',
      countLabel: formatNumber(totalCount),
      costLabel: formatCurrency(totalCost),
      notes: '', attachBtn: '',
    },
  });
}
