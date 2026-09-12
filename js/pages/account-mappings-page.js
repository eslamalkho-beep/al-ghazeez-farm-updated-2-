// js/pages/account-mappings-page.js
// شاشة "ربط العمليات بالحسابات": تعرض كل نقطة ترحيل تلقائي مع حسابها الحالي (مخصص أو افتراضي) وتسمح بتغييره
// من شجرة الحسابات — الحفظ فوري (setAccountMapping في account-mapping-service.js) ويُطبق على القيود الجديدة فقط

let _mappingsAccounts = [];

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('accounting');
  renderSidebar('accounting-mappings');
  renderHeader('ربط العمليات بالحسابات');

  const [accounts, mappings] = await Promise.all([getAllAccounts(), loadAccountMappings()]);
  _mappingsAccounts = accounts.sort((a, b) => (a.code || '').localeCompare(b.code || ''));

  const container = document.getElementById('mappings-content');
  container.innerHTML = ACCOUNT_MAPPING_GROUPS.map(group => {
    const defs = ACCOUNT_MAPPING_DEFINITIONS.filter(d => d.group === group.key);
    const rowsHtml = defs.map(def => _mappingRowHtml(def, mappings)).join('');
    return `
      <div class="card" style="margin-bottom: var(--spacing-3);">
        <div class="card__header"><h3>${group.label}</h3></div>
        <div style="display:flex; flex-direction:column;">
          ${rowsHtml}
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('.mapping-select').forEach(select => {
    select.addEventListener('change', async () => {
      const key = select.dataset.key;
      await setAccountMapping(key, select.value || null);
      showToast('تم حفظ الربط', 'success');
      _refreshMappingRow(key);
    });
  });

  container.querySelectorAll('.mapping-reset').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      const definition = ACCOUNT_MAPPING_DEFINITIONS.find(d => d.key === key);
      const select = container.querySelector(`.mapping-select[data-key="${key}"]`);
      if (select && definition) {
        select.value = definition.defaultCode;
        select.dispatchEvent(new Event('change'));
      }
    });
  });

  // المفاتيح المركّبة (تكويد لكل بند + حسابات أطراف) — تفويض عام على المستند لأن الصفوف تُبنى ديناميكيًا
  document.addEventListener('change', async (e) => {
    if (!e.target.classList.contains('dyn-mapping-select')) return;
    await setAccountMapping(e.target.dataset.key, e.target.value || null);
    showToast('تم حفظ الربط', 'success');
  });

  await _renderDynamicMappings();
});

function _effectiveCode(definition, mappings) {
  return resolveMappedAccountCode(definition.key, mappings);
}

function _accountOptionHtml(account, selectedCode) {
  const selected = account.code === selectedCode ? 'selected' : '';
  return `<option value="${account.code}" ${selected}>${account.code} - ${account.name}</option>`;
}

function _mappingRowHtml(definition, mappings) {
  const effectiveCode = _effectiveCode(definition, mappings);
  const isCustom = !!mappings[definition.key];
  const effectiveAccount = _mappingsAccounts.find(a => a.code === effectiveCode);

  return `
    <div class="mapping-row" data-key="${definition.key}" style="display:flex; gap: var(--spacing-3); align-items:flex-start; padding: var(--spacing-3); border-bottom: 1px solid var(--color-border); flex-wrap: wrap;">
      <div style="flex:1; min-width: 260px;">
        <div style="font-weight: 600; font-size: 14px; display:flex; align-items:center; gap: var(--spacing-2); flex-wrap: wrap;">
          ${definition.label}
          ${isCustom ? '<span class="badge badge--blue">مخصص</span>' : '<span class="badge badge--gray">افتراضي</span>'}
        </div>
        <div style="font-size: 12px; color: var(--color-text-secondary); margin-top: 2px;">${definition.note}</div>
        <div class="mapping-effective" style="font-size: 12px; margin-top: 6px; color: var(--color-primary-green-dark);">
          الحساب الحالي: <strong>${effectiveAccount ? `${effectiveAccount.code} - ${effectiveAccount.name}` : 'غير موجود في الشجرة!'}</strong>
        </div>
      </div>
      <div style="width: 340px; max-width: 100%;">
        <select class="form-control mapping-select" data-key="${definition.key}">
          ${_mappingsAccounts.map(a => _accountOptionHtml(a, effectiveCode)).join('')}
        </select>
        <button type="button" class="btn btn--sm mapping-reset" data-key="${definition.key}" style="margin-top: var(--spacing-2); display: ${isCustom ? '' : 'none'};">
          إعادة إلى الافتراضي (${definition.defaultCode})
        </button>
      </div>
    </div>`;
}

async function _refreshMappingRow(key) {
  const mappings = await loadAccountMappings();
  const definition = ACCOUNT_MAPPING_DEFINITIONS.find(d => d.key === key);
  if (!definition) return;
  const row = document.querySelector(`.mapping-row[data-key="${key}"]`);
  if (!row) return;
  row.outerHTML = _mappingRowHtml(definition, mappings);

  const newRow = document.querySelector(`.mapping-row[data-key="${key}"]`);
  newRow.querySelector('.mapping-select').addEventListener('change', async (e) => {
    await setAccountMapping(key, e.target.value || null);
    showToast('تم حفظ الربط', 'success');
    _refreshMappingRow(key);
  });
  newRow.querySelector('.mapping-reset').addEventListener('click', () => {
    const select = newRow.querySelector('.mapping-select');
    select.value = definition.defaultCode;
    select.dispatchEvent(new Event('change'));
  });
}

// ===== التكويد التفصيلي (مفاتيح مركّبة ديناميكية خارج ACCOUNT_MAPPING_DEFINITIONS) =====

function _allAccountsSelectHtml(key, currentCode, accounts) {
  const options = accounts
    .map(a => `<option value="${a.code}" ${currentCode === a.code ? 'selected' : ''}>${a.code} - ${a.name}</option>`)
    .join('');
  return `<select class="form-control dyn-mapping-select" data-key="${key}" style="max-width:250px;">
    <option value="">— استخدام العام —</option>
    ${options}
  </select>`;
}

function _dynamicHeaderHtml(labels) {
  return `<div style="display:grid; grid-template-columns: ${labels.map(() => '1fr').join(' ')}; gap: var(--spacing-2); font-size:12px; font-weight:600; color: var(--color-text-secondary); padding: var(--spacing-2) 0; border-bottom: 2px solid var(--color-border); margin-top: var(--spacing-2);">
    ${labels.map(l => `<div>${l}</div>`).join('')}
  </div>`;
}

// تكويد لكل بند مصروف: المخزون المرتبط + حساب الدفع لكل طريقة (catInventory/catPayCash/catPayBank/catPayCredit:<id>)
// وتكويد لكل بند إيراد: حساب التحصيل لكل طريقة (catReceiveCash/catReceiveBank/catReceiveCredit:<id>) —
// وأخيرًا حساب ذمم مخصص لكل طرف (partyAccount:<partyId>). ⚠️ المشتريات لا تظهر هنا بعد الآن (كانت تُدرَج ضمن
// نفس صفوف expenseCats قبل أن تصير بنودها حسابات مخزون فرع 113 — getPurchaseCategoryAccounts في
// accounting-service.js، انظر CLAUDE.md) — syncPurchaseJournalEntry يبحث عن نفس مفاتيح
// catPayCash/Bank/Credit:<categoryAccount.id> لكن categoryAccount.id صار الآن معرّف حساب مخزون لا حساب مصروف،
// فلا صف يطابقه هنا؛ يتدهور بأمان لمفاتيح purchasePayCash/Bank/Credit العامة (تحت "طرق الدفع" أعلى الصفحة)
// بدل تخصيص لكل بند على حدة
async function _renderDynamicMappings() {
  const [expenseCats, revenueCats, parties, accounts, mappings] = await Promise.all([
    getCategoryAccounts('expense'),
    getCategoryAccounts('revenue'),
    getAllParties(),
    getAllAccounts(),
    loadAccountMappings(),
  ]);
  accounts.sort((a, b) => (a.code || '').localeCompare(b.code || ''));

  const expenseContainer = document.getElementById('category-mappings-expense');
  const revenueContainer = document.getElementById('category-mappings-revenue');
  const partyContainer = document.getElementById('party-mappings');

  if (expenseContainer) {
    const rows = expenseCats.map(cat => `
      <div style="display:grid; grid-template-columns: 1.4fr 1fr 1fr 1fr 1fr; gap: var(--spacing-2); align-items:center; padding: var(--spacing-2) 0; border-bottom: 1px solid var(--color-border);">
        <div style="font-size:13px;"><strong>${cat.code}</strong> — ${cat.name}</div>
        <div>${_allAccountsSelectHtml(`catInventory:${cat.id}`, mappings[`catInventory:${cat.id}`] || '', accounts)}</div>
        <div>${_allAccountsSelectHtml(`catPayCash:${cat.id}`, mappings[`catPayCash:${cat.id}`] || '', accounts)}</div>
        <div>${_allAccountsSelectHtml(`catPayBank:${cat.id}`, mappings[`catPayBank:${cat.id}`] || '', accounts)}</div>
        <div>${_allAccountsSelectHtml(`catPayCredit:${cat.id}`, mappings[`catPayCredit:${cat.id}`] || '', accounts)}</div>
      </div>`).join('');
    expenseContainer.innerHTML = _dynamicHeaderHtml(['البند', 'المخزون المرتبط (اختياري)', 'الدفع نقدي', 'الدفع تحويل/بنك', 'الدفع آجل (مورّد)']) + rows
      || '<div class="empty-state" style="padding: var(--spacing-3);">لا توجد بنود مصروفات/مشتريات مكوَّدة</div>';
  }

  if (revenueContainer) {
    const rows = revenueCats.map(cat => `
      <div style="display:grid; grid-template-columns: 1.4fr 1fr 1fr 1fr; gap: var(--spacing-2); align-items:center; padding: var(--spacing-2) 0; border-bottom: 1px solid var(--color-border);">
        <div style="font-size:13px;"><strong>${cat.code}</strong> — ${cat.name}</div>
        <div>${_allAccountsSelectHtml(`catReceiveCash:${cat.id}`, mappings[`catReceiveCash:${cat.id}`] || '', accounts)}</div>
        <div>${_allAccountsSelectHtml(`catReceiveBank:${cat.id}`, mappings[`catReceiveBank:${cat.id}`] || '', accounts)}</div>
        <div>${_allAccountsSelectHtml(`catReceiveCredit:${cat.id}`, mappings[`catReceiveCredit:${cat.id}`] || '', accounts)}</div>
      </div>`).join('');
    revenueContainer.innerHTML = _dynamicHeaderHtml(['البند', 'التحصيل نقدي', 'التحصيل تحويل/بنك', 'الآجل (أفراد/سوق...)']) + rows
      || '<div class="empty-state" style="padding: var(--spacing-3);">لا توجد بنود إيرادات مكوَّدة</div>';
  }

  if (partyContainer) {
    const partyCodesByType = {
      client: ['112', '11201', '11202', '11203'],
      supplier: ['211', '21101', '21102', '21103', '21104', '21105'],
      partner: ['3010'],
    };
    const rows = parties.map(party => {
      const allowed = partyCodesByType[party.type] || [];
      const currentCode = mappings[`partyAccount:${party.id}`] || '';
      const options = accounts.filter(a => allowed.includes(a.code) || a.code === currentCode);
      const partyLabel = `${PARTY_TYPE_LABELS[party.type] || party.type} — ${party.name}`;
      return `
        <div style="display:grid; grid-template-columns: 1.4fr 1fr; gap: var(--spacing-2); align-items:center; padding: var(--spacing-2) 0; border-bottom: 1px solid var(--color-border);">
          <div style="font-size:13px;"><strong>${partyLabel}</strong></div>
          <div>${_allAccountsSelectHtml(`partyAccount:${party.id}`, currentCode, options)}</div>
        </div>`;
    }).join('');
    partyContainer.innerHTML = _dynamicHeaderHtml(['الطرف', 'حساب الذمم المخصص']) + rows
      || '<div class="empty-state" style="padding: var(--spacing-3);">لا توجد أطراف مكوَّدة</div>';
  }
}
