// js/pages/revenue-list-page.js

let _allRevenuesCache = [];
let _allAnimalsCache = [];
let _journalEntryByIdForRevenues = new Map();
// رقم الأرشفة (batchNumber) لكل أرشفة أسبوعية — انظر WeeklyBatches/weekly-batch-service.js
let _batchNumberByWeeklyBatchIdForRevenues = new Map();

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('revenues');
  renderSidebar('revenues');
  renderHeader('سجل الإيرادات');

  if (!hasActionPermission('revenues', 'add')) {
    document.getElementById('add-revenue-btn').style.display = 'none';
  }
  if (!hasActionPermission('revenues', 'export')) {
    document.getElementById('export-excel-btn').style.display = 'none';
  }
  // تصدير PDF يتطلب صلاحيتَي التصدير والطباعة معًا (قرار صلاحيات قائم — لم يتغيّر رغم أن التصدير صار تنزيلاً
  // مباشرًا بدل window.print() فعليًا، انظر export-utils.js) — نفس منطق المصروفات
  if (!hasActionPermission('revenues', 'export') || !hasActionPermission('revenues', 'print')) {
    document.getElementById('export-pdf-btn').style.display = 'none';
  }

  const revenueCategories = await getCategoryAccountNames('revenue');
  const categorySelect = document.getElementById('filter-category');
  categorySelect.innerHTML += revenueCategories.map(c => `<option value="${c}">${c}</option>`).join('');

  const params = new URLSearchParams(window.location.search);
  if (params.get('from')) document.getElementById('filter-from').value = params.get('from');
  if (params.get('to')) document.getElementById('filter-to').value = params.get('to');
  if (params.get('category')) document.getElementById('filter-category').value = params.get('category');

  _allRevenuesCache = await getAllRevenues();
  _allAnimalsCache = await getAllAnimals();
  _journalEntryByIdForRevenues = new Map((await getAllJournalEntries()).map(e => [e.id, e]));
  _batchNumberByWeeklyBatchIdForRevenues = new Map((await getAllWeeklyBatches()).map(b => [b.id, b.batchNumber]));
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

const RECEIVE_METHOD_LABELS = { cash: 'نقدي', transfer: 'تحويل بنكي', credit: 'آجل' };

const _revenueExportColumns = [
  { key: 'dateLabel', label: 'التاريخ' },
  { key: 'entryNumberLink', label: 'رقم القيد' },
  { key: 'category', label: 'النوع' },
  { key: 'animalCodeLabel', label: 'كود الحيوان' },
  { key: 'amountLabel', label: 'المبلغ' },
  { key: 'taxInvoiceLabel', label: 'فاتورة ضريبية' },
  { key: 'amountBeforeTaxLabel', label: 'المبلغ قبل الضريبة' },
  { key: 'client', label: 'العميل/الجهة' },
  { key: 'archiveNumberLabel', label: 'رقم الأرشفة' },
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
    // رابط منفصل داخل الخلية (لا onRowClick للجدول نفسه) لأن نقر الصف مخصّص أصلاً لفتح نموذج تعديل الإيراد —
    // stopPropagation يمنع فتح النموذج عند النقر على رقم القيد تحديدًا (onRowClick على مستوى الجدول)
    const journalEntry = r.journalEntryId ? _journalEntryByIdForRevenues.get(r.journalEntryId) : null;
    const entryNumber = journalEntry ? journalEntry.entryNumber : null;
    // رقم الأرشفة تلقائي بالكامل: مأخوذ من الأرشفة الأسبوعية للقيود (WeeklyBatches) التي يقع ضمنها قيد هذا
    // الإيراد — لا حقل مُدخَل يدويًا (انظر weekly-batch-service.js/accounting/weekly-batches.html)
    const archiveNumber = journalEntry && journalEntry.weeklyBatchId
      ? (_batchNumberByWeeklyBatchIdForRevenues.get(journalEntry.weeklyBatchId) || null)
      : null;
    return {
      ...r,
      dateLabel: formatDateArabic(r.date),
      amountLabel: formatCurrency(r.amount),
      taxInvoiceLabel: r.hasTaxInvoice ? 'نعم' : 'لا',
      taxInvoiceBadge: `<span class="badge ${r.hasTaxInvoice ? 'badge--blue' : 'badge--gray'}">${r.hasTaxInvoice ? 'نعم' : 'لا'}</span>`,
      amountBeforeTaxLabel: r.hasTaxInvoice ? formatCurrency(r.amountBeforeTax) : '-',
      receiveLabel: RECEIVE_METHOD_LABELS[r.receiveMethod] || r.receiveMethod,
      animalCodeLabel: animal ? animal.code : '-',
      entryNumberLink: entryNumber
        ? `<a href="../accounting/journal-entry-form.html?id=${r.journalEntryId}" onclick="event.stopPropagation();">${entryNumber}</a>`
        : '-',
      archiveNumberLabel: archiveNumber || '-',
    };
  });

  _revenueExportRows = rows;

  renderDataTable('revenue-table', [
    { key: 'dateLabel', label: 'التاريخ', sortable: true },
    { key: 'entryNumberLink', label: 'رقم القيد', sortable: false },
    { key: 'category', label: 'النوع', sortable: true },
    { key: 'animalCodeLabel', label: 'كود الحيوان', sortable: false },
    { key: 'amountLabel', label: 'المبلغ', sortable: false },
    { key: 'taxInvoiceBadge', label: 'فاتورة ضريبية', sortable: false },
    { key: 'client', label: 'العميل/الجهة', sortable: false },
    { key: 'archiveNumberLabel', label: 'رقم الأرشفة', sortable: false },
    { key: 'receiveLabel', label: 'طريقة الاستلام', sortable: false },
  ], rows, {
    onRowClick: (row) => { window.location.href = `revenue-form.html?id=${row.id}`; },
    emptyMessage: 'لا توجد إيرادات مطابقة',
  });
}
