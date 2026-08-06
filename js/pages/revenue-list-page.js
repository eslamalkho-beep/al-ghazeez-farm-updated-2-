// js/pages/revenue-list-page.js

let _allRevenuesCache = [];
let _allAnimalsCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('revenues');
  renderSidebar('revenues');
  renderHeader('سجل الإيرادات');

  const revenueCategories = await getCategoryNames('revenue');
  const categorySelect = document.getElementById('filter-category');
  categorySelect.innerHTML += revenueCategories.map(c => `<option value="${c}">${c}</option>`).join('');

  const params = new URLSearchParams(window.location.search);
  if (params.get('from')) document.getElementById('filter-from').value = params.get('from');
  if (params.get('to')) document.getElementById('filter-to').value = params.get('to');
  if (params.get('category')) document.getElementById('filter-category').value = params.get('category');

  _allRevenuesCache = await getAllRevenues();
  _allAnimalsCache = await getAllAnimals();
  _drawRevenues();

  document.getElementById('filter-from').addEventListener('change', _drawRevenues);
  document.getElementById('filter-to').addEventListener('change', _drawRevenues);
  document.getElementById('filter-category').addEventListener('change', _drawRevenues);
  document.getElementById('clear-filters-btn').addEventListener('click', () => {
    document.getElementById('filter-from').value = '';
    document.getElementById('filter-to').value = '';
    document.getElementById('filter-category').value = '';
    _drawRevenues();
  });

  document.getElementById('export-excel-btn').addEventListener('click', () => {
    exportRowsToExcel('سجل_الإيرادات', _revenueExportColumns, _revenueExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    exportRowsToPdf('سجل الإيرادات', _revenueExportColumns, _revenueExportRows);
  });
});

const RECEIVE_METHOD_LABELS = { cash: 'نقدي', transfer: 'تحويل بنكي' };

const _revenueExportColumns = [
  { key: 'dateLabel', label: 'التاريخ' },
  { key: 'category', label: 'النوع' },
  { key: 'animalCodeLabel', label: 'كود الحيوان' },
  { key: 'amountLabel', label: 'المبلغ' },
  { key: 'taxInvoiceLabel', label: 'فاتورة ضريبية' },
  { key: 'amountBeforeTaxLabel', label: 'المبلغ قبل الضريبة' },
  { key: 'client', label: 'العميل/الجهة' },
  { key: 'receiveLabel', label: 'طريقة الاستلام' },
];
let _revenueExportRows = [];

function _drawRevenues() {
  const from = document.getElementById('filter-from').value;
  const to = document.getElementById('filter-to').value;
  const category = document.getElementById('filter-category').value;

  let rows = _allRevenuesCache.filter(r =>
    (!from || r.date >= from) &&
    (!to || r.date <= to) &&
    (!category || r.category === category)
  );

  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  document.getElementById('total-amount').textContent = formatCurrency(total);

  rows = rows.map(r => {
    const animal = r.animalId ? _allAnimalsCache.find(a => a.id === r.animalId) : null;
    return {
      ...r,
      dateLabel: formatDateArabic(r.date),
      amountLabel: formatCurrency(r.amount),
      taxInvoiceLabel: r.hasTaxInvoice ? 'نعم' : 'لا',
      taxInvoiceBadge: `<span class="badge ${r.hasTaxInvoice ? 'badge--blue' : 'badge--gray'}">${r.hasTaxInvoice ? 'نعم' : 'لا'}</span>`,
      amountBeforeTaxLabel: r.hasTaxInvoice ? formatCurrency(r.amountBeforeTax) : '-',
      receiveLabel: RECEIVE_METHOD_LABELS[r.receiveMethod] || r.receiveMethod,
      animalCodeLabel: animal ? animal.code : '-',
      attachBtn: `<button type="button" class="btn btn--outline" onclick="event.stopPropagation(); openAttachmentsModal('revenue', ${r.id}, '${formatDateArabic(r.date)} - ${formatCurrency(r.amount)}')">📎 مرفقات</button>`,
    };
  });

  _revenueExportRows = rows;

  renderDataTable('revenue-table', [
    { key: 'dateLabel', label: 'التاريخ', sortable: true },
    { key: 'category', label: 'النوع', sortable: true },
    { key: 'animalCodeLabel', label: 'كود الحيوان', sortable: false },
    { key: 'amountLabel', label: 'المبلغ', sortable: false },
    { key: 'taxInvoiceBadge', label: 'فاتورة ضريبية', sortable: false },
    { key: 'client', label: 'العميل/الجهة', sortable: false },
    { key: 'receiveLabel', label: 'طريقة الاستلام', sortable: false },
    { key: 'attachBtn', label: 'الفاتورة', sortable: false },
  ], rows, {
    onRowClick: (row) => { window.location.href = `revenue-form.html?id=${row.id}`; },
    emptyMessage: 'لا توجد إيرادات مطابقة',
  });
}
