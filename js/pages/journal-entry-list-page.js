// js/pages/journal-entry-list-page.js

let _allJournalEntriesCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('accounting');
  renderSidebar('accounting-journal');
  renderHeader('القيود اليومية');

  _allJournalEntriesCache = await getAllJournalEntries();

  _drawEntries();

  document.getElementById('filter-from').addEventListener('change', _drawEntries);
  document.getElementById('filter-to').addEventListener('change', _drawEntries);
  document.getElementById('filter-status').addEventListener('change', _drawEntries);
  document.getElementById('clear-filters-btn').addEventListener('click', () => {
    document.getElementById('filter-from').value = '';
    document.getElementById('filter-to').value = '';
    document.getElementById('filter-status').value = '';
    _drawEntries();
  });
  document.getElementById('post-all-btn').addEventListener('click', _handlePostAllDrafts);

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
  { key: 'statusLabel', label: 'الحالة' },
  { key: 'totalDebitLabel', label: 'إجمالي المدين' },
  { key: 'totalCreditLabel', label: 'إجمالي الدائن' },
];
let _entryExportRows = [];

// قيد بلا status مخزَّن = مُرحَّل ضمنيًا (توافق خلفي مع قيود ما قبل ميزة المسودة/الترحيل)
function _isDraftEntry(entry) {
  return entry.status === 'draft';
}

function _drawEntries() {
  const from = document.getElementById('filter-from').value;
  const to = document.getElementById('filter-to').value;
  const statusFilter = document.getElementById('filter-status').value;

  let rows = _allJournalEntriesCache.filter(e =>
    (!from || e.date >= from) && (!to || e.date <= to) &&
    (!statusFilter || (statusFilter === 'draft' ? _isDraftEntry(e) : !_isDraftEntry(e)))
  );

  rows = rows
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map(e => {
      const { totalDebit, totalCredit } = validateJournalEntryBalance(e.lines || []);
      const isDraft = _isDraftEntry(e);
      return {
        ...e,
        dateLabel: formatDateArabic(e.date),
        totalDebitLabel: formatCurrency(totalDebit),
        totalCreditLabel: formatCurrency(totalCredit),
        statusLabel: isDraft ? 'مسودة' : 'مُرحَّل',
        statusBadge: `<span class="badge ${isDraft ? 'badge--warning' : 'badge--green'}">${isDraft ? 'مسودة' : 'مُرحَّل'}</span>`,
        postAction: isDraft
          ? `<button type="button" class="btn btn--success btn--sm" onclick="event.stopPropagation(); _handlePostEntryFromList(${e.id})">ترحيل</button>`
          : '',
      };
    });

  _entryExportRows = rows;

  const draftCount = _allJournalEntriesCache.filter(_isDraftEntry).length;
  const badgeEl = document.getElementById('draft-count-badge');
  if (badgeEl) {
    badgeEl.innerHTML = draftCount > 0
      ? `<span class="badge badge--warning">${draftCount} بانتظار الترحيل</span>`
      : '';
  }

  renderDataTable('entries-table', [
    { key: 'entryNumber', label: 'رقم القيد', sortable: true },
    { key: 'dateLabel', label: 'التاريخ', sortable: true },
    { key: 'description', label: 'الوصف', sortable: false },
    { key: 'statusBadge', label: 'الحالة', sortable: false },
    { key: 'totalDebitLabel', label: 'إجمالي المدين', sortable: false },
    { key: 'totalCreditLabel', label: 'إجمالي الدائن', sortable: false },
    { key: 'postAction', label: '', sortable: false },
  ], rows, {
    onRowClick: (row) => { window.location.href = `journal-entry-form.html?id=${row.id}`; },
    emptyMessage: 'لا توجد قيود يومية مسجّلة بعد',
  });
}

// تُستدعى من زر "ترحيل" داخل خلية الجدول (event.stopPropagation يمنع تفعيل onRowClick على نفس الصف)
async function _handlePostEntryFromList(id) {
  const entry = _allJournalEntriesCache.find(e => e.id === id);
  if (!entry) return;
  if (!(await guardPeriodOpenForSave(entry.date))) return;

  await postJournalEntry(id);
  showToast('تم ترحيل القيد بنجاح', 'success');
  _allJournalEntriesCache = await getAllJournalEntries();
  _drawEntries();
}

// ترحيل كل القيود المسودة المعروضة حاليًا (بعد تطبيق الفلاتر) دفعة واحدة — أي قيد بتاريخ ضمن فترة مغلقة
// يُتخطى مع تجميع رسالة تحذير واحدة بدل مقاطعة البقية بـ Toast لكل قيد
async function _handlePostAllDrafts() {
  const from = document.getElementById('filter-from').value;
  const to = document.getElementById('filter-to').value;
  const drafts = _allJournalEntriesCache.filter(e =>
    _isDraftEntry(e) && (!from || e.date >= from) && (!to || e.date <= to)
  );

  if (!drafts.length) {
    showToast('لا توجد قيود مسودة لترحيلها', 'info');
    return;
  }

  let posted = 0;
  let blockedByPeriod = 0;
  for (const entry of drafts) {
    if (!(await isPeriodOpenSilently(entry.date))) { blockedByPeriod++; continue; }
    await postJournalEntry(entry.id);
    posted++;
  }

  if (posted > 0) showToast(`تم ترحيل ${posted} قيد بنجاح`, 'success');
  if (blockedByPeriod > 0) showToast(`تم تخطي ${blockedByPeriod} قيد بفترات محاسبية مغلقة`, 'warning');
  if (posted === 0 && blockedByPeriod === 0) showToast('لا توجد قيود مسودة لترحيلها', 'info');

  _allJournalEntriesCache = await getAllJournalEntries();
  _drawEntries();
}

// نفس فحص guardPeriodOpenForSave لكن بلا Toast لكل قيد على حدة (الترحيل الجماعي يجمّع رسالة واحدة بالنهاية) —
// مدير النظام يتجاوزها دومًا نفس منطق guardPeriodOpenForSave الأصلية في period-service.js
async function isPeriodOpenSilently(dateStr) {
  const user = getCurrentUser();
  if (user && resolveRoleKey(user.role) === 'systemAdmin') return true;
  return !(await isPeriodClosed(dateStr));
}
