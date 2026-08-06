// js/pages/journal-entry-form-page.js
// إنشاء/تعديل قيد يومية — سطور قابلة للتكرار (حساب + مدين + دائن)، بنفس أسلوب بنود bulk-batch-form-page.js
// يُمنع الحفظ إن لم يتطابق إجمالي المدين مع إجمالي الدائن (شرط القيد المزدوج الأساسي)

let _editingEntryId = null;
let _linesState = []; // { accountId, debit, credit, lineNote }
let _accountsCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('accounting');
  renderSidebar('accounting');
  renderHeader('قيد يومية');

  _accountsCache = (await getAllAccounts()).sort((a, b) => (a.code || '').localeCompare(b.code || ''));

  const params = new URLSearchParams(window.location.search);
  const idParam = params.get('id');

  if (idParam) {
    _editingEntryId = Number(idParam);
    await _loadEntryIntoForm(_editingEntryId);
    document.getElementById('form-title').textContent = 'تعديل قيد يومية';
    document.getElementById('delete-btn').style.display = 'inline-flex';
  } else {
    document.getElementById('entryNumber').value = await generateNextEntryNumber();
    document.getElementById('date').value = todayIso();
    _linesState = [
      { accountId: '', debit: '', credit: '', lineNote: '' },
      { accountId: '', debit: '', credit: '', lineNote: '' },
    ];
  }

  _renderLines();

  document.getElementById('add-line-btn').addEventListener('click', () => {
    _linesState.push({ accountId: '', debit: '', credit: '', lineNote: '' });
    _renderLines();
  });

  document.getElementById('save-btn').addEventListener('click', _handleSave);
  document.getElementById('delete-btn').addEventListener('click', _handleDelete);
});

async function _loadEntryIntoForm(id) {
  const entry = await getJournalEntryById(id);
  if (!entry) {
    showToast('لم يتم العثور على القيد', 'error');
    window.location.href = 'journal-entries.html';
    return;
  }
  document.getElementById('entryNumber').value = entry.entryNumber || '';
  document.getElementById('date').value = entry.date || '';
  document.getElementById('description').value = entry.description || '';
  _linesState = (entry.lines || []).map(l => ({ ...l, debit: l.debit || '', credit: l.credit || '' }));
}

function _accountLabel(account) {
  return `${account.code} - ${account.name}`;
}

function _renderLines() {
  const container = document.getElementById('lines-list');
  container.innerHTML = _linesState.map((line, idx) => `
    <div class="batch-line-row batch-line-row--je">
      <div class="batch-line-field">
        <label>الحساب</label>
        <select class="form-control je-account" data-idx="${idx}">
          <option value="">-- اختر حسابًا --</option>
          ${_accountsCache.map(a => `<option value="${a.id}" ${String(line.accountId) === String(a.id) ? 'selected' : ''}>${_accountLabel(a)}</option>`).join('')}
        </select>
      </div>
      <div class="batch-line-field">
        <label>مدين</label>
        <input type="number" class="form-control je-debit" data-idx="${idx}" min="0" step="0.01" value="${line.debit ?? ''}" />
      </div>
      <div class="batch-line-field">
        <label>دائن</label>
        <input type="number" class="form-control je-credit" data-idx="${idx}" min="0" step="0.01" value="${line.credit ?? ''}" />
      </div>
      <div class="batch-line-field">
        <label>ملاحظة السطر</label>
        <input type="text" class="form-control je-note" data-idx="${idx}" value="${line.lineNote || ''}" />
      </div>
      <button type="button" class="batch-line-remove-btn je-remove" data-idx="${idx}" title="حذف السطر">×</button>
    </div>`).join('') || '<div class="empty-state">لا توجد سطور بعد</div>';

  container.querySelectorAll('.je-account').forEach(el => el.addEventListener('change', (e) => { _linesState[Number(e.target.dataset.idx)].accountId = e.target.value; }));
  container.querySelectorAll('.je-debit').forEach(el => el.addEventListener('input', (e) => {
    const idx = Number(e.target.dataset.idx);
    _linesState[idx].debit = e.target.value;
    if (Number(e.target.value) > 0) _linesState[idx].credit = '';
    _renderLines();
  }));
  container.querySelectorAll('.je-credit').forEach(el => el.addEventListener('input', (e) => {
    const idx = Number(e.target.dataset.idx);
    _linesState[idx].credit = e.target.value;
    if (Number(e.target.value) > 0) _linesState[idx].debit = '';
    _renderLines();
  }));
  container.querySelectorAll('.je-note').forEach(el => el.addEventListener('input', (e) => { _linesState[Number(e.target.dataset.idx)].lineNote = e.target.value; }));
  container.querySelectorAll('.je-remove').forEach(el => el.addEventListener('click', (e) => { _linesState.splice(Number(e.target.dataset.idx), 1); _renderLines(); }));

  _updateBalanceSummary();
}

function _updateBalanceSummary() {
  const { isBalanced, totalDebit, totalCredit } = validateJournalEntryBalance(_linesState);
  document.getElementById('summary-total-debit').textContent = formatCurrency(totalDebit);
  document.getElementById('summary-total-credit').textContent = formatCurrency(totalCredit);

  const statusEl = document.getElementById('summary-balance-status');
  statusEl.textContent = isBalanced ? 'متوازن ✓' : 'غير متوازن';
  statusEl.style.color = isBalanced ? 'var(--color-primary-green-dark)' : 'var(--color-primary-red)';

  document.getElementById('save-btn').disabled = !isBalanced;
}

function _validateBeforeSave() {
  const date = document.getElementById('date').value;
  const description = document.getElementById('description').value.trim();

  if (!isValidDate(date)) {
    showToast('يرجى إدخال تاريخ صحيح', 'error');
    return false;
  }
  if (!isRequired(description)) {
    showToast('وصف القيد مطلوب', 'error');
    return false;
  }
  if (_linesState.length < 2) {
    showToast('القيد يحتاج سطرين على الأقل', 'error');
    return false;
  }
  for (const line of _linesState) {
    const debit = Number(line.debit || 0);
    const credit = Number(line.credit || 0);
    if (!line.accountId) {
      showToast('تأكد من اختيار حساب لكل سطر', 'error');
      return false;
    }
    if (debit > 0 && credit > 0) {
      showToast('لا يمكن أن يكون السطر مدينًا ودائنًا في نفس الوقت', 'error');
      return false;
    }
    if (debit === 0 && credit === 0) {
      showToast('كل سطر يحتاج مبلغًا في المدين أو الدائن', 'error');
      return false;
    }
  }
  const { isBalanced } = validateJournalEntryBalance(_linesState);
  if (!isBalanced) {
    showToast('إجمالي المدين يجب أن يساوي إجمالي الدائن', 'error');
    return false;
  }
  return true;
}

async function _handleSave() {
  if (!_validateBeforeSave()) return;

  const data = {
    entryNumber: document.getElementById('entryNumber').value,
    date: document.getElementById('date').value,
    description: document.getElementById('description').value.trim(),
    lines: _linesState.map(l => ({
      accountId: Number(l.accountId),
      debit: Number(l.debit || 0),
      credit: Number(l.credit || 0),
      lineNote: (l.lineNote || '').trim(),
    })),
  };

  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'جاري الحفظ...';

  try {
    if (_editingEntryId) {
      await updateJournalEntry(_editingEntryId, data);
    } else {
      await createJournalEntry(data);
    }
    showToast('تم الحفظ بنجاح', 'success');
    setTimeout(() => { window.location.href = 'journal-entries.html'; }, 400);
  } catch (err) {
    showToast('حدث خطأ أثناء الحفظ', 'error');
    saveBtn.disabled = false;
    saveBtn.textContent = 'حفظ';
  }
}

function _handleDelete() {
  confirmDelete('هل أنت متأكد من حذف هذا القيد؟', async () => {
    await deleteJournalEntry(_editingEntryId);
    showToast('تم حذف القيد', 'success');
    setTimeout(() => { window.location.href = 'journal-entries.html'; }, 400);
  });
}
