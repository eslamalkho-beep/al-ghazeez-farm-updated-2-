// js/pages/chart-of-accounts-page.js

let _allAccountsCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('accounting');
  renderSidebar('accounting');
  renderHeader('شجرة الحسابات');

  await _refreshAccounts();

  document.getElementById('add-account-btn').addEventListener('click', () => _openAccountModal(null));
  document.getElementById('filter-type').addEventListener('change', _drawAccounts);
});

async function _refreshAccounts() {
  _allAccountsCache = await getAllAccounts();
  _drawAccounts();
}

function _drawAccounts() {
  const typeFilter = document.getElementById('filter-type').value;

  const rows = _allAccountsCache
    .filter(a => !typeFilter || a.type === typeFilter)
    .sort((a, b) => (a.code || '').localeCompare(b.code || ''))
    .map(a => ({
      ...a,
      typeBadge: `<span class="badge ${a.normalBalance === 'debit' ? 'badge--blue' : 'badge--green'}">${ACCOUNT_TYPE_LABELS[a.type] || a.type}</span>`,
      normalBalanceLabel: a.normalBalance === 'debit' ? 'مدين' : 'دائن',
    }));

  renderDataTable('accounts-table', [
    { key: 'code', label: 'الكود', sortable: true },
    { key: 'name', label: 'اسم الحساب', sortable: true },
    { key: 'typeBadge', label: 'النوع', sortable: false },
    { key: 'normalBalanceLabel', label: 'الطبيعة', sortable: false },
  ], rows, {
    onRowClick: (row) => _openAccountModal(row),
    emptyMessage: 'لا توجد حسابات مكوَّدة بعد',
    searchable: true,
    pageSize: 50,
  });
}

function _openAccountModal(account) {
  const isEdit = !!account;
  const html = `
    <form id="account-modal-form" class="form-grid">
      <div class="form-group">
        <label>الكود <span class="required">*</span></label>
        <input type="text" id="m-code" class="form-control" value="${account?.code || ''}" placeholder="مثال: 1050" />
        <span class="form-error">الكود مطلوب وغير مكرر</span>
      </div>
      <div class="form-group">
        <label>اسم الحساب <span class="required">*</span></label>
        <input type="text" id="m-name" class="form-control" value="${account?.name || ''}" />
        <span class="form-error">الاسم مطلوب</span>
      </div>
      <div class="form-group form-group--full">
        <label>نوع الحساب <span class="required">*</span></label>
        <select id="m-type" class="form-control">
          ${Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => `<option value="${value}" ${account?.type === value ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
        <span style="font-size:12px; color: var(--color-text-secondary);">الرصيد الطبيعي (مدين/دائن) يُحدَّد تلقائيًا حسب النوع</span>
      </div>
      <div class="form-group form-group--full">
        <label>ملاحظات</label>
        <textarea id="m-notes" class="form-control" rows="2">${account?.notes || ''}</textarea>
      </div>
      ${isEdit ? `
      <div class="form-group form-group--full" style="border-top:1px solid var(--color-border); padding-top: var(--spacing-3);">
        <button type="button" class="btn btn--danger btn--sm" id="delete-account-btn">حذف هذا الحساب</button>
      </div>` : ''}
    </form>
  `;

  openModal(html, {
    title: isEdit ? 'تعديل حساب' : 'إضافة حساب جديد',
    confirmLabel: 'حفظ',
    onConfirm: async () => {
      const code = document.getElementById('m-code').value.trim();
      const type = document.getElementById('m-type').value;

      const validations = [
        { fieldId: 'm-code', validatorFn: isRequired, message: 'الكود مطلوب وغير مكرر' },
        { fieldId: 'm-name', validatorFn: isRequired, message: 'الاسم مطلوب' },
      ];
      const isValid = validateForm(validations);
      if (!isValid) return;

      const taken = await isAccountCodeTaken(code, isEdit ? account.id : null);
      if (taken) {
        showToast('هذا الكود مستخدم بالفعل لحساب آخر', 'error');
        return;
      }

      const data = {
        code,
        name: document.getElementById('m-name').value.trim(),
        type,
        normalBalance: ACCOUNT_NORMAL_BALANCE_BY_TYPE[type],
        notes: document.getElementById('m-notes').value.trim(),
      };

      if (isEdit) {
        await updateAccount(account.id, data);
      } else {
        await createAccount(data);
      }
      showToast('تم الحفظ بنجاح', 'success');
      closeModal();
      await _refreshAccounts();
    },
  });

  if (isEdit) {
    document.getElementById('delete-account-btn').addEventListener('click', async () => {
      const inUse = await isAccountInUse(account.id);
      if (inUse) {
        showToast('لا يمكن حذف هذا الحساب لأنه مستخدم في قيود يومية موجودة', 'error');
        return;
      }
      confirmDelete(`هل أنت متأكد من حذف حساب "${account.name}"؟`, async () => {
        await deleteAccount(account.id);
        showToast('تم الحذف بنجاح', 'success');
        await _refreshAccounts();
      });
    });
  }
}
