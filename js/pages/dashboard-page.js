// js/pages/dashboard-page.js

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth();
  renderSidebar('dashboard');
  renderHeader('لوحة التحكم');

  const [animals, expenses, revenues, purchases, bulkBatches, births, deaths, healthRecords, custodyItems, employees, inventoryItems, inventoryMovements] = await Promise.all([
    getAllAnimals(),
    getAllExpenses(),
    getAllRevenues(),
    getAllPurchases(),
    getAllBulkBatches(),
    getAllBirths(),
    getAllDeaths(),
    dbGetAll('HealthRecords'),
    dbGetAll('CustodyItems'),
    dbGetAll('Employees'),
    getAllInventoryItems(),
    getAllInventoryMovements(),
  ]);

  renderKpiCards({ animals, expenses, revenues, purchases, bulkBatches, births, deaths, healthRecords, custodyItems, employees, inventoryItems, inventoryMovements });
  renderRevenueExpenseChart(expenses, revenues);
  renderHerdTypeChart(animals);
  renderHerdGenderChart(animals);
  renderHerdHealthChart(animals);
  renderBirthsDeathsChart(births, deaths);
  renderQuickAlerts({ healthRecords, custodyItems, expenses, purchases, animals, inventoryItems, inventoryMovements });
});

function renderKpiCards({ animals, expenses, revenues, purchases, bulkBatches, births, deaths, healthRecords, custodyItems, employees, inventoryItems, inventoryMovements }) {
  const alive = animals.filter(a => a.status === 'alive');
  const males = alive.filter(a => a.gender === 'male').length;
  const females = alive.filter(a => a.gender === 'female').length;

  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const totalRevenues = revenues.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const totalPurchases = purchases.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const bulkTotals = bulkBatches.reduce((acc, b) => {
    const t = computeBulkBatchTotals(b);
    acc.purchaseCost += t.totalPurchaseCost;
    acc.saleRevenue += t.totalSaleRevenue;
    acc.expenses += t.totalExpenses;
    acc.remainingCount += t.remainingCount;
    return acc;
  }, { purchaseCost: 0, saleRevenue: 0, expenses: 0, remainingCount: 0 });
  const totalBulkPurchases = bulkTotals.purchaseCost;
  const totalBulkSales = bulkTotals.saleRevenue;
  const totalBulkExpenses = bulkTotals.expenses;
  const bulkRemainingCount = bulkTotals.remainingCount;
  const bulkNetRevenue = totalBulkSales - totalBulkPurchases - totalBulkExpenses;
  const netProfit = totalRevenues + totalBulkSales - totalExpenses - totalPurchases - totalBulkPurchases - totalBulkExpenses;

  const sickCount = alive.filter(a => a.healthStatus === 'sick' || a.healthStatus === 'underTreatment').length;
  const activeEmployees = employees.filter(e => e.status === 'active').length;
  const totalCustodyValue = custodyItems
    .filter(c => c.status !== 'settled' && c.status !== 'deleted')
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
    { label: 'صافي إيراد الشراء والبيع الجماعي', value: formatCurrency(bulkNetRevenue), sub: 'بيع − شراء − مصاريف الجملة', color: bulkNetRevenue >= 0 ? 'green' : 'red', icon: '📦' },
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

function renderQuickAlerts({ healthRecords, custodyItems, expenses, purchases, animals, inventoryItems, inventoryMovements }) {
  const alerts = [];

  const activeSickAnimals = animals.filter(a => a.healthStatus === 'sick' || a.healthStatus === 'underTreatment');
  activeSickAnimals.forEach(a => {
    alerts.push({ dot: 'red', text: `الحيوان ${a.code} يحتاج متابعة صحية عاجلة` });
  });

  const openCustody = custodyItems.filter(c => c.status === 'open' || c.status === 'partially_settled');
  if (openCustody.length) {
    alerts.push({ dot: 'warning', text: `يوجد ${openCustody.length} عهدة نقدية غير مسوّاة بالكامل` });
  }

  const pendingExpenses = expenses.filter(e => e.status === 'pending');
  if (pendingExpenses.length) {
    alerts.push({ dot: 'blue', text: `يوجد ${pendingExpenses.length} مصروف بانتظار الاعتماد` });
  }

  const pendingPurchases = purchases.filter(p => p.status === 'pending');
  if (pendingPurchases.length) {
    alerts.push({ dot: 'blue', text: `يوجد ${pendingPurchases.length} مشترى بانتظار الاعتماد` });
  }

  inventoryItems.forEach(item => {
    const { currentQty, isLowStock } = computeItemStockLevel(item, inventoryMovements);
    if (isLowStock) {
      alerts.push({ dot: 'warning', text: `الصنف "${item.name}" وصل لحد الطلب (المتبقي: ${formatNumber(currentQty)} ${item.unit || ''})` });
    }
  });

  const container = document.getElementById('quick-alerts');
  if (!alerts.length) {
    container.innerHTML = '<div class="empty-state">لا توجد تنبيهات حاليًا 👍</div>';
    return;
  }
  container.innerHTML = alerts.slice(0, 6).map(a => `
    <div class="quick-alert-item">
      <span class="quick-alert-dot quick-alert-dot--${a.dot}"></span>
      <span>${a.text}</span>
    </div>
  `).join('');
}
