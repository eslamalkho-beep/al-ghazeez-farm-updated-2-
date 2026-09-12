// js/pages/parties-page.js

let _allPartiesCache = [];
let _allRevenuesCache = [];
let _allPurchasesCache = [];
let _allPartyTransactionsCache = [];
let _allFixedAssetsCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('parties');
  renderSidebar('parties-list');
  renderHeader('إدارة العملاء والموردين');

  if (!hasActionPermission('parties', 'add')) {
    document.getElementById('add-party-btn').style.display = 'none';
  }

  await _refreshParties();
  _renderAlertsBanner();

  document.getElementById('add-party-btn').addEventListener('click', () => _openPartyModal(null));
  document.getElementById('filter-type').addEventListener('change', _drawParties);
});

async function _refreshParties() {
  [_allPartiesCache, _allRevenuesCache, _allPurchasesCache, _allPartyTransactionsCache, _allFixedAssetsCache] = await Promise.all([
    getAllParties(), getAllRevenues(), getAllPurchases(), getAllPartyTransactions(), getAllFixedAssets(),
  ]);
  _drawParties();
}

function _balanceLabel(party) {
  const balance = computePartyBalance(party, _allRevenuesCache, _allPurchasesCache, _allPartyTransactionsCache, _allFixedAssetsCache);
  if (Math.abs(balance) < 0.01) return `<span style="color:var(--color-text-secondary);">0 ر.س</span>`;
  const isDebit = balance > 0;
  const color = isDebit ? 'var(--color-danger, #D6362E)' : 'var(--color-success, #1E9E5A)';
  const label = isDebit ? 'مدين' : 'دائن';
  return `<span style="color:${color}; font-weight:700;">${formatCurrency(Math.abs(balance))} (${label})</span>`;
}

function _drawParties() {
  const typeFilter = document.getElementById('filter-type').value;

  const rows = _allPartiesCache
    .filter(p => !typeFilter || p.type === typeFilter)
    .map(p => ({
      ...p,
      typeBadge: `<span class="badge ${p.type === 'client' ? 'badge--green' : (p.type === 'partner' ? 'badge--warning' : 'badge--blue')}">${PARTY_TYPE_LABELS[p.type] || p.type}</span>`,
      codeLabel: p.partyCode || '-',
      categoryLabel: p.category || '-',
      phoneLabel: p.phone || '-',
      balanceLabel: _balanceLabel(p),
      statusBadge: `<span class="badge ${(p.accountStatus || 'active') === 'active' ? 'badge--green' : 'badge--warning'}">${PARTY_ACCOUNT_STATUS_LABELS[p.accountStatus || 'active']}</span>`,
      locationBtn: p.locationUrl
        ? `<a href="${p.locationUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation();" class="btn btn--outline btn--sm">📍 الموقع</a>`
        : '-',
      statementBtn: `<a href="party-statement.html?partyId=${p.id}&type=${p.type}" onclick="event.stopPropagation();" class="btn btn--outline btn--sm">📄 كشف حساب</a>`,
      cardBtn: `<a href="party-card.html?partyId=${p.id}&type=${p.type}" onclick="event.stopPropagation();" class="btn btn--outline btn--sm">🪪 بطاقة</a>`,
    }));

  renderDataTable('parties-table', [
    { key: 'typeBadge', label: 'النوع', sortable: false },
    { key: 'codeLabel', label: 'الكود', sortable: true },
    { key: 'name', label: 'الاسم', sortable: true },
    { key: 'categoryLabel', label: 'التصنيف', sortable: true },
    { key: 'phoneLabel', label: 'الجوال', sortable: false },
    { key: 'balanceLabel', label: 'الرصيد الحالي', sortable: false },
    { key: 'statusBadge', label: 'الحالة', sortable: false },
    { key: 'locationBtn', label: 'اللوكيشن', sortable: false },
    { key: 'statementBtn', label: 'كشف حساب', sortable: false },
    { key: 'cardBtn', label: 'بطاقة', sortable: false },
  ], rows, {
    onRowClick: (row) => {
      if (!hasActionPermission('parties', 'edit')) {
        showToast('ليس لديك صلاحية تعديل بيانات العملاء والموردين', 'error');
        return;
      }
      _openPartyModal(row);
    },
    emptyMessage: 'لا يوجد عملاء أو موردون مكوّدون بعد',
  });
}

// شريط تنبيهات حيّ (محسوب مباشرة من البيانات المحمَّلة، بمعزل عن مركز الإشعارات — نفس مبدأ renderQuickAlerts
// في dashboard-page.js/_renderAlerts في custody-hub-page.js): تجاوز حد الائتمان + أرصدة مفتوحة
function _renderAlertsBanner() {
  const alerts = [];
  const clients = _allPartiesCache.filter(p => p.type === 'client');
  const suppliers = _allPartiesCache.filter(p => p.type === 'supplier');

  const overLimit = clients.filter(p => {
    if (!(Number(p.creditLimit) > 0)) return false;
    const balance = computePartyBalance(p, _allRevenuesCache, _allPurchasesCache, _allPartyTransactionsCache);
    return balance > Number(p.creditLimit) + 0.01;
  });
  if (overLimit.length) alerts.push(`🔴 يوجد ${formatNumber(overLimit.length)} عميل تجاوز حد الائتمان المحدد له`);

  const debtors = clients.filter(p => computePartyBalance(p, _allRevenuesCache, _allPurchasesCache, _allPartyTransactionsCache) > 0.01);
  if (debtors.length) alerts.push(`💰 يوجد ${formatNumber(debtors.length)} عميل عليه رصيد مدين مفتوح`);

  const payables = suppliers.filter(p => computePartyBalance(p, _allRevenuesCache, _allPurchasesCache, _allPartyTransactionsCache) < -0.01);
  if (payables.length) alerts.push(`📦 يوجد ${formatNumber(payables.length)} مورّد له رصيد مستحق السداد`);

  const card = document.getElementById('party-alerts-card');
  const list = document.getElementById('party-alerts-list');
  if (!alerts.length) { card.style.display = 'none'; return; }
  card.style.display = '';
  list.innerHTML = alerts.map(a => `<p style="padding:6px 0; font-size:13.5px;">${a}</p>`).join('');
}

function _openPartyModal(party) {
  const isEdit = !!party;
  const type = party?.type || 'supplier';
  const html = `
    <form id="party-modal-form" class="form-grid">
      ${isEdit ? `
      <div class="form-group">
        <label>الكود</label>
        <input type="text" class="form-control" value="${party.partyCode || '-'}" disabled />
      </div>` : ''}
      <div class="form-group">
        <label>النوع <span class="required">*</span></label>
        <select id="m-type" class="form-control">
          <option value="client" ${type === 'client' ? 'selected' : ''}>عميل</option>
          <option value="supplier" ${type === 'supplier' ? 'selected' : ''}>مورّد</option>
          <option value="partner" ${type === 'partner' ? 'selected' : ''}>شريك</option>
        </select>
      </div>
      <div class="form-group">
        <label>الاسم <span class="required">*</span></label>
        <input type="text" id="m-name" class="form-control" value="${party?.name || ''}" placeholder="اسم العميل أو المورّد" />
        <span class="form-error">الاسم مطلوب</span>
      </div>
      <div class="form-group">
        <label>التصنيف</label>
        <input type="text" id="m-category" class="form-control" value="${party?.category || ''}" placeholder="مثال: تاجر جملة، مطعم، مزرعة أخرى..." />
      </div>
      <div class="form-group">
        <label>رقم الجوال</label>
        <input type="text" id="m-phone" class="form-control" value="${party?.phone || ''}" placeholder="05xxxxxxxx" />
        <span class="form-error">رقم جوال غير صحيح</span>
      </div>
      <div class="form-group form-group--full">
        <label>العنوان</label>
        <input type="text" id="m-address" class="form-control" value="${party?.address || ''}" />
      </div>
      <div class="form-group form-group--full">
        <label>رابط الموقع (Google Maps)</label>
        <input type="text" id="m-locationUrl" class="form-control" value="${party?.locationUrl || ''}" placeholder="https://maps.google.com/..." />
      </div>
      <div class="form-group" id="m-bankAccount-group" style="display:${type === 'supplier' ? '' : 'none'};">
        <label>الحساب البنكي</label>
        <input type="text" id="m-bankAccount" class="form-control" value="${party?.bankAccount || ''}" placeholder="رقم الآيبان/الحساب" />
      </div>
      <div class="form-group" id="m-creditLimit-group" style="display:${type === 'client' ? '' : 'none'};">
        <label>حد الائتمان (اختياري)</label>
        <input type="number" id="m-creditLimit" class="form-control" value="${party?.creditLimit ?? ''}" min="0" step="0.01" />
      </div>
      <div class="form-group">
        <label>مدة السداد بالأيام (اختياري)</label>
        <input type="number" id="m-paymentTermDays" class="form-control" value="${party?.paymentTermDays ?? ''}" min="0" step="1" placeholder="مثال: 30" />
      </div>
      <div class="form-group">
        <label>الحالة</label>
        <select id="m-accountStatus" class="form-control">
          <option value="active" ${(party?.accountStatus || 'active') === 'active' ? 'selected' : ''}>نشط</option>
          <option value="suspended" ${party?.accountStatus === 'suspended' ? 'selected' : ''}>موقوف</option>
        </select>
      </div>
      <div class="form-group">
        <label>الرصيد الافتتاحي</label>
        <input type="number" id="m-openingBalance" class="form-control" value="${party?.openingBalance ?? 0}" min="0" step="0.01" />
      </div>
      <div class="form-group">
        <label>نوع الرصيد الافتتاحي</label>
        <select id="m-openingBalanceType" class="form-control">
          <option value="debit" ${(party?.openingBalanceType || 'debit') === 'debit' ? 'selected' : ''}>مدين (الطرف مدين لنا)</option>
          <option value="credit" ${party?.openingBalanceType === 'credit' ? 'selected' : ''}>دائن (نحن مدينون له)</option>
        </select>
        ${isEdit ? '<small style="color:var(--color-text-secondary);">تعديل هذا الرصيد يعيد ترحيل قيده المحاسبي بالكامل.</small>' : ''}
      </div>
      <div class="form-group form-group--full">
        <label>ملاحظات</label>
        <textarea id="m-notes" class="form-control" rows="2">${party?.notes || ''}</textarea>
      </div>
      ${isEdit && hasActionPermission('parties', 'delete') ? `
      <div class="form-group form-group--full" style="border-top:1px solid var(--color-border); padding-top: var(--spacing-3);">
        <button type="button" class="btn btn--danger btn--sm" id="delete-party-btn">حذف هذا السجل</button>
      </div>` : ''}
    </form>
  `;

  openModal(html, {
    title: isEdit ? 'تعديل بيانات عميل/مورّد' : 'تكويد عميل/مورّد جديد',
    confirmLabel: 'حفظ',
    onConfirm: async () => {
      const partyType = document.getElementById('m-type').value;
      const name = document.getElementById('m-name').value.trim();
      const phone = document.getElementById('m-phone').value.trim();

      const validations = [
        { fieldId: 'm-name', validatorFn: isRequired, message: 'الاسم مطلوب' },
      ];
      if (phone) {
        validations.push({ fieldId: 'm-phone', validatorFn: isValidPhone, message: 'رقم جوال غير صحيح' });
      }
      const isValid = validateForm(validations);
      if (!isValid) return;

      const taken = await isPartyNameTaken(partyType, name, isEdit ? party.id : null);
      if (taken) {
        showToast('هذا الاسم مستخدم بالفعل لنفس النوع', 'error');
        return;
      }

      const data = {
        type: partyType,
        name,
        category: document.getElementById('m-category').value.trim(),
        phone,
        address: document.getElementById('m-address').value.trim(),
        locationUrl: document.getElementById('m-locationUrl').value.trim(),
        bankAccount: document.getElementById('m-bankAccount').value.trim(),
        creditLimit: document.getElementById('m-creditLimit').value ? Number(document.getElementById('m-creditLimit').value) : null,
        paymentTermDays: document.getElementById('m-paymentTermDays').value ? Number(document.getElementById('m-paymentTermDays').value) : null,
        accountStatus: document.getElementById('m-accountStatus').value,
        openingBalance: Number(document.getElementById('m-openingBalance').value || 0),
        openingBalanceType: document.getElementById('m-openingBalanceType').value,
        notes: document.getElementById('m-notes').value.trim(),
      };

      if (isEdit) {
        await updateParty(party.id, data);
      } else {
        await createParty(data);
      }
      showToast('تم الحفظ بنجاح', 'success');
      closeModal();
      await _refreshParties();
      _renderAlertsBanner();
    },
  });

  document.getElementById('m-type').addEventListener('change', (e) => {
    document.getElementById('m-creditLimit-group').style.display = e.target.value === 'client' ? '' : 'none';
    document.getElementById('m-bankAccount-group').style.display = e.target.value === 'supplier' ? '' : 'none';
  });

  if (isEdit && hasActionPermission('parties', 'delete')) {
    document.getElementById('delete-party-btn').addEventListener('click', () => {
      confirmDelete(`هل أنت متأكد من حذف "${party.name}"؟ لن يؤثر هذا على السجلات السابقة (مبيعات/مشتريات/سندات) المرتبطة به — ستبقى كما هي، وسيُلغى فقط قيد الرصيد الافتتاحي.`, async () => {
        await deleteParty(party.id);
        showToast('تم الحذف بنجاح', 'success');
        await _refreshParties();
        _renderAlertsBanner();
      });
    });
  }
}
