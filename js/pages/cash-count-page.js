// js/pages/cash-count-page.js

let _cashCountsCache = [];
let _previewSystemAmount = 0;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('accounting');
  renderSidebar('accounting-cash-count');
  renderHeader('جرد الصندوق');

  const params = new URLSearchParams(window.location.search);
  const idParam = params.get('id');

  if (idParam) {
    await _renderMemo(Number(idParam));
    return;
  }

  document.getElementById('date').value = todayIso();

  // خيارا الحساب (الصندوق/البنك) يُشتقان من "ربط العمليات بالحسابات" — الافتراضي 11101/11102
  const [accounts, mappings] = await Promise.all([getAllAccounts(), loadAccountMappings()]);
  document.getElementById('accountCode').innerHTML = [
    getMappedAccount('cash', accounts, mappings),
    getMappedAccount('bank', accounts, mappings),
  ].filter(Boolean)
    .map(a => `<option value="${a.code}">${a.code} - ${a.name}</option>`)
    .join('');

  document.getElementById('countedAmount').addEventListener('input', _updatePreview);
  document.getElementById('accountCode').addEventListener('change', _refreshSystemPreview);
  document.getElementById('date').addEventListener('change', _refreshSystemPreview);
  document.getElementById('cash-count-form').addEventListener('submit', _handleSubmit);

  await _refreshSystemPreview();
  await _refreshCashCountsTable();
});

async function _refreshSystemPreview() {
  const accountCode = document.getElementById('accountCode').value;
  const date = document.getElementById('date').value;
  _previewSystemAmount = date ? await previewSystemAmount(accountCode, date) : 0;
  document.getElementById('preview-system').textContent = formatCurrency(_previewSystemAmount);
  _updatePreview();
}

function _updatePreview() {
  const counted = Number(document.getElementById('countedAmount').value || 0);
  const difference = Math.round((counted - _previewSystemAmount) * 100) / 100;
  document.getElementById('preview-counted').textContent = formatCurrency(counted);
  const diffEl = document.getElementById('preview-difference');
  diffEl.textContent = formatCurrency(difference);
  diffEl.style.color = Math.abs(difference) < 0.005
    ? 'var(--color-text-secondary)'
    : (difference > 0 ? 'var(--color-primary-green-dark)' : 'var(--color-primary-red)');
}

async function _handleSubmit(e) {
  e.preventDefault();

  const isValid = validateForm([
    { fieldId: 'date', validatorFn: isValidDate, message: 'التاريخ مطلوب' },
    { fieldId: 'countedAmount', validatorFn: isPositiveNumber, message: 'أدخل مبلغًا صحيحًا' },
  ]);
  if (!isValid) return;

  const date = document.getElementById('date').value;
  if (!(await guardPeriodOpenForSave(date))) return;

  const data = {
    accountCode: document.getElementById('accountCode').value,
    date,
    countedAmount: Number(document.getElementById('countedAmount').value),
    notes: document.getElementById('notes').value.trim(),
  };

  const saveBtn = document.getElementById('save-count-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'جاري الحفظ...';

  try {
    await createCashCount(data);
    showToast('تم حفظ الجرد بنجاح', 'success');
    document.getElementById('cash-count-form').reset();
    document.getElementById('date').value = todayIso();
    await _refreshSystemPreview();
    await _refreshCashCountsTable();
  } catch (err) {
    showToast(err.message || 'حدث خطأ أثناء حفظ الجرد', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'حفظ الجرد';
  }
}

function _handleDeleteClick(id) {
  confirmDelete('هل أنت متأكد من حذف سجل الجرد هذا؟ ستُحذف أيضًا تسوية فرق الصندوق المرتبطة به إن وُجدت.', async () => {
    await deleteCashCount(id);
    showToast('تم الحذف بنجاح', 'success');
    await _refreshCashCountsTable();
  });
}

const _CASH_COUNT_ACCOUNT_LABELS = { '1000': 'الصندوق', '1010': 'البنك', '11101': 'الصندوق', '11102': 'البنك' };

async function _refreshCashCountsTable() {
  _cashCountsCache = await getAllCashCounts();

  const rows = _cashCountsCache.map(c => ({
    ...c,
    accountLabel: _CASH_COUNT_ACCOUNT_LABELS[c.accountCode] || c.accountCode,
    dateLabel: formatDateArabic(c.date),
    systemAmountLabel: formatCurrency(c.systemAmount),
    countedAmountLabel: formatCurrency(c.countedAmount),
    differenceBadge: `<span class="badge ${Math.abs(c.difference) < 0.005 ? 'badge--gray' : (c.difference > 0 ? 'badge--green' : 'badge--red')}">${formatCurrency(c.difference)}</span>`,
    actionsHtml: `
      <a class="btn btn--outline btn--sm" href="cash-count.html?id=${c.id}">🖨️ محضر</a>
      <button type="button" class="btn btn--outline btn--sm" onclick="_handleDeleteClick(${c.id})">حذف</button>
    `,
  }));

  renderDataTable('cash-counts-table', [
    { key: 'dateLabel', label: 'التاريخ', sortable: true },
    { key: 'accountLabel', label: 'الحساب', sortable: true },
    { key: 'systemAmountLabel', label: 'رصيد النظام', sortable: false },
    { key: 'countedAmountLabel', label: 'المبلغ المعدود', sortable: false },
    { key: 'differenceBadge', label: 'الفرق', sortable: false },
    { key: 'actionsHtml', label: 'إجراء', sortable: false },
  ], rows, {
    emptyMessage: 'لا توجد عمليات جرد مسجَّلة بعد',
  });
}

async function _renderMemo(id) {
  const count = await getCashCountById(id);
  if (!count) {
    showToast('لم يتم العثور على سجل الجرد', 'error');
    window.location.href = 'cash-count.html';
    return;
  }

  document.getElementById('new-count-card').style.display = 'none';
  document.getElementById('list-view').style.display = 'none';
  document.getElementById('back-to-list-link').style.display = 'inline-flex';

  const memo = document.getElementById('memo-view');
  memo.style.display = '';
  memo.innerHTML = `
    <div class="card" style="max-width:520px;">
      <div class="card__header"><h3>محضر جرد ${_CASH_COUNT_ACCOUNT_LABELS[count.accountCode] || count.accountCode}</h3></div>
      <div style="padding: var(--spacing-3); display:flex; flex-direction:column; gap: var(--spacing-2); font-size:14px;">
        <div><strong>التاريخ:</strong> ${formatDateArabic(count.date)}</div>
        <div><strong>الحساب:</strong> ${_CASH_COUNT_ACCOUNT_LABELS[count.accountCode] || count.accountCode}</div>
        <div><strong>رصيد النظام كما في هذا التاريخ:</strong> ${formatCurrency(count.systemAmount)}</div>
        <div><strong>المبلغ المعدود فعليًا:</strong> ${formatCurrency(count.countedAmount)}</div>
        <div><strong>الفرق:</strong> ${formatCurrency(count.difference)} ${Math.abs(count.difference) < 0.005 ? '(مطابق)' : (count.difference > 0 ? '(فائض)' : '(عجز)')}</div>
        ${count.notes ? `<div><strong>ملاحظات:</strong> ${count.notes}</div>` : ''}
        <div style="color: var(--color-text-secondary); font-size:12px;">تم الإعداد بواسطة: ${count.createdByUserName || '-'}</div>
      </div>
    </div>
    <button type="button" class="btn btn--outline" style="margin-top: var(--spacing-3);" onclick="window.print()">🖨️ طباعة المحضر</button>
  `;
}
