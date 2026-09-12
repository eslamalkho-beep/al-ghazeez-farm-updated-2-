// js/pages/parties-hub-page.js
// مدخل وحدة "العملاء والموردون" — نفس نمط custody-hub-page.js: قائمة بالعمليات + ملخّص سريع + تنبيهات حيّة

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('parties');
  renderSidebar('parties');
  renderHeader('العملاء والموردون');

  _renderMenu();
  await _renderKpis();
  await _renderAlerts();
});

function _renderMenu() {
  const items = [
    { label: 'إدارة العملاء والموردين والشركاء', desc: 'إضافة/تعديل عميل أو مورّد أو شريك، الرصيد الافتتاحي، الحالة', href: 'parties.html', icon: '👥', tone: 'green' },
    { label: 'التحصيل من العملاء', desc: 'سند قبض جديد من عميل بقيد محاسبي تلقائي', href: 'customer-collection.html', icon: '💵', tone: 'blue' },
    { label: 'السداد للموردين', desc: 'سند صرف جديد لمورّد بقيد محاسبي تلقائي', href: 'supplier-payment.html', icon: '💸', tone: 'blue' },
    { label: 'ضخ/سحب فلوس (الشريك)', desc: 'مساهمة نقدية من شريك أو سحب له، على حساب جاري الشريك', href: 'partner-capital.html', icon: '🤝', tone: 'blue' },
    { label: 'كشف حساب عميل/مورّد/شريك', desc: 'رصيد أول المدة + كل الحركات + الرصيد الحالي، طباعة وتصدير', href: 'party-statement.html', icon: '📄', tone: 'blue' },
    { label: 'مرتجعات وخصومات', desc: 'مرتجع/خصم مبيعات يقلّل مديونية العميل، ومرتجع/خصم مشتريات يقلّل المستحق للمورّد', href: 'return-discount.html', icon: '↩️', tone: 'green' },
    { label: 'بطاقة عميل/مورّد/شريك', desc: 'صفحة مستقلة لكل طرف بسجلّه الزمني الكامل', href: 'party-card.html', icon: '🪪', tone: 'green' },
    { label: 'التقارير', desc: 'سجل الأرصدة، أعمار الديون، أعلى العملاء/الموردين، كشف فردي', href: '../reports/party-reports.html', icon: '📊', tone: 'blue' },
  ];
  document.getElementById('parties-hub-menu').innerHTML = kpiGrid(
    items.map(i => ({ value: i.label, label: i.desc, tone: i.tone, icon: i.icon, href: i.href })),
    3
  );
}

async function _renderKpis() {
  const [clients, suppliers, partners, revenues, purchases, partyTransactions, fixedAssets] = await Promise.all([
    getAllParties('client'), getAllParties('supplier'), getAllParties('partner'),
    getAllRevenues(), getAllPurchases(), getAllPartyTransactions(), getAllFixedAssets(),
  ]);

  const totalReceivable = clients.reduce((s, p) => {
    const b = computePartyBalance(p, revenues, purchases, partyTransactions);
    return s + (b > 0 ? b : 0);
  }, 0);
  const totalPayable = suppliers.reduce((s, p) => {
    const b = computePartyBalance(p, revenues, purchases, partyTransactions);
    return s + (b < 0 ? -b : 0);
  }, 0);
  // صافي "جاري الشريك" لكل الشركاء معًا: موجب = الشركاء مدينون للمزرعة، سالب = المزرعة مدينة لهم
  const partnersNetBalance = partners.reduce((s, p) => s + computePartyBalance(p, revenues, purchases, partyTransactions, fixedAssets), 0);

  document.getElementById('parties-hub-kpis').innerHTML = kpiGrid([
    { value: formatNumber(clients.length), label: 'عدد العملاء', tone: 'blue', icon: '🧑‍💼' },
    { value: formatNumber(suppliers.length), label: 'عدد الموردين', tone: 'blue', icon: '🏢' },
    { value: formatNumber(partners.length), label: 'عدد الشركاء', tone: 'blue', icon: '🤝' },
    { value: formatCurrency(totalReceivable), label: 'إجمالي المستحق لنا (ذمم مدينة)', tone: 'red', icon: '💰' },
    { value: formatCurrency(totalPayable), label: 'إجمالي المستحق علينا (ذمم دائنة)', tone: 'green', icon: '💰' },
    { value: `${formatCurrency(Math.abs(partnersNetBalance))} ${partnersNetBalance >= 0 ? 'مدين' : 'دائن'}`, label: 'صافي جاري الشركاء', tone: partnersNetBalance >= 0 ? 'red' : 'green', icon: '🤝' },
  ]);
}

async function _renderAlerts() {
  const [clients, suppliers, revenues, purchases, partyTransactions] = await Promise.all([
    getAllParties('client'), getAllParties('supplier'), getAllRevenues(), getAllPurchases(), getAllPartyTransactions(),
  ]);

  const alerts = [];

  const overLimit = clients.filter(p => {
    if (!(Number(p.creditLimit) > 0)) return false;
    const balance = computePartyBalance(p, revenues, purchases, partyTransactions);
    return balance > Number(p.creditLimit) + 0.01;
  });
  if (overLimit.length) alerts.push(`🔴 يوجد ${formatNumber(overLimit.length)} عميل تجاوز حد الائتمان المحدد له`);

  const overdueClients = clients.filter(p => isPartyOverdue(p, revenues, purchases));
  if (overdueClients.length) alerts.push(`⏰ يوجد ${formatNumber(overdueClients.length)} عميل متأخر في السداد`);

  const overdueSuppliers = suppliers.filter(p => isPartyOverdue(p, revenues, purchases));
  if (overdueSuppliers.length) alerts.push(`⏰ يوجد ${formatNumber(overdueSuppliers.length)} مورّد مستحق سداده`);

  const debtors = clients.filter(p => computePartyBalance(p, revenues, purchases, partyTransactions) > 0.01);
  if (debtors.length) alerts.push(`💰 يوجد ${formatNumber(debtors.length)} عميل عليه رصيد مدين مفتوح`);

  const payables = suppliers.filter(p => computePartyBalance(p, revenues, purchases, partyTransactions) < -0.01);
  if (payables.length) alerts.push(`📦 يوجد ${formatNumber(payables.length)} مورّد له رصيد مستحق السداد`);

  const card = document.getElementById('party-alerts-card');
  const list = document.getElementById('party-alerts-list');
  if (!alerts.length) { card.style.display = 'none'; return; }
  card.style.display = '';
  list.innerHTML = alerts.map(a => `<p style="padding:6px 0; font-size:13.5px;">${a}</p>`).join('');
}
