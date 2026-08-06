// js/pages/overview-report-page.js

let _ovAnimals = [];
let _ovBirths = [];
let _ovDeaths = [];
let _ovExpenses = [];
let _ovRevenues = [];
let _ovPurchases = [];
let _ovBulkBatches = [];
let _ovInventoryItems = [];
let _ovInventoryMovements = [];

let _currentExportColumns = null;
let _currentExportRows = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('reports');
  renderSidebar('reports');
  renderHeader('التقرير الشامل');

  [_ovAnimals, _ovBirths, _ovDeaths, _ovExpenses, _ovRevenues, _ovPurchases, _ovBulkBatches, _ovInventoryItems, _ovInventoryMovements] = await Promise.all([
    getAllAnimals(), getAllBirths(), getAllDeaths(), getAllExpenses(), getAllRevenues(), getAllPurchases(), getAllBulkBatches(),
    getAllInventoryItems(), getAllInventoryMovements(),
  ]);

  document.getElementById('report-from').addEventListener('change', _renderOverviewReport);
  document.getElementById('report-to').addEventListener('change', _renderOverviewReport);

  document.getElementById('export-excel-btn').addEventListener('click', () => {
    exportRowsToExcel('التقرير الشامل', _currentExportColumns, _currentExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    exportRowsToPdf('التقرير الشامل', _currentExportColumns, _currentExportRows);
  });

  _renderOverviewReport();
});

function _dateInRange(dateStr, from, to) {
  if (!dateStr) return false;
  if (from && dateStr < from) return false;
  if (to && dateStr > to) return false;
  return true;
}

// رصيد تراكمي (شراء − بيع) لكل تركيبة نوع/جنس عبر كل دفعات الجملة، بمعزل عن فلتر الفترة — نفس مبدأ "القطيع الحالي" أعلاه
function _computeBulkRemainingByTypeGender(batches) {
  const groups = {
    'sheep|male': { type: 'sheep', gender: 'male', purchased: 0, sold: 0 },
    'sheep|female': { type: 'sheep', gender: 'female', purchased: 0, sold: 0 },
    'goat|male': { type: 'goat', gender: 'male', purchased: 0, sold: 0 },
    'goat|female': { type: 'goat', gender: 'female', purchased: 0, sold: 0 },
  };
  batches.forEach(batch => {
    (batch.purchaseLines || []).forEach(l => {
      const g = groups[`${l.type}|${l.gender}`];
      if (g) g.purchased += Number(l.count || 0);
    });
    (batch.saleLines || []).forEach(l => {
      const g = groups[`${l.type}|${l.gender}`];
      if (g) g.sold += Number(l.count || 0);
    });
  });
  return Object.values(groups).map(g => ({ ...g, remaining: g.purchased - g.sold }));
}

function _renderOverviewReport() {
  const from = document.getElementById('report-from').value;
  const to = document.getElementById('report-to').value;

  const alive = _ovAnimals.filter(a => a.status === 'alive');
  const sheep = alive.filter(a => a.type === 'sheep');
  const goats = alive.filter(a => a.type === 'goat');
  const sheepMales = sheep.filter(a => a.gender === 'male').length;
  const sheepFemales = sheep.filter(a => a.gender === 'female').length;
  const goatMales = goats.filter(a => a.gender === 'male').length;
  const goatFemales = goats.filter(a => a.gender === 'female').length;
  const sickCount = alive.filter(a => a.healthStatus === 'sick' || a.healthStatus === 'underTreatment').length;

  const filteredBirths = _ovBirths.filter(b => (!from && !to) || _dateInRange(b.birthDate, from, to));
  const totalOffspring = filteredBirths.reduce((s, b) => s + Number(b.offspringCount || 0), 0);

  const filteredDeaths = _ovDeaths.filter(d => (!from && !to) || _dateInRange(d.deathDate, from, to));
  const deathRate = _ovAnimals.length ? ((filteredDeaths.length / _ovAnimals.length) * 100).toFixed(1) : '0.0';

  const filteredExpenses = _ovExpenses.filter(e => (!from && !to) || _dateInRange(e.date, from, to));
  const filteredRevenues = _ovRevenues.filter(r => (!from && !to) || _dateInRange(r.date, from, to));
  const filteredPurchases = _ovPurchases.filter(p => (!from && !to) || _dateInRange(p.date, from, to));

  const totalExpenses = filteredExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalRevenues = filteredRevenues.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalPurchases = filteredPurchases.reduce((s, p) => s + Number(p.amount || 0), 0);

  const filteredBulkPurchaseLines = [];
  const filteredBulkSaleLines = [];
  const filteredBulkExpenseLines = [];
  _ovBulkBatches.forEach(batch => {
    if ((!from && !to) || _dateInRange(batch.purchaseDate, from, to)) {
      filteredBulkPurchaseLines.push(...(batch.purchaseLines || []));
    }
    (batch.saleLines || []).forEach(l => { if ((!from && !to) || _dateInRange(l.date, from, to)) filteredBulkSaleLines.push(l); });
    (batch.expenseLines || []).forEach(l => { if ((!from && !to) || _dateInRange(l.date, from, to)) filteredBulkExpenseLines.push(l); });
  });
  const totalBulkPurchases = filteredBulkPurchaseLines.reduce((s, l) => s + Number(l.count || 0) * Number(l.unitPrice || 0), 0);
  const totalBulkSales = filteredBulkSaleLines.reduce((s, l) => s + Number(l.count || 0) * Number(l.unitPrice || 0), 0);
  const totalBulkExpenses = filteredBulkExpenseLines.reduce((s, l) => s + Number(l.amount || 0), 0);
  const bulkNetRevenue = totalBulkSales - totalBulkPurchases - totalBulkExpenses;

  const netProfit = totalRevenues + totalBulkSales - totalExpenses - totalPurchases - totalBulkPurchases - totalBulkExpenses;

  const bulkRemainingGroups = _computeBulkRemainingByTypeGender(_ovBulkBatches);
  const totalBulkRemaining = bulkRemainingGroups.reduce((s, g) => s + g.remaining, 0);

  const container = document.getElementById('report-content');
  container.innerHTML = `
    <div class="overview-section-title">القطيع الحالي</div>
    ${kpiGrid([
      { value: formatNumber(alive.length), label: 'إجمالي القطيع الحي', tone: 'blue', icon: '🐑' },
      { value: `${formatNumber(sheepMales)} / ${formatNumber(sheepFemales)}`, label: 'الأغنام: ذكور / إناث', tone: 'green' },
      { value: `${formatNumber(goatMales)} / ${formatNumber(goatFemales)}`, label: 'الماعز: ذكور / إناث', tone: 'blue' },
      { value: formatNumber(sickCount), label: 'حالات مرضية حاليًا', tone: 'red', icon: '⚕️' },
    ])}

    <div class="overview-section-title">الحركة خلال الفترة المحدّدة</div>
    ${kpiGrid([
      { value: formatNumber(filteredBirths.length), label: 'سجلات الولادة', tone: 'green' },
      { value: formatNumber(totalOffspring), label: 'إجمالي عدد المواليد', tone: 'green' },
      { value: formatNumber(filteredDeaths.length), label: 'حالات النفوق', tone: 'red' },
      { value: `${deathRate}%`, label: 'نسبة النفوق من إجمالي القطيع', tone: 'red' },
    ])}

    <div class="overview-section-title">الماليات خلال الفترة المحدّدة</div>
    ${kpiGrid([
      { value: formatCurrency(totalRevenues), label: 'إجمالي الإيرادات', tone: 'green', icon: '💰', href: buildQueryUrl('../revenues/revenue-list.html', { from, to }) },
      { value: formatCurrency(totalExpenses), label: 'إجمالي المصروفات', tone: 'red', icon: '💸', href: buildQueryUrl('../expenses/expense-list.html', { from, to }) },
      { value: formatCurrency(totalPurchases), label: 'إجمالي المشتريات', tone: 'red', icon: '🛒', href: buildQueryUrl('../purchases/purchase-list.html', { from, to }) },
      { value: formatCurrency(netProfit), label: 'صافي الربح', tone: netProfit >= 0 ? 'green' : 'red', icon: '📈' },
    ])}

    <div class="overview-section-title">الجملة (الدفعات) خلال الفترة المحدّدة</div>
    ${kpiGrid([
      { value: formatCurrency(totalBulkPurchases), label: 'تكلفة شراء الجملة', tone: 'red' },
      { value: formatCurrency(totalBulkSales), label: 'إيراد بيع الجملة', tone: 'green' },
      { value: formatCurrency(totalBulkExpenses), label: 'مصاريف الجملة', tone: 'red' },
      { value: formatCurrency(bulkNetRevenue), label: 'صافي إيراد الجملة', tone: bulkNetRevenue >= 0 ? 'green' : 'red' },
    ])}

    <div class="overview-section-title">الرؤوس المتبقية من الشراء والبيع الجماعي <span style="font-size:12px; font-weight:400; color: var(--color-text-secondary);">(رصيد تراكمي حتى الآن، بمعزل عن الفترة المحددة أعلاه)</span></div>
    <div id="ov-bulk-remaining-table"></div>

    <div class="overview-section-title">مستوى المخزون الحالي <span style="font-size:12px; font-weight:400; color: var(--color-text-secondary);">(رصيد تراكمي حتى الآن، بمعزل عن الفترة المحددة أعلاه)</span></div>
    <div id="ov-inventory-stock-table"></div>

    <div class="card" style="margin-bottom: var(--spacing-3);">
      <div class="card__header"><h3>توزيع القطيع (غنم / ماعز)</h3></div>
      <div class="chart-box"><canvas id="ov-herd-type-chart"></canvas></div>
    </div>
    <div class="card" style="margin-bottom: var(--spacing-3);">
      <div class="card__header"><h3>الإيرادات مقابل المصروفات والمشتريات خلال الفترة</h3></div>
      <div class="chart-box"><canvas id="ov-finance-chart"></canvas></div>
    </div>

    <div class="overview-section-title">جدول ملخّص</div>
    <div id="overview-summary-table"></div>
  `;

  const bulkRemainingRows = bulkRemainingGroups.map(g => ({
    typeLabel: ANIMAL_TYPE_LABELS[g.type] || '-',
    genderLabel: ANIMAL_GENDER_LABELS[g.gender] || '-',
    purchasedLabel: formatNumber(g.purchased),
    soldLabel: formatNumber(g.sold),
    remainingLabel: g.remaining < 0 ? `<strong style="color: var(--color-primary-red);">${formatNumber(g.remaining)}</strong>` : formatNumber(g.remaining),
  }));
  renderDataTable('ov-bulk-remaining-table', [
    { key: 'typeLabel', label: 'النوع', sortable: false },
    { key: 'genderLabel', label: 'الجنس', sortable: false },
    { key: 'purchasedLabel', label: 'عدد الشراء (تراكمي)', sortable: false },
    { key: 'soldLabel', label: 'عدد البيع (تراكمي)', sortable: false },
    { key: 'remainingLabel', label: 'المتبقي', sortable: false },
  ], bulkRemainingRows, {
    searchable: false,
    pageSize: bulkRemainingRows.length,
    emptyMessage: 'لا توجد بيانات شراء/بيع جماعي بعد',
    footerRow: {
      typeLabel: 'الإجمالي', genderLabel: '',
      purchasedLabel: formatNumber(bulkRemainingGroups.reduce((s, g) => s + g.purchased, 0)),
      soldLabel: formatNumber(bulkRemainingGroups.reduce((s, g) => s + g.sold, 0)),
      remainingLabel: formatNumber(totalBulkRemaining),
    },
  });

  const inventoryStockRows = _ovInventoryItems.map(item => {
    const { currentQty, isLowStock } = computeItemStockLevel(item, _ovInventoryMovements);
    return {
      nameLabel: item.name,
      categoryLabel: INVENTORY_CATEGORY_LABELS[item.category] || item.category,
      unitLabel: item.unit || '-',
      currentQtyLabel: formatNumber(currentQty),
      thresholdLabel: isRequired(item.reorderThreshold) ? formatNumber(item.reorderThreshold) : '-',
      statusLabel: isLowStock ? '<span class="badge badge--red">منخفض</span>' : '<span class="badge badge--green">متوفر</span>',
    };
  });
  renderDataTable('ov-inventory-stock-table', [
    { key: 'nameLabel', label: 'الصنف', sortable: true },
    { key: 'categoryLabel', label: 'التصنيف', sortable: true },
    { key: 'unitLabel', label: 'الوحدة', sortable: false },
    { key: 'currentQtyLabel', label: 'الرصيد الحالي', sortable: false },
    { key: 'thresholdLabel', label: 'حد الطلب', sortable: false },
    { key: 'statusLabel', label: 'الحالة', sortable: false },
  ], inventoryStockRows, {
    searchable: false,
    pageSize: inventoryStockRows.length || 1,
    emptyMessage: 'لا توجد أصناف مخزون مكوَّدة بعد',
  });

  renderPieChart('ov-herd-type-chart', ['غنم', 'ماعز'], [sheep.length, goats.length]);
  renderBarChart('ov-finance-chart', ['الإيرادات', 'المصروفات', 'المشتريات'], [{
    label: 'ر.س',
    data: [totalRevenues, totalExpenses, totalPurchases],
    backgroundColor: ['#1E9E5A', '#D6362E', '#E8A93B'],
  }]);

  const rows = [
    { item: 'إجمالي القطيع الحي', value: formatNumber(alive.length) },
    { item: 'الأغنام - ذكور', value: formatNumber(sheepMales) },
    { item: 'الأغنام - إناث', value: formatNumber(sheepFemales) },
    { item: 'الماعز - ذكور', value: formatNumber(goatMales) },
    { item: 'الماعز - إناث', value: formatNumber(goatFemales) },
    { item: 'حالات مرضية حاليًا', value: formatNumber(sickCount) },
    { item: 'سجلات الولادة (خلال الفترة)', value: formatNumber(filteredBirths.length) },
    { item: 'إجمالي عدد المواليد (خلال الفترة)', value: formatNumber(totalOffspring) },
    { item: 'حالات النفوق (خلال الفترة)', value: formatNumber(filteredDeaths.length) },
    { item: 'نسبة النفوق من إجمالي القطيع', value: `${deathRate}%` },
    { item: 'إجمالي الإيرادات (خلال الفترة)', value: formatCurrency(totalRevenues) },
    { item: 'إجمالي المصروفات (خلال الفترة)', value: formatCurrency(totalExpenses) },
    { item: 'إجمالي المشتريات (خلال الفترة)', value: formatCurrency(totalPurchases) },
    { item: 'تكلفة شراء الجملة (خلال الفترة)', value: formatCurrency(totalBulkPurchases) },
    { item: 'إيراد بيع الجملة (خلال الفترة)', value: formatCurrency(totalBulkSales) },
    { item: 'مصاريف الجملة (خلال الفترة)', value: formatCurrency(totalBulkExpenses) },
    { item: 'صافي إيراد الجملة (خلال الفترة)', value: formatCurrency(bulkNetRevenue) },
    { item: 'صافي الربح (خلال الفترة)', value: formatCurrency(netProfit) },
    ...bulkRemainingGroups.map(g => ({
      item: `المتبقي من الجملة - ${ANIMAL_TYPE_LABELS[g.type]} (${ANIMAL_GENDER_LABELS[g.gender]}) [تراكمي]`,
      value: formatNumber(g.remaining),
    })),
    { item: 'إجمالي المتبقي من الجملة (تراكمي)', value: formatNumber(totalBulkRemaining) },
    ...inventoryStockRows.map(r => ({
      item: `المخزون - ${r.nameLabel} (${r.categoryLabel}) [تراكمي]`,
      value: `${r.currentQtyLabel} ${r.unitLabel !== '-' ? r.unitLabel : ''}`.trim(),
    })),
  ];

  const columns = [
    { key: 'item', label: 'البند', sortable: false },
    { key: 'value', label: 'القيمة', sortable: false },
  ];

  _currentExportColumns = columns;
  _currentExportRows = rows;

  renderDataTable('overview-summary-table', columns, rows, { searchable: false, pageSize: rows.length });
}
