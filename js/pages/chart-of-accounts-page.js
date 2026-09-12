// js/pages/chart-of-accounts-page.js
// شجرة حسابات هرمية (أب/فرعي): عرض شجري بترتيب الأكواد + فلترة بالنوع والقائمة المالية، ونموذج إضافة/تعديل
// يحوي كل حقول الهرم (الحساب الأب/القائمة المالية/قابل للترحيل/الطبيعة/يظهر كبند)

let _allAccountsCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('accounting');
  renderSidebar('accounting');
  renderHeader('شجرة الحسابات');

  await _refreshAccounts();

  document.getElementById('add-account-btn').addEventListener('click', () => _openAccountModal(null));
  document.getElementById('filter-type').addEventListener('change', _drawAccounts);
  document.getElementById('filter-statement').addEventListener('change', _drawAccounts);
});

async function _refreshAccounts() {
  _allAccountsCache = await getAllAccounts();
  _drawAccounts();
}

function _hierarchy() {
  return getAccountHierarchy(_allAccountsCache);
}

function _drawAccounts() {
  const typeFilter = document.getElementById('filter-type').value;
  const statementFilter = document.getElementById('filter-statement').value;
  const hierarchy = _hierarchy();

  const rows = _allAccountsCache
    .filter(a => (!typeFilter || a.type === typeFilter) && (!statementFilter || a.financialStatement === statementFilter))
    .sort((a, b) => (a.code || '').localeCompare(b.code || ''))
    .map(a => {
      const depth = hierarchy.depthByCode.get(a.code) || 0;
      const isHeader = a.isPostable === false;
      const parent = a.parentCode ? hierarchy.byCode.get(a.parentCode) : null;
      const nameIndent = depth > 0 ? `<span style="display:inline-block;width:${depth * 18}px;"></span>` : '';
      return {
        ...a,
        nameHtml: `${nameIndent}${isHeader ? `<strong>${a.name}</strong>` : a.name}`,
        typeBadge: `<span class="badge ${a.normalBalance === 'debit' ? 'badge--blue' : 'badge--green'}">${ACCOUNT_TYPE_LABELS[a.type] || a.type}</span>`,
        parentLabel: parent ? parent.name : '—',
        statementLabel: ACCOUNT_FINANCIAL_STATEMENT_LABELS[a.financialStatement] || a.financialStatement || '—',
        postableLabel: a.isPostable === false ? 'لا' : 'نعم',
        categoryUsageLabel: (a.type === 'expense' || a.type === 'revenue')
          ? (a.isPostable !== false
            ? (a.isCategoryAccount !== false ? '<span class="badge badge--green">✓ يظهر كبند</span>' : '<span class="badge badge--gray">حساب تحكّم فقط</span>')
            : '—')
          : '—',
      };
    });

  renderDataTable('accounts-table', [
    { key: 'code', label: 'الكود', sortable: true },
    { key: 'nameHtml', label: 'اسم الحساب', sortable: false },
    { key: 'typeBadge', label: 'النوع', sortable: false },
    { key: 'parentLabel', label: 'الحساب الأب', sortable: false },
    { key: 'statementLabel', label: 'القائمة المالية', sortable: false },
    { key: 'postableLabel', label: 'قابل للترحيل', sortable: false },
    { key: 'categoryUsageLabel', label: 'الاستخدام كبند', sortable: false },
  ], rows, {
    onRowClick: (row) => _openAccountModal(row),
    emptyMessage: 'لا توجد حسابات مكوَّدة بعد',
    searchable: true,
    pageSize: 100,
  });
}

function _collectDescendantCodes(account) {
  const hierarchy = _hierarchy();
  const codes = new Set([account.code]);
  const walk = (code) => {
    (hierarchy.childrenByParentCode.get(code) || []).forEach(child => {
      codes.add(child.code);
      walk(child.code);
    });
  };
  walk(account.code);
  return codes;
}

async function _openAccountModal(account) {
  const isEdit = !!account;
  const hasMovements = isEdit ? await isAccountUsedInJournalEntries(account.id) : false;
  const hierarchy = _hierarchy();
  const excludedCodes = isEdit ? _collectDescendantCodes(account) : new Set();
  const type = account?.type || 'asset';
  const statement = account?.financialStatement || (['asset', 'liability', 'equity'].includes(type) ? 'balanceSheet' : 'incomeStatement');
  const isPostable = account ? (account.isPostable !== false) : true;
  const normalBalance = account?.normalBalance || ACCOUNT_NORMAL_BALANCE_BY_TYPE[type] || 'debit';

  // رؤوس الشجرة فقط (غير قابلة للترحيل) تصلح آباءً — مع استبعاد الحساب نفسه وكل أحفاده عند التعديل
  const parentOptions = _allAccountsCache
    .filter(a => a.isPostable === false && !excludedCodes.has(a.code))
    .sort((a, b) => (a.code || '').localeCompare(b.code || ''))
    .map(a => `<option value="${a.code}" ${account?.parentCode === a.code ? 'selected' : ''}>${a.code} - ${a.name}</option>`)
    .join('');

  const html = `
    <form id="account-modal-form" class="form-grid">
      ${hasMovements ? `
      <div class="form-group form-group--full" style="background: rgba(232,169,59,0.15); border: 1px solid var(--color-warning); border-radius: var(--radius-sm); padding: var(--spacing-2) var(--spacing-3); font-size: 13px; color: #8a5a10;">
        ⚠️ هذا الحساب له حركات مرحّلة بالفعل في قيود يومية سابقة — تعديل الكود/النوع/الطبيعة/قابل للترحيل قد يؤثر على دقة الأرصدة والتقارير المحاسبية لتلك الحركات. يُفضَّل الاكتفاء بتعديل الاسم/الملاحظات، أو استشارة المحاسب قبل تغيير باقي الحقول.
      </div>` : ''}
      <div class="form-group">
        <label>الكود <span class="required">*</span></label>
        <input type="text" id="m-code" class="form-control" value="${account?.code || ''}" placeholder="مثال: 11101" />
        <span class="form-error">الكود مطلوب وغير مكرر</span>
      </div>
      <div class="form-group">
        <label>اسم الحساب <span class="required">*</span></label>
        <input type="text" id="m-name" class="form-control" value="${account?.name || ''}" />
        <span class="form-error">الاسم مطلوب</span>
      </div>
      <div class="form-group">
        <label>نوع الحساب <span class="required">*</span></label>
        <select id="m-type" class="form-control">
          ${Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => `<option value="${value}" ${type === value ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>الحساب الأب</label>
        <select id="m-parentCode" class="form-control">
          <option value="">بلا أب (حساب رئيسي)</option>
          ${parentOptions}
        </select>
        <span style="font-size:12px; color: var(--color-text-secondary);">الحسابات "الرئيسية" (غير القابلة للترحيل) فقط تصلح آباءً</span>
      </div>
      <div class="form-group">
        <label>القائمة المالية <span class="required">*</span></label>
        <select id="m-financialStatement" class="form-control">
          ${Object.entries(ACCOUNT_FINANCIAL_STATEMENT_LABELS).map(([value, label]) => `<option value="${value}" ${statement === value ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>الطبيعة (الرصيد الطبيعي)</label>
        <select id="m-normalBalance" class="form-control">
          <option value="debit" ${normalBalance === 'debit' ? 'selected' : ''}>مدين</option>
          <option value="credit" ${normalBalance === 'credit' ? 'selected' : ''}>دائن</option>
        </select>
        <span style="font-size:12px; color: var(--color-text-secondary);">تُحدَّد تلقائيًا حسب النوع — عدّلها يدويًا فقط لحساب مخالف مثل "مجمع الإهلاك" (دائن)</span>
      </div>
      <div class="form-group form-group--full">
        <label style="display:flex; align-items:center; gap: var(--spacing-2);">
          <input type="checkbox" id="m-isPostable" ${isPostable ? 'checked' : ''} />
          قابل للترحيل (حساب فرعي تُرحَّل عليه القيود)
        </label>
        <span style="font-size:12px; color: var(--color-text-secondary);">أطفئها لحساب "رئيسي" تجميعي (مثل 113 المخزون أو 75 الإهلاك) لا يُرحَّل عليه مباشرة بل على أبنائه</span>
      </div>
      <div class="form-group form-group--full" id="category-account-group">
        <label style="display:flex; align-items:center; gap: var(--spacing-2);">
          <input type="checkbox" id="m-isCategoryAccount" ${account && account.isCategoryAccount === false ? '' : 'checked'} />
          يظهر كبند قابل للاختيار عند تسجيل مصروف/إيراد/مشترى
        </label>
        <span style="font-size:12px; color: var(--color-text-secondary);">أطفئها لحساب "تحكّم" داخلي (مثل مردودات الذمم أو تكلفة المبيعات) لا يجب اختياره يدويًا من نماذج المصروفات/الإيرادات/المشتريات</span>
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
      const newType = document.getElementById('m-type').value;
      const newIsPostable = document.getElementById('m-isPostable').checked;
      const parentCode = document.getElementById('m-parentCode').value || null;

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

      // فحص دفاعي أخير: الأب المختار يجب ألا يكون الحساب نفسه ولا أحد أحفاده (استُبعدوا أصلًا من القائمة)
      if (isEdit && parentCode && excludedCodes.has(parentCode)) {
        showToast('لا يمكن اختيار الحساب نفسه أو أحد أبنائه كحساب أب', 'error');
        return;
      }

      const data = {
        code,
        name: document.getElementById('m-name').value.trim(),
        type: newType,
        parentCode,
        financialStatement: document.getElementById('m-financialStatement').value,
        isPostable: newIsPostable,
        normalBalance: document.getElementById('m-normalBalance').value,
        isCategoryAccount: (newType === 'expense' || newType === 'revenue') && newIsPostable
          ? document.getElementById('m-isCategoryAccount').checked
          : false,
        notes: document.getElementById('m-notes').value.trim(),
      };

      // تعديل حقول "حساسة" (تؤثر مباشرة على الحركات المرحّلة سابقًا) على حساب له حركات فعلية — تأكيد إضافي
      // صريح قبل الحفظ (window.confirm الأصلي بدل نافذة منبثقة متداخلة، النافذة الحالية أصلاً مفتوحة فوقها)
      if (isEdit && hasMovements) {
        const sensitiveFieldsChanged = code !== account.code
          || newType !== account.type
          || newIsPostable !== (account.isPostable !== false)
          || data.normalBalance !== (account.normalBalance || ACCOUNT_NORMAL_BALANCE_BY_TYPE[account.type] || 'debit')
          || parentCode !== (account.parentCode || null);
        if (sensitiveFieldsChanged) {
          const confirmed = window.confirm(
            'هذا الحساب له حركات مرحّلة بالفعل في قيود يومية سابقة، وأنت على وشك تعديل الكود/النوع/الطبيعة/قابل للترحيل/الحساب الأب.\n' +
            'هذا قد يؤثر على دقة الأرصدة والتقارير المحاسبية لتلك الحركات القديمة.\n\n' +
            'هل تريد المتابعة والحفظ رغم ذلك؟'
          );
          if (!confirmed) return;
        }
      }

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

  const typeSelect = document.getElementById('m-type');
  const categoryAccountGroup = document.getElementById('category-account-group');
  const postableCheckbox = document.getElementById('m-isPostable');
  const categoryCheckbox = document.getElementById('m-isCategoryAccount');
  const toggleCategoryAccountGroup = () => {
    const t = typeSelect.value;
    const postable = postableCheckbox.checked;
    const isCategoryType = t === 'expense' || t === 'revenue';
    categoryAccountGroup.style.display = isCategoryType && postable ? '' : 'none';
    if (!isCategoryType || !postable) categoryCheckbox.checked = false;
  };
  typeSelect.addEventListener('change', toggleCategoryAccountGroup);
  postableCheckbox.addEventListener('change', toggleCategoryAccountGroup);
  toggleCategoryAccountGroup();

  if (isEdit) {
    document.getElementById('delete-account-btn').addEventListener('click', async () => {
      const inUse = await isAccountInUse(account.id);
      if (inUse) {
        showToast('لا يمكن حذف هذا الحساب لأنه مستخدم في قيود يومية أو له حسابات أبناء أو مرتبط كبند في سجلات', 'error');
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
