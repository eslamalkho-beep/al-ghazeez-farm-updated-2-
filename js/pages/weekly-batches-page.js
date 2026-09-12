// js/pages/weekly-batches-page.js

let _weeklyBatchesCache = [];
let _accountsByIdCache = new Map(); // accountId → {code, name, ...} لعرض طرفي كل سطر قيد (المدين/الدائن) بالاسم

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('accounting');
  renderSidebar('accounting-weekly-batches');
  renderHeader('الأرشفة الأسبوعية للقيود');

  const allAccounts = await getAllAccounts();
  _accountsByIdCache = new Map(allAccounts.map(a => [a.id, a]));

  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 6);
  document.getElementById('dateFrom').value = _toIsoDate(weekAgo);
  document.getElementById('dateTo').value = _toIsoDate(today);

  document.getElementById('preview-btn').addEventListener('click', _handlePreview);
  document.getElementById('batch-form').addEventListener('submit', _handleSubmit);

  await _refreshBatchesTable();
});

function _toIsoDate(d) {
  return d.toISOString().slice(0, 10);
}

function _readRange() {
  const dateFrom = document.getElementById('dateFrom').value;
  const dateTo = document.getElementById('dateTo').value;
  if (!dateFrom || !dateTo) {
    showToast('يرجى تحديد الفترة (من - إلى)', 'error');
    return null;
  }
  if (dateFrom > dateTo) {
    showToast('تاريخ "من" يجب أن يسبق أو يساوي تاريخ "إلى"', 'error');
    return null;
  }
  return { dateFrom, dateTo };
}

async function _handlePreview() {
  const range = _readRange();
  if (!range) return;

  const entries = await previewWeeklyBatchRange(range.dateFrom, range.dateTo);
  const box = document.getElementById('preview-box');
  box.style.display = '';

  if (!entries.length) {
    box.innerHTML = `<p style="color: var(--color-text-secondary);">لا توجد قيود غير مؤرشفة ضمن هذه الفترة.</p>`;
    return;
  }

  const draftCount = entries.filter(e => e.status === 'draft').length;
  const postedCount = entries.length - draftCount;
  const totalDebit = entries.reduce((s, e) => s + (e.lines || []).reduce((ls, l) => ls + Number(l.debit || 0), 0), 0);

  box.innerHTML = `
    <div class="card" style="background: var(--color-bg-secondary); padding: var(--spacing-3);">
      <p style="margin:0 0 4px;"><strong>${entries.length}</strong> قيد ضمن الفترة (${postedCount} مُرحَّل، ${draftCount} مسودة سيُرحَّل تلقائيًا عند الأرشفة).</p>
      <p style="margin:0;">إجمالي الحركة: ${formatCurrency(totalDebit)}</p>
    </div>
  `;
}

async function _handleSubmit(e) {
  e.preventDefault();
  const range = _readRange();
  if (!range) return;

  const saveBtn = document.getElementById('save-batch-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'جاري الأرشفة...';

  try {
    const notes = document.getElementById('notes').value;
    const result = await createWeeklyBatch({ dateFrom: range.dateFrom, dateTo: range.dateTo, notes });

    let message = `تم إصدار الأرشفة ${result.batchNumber} — ${result.archivedCount} قيد.`;
    if (result.blockedByPeriod > 0) message += ` (تم تخطي ${result.blockedByPeriod} قيد بفترات محاسبية مغلقة)`;
    showToast(message, 'success');

    document.getElementById('batch-form').reset();
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 6);
    document.getElementById('dateFrom').value = _toIsoDate(weekAgo);
    document.getElementById('dateTo').value = _toIsoDate(today);
    document.getElementById('preview-box').style.display = 'none';

    await _refreshBatchesTable();
  } catch (err) {
    showToast(err.message || 'حدث خطأ أثناء الأرشفة', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'أرشفة الفترة وإصدار رقم مرجعي';
  }
}

// عمود واحد لكل "سطر" من سطور القيد (طرف مدين أو طرف دائن) بدل صف واحد بإجمالي القيد — كل قيد يظهر بعدد
// أسطره (عادة سطران فأكثر)، فيتضح مباشرة أي حساب دائن وأي حساب مدين، بنفس شكل دفتر اليومية التقليدي
function _accountLabelFor(accountId) {
  const account = _accountsByIdCache.get(Number(accountId));
  return account ? `${account.code} - ${account.name}` : '-';
}

function _batchLineColumns() {
  return [
    { key: 'entryNumber', label: 'رقم القيد' },
    { key: 'dateLabel', label: 'التاريخ' },
    { key: 'description', label: 'الوصف' },
    { key: 'accountLabel', label: 'الحساب' },
    { key: 'debitLabel', label: 'مدين' },
    { key: 'creditLabel', label: 'دائن' },
  ];
}

function _buildLineRows(entries) {
  const rows = [];
  entries.forEach(e => {
    (e.lines || []).forEach(line => {
      const debit = Number(line.debit || 0);
      const credit = Number(line.credit || 0);
      rows.push({
        entryNumber: e.entryNumber,
        dateLabel: formatDateArabic(e.date),
        description: e.description,
        accountLabel: _accountLabelFor(line.accountId),
        debitLabel: debit ? formatCurrency(debit) : '',
        creditLabel: credit ? formatCurrency(credit) : '',
      });
    });
  });
  return rows;
}

async function _handleViewClick(id) {
  const details = await getWeeklyBatchDetails(id);
  if (!details) return;

  const rows = _buildLineRows(details.entries);

  openModal(`
    <p><strong>الفترة:</strong> ${formatDateArabic(details.batch.dateFrom)} - ${formatDateArabic(details.batch.dateTo)}</p>
    ${details.batch.notes ? `<p><strong>ملاحظات:</strong> ${details.batch.notes}</p>` : ''}
    <p><strong>الإجمالي:</strong> مدين ${formatCurrency(details.batch.totalDebit)} — دائن ${formatCurrency(details.batch.totalCredit)}</p>
    <div id="batch-detail-table"></div>
    <div style="display:flex; gap:8px; margin-top: var(--spacing-3); flex-wrap:wrap;">
      <button type="button" class="btn btn--outline btn--sm" onclick="_exportBatchExcel(${id})">تصدير Excel</button>
      <button type="button" class="btn btn--outline btn--sm" onclick="_exportBatchPdf(${id})">تصدير PDF</button>
    </div>
  `, {
    title: `أرشفة ${details.batch.batchNumber}`,
    hideFooter: true,
  });

  renderDataTable('batch-detail-table', _batchLineColumns(), rows, {
    emptyMessage: 'لا توجد قيود ضمن هذه الأرشفة',
  });
}

async function _exportBatchExcel(id) {
  const details = await getWeeklyBatchDetails(id);
  if (!details) return;
  exportRowsToExcel(`أرشفة_${details.batch.batchNumber}`, _batchLineColumns(), _buildLineRows(details.entries), {
    infoLines: [`الفترة: ${formatDateArabic(details.batch.dateFrom)} - ${formatDateArabic(details.batch.dateTo)}`],
  });
}

async function _exportBatchPdf(id) {
  const details = await getWeeklyBatchDetails(id);
  if (!details) return;
  exportRowsToPdf(`أرشفة ${details.batch.batchNumber}`, _batchLineColumns(), _buildLineRows(details.entries), {
    infoLines: [`الفترة: ${formatDateArabic(details.batch.dateFrom)} - ${formatDateArabic(details.batch.dateTo)}`],
  });
}

function _handleDeleteClick(id) {
  confirmDelete('هل أنت متأكد من حذف هذه الأرشفة؟ القيود نفسها لن تُحذف، فقط سيُفَك ربطها فتعود قابلة لأرشفة لاحقة.', async () => {
    await deleteWeeklyBatch(id);
    showToast('تم حذف الأرشفة بنجاح', 'success');
    await _refreshBatchesTable();
  });
}

async function _refreshBatchesTable() {
  _weeklyBatchesCache = await getAllWeeklyBatches();

  const rows = _weeklyBatchesCache.map(b => ({
    ...b,
    rangeLabel: `${formatDateArabic(b.dateFrom)} - ${formatDateArabic(b.dateTo)}`,
    totalDebitLabel: formatCurrency(b.totalDebit),
    totalCreditLabel: formatCurrency(b.totalCredit),
    actionsHtml: `
      <button type="button" class="btn btn--outline btn--sm" onclick="event.stopPropagation(); _handleViewClick(${b.id})">عرض</button>
      <button type="button" class="btn btn--outline btn--sm" onclick="event.stopPropagation(); _handleDeleteClick(${b.id})">حذف</button>
    `,
  }));

  renderDataTable('batches-table', [
    { key: 'batchNumber', label: 'رقم الأرشفة', sortable: true },
    { key: 'rangeLabel', label: 'الفترة', sortable: false },
    { key: 'entryCount', label: 'عدد القيود', sortable: true },
    { key: 'totalDebitLabel', label: 'إجمالي مدين', sortable: false },
    { key: 'totalCreditLabel', label: 'إجمالي دائن', sortable: false },
    { key: 'notes', label: 'ملاحظات', sortable: false },
    { key: 'actionsHtml', label: 'إجراء', sortable: false },
  ], rows, {
    onRowClick: (row) => _handleViewClick(row.id),
    emptyMessage: 'لا توجد أرشفات أسبوعية بعد',
  });
}
