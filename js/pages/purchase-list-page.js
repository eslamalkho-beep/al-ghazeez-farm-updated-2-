// js/pages/purchase-list-page.js

let _allPurchasesCache = [];
// رقم القيد المحاسبي لكل مشترى — نفس نمط revenue-list-page.js
let _journalEntryByIdForPurchases = new Map();
// رقم الأرشفة (batchNumber) لكل أرشفة أسبوعية — انظر WeeklyBatches/weekly-batch-service.js
let _batchNumberByWeeklyBatchIdForPurchases = new Map();

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('purchases');
  renderSidebar('purchases');
  renderHeader('سجل المشتريات');

  if (!hasActionPermission('purchases', 'add')) {
    document.getElementById('add-purchase-btn').style.display = 'none';
  }
  if (!hasActionPermission('purchases', 'export')) {
    document.getElementById('export-excel-btn').style.display = 'none';
  }
  if (!hasActionPermission('purchases', 'export') || !hasActionPermission('purchases', 'print')) {
    document.getElementById('export-pdf-btn').style.display = 'none';
  }

  // بنود المشتريات الجديدة مقصورة على فرع "113 المخزون" فقط (انظر purchase-form-page.js) — حسابات
  // type:'expense' مُضافة هنا أيضًا فقط لإتاحة فلترة مشتريات قديمة سُجِّلت قبل هذا التغيير ببند مصروف
  const [inventoryAccounts, legacyExpenseNames] = await Promise.all([
    getPurchaseCategoryAccounts(),
    getCategoryAccountNames('expense'),
  ]);
  const purchaseCategories = [...new Set([...inventoryAccounts.map(a => a.name), ...legacyExpenseNames])];
  const categorySelect = document.getElementById('filter-category');
  categorySelect.innerHTML += purchaseCategories.map(c => `<option value="${c}">${c}</option>`).join('');

  const params = new URLSearchParams(window.location.search);
  if (params.get('from')) document.getElementById('filter-from').value = params.get('from');
  if (params.get('to')) document.getElementById('filter-to').value = params.get('to');
  if (params.get('category')) document.getElementById('filter-category').value = params.get('category');
  if (params.get('status')) document.getElementById('filter-status').value = params.get('status');

  [_allPurchasesCache, _journalEntryByIdForPurchases, _batchNumberByWeeklyBatchIdForPurchases] = await Promise.all([
    getAllPurchases(),
    getAllJournalEntries().then(entries => new Map(entries.map(e => [e.id, e]))),
    getAllWeeklyBatches().then(batches => new Map(batches.map(b => [b.id, b.batchNumber]))),
  ]);
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
const PURCHASE_PAYMENT_METHOD_LABELS = { cash: 'نقدي', transfer: 'تحويل بنكي', cheque: 'شيك', credit: 'آجل' };

const _purchaseExportColumns = [
  { key: 'dateLabel', label: 'التاريخ' },
  { key: 'entryNumberLink', label: 'رقم القيد' },
  { key: 'category', label: 'البند' },
  { key: 'amountLabel', label: 'المبلغ' },
  { key: 'unitCostLabel', label: 'تكلفة الوحدة' },
  { key: 'taxInvoiceLabel', label: 'فاتورة ضريبية' },
  { key: 'amountBeforeTaxLabel', label: 'المبلغ قبل الضريبة' },
  { key: 'vendor', label: 'المورّد' },
  { key: 'archiveNumberLabel', label: 'رقم الأرشفة' },
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

  rows = rows.map(p => {
    // تكلفة الوحدة: نفس حساب _syncPurchaseInventoryLink في purchase-form-page.js (amount / linkedQuantity)،
    // معروضة هنا مباشرة في السجل بدل الاضطرار لفتح حركة المخزون المرتبطة لمعرفتها
    const unitCost = p.linkedQuantity ? Math.round((p.amount / p.linkedQuantity) * 100) / 100 : null;
    // stopPropagation يمنع فتح نموذج تعديل المشترى عند النقر على رقم القيد تحديدًا، نفس نمط revenue-list-page.js
    const journalEntry = p.journalEntryId ? _journalEntryByIdForPurchases.get(p.journalEntryId) : null;
    const entryNumber = journalEntry ? journalEntry.entryNumber : null;
    // رقم الأرشفة تلقائي بالكامل: مأخوذ من الأرشفة الأسبوعية للقيود (WeeklyBatches) التي يقع ضمنها قيد هذا
    // المشترى — لا حقل مُدخَل يدويًا (انظر weekly-batch-service.js/accounting/weekly-batches.html)
    const archiveNumber = journalEntry && journalEntry.weeklyBatchId
      ? (_batchNumberByWeeklyBatchIdForPurchases.get(journalEntry.weeklyBatchId) || null)
      : null;
    return {
      ...p,
      dateLabel: formatDateArabic(p.date),
      amountLabel: formatCurrency(p.amount),
      unitCostLabel: unitCost !== null ? formatCurrency(unitCost) : '-',
      taxInvoiceLabel: p.hasTaxInvoice ? 'نعم' : 'لا',
      taxInvoiceBadge: `<span class="badge ${p.hasTaxInvoice ? 'badge--blue' : 'badge--gray'}">${p.hasTaxInvoice ? 'نعم' : 'لا'}</span>`,
      amountBeforeTaxLabel: p.hasTaxInvoice ? formatCurrency(p.amountBeforeTax) : '-',
      paymentLabel: PURCHASE_PAYMENT_METHOD_LABELS[p.paymentMethod] || p.paymentMethod,
      statusBadge: `<span class="badge ${p.status === 'approved' ? 'badge--green' : 'badge--warning'}">${PURCHASE_STATUS_LABELS[p.status] || p.status}</span>`,
      entryNumberLink: entryNumber
        ? `<a href="../accounting/journal-entry-form.html?id=${p.journalEntryId}" onclick="event.stopPropagation();">${entryNumber}</a>`
        : '-',
      archiveNumberLabel: archiveNumber || '-',
    };
  });

  _purchaseExportRows = rows;

  renderDataTable('purchase-table', [
    { key: 'dateLabel', label: 'التاريخ', sortable: true },
    { key: 'entryNumberLink', label: 'رقم القيد', sortable: false },
    { key: 'category', label: 'البند', sortable: true },
    { key: 'amountLabel', label: 'المبلغ', sortable: false },
    { key: 'unitCostLabel', label: 'تكلفة الوحدة', sortable: false },
    { key: 'taxInvoiceBadge', label: 'فاتورة ضريبية', sortable: false },
    { key: 'vendor', label: 'المورّد', sortable: false },
    { key: 'archiveNumberLabel', label: 'رقم الأرشفة', sortable: false },
    { key: 'paymentLabel', label: 'طريقة الدفع', sortable: false },
    { key: 'statusBadge', label: 'الحالة', sortable: false },
  ], rows, {
    onRowClick: (row) => { window.location.href = `purchase-form.html?id=${row.id}`; },
    emptyMessage: 'لا توجد مشتريات مطابقة',
  });
}
