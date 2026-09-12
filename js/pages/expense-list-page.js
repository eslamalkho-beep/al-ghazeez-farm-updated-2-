// js/pages/expense-list-page.js

let _allExpensesCache = [];
// رقم القيد المحاسبي + رقم الأرشفة الأسبوعية (weeklyBatchId) لكل مصروف — نفس نمط revenue-list-page.js
let _journalEntryByIdForExpenses = new Map();
// رقم الأرشفة (batchNumber) لكل أرشفة أسبوعية — انظر WeeklyBatches/weekly-batch-service.js
let _batchNumberByWeeklyBatchIdForExpenses = new Map();

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('expenses');
  renderSidebar('expenses');
  renderHeader('سجل المصاريف');

  if (!hasActionPermission('expenses', 'add')) {
    document.getElementById('add-expense-btn').style.display = 'none';
  }
  if (!hasActionPermission('expenses', 'export')) {
    document.getElementById('export-excel-btn').style.display = 'none';
  }
  // تصدير PDF يتطلب صلاحيتَي التصدير والطباعة معًا (قرار صلاحيات قائم — لم يتغيّر رغم أن التصدير صار تنزيلاً
  // مباشرًا بدل window.print() فعليًا، انظر export-utils.js)، بعكس Excel الذي يتطلب "تصدير" فقط
  if (!hasActionPermission('expenses', 'export') || !hasActionPermission('expenses', 'print')) {
    document.getElementById('export-pdf-btn').style.display = 'none';
  }

  const expenseCategories = await getCategoryAccountNames('expense');
  const categorySelect = document.getElementById('filter-category');
  categorySelect.innerHTML += expenseCategories.map(c => `<option value="${c}">${c}</option>`).join('');

  const params = new URLSearchParams(window.location.search);
  if (params.get('from')) document.getElementById('filter-from').value = params.get('from');
  if (params.get('to')) document.getElementById('filter-to').value = params.get('to');
  if (params.get('category')) document.getElementById('filter-category').value = params.get('category');
  if (params.get('status')) document.getElementById('filter-status').value = params.get('status');

  [_allExpensesCache, _journalEntryByIdForExpenses, _batchNumberByWeeklyBatchIdForExpenses] = await Promise.all([
    getAllExpenses(),
    getAllJournalEntries().then(entries => new Map(entries.map(e => [e.id, e]))),
    getAllWeeklyBatches().then(batches => new Map(batches.map(b => [b.id, b.batchNumber]))),
  ]);
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
  { key: 'entryNumberLink', label: 'رقم القيد' },
  { key: 'category', label: 'البند' },
  { key: 'amountLabel', label: 'المبلغ' },
  { key: 'taxInvoiceLabel', label: 'فاتورة ضريبية' },
  { key: 'amountBeforeTaxLabel', label: 'المبلغ قبل الضريبة' },
  { key: 'vendor', label: 'المستفيد/المورّد' },
  { key: 'archiveNumberLabel', label: 'رقم الأرشفة' },
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

  rows = rows.map(e => {
    // stopPropagation يمنع فتح نموذج تعديل المصروف عند النقر على رقم القيد تحديدًا (onRowClick على مستوى الجدول)
    const journalEntry = e.journalEntryId ? _journalEntryByIdForExpenses.get(e.journalEntryId) : null;
    const entryNumber = journalEntry ? journalEntry.entryNumber : null;
    // رقم الأرشفة تلقائي بالكامل: مأخوذ من الأرشفة الأسبوعية للقيود (WeeklyBatches) التي يقع ضمنها قيد هذا
    // المصروف — لا حقل مُدخَل يدويًا (انظر weekly-batch-service.js/accounting/weekly-batches.html)
    const archiveNumber = journalEntry && journalEntry.weeklyBatchId
      ? (_batchNumberByWeeklyBatchIdForExpenses.get(journalEntry.weeklyBatchId) || null)
      : null;
    return {
      ...e,
      dateLabel: formatDateArabic(e.date),
      amountLabel: formatCurrency(e.amount),
      taxInvoiceLabel: e.hasTaxInvoice ? 'نعم' : 'لا',
      taxInvoiceBadge: `<span class="badge ${e.hasTaxInvoice ? 'badge--blue' : 'badge--gray'}">${e.hasTaxInvoice ? 'نعم' : 'لا'}</span>`,
      amountBeforeTaxLabel: e.hasTaxInvoice ? formatCurrency(e.amountBeforeTax) : '-',
      paymentLabel: PAYMENT_METHOD_LABELS[e.paymentMethod] || e.paymentMethod,
      statusBadge: `<span class="badge ${e.status === 'approved' ? 'badge--green' : 'badge--warning'}">${EXPENSE_STATUS_LABELS[e.status] || e.status}</span>`,
      entryNumberLink: entryNumber
        ? `<a href="../accounting/journal-entry-form.html?id=${e.journalEntryId}" onclick="event.stopPropagation();">${entryNumber}</a>`
        : '-',
      archiveNumberLabel: archiveNumber || '-',
    };
  });

  _expenseExportRows = rows;

  renderDataTable('expense-table', [
    { key: 'dateLabel', label: 'التاريخ', sortable: true },
    { key: 'entryNumberLink', label: 'رقم القيد', sortable: false },
    { key: 'category', label: 'البند', sortable: true },
    { key: 'amountLabel', label: 'المبلغ', sortable: false },
    { key: 'taxInvoiceBadge', label: 'فاتورة ضريبية', sortable: false },
    { key: 'vendor', label: 'المستفيد/المورّد', sortable: false },
    { key: 'archiveNumberLabel', label: 'رقم الأرشفة', sortable: false },
    { key: 'paymentLabel', label: 'طريقة الدفع', sortable: false },
    { key: 'statusBadge', label: 'الحالة', sortable: false },
  ], rows, {
    onRowClick: (row) => { window.location.href = `expense-form.html?id=${row.id}`; },
    emptyMessage: 'لا توجد مصروفات مطابقة',
  });
}
