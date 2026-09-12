// js/pages/period-lock-page.js

let _allPeriodsCache = [];
let _isAdmin = false;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('accounting');
  renderSidebar('accounting-period-lock');
  renderHeader('قفل الفترات المحاسبية');

  const currentUser = getCurrentUser();
  _isAdmin = !!currentUser && resolveRoleKey(currentUser.role) === 'systemAdmin';

  document.getElementById('close-period-card').style.display = _isAdmin ? '' : 'none';
  document.getElementById('admin-only-note').style.display = _isAdmin ? 'none' : '';

  document.getElementById('close-period-form').addEventListener('submit', _handleCloseSubmit);

  await _refreshPeriodsTable();
});

function _handleCloseSubmit(e) {
  e.preventDefault();
  if (!_isAdmin) return;

  const isValid = validateForm([
    { fieldId: 'periodMonth', validatorFn: isRequired, message: 'اختر شهرًا' },
  ]);
  if (!isValid) return;

  const periodKey = document.getElementById('periodMonth').value;
  const existing = _allPeriodsCache.find(p => p.periodKey === periodKey);
  if (existing && existing.isClosed) {
    showToast('هذه الفترة مغلقة بالفعل', 'warning');
    return;
  }

  openModal(`<p>هل أنت متأكد من إغلاق فترة "${formatPeriodLabel(periodKey)}"؟ لن يستطيع أي مستخدم غير مدير النظام إضافة أو تعديل أو حذف أي عملية بتاريخ ضمن هذا الشهر بعد الإغلاق.</p>`, {
    title: 'تأكيد إغلاق الفترة',
    confirmLabel: 'إغلاق الفترة',
    cancelLabel: 'إلغاء',
    onConfirm: async () => {
      closeModal();
      try {
        await closePeriod(periodKey, getCurrentUser());
        showToast('تم إغلاق الفترة بنجاح', 'success');
        document.getElementById('close-period-form').reset();
        await _refreshPeriodsTable();
      } catch (err) {
        showToast(err.message || 'حدث خطأ أثناء إغلاق الفترة', 'error');
      }
    },
  });
}

function _handleReopenClick(periodKey) {
  if (!_isAdmin) return;

  openModal(`
    <p>إعادة فتح فترة "${formatPeriodLabel(periodKey)}" — يلزم توضيح سبب الفتح (يُحفظ في سجل الفترة لأي مراجعة لاحقة). لا تنسَ إغلاق الفترة مجددًا بعد إتمام التعديل اللازم.</p>
    <div class="form-group">
      <label for="reopen-reason">سبب إعادة الفتح <span class="required">*</span></label>
      <textarea id="reopen-reason" class="form-control" rows="3"></textarea>
      <span class="form-error" id="reopen-reason-error" style="display:none;">سبب إعادة الفتح مطلوب</span>
    </div>
  `, {
    title: 'إعادة فتح الفترة',
    confirmLabel: 'إعادة الفتح',
    cancelLabel: 'إلغاء',
    onConfirm: async () => {
      const reason = document.getElementById('reopen-reason').value.trim();
      if (!reason) {
        document.getElementById('reopen-reason-error').style.display = '';
        return false;
      }
      try {
        await reopenPeriod(periodKey, getCurrentUser(), reason);
        showToast('تمت إعادة فتح الفترة بنجاح', 'success');
        closeModal();
        await _refreshPeriodsTable();
      } catch (err) {
        showToast(err.message || 'حدث خطأ أثناء إعادة فتح الفترة', 'error');
      }
    },
  });
}

async function _refreshPeriodsTable() {
  _allPeriodsCache = await getAllPeriodRecords();

  const rows = _allPeriodsCache.map(p => ({
    ...p,
    periodLabel: formatPeriodLabel(p.periodKey),
    statusBadge: `<span class="badge ${p.isClosed ? 'badge--red' : 'badge--green'}">${p.isClosed ? 'مغلقة' : 'مفتوحة'}</span>`,
    closedByLabel: p.closedByUserName ? `${p.closedByUserName} — ${formatDateArabic(p.closedAt)}` : '-',
    reopenBtn: (_isAdmin && p.isClosed)
      ? `<button type="button" class="btn btn--outline btn--sm" onclick="_handleReopenClick('${p.periodKey}')">إعادة الفتح</button>`
      : '-',
  }));

  renderDataTable('periods-table', [
    { key: 'periodLabel', label: 'الفترة', sortable: true },
    { key: 'statusBadge', label: 'الحالة', sortable: false },
    { key: 'closedByLabel', label: 'آخر إغلاق', sortable: false },
    { key: 'reopenBtn', label: 'إجراء', sortable: false },
  ], rows, {
    emptyMessage: 'لا توجد فترات مغلقة بعد — كل الفترات مفتوحة تلقائيًا',
  });
}
