// js/pages/categories-page.js

let _allCategoriesCache = [];
let _expenseAccountsCache = []; // تُستخدم لبنود المصروفات وأيضًا بنود المشتريات (نفس طبيعة القيد: مدين حساب مصروف)
let _revenueAccountsCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('categories');
  renderSidebar('categories');
  renderHeader('تكويدات البنود');

  const allAccounts = await getAllAccounts();
  _expenseAccountsCache = allAccounts.filter(a => a.type === 'expense');
  _revenueAccountsCache = allAccounts.filter(a => a.type === 'revenue');
  await _refreshCategories();

  document.getElementById('add-category-btn').addEventListener('click', () => _openCategoryModal(null));
  document.getElementById('filter-type').addEventListener('change', _drawCategories);
});

async function _refreshCategories() {
  _allCategoriesCache = await getAllCategories();
  _drawCategories();
}

function _drawCategories() {
  const typeFilter = document.getElementById('filter-type').value;

  const rows = _allCategoriesCache
    .filter(c => !typeFilter || c.type === typeFilter)
    .map(c => ({
      ...c,
      typeBadge: `<span class="badge ${c.type === 'expense' ? 'badge--red' : c.type === 'revenue' ? 'badge--green' : 'badge--blue'}">${CATEGORY_TYPE_LABELS[c.type] || c.type}</span>`,
    }));

  renderDataTable('categories-table', [
    { key: 'typeBadge', label: 'النوع', sortable: false },
    { key: 'name', label: 'اسم البند', sortable: true },
  ], rows, {
    onRowClick: (row) => _openCategoryModal(row),
    emptyMessage: 'لا توجد بنود مكوّدة بعد',
  });
}

function _openCategoryModal(category) {
  const isEdit = !!category;
  const html = `
    <form id="category-modal-form" class="form-grid">
      <div class="form-group">
        <label>النوع <span class="required">*</span></label>
        <select id="m-type" class="form-control" ${isEdit ? 'disabled' : ''}>
          <option value="expense" ${category?.type === 'expense' ? 'selected' : ''}>بند مصروف</option>
          <option value="revenue" ${category?.type === 'revenue' ? 'selected' : ''}>بند إيراد</option>
          <option value="purchase" ${category?.type === 'purchase' ? 'selected' : ''}>بند مشتريات</option>
        </select>
      </div>
      <div class="form-group">
        <label>اسم البند <span class="required">*</span></label>
        <input type="text" id="m-name" class="form-control" value="${category?.name || ''}" placeholder="مثال: أعلاف" />
      </div>
      <div class="form-group form-group--full" id="linked-account-group">
        <label>الحساب المحاسبي المرتبط (اختياري)</label>
        <select id="m-linkedAccountId" class="form-control"></select>
      </div>
      ${isEdit ? `
      <div class="form-group form-group--full" style="border-top:1px solid var(--color-border); padding-top: var(--spacing-3);">
        <button type="button" class="btn btn--danger btn--sm" id="delete-category-btn">حذف هذا البند</button>
      </div>` : ''}
    </form>
  `;

  openModal(html, {
    title: isEdit ? 'تعديل بند' : 'تكويد بند جديد',
    confirmLabel: 'حفظ',
    onConfirm: async () => {
      const type = document.getElementById('m-type').value;
      const name = document.getElementById('m-name').value.trim();
      const linkedAccountIdValue = document.getElementById('m-linkedAccountId').value;

      if (!isRequired(name)) {
        showToast('اسم البند مطلوب', 'error');
        return;
      }

      const taken = await isCategoryNameTaken(type, name, isEdit ? category.id : null);
      if (taken) {
        showToast('هذا الاسم مستخدم بالفعل لنفس النوع', 'error');
        return;
      }

      const linkedAccountId = linkedAccountIdValue ? Number(linkedAccountIdValue) : null;

      if (isEdit) {
        await updateCategory(category.id, { name, linkedAccountId });
      } else {
        await createCategory({ type, name, linkedAccountId });
      }
      showToast('تم الحفظ بنجاح', 'success');
      closeModal();
      await _refreshCategories();
    },
  });

  const typeSelect = document.getElementById('m-type');
  const accountSelect = document.getElementById('m-linkedAccountId');
  // بنود المصروفات والمشتريات كلاهما يُرحَّلان مدينًا لحساب مصروف (نفس القائمة)، وبنود الإيرادات لحساب إيراد
  const _accountsForType = (type) => (type === 'revenue' ? _revenueAccountsCache : _expenseAccountsCache);
  const _fallbackLabelForType = (type) => (type === 'revenue' ? 'إيرادات أخرى' : 'مصروفات أخرى');
  const renderAccountOptions = () => {
    const type = typeSelect.value;
    accountSelect.innerHTML = `<option value="">-- بدون ربط (يُرحَّل تلقائيًا لحساب "${_fallbackLabelForType(type)}") --</option>` +
      _accountsForType(type).map(a => `<option value="${a.id}" ${String(category?.linkedAccountId) === String(a.id) ? 'selected' : ''}>${a.code} - ${a.name}</option>`).join('');
  };
  typeSelect.addEventListener('change', renderAccountOptions);
  renderAccountOptions();

  if (isEdit) {
    document.getElementById('delete-category-btn').addEventListener('click', () => {
      confirmDelete(`هل أنت متأكد من حذف البند "${category.name}"؟ لن يؤثر هذا على السجلات السابقة التي تستخدم هذا الاسم.`, async () => {
        await deleteCategory(category.id);
        showToast('تم حذف البند', 'success');
        await _refreshCategories();
      });
    });
  }
}
