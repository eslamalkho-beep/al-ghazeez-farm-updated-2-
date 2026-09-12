// js/pages/stock-count-list-page.js

let _allStockCountsCache = [];
let _allInventoryItemsCacheForCounts = [];

const STOCK_COUNT_STATUS_LABELS = { draft: 'مسودة', approved: 'معتمد' };

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('inventory');
  renderSidebar('inventory-stock-counts');
  renderHeader('الجرد');

  await _refreshStockCounts();

  document.getElementById('export-excel-btn').addEventListener('click', () => {
    exportRowsToExcel('سجل_الجرد', _stockCountExportColumns, _stockCountExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    exportRowsToPdf('سجل الجرد', _stockCountExportColumns, _stockCountExportRows);
  });
});

// تصدير/طباعة "سجل الجرد" تفصيلي بمستوى السطر (كل صنف مُستهلَك في كل جرد صف مستقل)، بعكس جدول العرض على
// الشاشة أعلاه الذي يبقى بمستوى الجرد الكامل (صف لكل جرد، ينقر عليه المستخدم ليفتح نموذج ذلك الجرد بالتفصيل)
const _stockCountExportColumns = [
  { key: 'dateLabel', label: 'التاريخ' },
  { key: 'itemNumber', label: 'رقم الصنف' },
  { key: 'itemName', label: 'اسم الصنف' },
  { key: 'consumedQtyLabel', label: 'الكمية المستهلكة' },
  { key: 'consumedValueLabel', label: 'قيمة الاستهلاك' },
  { key: 'statusLabel', label: 'الحالة' },
  { key: 'notesLabel', label: 'ملاحظات' },
];
let _stockCountExportRows = [];

async function _refreshStockCounts() {
  [_allStockCountsCache, _allInventoryItemsCacheForCounts] = await Promise.all([
    getAllStockCounts(),
    getAllInventoryItems(),
  ]);
  _drawStockCounts();
}

// يبني صفوف التصدير التفصيلية: يفرد سطور كل جرد (بترتيب العرض نفسه: الأحدث أولاً) إلى صف مستقل لكل صنف —
// "رقم الصنف" هنا هو معرّف السجل (id) في مخزن InventoryItems، إذ لا يوجد حاليًا كود/رقم مخصص لكل صنف في النظام
function _buildStockCountExportRows(sortedCounts) {
  const rows = [];
  sortedCounts.forEach(count => {
    (count.lines || []).forEach(line => {
      if (!line.itemId) return;
      const item = _allInventoryItemsCacheForCounts.find(i => i.id === Number(line.itemId));
      rows.push({
        dateLabel: formatDateArabic(count.date),
        itemNumber: line.itemId,
        itemName: item ? item.name : 'صنف محذوف',
        consumedQtyLabel: `${formatNumber(line.consumedQty)}${item ? ' ' + (item.unit || '') : ''}`,
        consumedValueLabel: formatCurrency(line.consumedValue),
        statusLabel: STOCK_COUNT_STATUS_LABELS[count.status] || count.status,
        notesLabel: count.notes || '-',
      });
    });
  });
  return rows;
}

function _drawStockCounts() {
  const sortedCounts = [..._allStockCountsCache].sort((a, b) => (a.date < b.date ? 1 : -1));
  const rows = sortedCounts.map(c => {
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

  _stockCountExportRows = _buildStockCountExportRows(sortedCounts);

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
