// js/pages/custody-hub-page.js
// مدخل وحدة "إدارة العهد" — قائمة بالعمليات الست + ملخّص سريع + تنبيهات حيّة

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('custody');
  renderSidebar('custody');
  renderHeader('إدارة العهد');

  const thresholdInput = document.getElementById('alert-threshold-input');
  thresholdInput.value = localStorage.getItem('custodyAlertThreshold') || '';
  document.getElementById('save-threshold-btn').addEventListener('click', () => {
    const value = Number(thresholdInput.value || 0);
    if (value > 0) localStorage.setItem('custodyAlertThreshold', String(value));
    else localStorage.removeItem('custodyAlertThreshold');
    showToast('تم حفظ الحد المالي', 'success');
    _renderAlerts();
  });

  _renderMenu();
  await _renderKpis();
  await _renderAlerts();
});

function _renderMenu() {
  const items = [
    { label: 'إصدار عهدة', desc: 'تسجيل عهدة جديدة نقدية أو عينية لموظف', href: 'custody-issue.html', icon: '➕', tone: 'green' },
    { label: 'تصفية عهدة', desc: 'الإغلاق الطبيعي: فواتير معتمدة و/أو نقد مرتجع، أو رد أصناف', href: 'custody-liquidate.html', icon: '🧾', tone: 'green' },
    { label: 'تسوية عهدة', desc: 'استثناءات: تحميل الموظف، خصم راتب، إلغاء بقرار الإدارة، نقل رصيد...', href: 'custody-settle.html', icon: '✔️', tone: 'blue' },
    { label: 'كشف حساب الموظف', desc: 'كل حركات موظف واحد خلال فترة + الرصيد', href: 'employee-statement.html', icon: '📄', tone: 'blue' },
    { label: 'سجل العهد', desc: 'كل العهد المسجّلة بحالاتها', href: 'custody-list.html', icon: '📋', tone: 'blue' },
    { label: 'التقارير', desc: '9 تقارير: المفتوحة، المتأخرة، حسب الموظف/النوع/الفترة...', href: '../reports/custody-reports.html', icon: '📊', tone: 'blue' },
    { label: 'محفظة عهد الموظف', desc: 'صفحة مستقلة لكل موظف بسجلّه الزمني الكامل', href: 'employee-wallet.html', icon: '👤', tone: 'green' },
  ];
  document.getElementById('custody-hub-menu').innerHTML = kpiGrid(
    items.map(i => ({ value: i.label, label: i.desc, tone: i.tone, icon: i.icon, href: i.href })),
    3
  );
}

async function _renderKpis() {
  const items = await getAllCustodyItems();
  const openItems = items.filter(i => i.status === 'open' || i.status === 'partially_settled');
  const overdueCount = openItems.filter(i => getEffectiveCustodyStatus(i) === 'overdue').length;
  const totalRemaining = openItems.reduce((s, i) => s + remainingCustodyAmount(i), 0);
  const employeesWithBalance = new Set(openItems.filter(i => remainingCustodyAmount(i) > 0.01).map(i => i.employeeId)).size;

  document.getElementById('custody-hub-kpis').innerHTML = kpiGrid([
    { value: formatNumber(openItems.length), label: 'عهد مفتوحة/جزئية', tone: 'blue', icon: '📦' },
    { value: formatCurrency(totalRemaining), label: 'إجمالي الأرصدة المتبقية', tone: 'red', icon: '💰' },
    { value: formatNumber(overdueCount), label: 'عهد متأخرة', tone: 'red', icon: '⏰' },
    { value: formatNumber(employeesWithBalance), label: 'موظفون عليهم أرصدة', tone: 'green', icon: '👥' },
  ]);
}

async function _renderAlerts() {
  const items = await getAllCustodyItems();
  const openItems = items.filter(i => i.status === 'open' || i.status === 'partially_settled');
  const threshold = Number(localStorage.getItem('custodyAlertThreshold') || 0);
  const now = Date.now();
  const STALE_MS = 30 * 24 * 60 * 60 * 1000;

  const alerts = [];
  const overdue = openItems.filter(i => getEffectiveCustodyStatus(i) === 'overdue');
  if (overdue.length) alerts.push(`⏰ يوجد ${formatNumber(overdue.length)} عهدة انتهت مدتها المتوقعة ولم تُسوَّ بعد`);

  const stale = openItems.filter(i => i.createdAt && (now - new Date(i.createdAt).getTime()) > STALE_MS);
  if (stale.length) alerts.push(`🕓 يوجد ${formatNumber(stale.length)} عهدة مفتوحة منذ أكثر من 30 يومًا دون تسوية`);

  const employeesWithBalance = new Set(openItems.filter(i => remainingCustodyAmount(i) > 0.01).map(i => i.employeeId)).size;
  if (employeesWithBalance) alerts.push(`👥 يوجد ${formatNumber(employeesWithBalance)} موظف عليه رصيد عهدة مفتوح`);

  if (threshold > 0) {
    const overThreshold = openItems.filter(i => remainingCustodyAmount(i) > threshold);
    if (overThreshold.length) alerts.push(`🔴 يوجد ${formatNumber(overThreshold.length)} عهدة تجاوز رصيدها المتبقي الحد المالي المحدد (${formatCurrency(threshold)})`);
  }

  const card = document.getElementById('custody-alerts-card');
  const list = document.getElementById('custody-alerts-list');
  if (!alerts.length) { card.style.display = 'none'; return; }
  card.style.display = '';
  list.innerHTML = alerts.map(a => `<p style="padding:6px 0; font-size:13.5px;">${a}</p>`).join('');
}
