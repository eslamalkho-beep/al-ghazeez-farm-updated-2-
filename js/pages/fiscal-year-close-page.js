// js/pages/fiscal-year-close-page.js

let _isFiscalYearAdmin = false;
let _allFiscalYearsCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('accounting');
  renderSidebar('accounting-fiscal-year-close');
  renderHeader('إقفال السنة المالية');

  const currentUser = getCurrentUser();
  _isFiscalYearAdmin = !!currentUser && resolveRoleKey(currentUser.role) === 'systemAdmin';

  document.getElementById('close-year-card').style.display = _isFiscalYearAdmin ? '' : 'none';
  document.getElementById('admin-only-note').style.display = _isFiscalYearAdmin ? 'none' : '';

  document.getElementById('fiscalYearInput').value = new Date().getFullYear() - 1;
  document.getElementById('preview-year-btn').addEventListener('click', _handlePreviewYear);

  await _refreshFiscalYearsTable();
});

async function _handlePreviewYear() {
  if (!_isFiscalYearAdmin) return;

  const yearKey = String(document.getElementById('fiscalYearInput').value || '').trim();
  if (!/^\d{4}$/.test(yearKey)) {
    showToast('أدخل سنة صحيحة (أربع خانات)', 'error');
    return;
  }

  const box = document.getElementById('year-preview-box');
  box.innerHTML = '<p style="color: var(--color-text-secondary);">جارٍ الحساب...</p>';

  const preview = await computeFiscalYearClosingPreview(yearKey);
  _renderYearPreview(preview);
}

function _renderYearPreview(preview) {
  const box = document.getElementById('year-preview-box');
  const netTone = preview.netIncome >= 0 ? 'green' : 'red';

  const cards = [
    { value: formatCurrency(preview.totalRevenue), label: 'إجمالي الإيرادات المرحّلة', tone: 'blue' },
    { value: formatCurrency(preview.totalExpense), label: 'إجمالي المصروفات المرحّلة', tone: 'blue' },
    { value: formatCurrency(preview.netIncome), label: preview.netIncome >= 0 ? 'صافي الربح' : 'صافي الخسارة', tone: netTone },
  ];
  if (preview.appropriationAmount > 0) {
    cards.push({ value: formatCurrency(preview.appropriationAmount), label: 'يُرحَّل لأرباح السنوات السابقة قبل الإقفال', tone: 'blue' });
  }

  let html = kpiGrid(cards, cards.length);

  if (preview.blocker) {
    html += `<p style="color: var(--color-danger, #c0392b); margin-top: var(--spacing-3);">⚠️ ${preview.blocker}</p>`;
  } else if (preview.missingAccounts) {
    html += `<p style="color: var(--color-danger, #c0392b); margin-top: var(--spacing-3);">⚠️ حسابا "أرباح سنوات سابقة" (32101) و"صافي ربح السنة الحالية" (32103) مطلوبان في شجرة الحسابات لإتمام الإقفال.</p>`;
  } else if (!preview.hasMovements) {
    html += `<p style="color: var(--color-text-secondary); margin-top: var(--spacing-3);">لا توجد أي حركات إيرادات أو مصروفات مرحّلة ضمن سنة ${preview.yearKey} — لا حاجة لإقفالها.</p>`;
  } else {
    html += `<div class="form-actions" style="margin-top: var(--spacing-3);">
      <button type="button" class="btn btn--danger" id="confirm-close-year-btn">إقفال السنة المالية ${preview.yearKey}</button>
    </div>`;
  }

  box.innerHTML = html;

  const confirmBtn = document.getElementById('confirm-close-year-btn');
  if (confirmBtn) confirmBtn.addEventListener('click', () => _handleConfirmCloseYear(preview));
}

function _handleConfirmCloseYear(preview) {
  const netLabel = preview.netIncome >= 0 ? 'ربح' : 'خسارة';
  const appropriationNote = preview.appropriationAmount > 0
    ? '، بعد ترحيل نتيجة السنوات السابقة المتراكمة إلى "أرباح سنوات سابقة" أولاً'
    : '';

  openModal(`
    <p>سيتم إنشاء قيد إقفال يُصفّر كل حسابات الإيرادات والمصروفات لسنة ${preview.yearKey} وينقل صافي ${netLabel}
    (${formatCurrency(Math.abs(preview.netIncome))}) إلى حساب "صافي ربح السنة الحالية"${appropriationNote}، مع قفل
    الأشهر الاثني عشر لهذه السنة تلقائيًا. لن يستطيع أي مستخدم غير مدير النظام إضافة أو تعديل أو حذف أي عملية
    بتاريخ ضمن هذه السنة بعد الإقفال. هل تريد المتابعة؟</p>
  `, {
    title: 'تأكيد إقفال السنة المالية',
    confirmLabel: 'إقفال السنة',
    cancelLabel: 'إلغاء',
    onConfirm: async () => {
      closeModal();
      try {
        await closeFiscalYear(preview.yearKey, getCurrentUser());
        showToast(`تم إقفال السنة المالية ${preview.yearKey} بنجاح`, 'success');
        document.getElementById('year-preview-box').innerHTML = '';
        await _refreshFiscalYearsTable();
      } catch (err) {
        showToast(err.message || 'حدث خطأ أثناء إقفال السنة المالية', 'error');
      }
    },
  });
}

function _handleReopenYearClick(yearKey) {
  if (!_isFiscalYearAdmin) return;

  openModal(`
    <p>إعادة فتح السنة المالية ${yearKey} تحذف قيد الإقفال (وقيد ترحيل الأرباح المرتبط إن وُجد) وتعيد فتح أشهرها
    الاثني عشر المُقفلة. يلزم توضيح السبب (يُحفظ في سجل السنة لأي مراجعة لاحقة). لا تنسَ إعادة إقفالها بعد إتمام
    التعديل اللازم.</p>
    <div class="form-group">
      <label for="reopen-year-reason">سبب إعادة الفتح <span class="required">*</span></label>
      <textarea id="reopen-year-reason" class="form-control" rows="3"></textarea>
      <span class="form-error" id="reopen-year-reason-error" style="display:none;">سبب إعادة الفتح مطلوب</span>
    </div>
  `, {
    title: 'إعادة فتح السنة المالية',
    confirmLabel: 'إعادة الفتح',
    cancelLabel: 'إلغاء',
    onConfirm: async () => {
      const reason = document.getElementById('reopen-year-reason').value.trim();
      if (!reason) {
        document.getElementById('reopen-year-reason-error').style.display = '';
        return false;
      }
      try {
        await reopenFiscalYear(yearKey, getCurrentUser(), reason);
        showToast('تمت إعادة فتح السنة المالية بنجاح', 'success');
        closeModal();
        await _refreshFiscalYearsTable();
      } catch (err) {
        showToast(err.message || 'حدث خطأ أثناء إعادة فتح السنة المالية', 'error');
      }
    },
  });
}

async function _refreshFiscalYearsTable() {
  _allFiscalYearsCache = await getAllFiscalYearRecords();

  const rows = _allFiscalYearsCache.map(y => ({
    ...y,
    statusBadge: `<span class="badge ${y.isClosed ? 'badge--red' : 'badge--green'}">${y.isClosed ? 'مغلقة' : 'مفتوحة'}</span>`,
    netIncomeLabel: y.netIncome != null ? formatCurrency(y.netIncome) : '-',
    closedByLabel: y.closedByUserName ? `${y.closedByUserName} — ${formatDateArabic(y.closedAt)}` : '-',
    reopenBtn: (_isFiscalYearAdmin && y.isClosed)
      ? `<button type="button" class="btn btn--outline btn--sm" onclick="_handleReopenYearClick('${y.yearKey}')">إعادة الفتح</button>`
      : '-',
  }));

  renderDataTable('fiscal-years-table', [
    { key: 'yearKey', label: 'السنة', sortable: true },
    { key: 'statusBadge', label: 'الحالة', sortable: false },
    { key: 'netIncomeLabel', label: 'صافي الربح/الخسارة', sortable: true },
    { key: 'closedByLabel', label: 'آخر إغلاق', sortable: false },
    { key: 'reopenBtn', label: 'إجراء', sortable: false },
  ], rows, {
    emptyMessage: 'لا توجد سنوات مالية مُقفلة بعد — كل السنوات مفتوحة تلقائيًا',
  });
}
