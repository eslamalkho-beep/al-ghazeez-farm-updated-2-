// js/pages/dashboard-page.js

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth();
  renderSidebar('dashboard');
  renderHeader('لوحة التحكم');

  const [animals, expenses, revenues, purchases, bulkPurchases, bulkSales, births, deaths, healthRecords, custodyItems, employees, inventoryItems, inventoryMovements] = await Promise.all([
    getAllAnimals(),
    getAllExpenses(),
    getAllRevenues(),
    getAllPurchases(),
    getAllBulkPurchases(),
    getAllBulkSales(),
    getAllBirths(),
    getAllDeaths(),
    dbGetAll('HealthRecords'),
    dbGetAll('CustodyItems'),
    dbGetAll('Employees'),
    getAllInventoryItems(),
    getAllInventoryMovements(),
  ]);

  renderKpiCards({ animals, expenses, revenues, purchases, bulkPurchases, bulkSales, births, deaths, healthRecords, custodyItems, employees, inventoryItems, inventoryMovements });
  renderRevenueExpenseChart(expenses, revenues);
  renderHerdTypeChart(animals);
  renderHerdGenderChart(animals);
  renderHerdHealthChart(animals);
  renderBirthsDeathsChart(births, deaths);
  await renderQuickAlerts();
});

function renderKpiCards({ animals, expenses, revenues, purchases, bulkPurchases, bulkSales, births, deaths, healthRecords, custodyItems, employees, inventoryItems, inventoryMovements }) {
  const alive = animals.filter(a => a.status === 'alive');
  const males = alive.filter(a => a.gender === 'male').length;
  const females = alive.filter(a => a.gender === 'female').length;

  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const totalRevenues = revenues.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const totalPurchases = purchases.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  // بيع − تكلفة البضاعة المباعة (COGS) = ربح الجملة الفعلي، لا يظهر إلا عند البيع الفعلي (متوسط تكلفة
  // متحرك مبني على الشراء فقط) — بعكس النموذج القديم الذي كان يحمّل تكلفة الشراء كمصروف فوري بصرف النظر
  // عن البيع، انظر computeBulkGroupBalances في bulk-batch-service.js
  const bulkGroups = computeBulkGroupBalances(bulkPurchases, bulkSales);
  const bulkTotals = bulkGroups.reduce((acc, g) => {
    acc.saleRevenue += g.soldRevenue;
    acc.cogs += g.cogs;
    acc.remainingCount += g.remainingCount;
    return acc;
  }, { saleRevenue: 0, cogs: 0, remainingCount: 0 });
  const totalBulkSales = bulkTotals.saleRevenue;
  const totalBulkCogs = bulkTotals.cogs;
  const bulkRemainingCount = bulkTotals.remainingCount;
  const bulkGrossProfit = totalBulkSales - totalBulkCogs;
  // ⚠️ المشتريات (Purchases) لا تدخل صافي الربح — بندها صار حصرًا حسابات مخزون (فرع 113، انظر
  // getPurchaseCategoryAccounts في accounting-service.js ووصف Purchases في CLAUDE.md)، فتُرسمَل كأصل مخزون
  // (رسملة) لا كتكلفة تشغيلية فورية؛ نفس مبدأ استبعاد مشتريات الجملة (تُرسمَل كأصل "1035" ولا تدخل الربح إلا
  // عبر تكلفة البضاعة المباعة عند البيع الفعلي، totalBulkCogs أدناه). كانت تُطرح بالكامل قبل هذا التغيير
  // بافتراض أنها دومًا تكلفة تشغيلية — لم يعد هذا الافتراض صحيحًا
  const netProfit = totalRevenues + totalBulkSales - totalExpenses - totalBulkCogs;

  const sickCount = alive.filter(a => a.healthStatus === 'sick' || a.healthStatus === 'underTreatment').length;
  const activeEmployees = employees.filter(e => e.status === 'active').length;
  const totalCustodyValue = custodyItems
    .filter(c => c.status === 'open' || c.status === 'partially_settled')
    .reduce((sum, c) => sum + (Number(c.amount || 0) - Number(c.settledAmount || 0)), 0);

  const lowStockCount = inventoryItems.filter(item => computeItemStockLevel(item, inventoryMovements).isLowStock).length;

  const cards = [
    { label: 'إجمالي رؤوس القطيع', value: formatNumber(alive.length), sub: `ذكور ${formatNumber(males)} / إناث ${formatNumber(females)}`, color: 'blue', icon: '🐑' },
    { label: 'المواليد (الإجمالي)', value: formatNumber(births.length), sub: 'سجل الولادات الكامل', color: 'green', icon: '🐣' },
    { label: 'حالات النفوق (الإجمالي)', value: formatNumber(deaths.length), sub: 'سجل النفوق الكامل', color: 'red', icon: '⚠️' },
    { label: 'حيوانات تحت المتابعة', value: formatNumber(sickCount), sub: 'مريض / تحت العلاج', color: 'red', icon: '💊' },
    { label: 'إجمالي الإيرادات', value: formatCurrency(totalRevenues), sub: 'كل الفترات', color: 'green', icon: '💰' },
    { label: 'إجمالي المصروفات', value: formatCurrency(totalExpenses), sub: 'كل الفترات', color: 'red', icon: '🧾' },
    { label: 'إجمالي المشتريات', value: formatCurrency(totalPurchases), sub: 'كل الفترات', color: 'red', icon: '🛒' },
    { label: 'إجمالي ربح الشراء والبيع الجماعي', value: formatCurrency(bulkGrossProfit), sub: 'إيراد البيع − تكلفة البضاعة المباعة', color: bulkGrossProfit >= 0 ? 'green' : 'red', icon: '📦' },
    { label: 'الرؤوس المتبقية من الجملة', value: formatNumber(bulkRemainingCount), sub: 'شراء جملة − بيع جملة (كل الفترات)', color: bulkRemainingCount < 0 ? 'red' : 'blue', icon: '🐐' },
    { label: 'صافي الربح', value: formatCurrency(netProfit), sub: netProfit >= 0 ? 'أداء إيجابي' : 'أداء سلبي', color: netProfit >= 0 ? 'green' : 'red', icon: '📊' },
    { label: 'الموظفون النشطون', value: formatNumber(activeEmployees), sub: `قيمة العهد الحالية: ${formatCurrency(totalCustodyValue)}`, color: 'blue', icon: '👥' },
    { label: 'أصناف تحت حد الطلب', value: formatNumber(lowStockCount), sub: 'من إجمالي أصناف المخزون المكوَّدة', color: lowStockCount > 0 ? 'red' : 'blue', icon: '📉' },
  ];

  const container = document.getElementById('kpi-grid');
  container.innerHTML = cards.map(card => `
    <div class="kpi-card kpi-card--${card.color}">
      <div class="kpi-card__icon">${card.icon}</div>
      <div>
        <div class="kpi-card__value">${card.value}</div>
        <div class="kpi-card__label">${card.label}</div>
        <div class="kpi-card__delta">${card.sub}</div>
      </div>
    </div>
  `).join('');
}

function _lastSixMonthsLabels() {
  const labels = [];
  const keys = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    labels.push(ARABIC_MONTHS[d.getMonth()]);
    keys.push(`${d.getFullYear()}-${d.getMonth()}`);
  }
  return { labels, keys };
}

function _monthKey(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${d.getMonth()}`;
}

function renderRevenueExpenseChart(expenses, revenues) {
  const { labels, keys } = _lastSixMonthsLabels();
  const expenseData = keys.map(key => expenses.filter(e => _monthKey(e.date) === key).reduce((s, e) => s + Number(e.amount || 0), 0));
  const revenueData = keys.map(key => revenues.filter(r => _monthKey(r.date) === key).reduce((s, r) => s + Number(r.amount || 0), 0));

  renderLineChart('revenue-expense-chart', labels, [
    { label: 'الإيرادات', data: revenueData, borderColor: '#1E9E5A', backgroundColor: '#1E9E5A' },
    { label: 'المصروفات', data: expenseData, borderColor: '#D6362E', backgroundColor: '#D6362E' },
  ]);
}

function renderHerdTypeChart(animals) {
  const alive = animals.filter(a => a.status === 'alive');
  const sheepCount = alive.filter(a => a.type === 'sheep').length;
  const goatCount = alive.filter(a => a.type === 'goat').length;
  renderPieChart('herd-type-chart', ['غنم', 'ماعز'], [sheepCount, goatCount]);
}

function renderHerdGenderChart(animals) {
  const alive = animals.filter(a => a.status === 'alive');
  const males = alive.filter(a => a.gender === 'male').length;
  const females = alive.filter(a => a.gender === 'female').length;
  renderPieChart('herd-gender-chart', ['ذكور', 'إناث'], [males, females], ['#1E5FBF', '#D6362E']);
}

function renderHerdHealthChart(animals) {
  const alive = animals.filter(a => a.status === 'alive');
  const statusKeys = ['healthy', 'sick', 'underTreatment', 'quarantine'];
  const counts = statusKeys.map(key => alive.filter(a => a.healthStatus === key).length);
  renderPieChart(
    'herd-health-chart',
    statusKeys.map(key => ANIMAL_HEALTH_LABELS[key]),
    counts,
    ['#1E9E5A', '#D6362E', '#E8A93B', '#6B7280']
  );
}

function renderBirthsDeathsChart(births, deaths) {
  const { labels, keys } = _lastSixMonthsLabels();
  const birthsData = keys.map(key => births.filter(b => _monthKey(b.birthDate) === key).length);
  const deathsData = keys.map(key => deaths.filter(d => _monthKey(d.deathDate) === key).length);

  renderBarChart('births-deaths-chart', labels, [
    { label: 'المواليد', data: birthsData, backgroundColor: '#1E9E5A' },
    { label: 'النفوق', data: deathsData, backgroundColor: '#D6362E' },
  ]);
}

// نسخة مختصرة (أول 6 فقط) من مركز التنبيهات الكامل (notifications/alerts-center.html) — كلاهما مبني فوق
// computeAllAlerts() في alerts-service.js، المصدر الوحيد لمنطق حساب التنبيهات (10 فئات، انظر ذلك الملف)
async function renderQuickAlerts() {
  // غير المقروءة فقط — نفس منطق مركز التنبيهات (alerts-center-page.js): تنبيه مُعلَّم كمقروء يختفي من كل
  // عروض "التنبيهات السريعة"، لا يبقى ظاهرًا هنا بعد أن اختفى هناك
  const alerts = (await computeAllAlerts()).filter(a => !a.isRead);
  const container = document.getElementById('quick-alerts');
  if (!alerts.length) {
    container.innerHTML = '<div class="empty-state">لا توجد تنبيهات حاليًا 👍</div>';
    return;
  }
  container.innerHTML = alerts.slice(0, 6).map(a => `
    <a class="quick-alert-item" href="${a.href}" style="text-decoration:none; color:inherit;">
      <span class="quick-alert-dot quick-alert-dot--${a.severity}"></span>
      <span>
        <strong>${a.title}</strong> — ${a.message}
        <span style="display:inline-block; margin-inline-start:8px; font-size:11px; color: var(--color-text-secondary); white-space:nowrap;">${formatDateArabic(a.date)}</span>
      </span>
    </a>
  `).join('');
}
