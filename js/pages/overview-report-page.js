// js/pages/overview-report-page.js

let _ovAnimals = [];
let _ovBirths = [];
let _ovDeaths = [];
let _ovExpenses = [];
let _ovRevenues = [];
let _ovPurchases = [];
let _ovBulkPurchases = [];
let _ovBulkSales = [];
let _ovInventoryItems = [];
let _ovInventoryMovements = [];
let _ovFixedAssets = [];
let _ovFixedAssetTransactions = [];

let _currentExportColumns = null;
let _currentExportRows = null;

// تسميات أنواع حركات الأصول الثابتة لعرضها في جدول "حركات الأصول خلال الفترة" — نسخة مصغّرة من
// FIXED_ASSET_TXN_TYPE_META (asset-card-page.js) بلا حاجة لتحميل صفحة كاملة هنا، فقط للتسمية النصية
const _OV_ASSET_TXN_TYPE_LABELS = {
  depreciation: 'إهلاك', improvement: 'تحسين', maintenance: 'صيانة',
  transfer: 'نقل', sale: 'بيع', disposal: 'استبعاد', countAdjustment: 'تسوية جرد',
};

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('reports');
  renderSidebar('reports-overview');
  renderHeader('التقرير الشامل');

  [_ovAnimals, _ovBirths, _ovDeaths, _ovExpenses, _ovRevenues, _ovPurchases, _ovBulkPurchases, _ovBulkSales, _ovInventoryItems, _ovInventoryMovements, _ovFixedAssets, _ovFixedAssetTransactions] = await Promise.all([
    getAllAnimals(), getAllBirths(), getAllDeaths(), getAllExpenses(), getAllRevenues(), getAllPurchases(), getAllBulkPurchases(), getAllBulkSales(),
    getAllInventoryItems(), getAllInventoryMovements(), getAllFixedAssets(), getAllFixedAssetTransactions(),
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

// رصيد تراكمي (شراء − بيع) لكل تركيبة نوع/جنس عبر كل عمليات الشراء/البيع الجماعي، بمعزل عن فلتر الفترة —
// نفس مبدأ "القطيع الحالي" أعلاه (تجميع أبسط بالنوع/الجنس فقط بلا سلالة، بعكس computeBulkGroupBalances
// المستخدمة في صفحة "ملخص الأرصدة" التي تُفرّق بالسلالة أيضًا)
function _computeBulkRemainingByTypeGender(purchases, sales) {
  const groups = {
    'sheep|male': { type: 'sheep', gender: 'male', purchased: 0, sold: 0 },
    'sheep|female': { type: 'sheep', gender: 'female', purchased: 0, sold: 0 },
    'goat|male': { type: 'goat', gender: 'male', purchased: 0, sold: 0 },
    'goat|female': { type: 'goat', gender: 'female', purchased: 0, sold: 0 },
  };
  purchases.forEach(p => {
    (p.lines || []).forEach(l => {
      const g = groups[`${l.type}|${l.gender}`];
      if (g) g.purchased += Number(l.count || 0);
    });
  });
  sales.forEach(s => {
    (s.lines || []).forEach(l => {
      const g = groups[`${l.type}|${l.gender}`];
      if (g) g.sold += Number(l.count || 0);
    });
  });
  return Object.values(groups).map(g => ({ ...g, remaining: g.purchased - g.sold }));
}

// صف ملخّص ضريبة لمصدر واحد (مبيعات/مشتريات/مصروفات) — يقتصر على السجلات hasTaxInvoice فقط (غير الضريبية
// لا amountBeforeTax/taxAmount لها أصلًا)؛ البيع/الشراء بالجملة مستبعدان عمدًا (لا حقول فاتورة ضريبية
// لـBulkPurchaseBatches/BulkSaleBatches، انظر CLAUDE.md)
function _computeTaxSummaryRow(records) {
  const taxed = records.filter(r => r.hasTaxInvoice);
  return {
    count: taxed.length,
    beforeTax: taxed.reduce((s, r) => s + Number(r.amountBeforeTax || 0), 0),
    tax: taxed.reduce((s, r) => s + Number(r.taxAmount || 0), 0),
    withTax: taxed.reduce((s, r) => s + Number(r.amount || 0), 0),
  };
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

  // شراء/بيع فردي للقطيع خلال الفترة (بمعزل عن الشراء والبيع الجماعي أدناه) — birthDate يحمل تاريخ الاقتناء
  // فعليًا للحيوان المُشترى (نفس الحقل للحالتين، انظر CLAUDE.md)، والبيع الفردي عبر Revenues.animalId
  const purchasedAnimalsInPeriod = _ovAnimals.filter(a => a.source === 'purchased' && ((!from && !to) || _dateInRange(a.birthDate, from, to)));
  const soldAnimalsInPeriod = _ovRevenues.filter(r => r.animalId && ((!from && !to) || _dateInRange(r.date, from, to)));
  const netHerdChange = (totalOffspring + purchasedAnimalsInPeriod.length) - (filteredDeaths.length + soldAnimalsInPeriod.length);

  const filteredExpenses = _ovExpenses.filter(e => (!from && !to) || _dateInRange(e.date, from, to));
  const filteredRevenues = _ovRevenues.filter(r => (!from && !to) || _dateInRange(r.date, from, to));
  const filteredPurchases = _ovPurchases.filter(p => (!from && !to) || _dateInRange(p.date, from, to));

  const totalExpenses = filteredExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalRevenues = filteredRevenues.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalPurchases = filteredPurchases.reduce((s, p) => s + Number(p.amount || 0), 0);

  // تكلفة الشراء إعلامية فقط هنا (خرجت نقدًا خلال الفترة لكنها تُرسمَل كأصل، لا تدخل صافي الربح مباشرة) —
  // الذي يدخل صافي الربح هو تكلفة البضاعة المباعة (COGS) المحسوبة وقت البيع فقط، انظر computeSaleLinesCosts
  // في bulk-batch-service.js
  const filteredBulkPurchases = _ovBulkPurchases.filter(p => (!from && !to) || _dateInRange(p.date, from, to));
  const filteredBulkSales = _ovBulkSales.filter(s => (!from && !to) || _dateInRange(s.date, from, to));
  const totalBulkPurchases = filteredBulkPurchases.reduce((s, p) => s + (p.lines || []).reduce((sum, l) => sum + Number(l.count || 0) * Number(l.unitPrice || 0), 0), 0);
  const totalBulkSales = filteredBulkSales.reduce((s, sale) => s + (sale.lines || []).reduce((sum, l) => sum + Number(l.count || 0) * Number(l.unitPrice || 0), 0), 0);
  const totalBulkCogs = filteredBulkSales.reduce((s, sale) => s + (sale.lines || []).reduce((sum, l) => sum + Number(l.cogsAmount || 0), 0), 0);
  const bulkGrossProfit = totalBulkSales - totalBulkCogs;

  // ⚠️ Purchases (المشتريات، بعكس totalBulkPurchases أعلاه) لا تدخل صافي الربح كذلك الآن — بندها صار حصرًا
  // حسابات مخزون (فرع 113، getPurchaseCategoryAccounts في accounting-service.js)، فتُرسمَل كأصل مخزون لا
  // كتكلفة تشغيلية فورية؛ كانت تُطرح هنا بافتراض أنها دومًا تكلفة تشغيلية — لم يعد هذا الافتراض صحيحًا
  const netProfit = totalRevenues + totalBulkSales - totalExpenses - totalBulkCogs;

  const bulkRemainingGroups = _computeBulkRemainingByTypeGender(_ovBulkPurchases, _ovBulkSales);
  const totalBulkRemaining = bulkRemainingGroups.reduce((s, g) => s + g.remaining, 0);

  // ملخّص الضريبة: فواتير ضريبية فقط (hasTaxInvoice) من المبيعات/المشتريات/المصروفات خلال نفس الفترة —
  // صافي الضريبة المستحقة = ضريبة المبيعات (مُحصَّلة) − ضريبة المشتريات والمصروفات (مدفوعة)، نفس مبدأ إقرار
  // ضريبة القيمة المضافة المعتاد (موجب = مستحق للمصلحة، سالب = مسترد)
  const taxRevenues = _computeTaxSummaryRow(filteredRevenues);
  const taxPurchases = _computeTaxSummaryRow(filteredPurchases);
  const taxExpenses = _computeTaxSummaryRow(filteredExpenses);
  const netVat = taxRevenues.tax - taxPurchases.tax - taxExpenses.tax;

  // الأصول الثابتة: عدد/قيمة دفترية للأصول النشطة لحظية (نفس مبدأ "القطيع الحالي" أعلاه)، وتكلفة الاقتناء/
  // الإهلاك المُرحَّل خلال الفترة المحدّدة تحديدًا — انظر fixed-asset-service.js
  const activeFixedAssets = _ovFixedAssets.filter(a => a.assetStatus !== 'sold' && a.assetStatus !== 'disposed');
  const totalAssetBookValue = activeFixedAssets.reduce((s, a) => s + computeAssetBookValue(a), 0);
  const acquiredAssetsInPeriod = _ovFixedAssets.filter(a => (!from && !to) || _dateInRange(a.purchaseDate, from, to));
  const totalAssetAcquisitionCost = acquiredAssetsInPeriod.reduce((s, a) => s + Number(a.purchaseCost || 0) + Number(a.acquisitionAdditionalCosts || 0), 0);
  const filteredAssetTxns = _ovFixedAssetTransactions.filter(t => (!from && !to) || _dateInRange(t.date, from, to));
  const totalDepreciationInPeriod = filteredAssetTxns.filter(t => t.type === 'depreciation').reduce((s, t) => s + Number(t.amount || 0), 0);
  const assetById = new Map(_ovFixedAssets.map(a => [a.id, a]));

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
    ${kpiGrid([
      { value: formatNumber(purchasedAnimalsInPeriod.length), label: 'حيوانات مُضافة بالشراء الفردي', tone: 'green' },
      { value: formatNumber(soldAnimalsInPeriod.length), label: 'حيوانات مُخرجة بالبيع الفردي', tone: 'red' },
      { value: `${netHerdChange >= 0 ? '+' : ''}${formatNumber(netHerdChange)}`, label: 'صافي التغيّر في عدد القطيع خلال الفترة', tone: netHerdChange >= 0 ? 'green' : 'red' },
    ], 3)}

    <div class="overview-section-title">الماليات خلال الفترة المحدّدة</div>
    ${kpiGrid([
      { value: formatCurrency(totalRevenues), label: 'إجمالي الإيرادات', tone: 'green', icon: '💰', href: buildQueryUrl('../revenues/revenue-list.html', { from, to }) },
      { value: formatCurrency(totalExpenses), label: 'إجمالي المصروفات', tone: 'red', icon: '💸', href: buildQueryUrl('../expenses/expense-list.html', { from, to }) },
      { value: formatCurrency(totalPurchases), label: 'إجمالي المشتريات', tone: 'red', icon: '🛒', href: buildQueryUrl('../purchases/purchase-list.html', { from, to }) },
      { value: formatCurrency(netProfit), label: 'صافي الربح', tone: netProfit >= 0 ? 'green' : 'red', icon: '📈' },
    ])}

    <div class="overview-section-title">ملخّص الضريبة خلال الفترة المحدّدة <span style="font-size:12px; font-weight:400; color: var(--color-text-secondary);">(الفواتير الضريبية فقط من المبيعات/المشتريات/المصروفات — لا يشمل الشراء والبيع الجماعي، لا فاتورة ضريبية لهما)</span></div>
    ${kpiGrid([
      { value: formatCurrency(taxRevenues.tax), label: 'ضريبة المبيعات (مُحصَّلة)', tone: 'green' },
      { value: formatCurrency(taxPurchases.tax + taxExpenses.tax), label: 'ضريبة المشتريات والمصروفات (مدفوعة)', tone: 'red' },
      { value: formatCurrency(netVat), label: netVat >= 0 ? 'صافي الضريبة المستحقة' : 'صافي الضريبة المستردة', tone: netVat >= 0 ? 'red' : 'green' },
    ], 3)}
    <div id="ov-tax-summary-table"></div>

    <div class="overview-section-title">الشراء والبيع الجماعي خلال الفترة المحدّدة</div>
    ${kpiGrid([
      { value: formatCurrency(totalBulkPurchases), label: 'تكلفة شراء الجملة', tone: 'red' },
      { value: formatCurrency(totalBulkSales), label: 'إيراد بيع الجملة', tone: 'green' },
      { value: formatCurrency(totalBulkCogs), label: 'تكلفة البضاعة المباعة', tone: 'red' },
      { value: formatCurrency(bulkGrossProfit), label: 'إجمالي ربح الجملة', tone: bulkGrossProfit >= 0 ? 'green' : 'red' },
    ])}

    <div class="overview-section-title">الرؤوس المتبقية من الشراء والبيع الجماعي <span style="font-size:12px; font-weight:400; color: var(--color-text-secondary);">(رصيد تراكمي حتى الآن، بمعزل عن الفترة المحددة أعلاه)</span></div>
    <div id="ov-bulk-remaining-table"></div>

    <div class="overview-section-title">مستوى المخزون الحالي <span style="font-size:12px; font-weight:400; color: var(--color-text-secondary);">(رصيد تراكمي حتى الآن، بمعزل عن الفترة المحددة أعلاه)</span></div>
    <div id="ov-inventory-stock-table"></div>

    <div class="overview-section-title">الأصول الثابتة</div>
    ${kpiGrid([
      { value: formatNumber(activeFixedAssets.length), label: 'عدد الأصول النشطة (لحظي)', tone: 'blue', icon: '🏢', href: '../fixed-assets/asset-list.html' },
      { value: formatCurrency(totalAssetBookValue), label: 'إجمالي القيمة الدفترية الحالية (لحظي)', tone: 'blue' },
      { value: formatCurrency(totalAssetAcquisitionCost), label: 'تكلفة أصول مُقتناة خلال الفترة', tone: 'green' },
      { value: formatCurrency(totalDepreciationInPeriod), label: 'إجمالي الإهلاك المُرحَّل خلال الفترة', tone: 'red' },
    ])}
    <div class="overview-section-title" style="font-size:13px; font-weight:700; margin-top: var(--spacing-2);">حركات الأصول الثابتة خلال الفترة المحدّدة</div>
    <div id="ov-asset-movements-table"></div>

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

  const taxSummaryRows = [
    { sourceLabel: 'المبيعات (إيرادات)', ...taxRevenues },
    { sourceLabel: 'المشتريات', ...taxPurchases },
    { sourceLabel: 'المصروفات', ...taxExpenses },
  ].map(r => ({
    sourceLabel: r.sourceLabel,
    countLabel: formatNumber(r.count),
    beforeTaxLabel: formatCurrency(r.beforeTax),
    taxLabel: formatCurrency(r.tax),
    withTaxLabel: formatCurrency(r.withTax),
  }));
  renderDataTable('ov-tax-summary-table', [
    { key: 'sourceLabel', label: 'المصدر', sortable: false },
    { key: 'countLabel', label: 'عدد الفواتير الضريبية', sortable: false },
    { key: 'beforeTaxLabel', label: 'المبلغ غير شامل الضريبة', sortable: false },
    { key: 'taxLabel', label: 'قيمة الضريبة', sortable: false },
    { key: 'withTaxLabel', label: 'المبلغ شامل الضريبة', sortable: false },
  ], taxSummaryRows, {
    searchable: false,
    pageSize: taxSummaryRows.length,
    emptyMessage: 'لا توجد فواتير ضريبية خلال هذه الفترة',
    footerRow: {
      sourceLabel: 'الإجمالي',
      countLabel: formatNumber(taxRevenues.count + taxPurchases.count + taxExpenses.count),
      beforeTaxLabel: formatCurrency(taxRevenues.beforeTax + taxPurchases.beforeTax + taxExpenses.beforeTax),
      taxLabel: formatCurrency(taxRevenues.tax + taxPurchases.tax + taxExpenses.tax),
      withTaxLabel: formatCurrency(taxRevenues.withTax + taxPurchases.withTax + taxExpenses.withTax),
    },
  });

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
      // فحص مباشر بدل isRequired() (من js/utils/validators.js) — هذه الصفحة تقرير عرض فقط بلا نماذج تحقق
      // فلا تحمّل validators.js أصلاً (نفس قاعدة "يُحمَّل فقط في صفحات النماذج" في CLAUDE.md)؛ استخدام
      // isRequired() هنا كان يرمي ReferenceError بمجرد وجود صنف مخزون واحد على الأقل (لم يظهر إلا عندها،
      // فبقي كامنًا في أي اختبار بقاعدة بيانات بلا أصناف مخزون مكوَّدة)
      thresholdLabel: item.reorderThreshold !== null && item.reorderThreshold !== undefined ? formatNumber(item.reorderThreshold) : '-',
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

  const assetMovementRows = filteredAssetTxns.map(t => {
    const asset = assetById.get(t.assetId);
    return {
      dateLabel: formatDateArabic(t.date),
      assetLabel: asset ? `${asset.assetCode} — ${asset.name}` : `#${t.assetId}`,
      typeLabel: _OV_ASSET_TXN_TYPE_LABELS[t.type] || t.type,
      amountLabel: formatCurrency(t.amount || 0),
      notesLabel: t.notes || '-',
    };
  });
  renderDataTable('ov-asset-movements-table', [
    { key: 'dateLabel', label: 'التاريخ', sortable: true },
    { key: 'assetLabel', label: 'الأصل', sortable: false },
    { key: 'typeLabel', label: 'نوع الحركة', sortable: false },
    { key: 'amountLabel', label: 'المبلغ', sortable: false },
    { key: 'notesLabel', label: 'ملاحظات', sortable: false },
  ], assetMovementRows, {
    searchable: false,
    pageSize: assetMovementRows.length || 1,
    emptyMessage: 'لا توجد حركات على الأصول الثابتة خلال هذه الفترة',
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
    { item: 'حيوانات مُضافة بالشراء الفردي (خلال الفترة)', value: formatNumber(purchasedAnimalsInPeriod.length) },
    { item: 'حيوانات مُخرجة بالبيع الفردي (خلال الفترة)', value: formatNumber(soldAnimalsInPeriod.length) },
    { item: 'صافي التغيّر في عدد القطيع (خلال الفترة)', value: `${netHerdChange >= 0 ? '+' : ''}${formatNumber(netHerdChange)}` },
    { item: 'إجمالي الإيرادات (خلال الفترة)', value: formatCurrency(totalRevenues) },
    { item: 'إجمالي المصروفات (خلال الفترة)', value: formatCurrency(totalExpenses) },
    { item: 'إجمالي المشتريات (خلال الفترة)', value: formatCurrency(totalPurchases) },
    { item: 'ضريبة المبيعات (مُحصَّلة، فواتير ضريبية فقط)', value: formatCurrency(taxRevenues.tax) },
    { item: 'ضريبة المشتريات والمصروفات (مدفوعة، فواتير ضريبية فقط)', value: formatCurrency(taxPurchases.tax + taxExpenses.tax) },
    { item: netVat >= 0 ? 'صافي الضريبة المستحقة' : 'صافي الضريبة المستردة', value: formatCurrency(netVat) },
    { item: 'تكلفة شراء الجملة (خلال الفترة)', value: formatCurrency(totalBulkPurchases) },
    { item: 'إيراد بيع الجملة (خلال الفترة)', value: formatCurrency(totalBulkSales) },
    { item: 'تكلفة البضاعة المباعة - الجملة (خلال الفترة)', value: formatCurrency(totalBulkCogs) },
    { item: 'إجمالي ربح الجملة (خلال الفترة)', value: formatCurrency(bulkGrossProfit) },
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
    { item: 'عدد الأصول الثابتة النشطة [لحظي]', value: formatNumber(activeFixedAssets.length) },
    { item: 'إجمالي القيمة الدفترية للأصول الثابتة [لحظي]', value: formatCurrency(totalAssetBookValue) },
    { item: 'تكلفة أصول ثابتة مُقتناة (خلال الفترة)', value: formatCurrency(totalAssetAcquisitionCost) },
    { item: 'إجمالي إهلاك الأصول الثابتة المُرحَّل (خلال الفترة)', value: formatCurrency(totalDepreciationInPeriod) },
    ...assetMovementRows.map(r => ({
      item: `حركة أصل - ${r.dateLabel} - ${r.assetLabel} (${r.typeLabel})`,
      value: r.amountLabel,
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
