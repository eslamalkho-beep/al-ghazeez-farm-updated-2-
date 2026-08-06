// js/pages/expense-list-page.js

let _allExpensesCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('expenses');
  renderSidebar('expenses');
  renderHeader('سجل المصاريف');

  const expenseCategories = await getCategoryNames('expense');
  const categorySelect = document.getElementById('filter-category');
  categorySelect.innerHTML += expenseCategories.map(c => `<option value="${c}">${c}</option>`).join('');

  const params = new URLSearchParams(window.location.search);
  if (params.get('from')) document.getElementById('filter-from').value = params.get('from');
  if (params.get('to')) document.getElementById('filter-to').value = params.get('to');
  if (params.get('category')) document.getElementById('filter-category').value = params.get('category');
  if (params.get('status')) document.getElementById('filter-status').value = params.get('status');

  _allExpensesCache = await getAllExpenses();
  _drawExpenses();

  document.getElementById('filter-from').addEventListener('change', _drawExpenses);
  document.getElementById('filter-to').addEventListener('change', _drawExpenses);
  document.getElementById('filter-category').addEventListener('change', _drawExpenses);
  document.getElementById('filter-status').addEventListener('change', _drawExpenses);
  document.getElementById('clear-filters-btn').addEventListener('click', () => {
    document.getElementById('filter-from').value = '';
    document.getElementById('filter-to').value = '';
    document.getElementById('filter-category').value = '';
    document.getElementById('filter-status').value = '';
    _drawExpenses();
  });

  document.getElementById('export-excel-btn').addEventListener('click', () => {
    exportRowsToExcel('سجل_المصاريف', _expenseExportColumns, _expenseExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    exportRowsToPdf('سجل المصاريف', _expenseExportColumns, _expenseExportRows);
  });
});

const EXPENSE_STATUS_LABELS = { approved: 'معتمد', pending: 'قيد الاعتماد' };
const PAYMENT_METHOD_LABELS = { cash: 'نقدي', transfer: 'تحويل بنكي', cheque: 'شيك' };

const _expenseExportColumns = [
  { key: 'dateLabel', label: 'التاريخ' },
  { key: 'category', label: 'البند' },
  { key: 'amountLabel', label: 'المبلغ' },
  { key: 'taxInvoiceLabel', label: 'فاتورة ضريبية' },
  { key: 'amountBeforeTaxLabel', label: 'المبلغ قبل الضريبة' },
  { key: 'vendor', label: 'المستفيد/المورّد' },
  { key: 'paymentLabel', label: 'طريقة الدفع' },
  { key: 'statusBadge', label: 'الحالة' },
];
let _expenseExportRows = [];

function _drawExpenses() {
  const from = document.getElementById('filter-from').value;
  const to = document.getElementById('filter-to').value;
  const category = document.getElementById('filter-category').value;
  const status = document.getElementById('filter-status').value;

  let rows = _allExpensesCache.filter(e =>
    (!from || e.date >= from) &&
    (!to || e.date <= to) &&
    (!category || e.category === category) &&
    (!status || e.status === status)
  );

  const total = rows.reduce((s, e) => s + Number(e.amount || 0), 0);
  document.getElementById('total-amount').textContent = formatCurrency(total);

  rows = rows.map(e => ({
    ...e,
    dateLabel: formatDateArabic(e.date),
    amountLabel: formatCurrency(e.amount),
    taxInvoiceLabel: e.hasTaxInvoice ? 'نعم' : 'لا',
    taxInvoiceBadge: `<span class="badge ${e.hasTaxInvoice ? 'badge--blue' : 'badge--gray'}">${e.hasTaxInvoice ? 'نعم' : 'لا'}</span>`,
    amountBeforeTaxLabel: e.hasTaxInvoice ? formatCurrency(e.amountBeforeTax) : '-',
    paymentLabel: PAYMENT_METHOD_LABELS[e.paymentMethod] || e.paymentMethod,
    statusBadge: `<span class="badge ${e.status === 'approved' ? 'badge--green' : 'badge--warning'}">${EXPENSE_STATUS_LABELS[e.status] || e.status}</span>`,
    attachBtn: `<button type="button" class="btn btn--outline" onclick="event.stopPropagation(); openAttachmentsModal('expense', ${e.id}, '${formatDateArabic(e.date)} - ${formatCurrency(e.amount)}')">📎 مرفقات</button>`,
  }));

  _expenseExportRows = rows;

  renderDataTable('expense-table', [
    { key: 'dateLabel', label: 'التاريخ', sortable: true },
    { key: 'category', label: 'البند', sortable: true },
    { key: 'amountLabel', label: 'المبلغ', sortable: false },
    { key: 'taxInvoiceBadge', label: 'فاتورة ضريبية', sortable: false },
    { key: 'vendor', label: 'المستفيد/المورّد', sortable: false },
    { key: 'paymentLabel', label: 'طريقة الدفع', sortable: false },
    { key: 'statusBadge', label: 'الحالة', sortable: false },
    { key: 'attachBtn', label: 'الفاتورة', sortable: false },
  ], rows, {
    onRowClick: (row) => { window.location.href = `expense-form.html?id=${row.id}`; },
    emptyMessage: 'لا توجد مصروفات مطابقة',
  });
}
