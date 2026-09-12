// js/pages/bank-reconciliation-page.js

let _bankAccountForRecon = null;
let _systemLedgerRowsForRecon = [];
let _allEntriesForRecon = [];
let _statementLinesCache = [];
let _lastReconciliation = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('accounting');
  renderSidebar('accounting-bank-reconciliation');
  renderHeader('تسوية البنوك');

  const [accounts, mappings] = await Promise.all([getAllAccounts(), loadAccountMappings()]);
  _bankAccountForRecon = getMappedAccount('bank', accounts, mappings);
  _allEntriesForRecon = await getPostedJournalEntries();
  _systemLedgerRowsForRecon = _bankAccountForRecon ? computeAccountLedgerRows(_bankAccountForRecon, _allEntriesForRecon) : [];

  document.getElementById('sl-date').value = todayIso();
  document.getElementById('filter-from').addEventListener('change', _render);
  document.getElementById('filter-to').addEventListener('change', _render);
  document.getElementById('statement-closing-balance').addEventListener('input', _render);
  document.getElementById('statement-line-form').addEventListener('submit', _handleAddLine);

  _statementLinesCache = await getAllBankStatementLines();
  _render();
});

async function _handleAddLine(e) {
  e.preventDefault();

  const isValid = validateForm([
    { fieldId: 'sl-date', validatorFn: isValidDate, message: 'التاريخ مطلوب' },
    { fieldId: 'sl-amount', validatorFn: isPositiveNumber, message: 'أدخل مبلغًا صحيحًا' },
  ]);
  if (!isValid) return;

  const addBtn = document.getElementById('add-line-btn');
  addBtn.disabled = true;

  try {
    await createBankStatementLine({
      date: document.getElementById('sl-date').value,
      direction: document.getElementById('sl-direction').value,
      amount: Number(document.getElementById('sl-amount').value),
      reference: document.getElementById('sl-reference').value.trim(),
      description: document.getElementById('sl-description').value.trim(),
    });
    showToast('تمت إضافة السطر بنجاح', 'success');
    document.getElementById('statement-line-form').reset();
    document.getElementById('sl-date').value = todayIso();
    _statementLinesCache = await getAllBankStatementLines();
    _render();
  } catch (err) {
    showToast(err.message || 'حدث خطأ أثناء الإضافة', 'error');
  } finally {
    addBtn.disabled = false;
  }
}

function _handleDeleteLine(id) {
  confirmDelete('هل أنت متأكد من حذف سطر كشف البنك هذا؟', async () => {
    await deleteBankStatementLine(id);
    _statementLinesCache = await getAllBankStatementLines();
    showToast('تم الحذف بنجاح', 'success');
    _render();
  });
}

function _handleUnmatch(id) {
  unmatchBankStatementLine(id).then(async () => {
    _statementLinesCache = await getAllBankStatementLines();
    showToast('تم إلغاء المطابقة', 'success');
    _render();
  });
}

function _handleMatchClick(lineId) {
  const line = _statementLinesCache.find(l => l.id === lineId);
  if (!line || !_lastReconciliation) return;

  const candidates = suggestSystemMatches(line, _lastReconciliation.unmatchedSystemRows);
  if (!candidates.length) {
    showToast('لا توجد حركة نظام بنفس المبلغ ضمن الفترة المحدَّدة — وسّع نطاق التاريخ أو تأكد من تسجيل الحركة أولاً', 'warning');
    return;
  }

  const optionsHtml = candidates.map(r =>
    `<option value="${r.entryId}">${formatDateArabic(r.date)} — ${r.description} (${formatCurrency(r.debit || r.credit)})</option>`
  ).join('');

  openModal(`
    <p>مطابقة سطر كشف بتاريخ ${formatDateArabic(line.date)} بمبلغ ${formatCurrency(line.amount)} مع حركة نظام:</p>
    <div class="form-group">
      <select id="match-entry-select" class="form-control">${optionsHtml}</select>
    </div>
  `, {
    title: 'مطابقة حركة',
    confirmLabel: 'مطابقة',
    cancelLabel: 'إلغاء',
    onConfirm: async () => {
      const entryId = document.getElementById('match-entry-select').value;
      await matchBankStatementLine(lineId, entryId);
      _statementLinesCache = await getAllBankStatementLines();
      showToast('تمت المطابقة بنجاح', 'success');
      closeModal();
      _render();
    },
  });
}

function _render() {
  const from = document.getElementById('filter-from').value;
  const to = document.getElementById('filter-to').value;

  const result = computeReconciliation(_systemLedgerRowsForRecon, _statementLinesCache, from, to);
  _lastReconciliation = result;

  const summaryCards = [
    { value: formatNumber(result.matchedStatementLines.length), label: `حركات متطابقة (${formatCurrency(result.matchedAmount)})`, tone: 'green', icon: '✅' },
    { value: formatNumber(result.unmatchedSystemRows.length), label: `حركات نظام معلّقة (${formatCurrency(result.unmatchedSystemAmount)})`, tone: 'blue', icon: '⏳' },
    { value: formatNumber(result.unmatchedStatementLines.length), label: `حركات كشف غير مسجَّلة (${formatCurrency(result.unmatchedStatementAmount)})`, tone: 'red', icon: '❓' },
  ];

  const closingBalanceValue = document.getElementById('statement-closing-balance').value;
  if (closingBalanceValue !== '' && _bankAccountForRecon) {
    const asOfDate = to || todayIso();
    const systemBalance = computeAccountBalance(_bankAccountForRecon, _allEntriesForRecon, asOfDate).balance;
    const diff = Number(closingBalanceValue) - systemBalance;
    summaryCards.push({
      value: formatCurrency(diff), label: `الفرق (كشف البنك − رصيد النظام كما في ${formatDateArabic(asOfDate)})`,
      tone: Math.abs(diff) < 0.005 ? 'green' : 'red', icon: '⚖️',
    });
  }

  document.getElementById('reconciliation-summary').innerHTML = kpiGrid(summaryCards, summaryCards.length);

  const matchedEntryIds = new Set(result.matchedStatementLines.map(l => Number(l.matchedEntryId)));

  const statementRows = [...result.matchedStatementLines, ...result.unmatchedStatementLines]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map(l => ({
      dateLabel: formatDateArabic(l.date),
      directionLabel: l.direction === 'credit' ? 'إيداع' : 'سحب',
      amountLabel: formatCurrency(l.amount),
      reference: l.reference || '-',
      description: l.description || '-',
      statusBadge: l.reconciled ? `<span class="badge badge--green">مطابقة</span>` : `<span class="badge badge--warning">غير مطابقة</span>`,
      actionsHtml: l.reconciled
        ? `<button type="button" class="btn btn--outline btn--sm" onclick="_handleUnmatch(${l.id})">إلغاء المطابقة</button>`
        : `<button type="button" class="btn btn--outline btn--sm" onclick="_handleMatchClick(${l.id})">مطابقة</button>
           <button type="button" class="btn btn--outline btn--sm" onclick="_handleDeleteLine(${l.id})">حذف</button>`,
    }));

  renderDataTable('statement-lines-table', [
    { key: 'dateLabel', label: 'التاريخ', sortable: true },
    { key: 'directionLabel', label: 'الاتجاه', sortable: false },
    { key: 'amountLabel', label: 'المبلغ', sortable: false },
    { key: 'reference', label: 'المرجع', sortable: false },
    { key: 'description', label: 'البيان', sortable: false },
    { key: 'statusBadge', label: 'الحالة', sortable: false },
    { key: 'actionsHtml', label: 'إجراء', sortable: false },
  ], statementRows, { emptyMessage: 'لا توجد حركات كشف بنك مُدخلة لهذه الفترة' });

  const systemRows = [...result.matchedSystemRows, ...result.unmatchedSystemRows]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map(r => ({
      dateLabel: formatDateArabic(r.date),
      entryNumber: r.entryNumber,
      description: r.description,
      debitLabel: r.debit > 0 ? formatCurrency(r.debit) : '-',
      creditLabel: r.credit > 0 ? formatCurrency(r.credit) : '-',
      statusBadge: matchedEntryIds.has(Number(r.entryId)) ? `<span class="badge badge--green">مطابقة</span>` : `<span class="badge badge--warning">معلّقة</span>`,
    }));

  renderDataTable('system-rows-table', [
    { key: 'dateLabel', label: 'التاريخ', sortable: true },
    { key: 'entryNumber', label: 'رقم القيد', sortable: false },
    { key: 'description', label: 'البيان', sortable: false },
    { key: 'debitLabel', label: 'مدين (إيداع)', sortable: false },
    { key: 'creditLabel', label: 'دائن (سحب)', sortable: false },
    { key: 'statusBadge', label: 'الحالة', sortable: false },
  ], systemRows, { emptyMessage: 'لا توجد حركات نظام على حساب البنك لهذه الفترة' });
}
