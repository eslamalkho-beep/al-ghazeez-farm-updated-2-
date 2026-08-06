// js/pages/journal-entry-list-page.js

let _allJournalEntriesCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('accounting');
  renderSidebar('accounting');
  renderHeader('القيود اليومية');

  _allJournalEntriesCache = await getAllJournalEntries();

  _drawEntries();

  document.getElementById('filter-from').addEventListener('change', _drawEntries);
  document.getElementById('filter-to').addEventListener('change', _drawEntries);
  document.getElementById('clear-filters-btn').addEventListener('click', () => {
    document.getElementById('filter-from').value = '';
    document.getElementById('filter-to').value = '';
    _drawEntries();
  });

  document.getElementById('export-excel-btn').addEventListener('click', () => {
    exportRowsToExcel('القيود_اليومية', _entryExportColumns, _entryExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    exportRowsToPdf('القيود اليومية', _entryExportColumns, _entryExportRows);
  });
});

const _entryExportColumns = [
  { key: 'entryNumber', label: 'رقم القيد' },
  { key: 'dateLabel', label: 'التاريخ' },
  { key: 'description', label: 'الوصف' },
  { key: 'totalDebitLabel', label: 'إجمالي المدين' },
  { key: 'totalCreditLabel', label: 'إجمالي الدائن' },
];
let _entryExportRows = [];

function _drawEntries() {
  const from = document.getElementById('filter-from').value;
  const to = document.getElementById('filter-to').value;

  let rows = _allJournalEntriesCache.filter(e =>
    (!from || e.date >= from) && (!to || e.date <= to)
  );

  rows = rows
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map(e => {
      const { totalDebit, totalCredit } = validateJournalEntryBalance(e.lines || []);
      return {
        ...e,
        dateLabel: formatDateArabic(e.date),
        totalDebitLabel: formatCurrency(totalDebit),
        totalCreditLabel: formatCurrency(totalCredit),
      };
    });

  _entryExportRows = rows;

  renderDataTable('entries-table', [
    { key: 'entryNumber', label: 'رقم القيد', sortable: true },
    { key: 'dateLabel', label: 'التاريخ', sortable: true },
    { key: 'description', label: 'الوصف', sortable: false },
    { key: 'totalDebitLabel', label: 'إجمالي المدين', sortable: false },
    { key: 'totalCreditLabel', label: 'إجمالي الدائن', sortable: false },
  ], rows, {
    onRowClick: (row) => { window.location.href = `journal-entry-form.html?id=${row.id}`; },
    emptyMessage: 'لا توجد قيود يومية مسجّلة بعد',
  });
}
