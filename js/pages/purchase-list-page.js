// js/pages/purchase-list-page.js

let _allPurchasesCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('purchases');
  renderSidebar('purchases');
  renderHeader('سجل المشتريات');

  const purchaseCategories = await getCategoryNames('purchase');
  const categorySelect = document.getElementById('filter-category');
  categorySelect.innerHTML += purchaseCategories.map(c => `<option value="${c}">${c}</option>`).join('');

  const params = new URLSearchParams(window.location.search);
  if (params.get('from')) document.getElementById('filter-from').value = params.get('from');
  if (params.get('to')) document.getElementById('filter-to').value = params.get('to');
  if (params.get('category')) document.getElementById('filter-category').value = params.get('category');
  if (params.get('status')) document.getElementById('filter-status').value = params.get('status');

  _allPurchasesCache = await getAllPurchases();
  _drawPurchases();

  document.getElementById('filter-from').addEventListener('change', _drawPurchases);
  document.getElementById('filter-to').addEventListener('change', _drawPurchases);
  document.getElementById('filter-category').addEventListener('change', _drawPurchases);
  document.getElementById('filter-status').addEventListener('change', _drawPurchases);
  document.getElementById('clear-filters-btn').addEventListener('click', () => {
    document.getElementById('filter-from').value = '';
    document.getElementById('filter-to').value = '';
    document.getElementById('filter-category').value = '';
    document.getElementById('filter-status').value = '';
    _drawPurchases();
  });

  document.getElementById('export-excel-btn').addEventListener('click', () => {
    exportRowsToExcel('سجل_المشتريات', _purchaseExportColumns, _purchaseExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    exportRowsToPdf('سجل المشتريات', _purchaseExportColumns, _purchaseExportRows);
  });
});

const PURCHASE_STATUS_LABELS = { approved: 'معتمد', pending: 'قيد الاعتماد' };
const PURCHASE_PAYMENT_METHOD_LABELS = { cash: 'نقدي', transfer: 'تحويل بنكي', cheque: 'شيك' };

const _purchaseExportColumns = [
  { key: 'dateLabel', label: 'التاريخ' },
  { key: 'category', label: 'البند' },
  { key: 'amountLabel', label: 'المبلغ' },
  { key: 'taxInvoiceLabel', label: 'فاتورة ضريبية' },
  { key: 'amountBeforeTaxLabel', label: 'المبلغ قبل الضريبة' },
  { key: 'vendor', label: 'المورّد' },
  { key: 'paymentLabel', label: 'طريقة الدفع' },
  { key: 'statusBadge', label: 'الحالة' },
];
let _purchaseExportRows = [];

function _drawPurchases() {
  const from = document.getElementById('filter-from').value;
  const to = document.getElementById('filter-to').value;
  const category = document.getElementById('filter-category').value;
  const status = document.getElementById('filter-status').value;

  let rows = _allPurchasesCache.filter(p =>
    (!from || p.date >= from) &&
    (!to || p.date <= to) &&
    (!category || p.category === category) &&
    (!status || p.status === status)
  );

  const total = rows.reduce((s, p) => s + Number(p.amount || 0), 0);
  document.getElementById('total-amount').textContent = formatCurrency(total);

  rows = rows.map(p => ({
    ...p,
    dateLabel: formatDateArabic(p.date),
    amountLabel: formatCurrency(p.amount),
    taxInvoiceLabel: p.hasTaxInvoice ? 'نعم' : 'لا',
    taxInvoiceBadge: `<span class="badge ${p.hasTaxInvoice ? 'badge--blue' : 'badge--gray'}">${p.hasTaxInvoice ? 'نعم' : 'لا'}</span>`,
    amountBeforeTaxLabel: p.hasTaxInvoice ? formatCurrency(p.amountBeforeTax) : '-',
    paymentLabel: PURCHASE_PAYMENT_METHOD_LABELS[p.paymentMethod] || p.paymentMethod,
    statusBadge: `<span class="badge ${p.status === 'approved' ? 'badge--green' : 'badge--warning'}">${PURCHASE_STATUS_LABELS[p.status] || p.status}</span>`,
    attachBtn: `<button type="button" class="btn btn--outline" onclick="event.stopPropagation(); openAttachmentsModal('purchase', ${p.id}, '${formatDateArabic(p.date)} - ${formatCurrency(p.amount)}')">📎 مرفقات</button>`,
  }));

  _purchaseExportRows = rows;

  renderDataTable('purchase-table', [
    { key: 'dateLabel', label: 'التاريخ', sortable: true },
    { key: 'category', label: 'البند', sortable: true },
    { key: 'amountLabel', label: 'المبلغ', sortable: false },
    { key: 'taxInvoiceBadge', label: 'فاتورة ضريبية', sortable: false },
    { key: 'vendor', label: 'المورّد', sortable: false },
    { key: 'paymentLabel', label: 'طريقة الدفع', sortable: false },
    { key: 'statusBadge', label: 'الحالة', sortable: false },
    { key: 'attachBtn', label: 'الفاتورة', sortable: false },
  ], rows, {
    onRowClick: (row) => { window.location.href = `purchase-form.html?id=${row.id}`; },
    emptyMessage: 'لا توجد مشتريات مطابقة',
  });
}
