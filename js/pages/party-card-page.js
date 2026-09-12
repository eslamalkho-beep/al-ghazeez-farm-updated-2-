// js/pages/party-card-page.js
// بطاقة عميل/مورّد (البندان 10/11 من الطلب): صفحة مستقلة — بيانات أساسية + KPIs + آخر عملية بيع/شراء
// وتحصيل/سداد + مرفقات + سجل زمني كامل لكل الحركات (فواتير نقدي/تحويل/آجل معًا + سندات قبض/صرف/مرتجعات/خصومات)

let _allPartiesForCard = [];
let _allRevenuesForCard = [];
let _allPurchasesForCard = [];
let _allPartyTransactionsForCard = [];
let _allFixedAssetsForCard = [];

// خرائط تسمية محلية صغيرة (بدل تحميل revenue-list-page.js/purchase-list-page.js كاملتين لأجل ثابت واحد)
const _CARD_METHOD_LABELS = { cash: 'نقدي', transfer: 'تحويل بنكي', cheque: 'شيك', credit: 'آجل' };

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('parties');
  renderSidebar('parties');
  renderHeader('بطاقة عميل/مورّد/شريك');

  [_allPartiesForCard, _allRevenuesForCard, _allPurchasesForCard, _allPartyTransactionsForCard, _allFixedAssetsForCard] = await Promise.all([
    getAllParties(), getAllRevenues(), getAllPurchases(), getAllPartyTransactions(), getAllFixedAssets(),
  ]);

  document.getElementById('picker-type-filter').addEventListener('change', _renderPicker);

  const urlParams = new URLSearchParams(window.location.search);
  const partyId = urlParams.get('partyId');

  if (partyId) {
    _renderCard(Number(partyId));
  } else {
    _renderPicker();
  }
});

function _partyToneAndIndicator(party) {
  const overdue = isPartyOverdue(party, _allRevenuesForCard, _allPurchasesForCard);
  const balance = computePartyBalance(party, _allRevenuesForCard, _allPurchasesForCard, _allPartyTransactionsForCard, _allFixedAssetsForCard);
  if (overdue) return { tone: 'red', indicator: '🔴' };
  if (Math.abs(balance) > 0.01) return { tone: 'blue', indicator: '🟡' };
  return { tone: 'green', indicator: '🟢' };
}

function _renderPicker() {
  document.getElementById('card-box').style.display = 'none';
  const typeFilter = document.getElementById('picker-type-filter').value;
  const list = _allPartiesForCard.filter(p => !typeFilter || p.type === typeFilter);
  const grid = document.getElementById('party-picker-grid');

  if (!list.length) {
    grid.innerHTML = '<p style="padding:12px; color: var(--color-text-secondary);">لا يوجد عملاء أو موردون أو شركاء مكوَّدون بعد</p>';
    return;
  }

  grid.innerHTML = kpiGrid(list.map(p => {
    const { tone, indicator } = _partyToneAndIndicator(p);
    return {
      value: `${p.name} ${indicator}`,
      label: `${PARTY_TYPE_LABELS[p.type]} — ${p.partyCode || ''}`,
      tone,
      href: `party-card.html?partyId=${p.id}&type=${p.type}`,
    };
  }), 3);
}

// ملخّص جاري الشريك (مقابل getPartyRegistrySummary المقصورة على عميل/مورّد فقط — أعمار الديون/الفواتير
// الآجلة فقط لا تصف حساب جاري) — "المساهمات" = ضخ فلوس + مساهمات أصول، "المسحوبات" = سحب فلوس فقط
function _partnerSummary(party) {
  const capitalIns = _allPartyTransactionsForCard.filter(t => Number(t.partyId) === Number(party.id) && t.type === 'capitalIn');
  const capitalOuts = _allPartyTransactionsForCard.filter(t => Number(t.partyId) === Number(party.id) && t.type === 'capitalOut');
  const contributions = _allFixedAssetsForCard.filter(a => Number(a.partyId) === Number(party.id) && a.paymentMethod === 'partnerContribution');

  const totalContributions = capitalIns.reduce((s, t) => s + Number(t.amount || 0), 0)
    + contributions.reduce((s, a) => s + computeAssetCostBasis(a), 0);
  const totalWithdrawals = capitalOuts.reduce((s, t) => s + Number(t.amount || 0), 0);

  const lastContributionDate = [...capitalIns.map(t => t.date), ...contributions.map(a => a.purchaseDate)]
    .reduce((max, d) => (!max || d > max) ? d : max, null);
  const lastWithdrawalDate = capitalOuts.reduce((max, t) => (!max || t.date > max) ? t.date : max, null);

  const opCount = capitalIns.length + capitalOuts.length + contributions.length
    + _allRevenuesForCard.filter(r => Number(r.partyId) === Number(party.id) && r.receiveMethod === 'credit').length
    + _allPurchasesForCard.filter(p => Number(p.partyId) === Number(party.id) && p.paymentMethod === 'credit').length;

  const balance = computePartyBalance(party, _allRevenuesForCard, _allPurchasesForCard, _allPartyTransactionsForCard, _allFixedAssetsForCard);
  return { totalContributions, totalWithdrawals, lastContributionDate, lastWithdrawalDate, opCount, balance };
}

function _renderCard(partyId) {
  const party = _allPartiesForCard.find(p => p.id === partyId);
  document.getElementById('picker-box').style.display = 'none';
  if (!party) {
    document.getElementById('card-box').innerHTML = '<p>الطرف غير موجود</p>';
    document.getElementById('card-box').style.display = '';
    return;
  }

  const isPartner = party.type === 'partner';
  const summary = isPartner ? null : getPartyRegistrySummary(party, _allRevenuesForCard, _allPurchasesForCard, _allPartyTransactionsForCard);
  const partnerSummary = isPartner ? _partnerSummary(party) : null;
  const { indicator } = _partyToneAndIndicator(party);

  document.getElementById('card-avatar').textContent = party.type === 'client' ? '👤' : (isPartner ? '🤝' : '🏢');
  document.getElementById('card-name').textContent = `${party.name} ${indicator}`;
  document.getElementById('card-type-badge').innerHTML = `<span class="badge ${party.type === 'client' ? 'badge--green' : (isPartner ? 'badge--warning' : 'badge--blue')}">${PARTY_TYPE_LABELS[party.type]}</span>`;
  document.getElementById('card-status-badge').innerHTML = `<span class="badge ${(party.accountStatus || 'active') === 'active' ? 'badge--green' : 'badge--warning'}">${PARTY_ACCOUNT_STATUS_LABELS[party.accountStatus || 'active']}</span>`;
  document.getElementById('card-meta').textContent = [
    party.partyCode, party.phone, party.address, party.bankAccount ? `🏦 ${party.bankAccount}` : null,
  ].filter(Boolean).join(' — ');
  document.getElementById('card-statement-link').href = `party-statement.html?partyId=${party.id}&type=${party.type}`;

  if (isPartner) {
    const balance = partnerSummary.balance;
    document.getElementById('card-kpis').innerHTML = kpiGrid([
      { value: formatCurrency(partnerSummary.totalContributions), label: 'إجمالي المساهمات (ضخ فلوس + أصول)', tone: 'blue', icon: '⬆️' },
      { value: formatCurrency(partnerSummary.totalWithdrawals), label: 'إجمالي المسحوبات', tone: 'green', icon: '⬇️' },
      { value: `${formatCurrency(Math.abs(balance))} ${balance >= 0 ? 'مدين' : 'دائن'}`, label: 'الرصيد الحالي (جاري الشريك)', tone: balance > 0.01 ? 'red' : 'green', icon: '💰' },
      { value: formatNumber(partnerSummary.opCount), label: 'عدد العمليات', tone: 'blue', icon: '🔁' },
    ]);
    document.getElementById('card-last-ops').innerHTML = `
      <span>آخر مساهمة: <strong>${partnerSummary.lastContributionDate ? formatDateArabic(partnerSummary.lastContributionDate) : 'لا يوجد'}</strong></span>
      &nbsp;|&nbsp;
      <span>آخر سحب: <strong>${partnerSummary.lastWithdrawalDate ? formatDateArabic(partnerSummary.lastWithdrawalDate) : 'لا يوجد'}</strong></span>
    `;
  } else {
    document.getElementById('card-kpis').innerHTML = kpiGrid([
      { value: formatCurrency(summary.totalAmount), label: party.type === 'client' ? 'إجمالي المبيعات' : 'إجمالي المشتريات', tone: 'blue', icon: '📦' },
      { value: formatCurrency(summary.settledAmount), label: party.type === 'client' ? 'إجمالي التحصيل' : 'إجمالي السداد', tone: 'green', icon: '💵' },
      { value: `${formatCurrency(Math.abs(summary.balance))} ${summary.balance >= 0 ? 'مدين' : 'دائن'}`, label: 'الرصيد الحالي', tone: summary.balance > 0.01 ? 'red' : 'green', icon: '💰' },
      { value: formatNumber(summary.invoiceCount), label: 'عدد الفواتير', tone: 'blue', icon: '🧾' },
    ]);
    document.getElementById('card-last-ops').innerHTML = `
      <span>${party.type === 'client' ? 'آخر عملية بيع' : 'آخر عملية شراء'}: <strong>${summary.lastInvoiceDate ? formatDateArabic(summary.lastInvoiceDate) : 'لا يوجد'}</strong></span>
      &nbsp;|&nbsp;
      <span>${party.type === 'client' ? 'آخر تحصيل' : 'آخر سداد'}: <strong>${summary.lastSettlementDate ? formatDateArabic(summary.lastSettlementDate) : 'لا يوجد'}</strong></span>
    `;
  }

  _renderTimeline(party);
  document.getElementById('card-box').style.display = '';
}

function _renderTimeline(party) {
  const adjustmentsByRevenueId = new Map();
  const adjustmentsByPurchaseId = new Map();
  _allPartyTransactionsForCard
    .filter(t => Number(t.partyId) === Number(party.id) && (t.type === 'return' || t.type === 'discount'))
    .forEach(t => {
      if (t.linkedRevenueId) adjustmentsByRevenueId.set(t.linkedRevenueId, t);
      if (t.linkedPurchaseId) adjustmentsByPurchaseId.set(t.linkedPurchaseId, t);
    });

  const events = [];

  if (party.type === 'partner') {
    _allRevenuesForCard.filter(r => Number(r.partyId) === Number(party.id) && r.receiveMethod === 'credit').forEach(r => {
      events.push({
        date: r.date, icon: '🧾', title: `بيع آجل - ${r.category}`,
        detail: `${formatCurrency(Math.abs(r.amount))}${r.notes ? ' — ' + r.notes : ''}`,
        attachBtn: `<button type="button" class="btn btn--outline" style="padding:2px 8px; font-size:11px;" onclick="openAttachmentsModal('revenue', ${r.id}, '${r.category}')">📎</button>`,
      });
    });
    _allPurchasesForCard.filter(p => Number(p.partyId) === Number(party.id) && p.paymentMethod === 'credit').forEach(p => {
      events.push({
        date: p.date, icon: '🧾', title: `شراء آجل - ${p.category}`,
        detail: `${formatCurrency(Math.abs(p.amount))}${p.notes ? ' — ' + p.notes : ''}`,
        attachBtn: `<button type="button" class="btn btn--outline" style="padding:2px 8px; font-size:11px;" onclick="openAttachmentsModal('purchase', ${p.id}, '${p.category}')">📎</button>`,
      });
    });
    _allPartyTransactionsForCard.filter(t => Number(t.partyId) === Number(party.id) && (t.type === 'capitalIn' || t.type === 'capitalOut')).forEach(t => {
      events.push({
        date: t.date, icon: t.type === 'capitalIn' ? '⬆️' : '⬇️',
        title: `${PARTY_TRANSACTION_TYPE_LABELS[t.type]} ${t.voucherNumber}`,
        detail: `${formatCurrency(t.amount)} (${PARTY_TRANSACTION_METHOD_LABELS[t.method] || t.method})${t.description ? ' — ' + t.description : ''}`,
        attachBtn: `<button type="button" class="btn btn--outline" style="padding:2px 8px; font-size:11px;" onclick="openAttachmentsModal('partyTransaction', ${t.id}, '${t.voucherNumber}')">📎</button>`,
      });
    });
    _allFixedAssetsForCard.filter(a => Number(a.partyId) === Number(party.id) && a.paymentMethod === 'partnerContribution').forEach(a => {
      events.push({
        date: a.purchaseDate, icon: '🏗️', title: `مساهمة أصل - ${a.name}`,
        detail: `${formatCurrency(computeAssetCostBasis(a))} (${a.assetCode || ''})`,
        attachBtn: `<button type="button" class="btn btn--outline" style="padding:2px 8px; font-size:11px;" onclick="openAttachmentsModal('fixedAsset', ${a.id}, '${a.name}')">📎</button>`,
      });
    });
  } else if (party.type === 'client') {
    _allRevenuesForCard.filter(r => Number(r.partyId) === Number(party.id)).forEach(r => {
      const adj = adjustmentsByRevenueId.get(r.id);
      events.push({
        date: r.date,
        icon: adj ? (adj.type === 'return' ? '↩️' : '➖') : '🧾',
        title: adj ? `${PARTY_TRANSACTION_TYPE_LABELS[adj.type]} ${adj.voucherNumber}` : `فاتورة بيع - ${r.category}`,
        detail: `${formatCurrency(Math.abs(r.amount))} (${_CARD_METHOD_LABELS[r.receiveMethod] || r.receiveMethod})${r.notes ? ' — ' + r.notes : ''}`,
        attachBtn: `<button type="button" class="btn btn--outline" style="padding:2px 8px; font-size:11px;" onclick="openAttachmentsModal('revenue', ${r.id}, '${r.category}')">📎</button>`,
      });
    });
  } else {
    _allPurchasesForCard.filter(p => Number(p.partyId) === Number(party.id)).forEach(p => {
      const adj = adjustmentsByPurchaseId.get(p.id);
      events.push({
        date: p.date,
        icon: adj ? (adj.type === 'return' ? '↩️' : '➖') : '🧾',
        title: adj ? `${PARTY_TRANSACTION_TYPE_LABELS[adj.type]} ${adj.voucherNumber}` : `فاتورة شراء - ${p.category}`,
        detail: `${formatCurrency(Math.abs(p.amount))} (${_CARD_METHOD_LABELS[p.paymentMethod] || p.paymentMethod})${p.notes ? ' — ' + p.notes : ''}`,
        attachBtn: `<button type="button" class="btn btn--outline" style="padding:2px 8px; font-size:11px;" onclick="openAttachmentsModal('purchase', ${p.id}, '${p.category}')">📎</button>`,
      });
    });
  }

  // سندات القبض/الصرف (عميل/مورّد فقط — للشريك أُضيفت ضخ/سحب الفلوس أعلاه بالفعل ضمن فرعه الخاص)
  if (party.type === 'client' || party.type === 'supplier') {
    const txType = party.type === 'client' ? 'collection' : 'payment';
    _allPartyTransactionsForCard
      .filter(t => Number(t.partyId) === Number(party.id) && t.type === txType)
      .forEach(t => {
        events.push({
          date: t.date,
          icon: '💵',
          title: `${PARTY_TRANSACTION_TYPE_LABELS[t.type]} ${t.voucherNumber}`,
          detail: `${formatCurrency(t.amount)} (${PARTY_TRANSACTION_METHOD_LABELS[t.method] || t.method})${t.description ? ' — ' + t.description : ''}`,
          attachBtn: `<button type="button" class="btn btn--outline" style="padding:2px 8px; font-size:11px;" onclick="openAttachmentsModal('partyTransaction', ${t.id}, '${t.voucherNumber}')">📎</button>`,
        });
      });
  }

  events.sort((a, b) => (a.date === b.date ? 0 : (a.date < b.date ? 1 : -1))); // تنازليًا

  const container = document.getElementById('card-timeline');
  if (!events.length) {
    container.innerHTML = '<p style="padding:12px; color: var(--color-text-secondary);">لا توجد حركات بعد</p>';
    return;
  }

  container.innerHTML = events.map(e => `
    <div style="display:flex; gap:12px; padding:10px 4px; border-bottom:1px solid var(--color-border);">
      <div style="font-size:20px;">${e.icon}</div>
      <div style="flex:1;">
        <div style="font-weight:700; font-size:13.5px;">${e.title}</div>
        <div style="font-size:12.5px; color: var(--color-text-secondary);">${e.detail}</div>
      </div>
      <div style="font-size:12px; color: var(--color-text-secondary); white-space:nowrap;">${formatDateArabic(e.date)}</div>
      <div>${e.attachBtn}</div>
    </div>
  `).join('');
}
