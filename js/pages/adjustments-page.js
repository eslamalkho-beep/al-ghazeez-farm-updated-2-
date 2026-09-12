// js/pages/adjustments-page.js

let _adjustmentsCache = [];
let _expenseAccountsCache = [];
let _revenueAccountsCache = [];
let _cashBankAccountsCache = []; // [{code, name}, ...] لحسابي الصندوق/البنك (من ربط العمليات بالحسابات)

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('accounting');
  renderSidebar('accounting-adjustments');
  renderHeader('التسويات المحاسبية');

  document.getElementById('adjustments-quick-links').innerHTML = kpiGrid([
    { label: 'فروقات الجرد', icon: '📦', tone: 'blue', href: '../inventory/stock-counts.html' },
    { label: 'تسويات العهد', icon: '🧾', tone: 'green', href: '../custody/custody-settle.html' },
    { label: 'تسويات العملاء والموردين', icon: '🤝', tone: 'red', href: '../parties/parties-hub.html' },
  ], 3);

  const [allAccounts, mappings] = await Promise.all([getAllAccounts(), loadAccountMappings()]);
  _expenseAccountsCache = await getCategoryAccounts('expense');
  _revenueAccountsCache = await getCategoryAccounts('revenue');
  const cashAccount = getMappedAccount('cash', allAccounts, mappings);
  const bankAccount = getMappedAccount('bank', allAccounts, mappings);
  _cashBankAccountsCache = [cashAccount, bankAccount].filter(Boolean);

  document.getElementById('cashAccountCode').innerHTML = _cashBankAccountsCache
    .map(a => `<option value="${a.code}">${a.name}</option>`).join('');

  document.getElementById('date').value = todayIso();
  document.getElementById('type').addEventListener('change', _toggleTypeFields);
  _toggleTypeFields();

  document.getElementById('adjustment-form').addEventListener('submit', _handleSubmit);

  await _refreshAdjustmentsTable();
});

function _toggleTypeFields() {
  const type = document.getElementById('type').value;
  const categoryGroup = document.getElementById('category-account-group');
  const cashGroup = document.getElementById('cash-account-group');
  const directionGroup = document.getElementById('direction-group');
  const categoryLabel = document.getElementById('category-account-label');
  const categorySelect = document.getElementById('categoryAccountId');

  const needsCategoryAtCreation = type === 'accruedExpense' || type === 'accruedRevenue';
  const needsCashAtCreation = type === 'prepaidExpense' || type === 'deferredRevenue' || type === 'cashDifference';

  categoryGroup.style.display = needsCategoryAtCreation ? '' : 'none';
  cashGroup.style.display = needsCashAtCreation ? '' : 'none';
  directionGroup.style.display = type === 'cashDifference' ? '' : 'none';

  if (needsCategoryAtCreation) {
    const isExpense = type === 'accruedExpense';
    categoryLabel.textContent = isExpense ? 'حساب المصروف' : 'حساب الإيراد';
    const list = isExpense ? _expenseAccountsCache : _revenueAccountsCache;
    categorySelect.innerHTML = list.map(a => `<option value="${a.id}">${a.code} - ${a.name}</option>`).join('');
  }
}

async function _handleSubmit(e) {
  e.preventDefault();

  const type = document.getElementById('type').value;
  const validations = [
    { fieldId: 'date', validatorFn: isValidDate, message: 'التاريخ مطلوب' },
    { fieldId: 'amount', validatorFn: isPositiveNumber, message: 'أدخل مبلغًا صحيحًا' },
  ];
  if (type === 'accruedExpense' || type === 'accruedRevenue') {
    validations.push({ fieldId: 'categoryAccountId', validatorFn: isRequired, message: 'يرجى اختيار الحساب' });
  }
  if (type === 'prepaidExpense' || type === 'deferredRevenue' || type === 'cashDifference') {
    validations.push({ fieldId: 'cashAccountCode', validatorFn: isRequired, message: 'يرجى اختيار الصندوق أو البنك' });
  }

  const isValid = validateForm(validations);
  if (!isValid) return;

  const date = document.getElementById('date').value;
  if (!(await guardPeriodOpenForSave(date))) return;

  const data = {
    type,
    date,
    amount: Number(document.getElementById('amount').value),
    description: document.getElementById('description').value.trim(),
    categoryAccountId: document.getElementById('categoryAccountId').value || null,
    cashAccountCode: document.getElementById('cashAccountCode').value || null,
    direction: type === 'cashDifference' ? document.getElementById('direction').value : null,
  };

  const saveBtn = document.getElementById('save-adjustment-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'جاري الحفظ...';

  try {
    await createAdjustment(data);
    showToast('تم حفظ التسوية بنجاح', 'success');
    document.getElementById('adjustment-form').reset();
    document.getElementById('date').value = todayIso();
    _toggleTypeFields();
    await _refreshAdjustmentsTable();
  } catch (err) {
    showToast(err.message || 'حدث خطأ أثناء حفظ التسوية', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'حفظ التسوية';
  }
}

function _handleSettleClick(id) {
  const adjustment = _adjustmentsCache.find(a => a.id === id);
  if (!adjustment) return;

  const needsCash = adjustment.type === 'accruedExpense' || adjustment.type === 'accruedRevenue';
  const isExpenseSide = adjustment.type === 'accruedExpense' || adjustment.type === 'prepaidExpense';
  const categoryList = isExpenseSide ? _expenseAccountsCache : _revenueAccountsCache;

  const fieldHtml = needsCash
    ? `<div class="form-group">
        <label for="settle-cash">الصندوق أو البنك <span class="required">*</span></label>
        <select id="settle-cash" class="form-control">${_cashBankAccountsCache.map(a => `<option value="${a.code}">${a.name}</option>`).join('')}</select>
      </div>`
    : `<div class="form-group">
        <label for="settle-category">${isExpenseSide ? 'حساب المصروف' : 'حساب الإيراد'} <span class="required">*</span></label>
        <select id="settle-category" class="form-control">${categoryList.map(a => `<option value="${a.id}">${a.code} - ${a.name}</option>`).join('')}</select>
      </div>`;

  openModal(`
    <p>تسوية "${ADJUSTMENT_TYPE_LABELS[adjustment.type]}" بمبلغ ${formatCurrency(adjustment.amount)}.</p>
    <div class="form-group">
      <label for="settle-date">تاريخ التسوية <span class="required">*</span></label>
      <input type="date" id="settle-date" class="form-control" value="${todayIso()}" />
    </div>
    ${fieldHtml}
  `, {
    title: 'تسوية',
    confirmLabel: 'تسوية',
    cancelLabel: 'إلغاء',
    onConfirm: async () => {
      const date = document.getElementById('settle-date').value;
      if (!date) { showToast('التاريخ مطلوب', 'error'); return; }
      if (!(await guardPeriodOpenForSave(date))) return;

      const input = { date };
      if (needsCash) {
        input.cashAccountCode = document.getElementById('settle-cash').value;
      } else {
        input.categoryAccountId = document.getElementById('settle-category').value;
      }

      try {
        await settleAdjustment(id, input);
        showToast('تمت التسوية بنجاح', 'success');
        closeModal();
        await _refreshAdjustmentsTable();
      } catch (err) {
        showToast(err.message || 'حدث خطأ أثناء التسوية', 'error');
      }
    },
  });
}

function _handleDeleteClick(id) {
  confirmDelete('هل أنت متأكد من حذف هذه التسوية؟ سيُحذف أيضًا القيد/القيود المحاسبية المرتبطة بها.', async () => {
    await deleteAdjustment(id);
    showToast('تم الحذف بنجاح', 'success');
    await _refreshAdjustmentsTable();
  });
}

async function _refreshAdjustmentsTable() {
  _adjustmentsCache = await getAllAdjustments();

  const rows = _adjustmentsCache.map(a => ({
    ...a,
    typeLabel: ADJUSTMENT_TYPE_LABELS[a.type] || a.type,
    dateLabel: formatDateArabic(a.date),
    amountLabel: formatCurrency(a.amount),
    statusBadge: `<span class="badge ${a.status === 'settled' ? 'badge--green' : 'badge--warning'}">${a.status === 'settled' ? 'مسوّاة' : 'مفتوحة'}</span>`,
    actionsHtml: `
      ${a.status === 'open' ? `<button type="button" class="btn btn--outline btn--sm" onclick="_handleSettleClick(${a.id})">تسوية</button>` : ''}
      <button type="button" class="btn btn--outline btn--sm" onclick="_handleDeleteClick(${a.id})">حذف</button>
    `,
  }));

  renderDataTable('adjustments-table', [
    { key: 'typeLabel', label: 'النوع', sortable: true },
    { key: 'dateLabel', label: 'التاريخ', sortable: true },
    { key: 'amountLabel', label: 'المبلغ', sortable: false },
    { key: 'description', label: 'الوصف', sortable: false },
    { key: 'statusBadge', label: 'الحالة', sortable: false },
    { key: 'actionsHtml', label: 'إجراء', sortable: false },
  ], rows, {
    emptyMessage: 'لا توجد تسويات مسجَّلة بعد',
  });
}
