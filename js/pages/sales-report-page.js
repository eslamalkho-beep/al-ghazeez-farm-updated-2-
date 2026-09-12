// js/pages/sales-report-page.js
// قسمان: (1) المبيعات الموحّدة — بيع حيوان فردي (Revenues) + بيع جملة (BulkSaleBatches.lines) في تقرير واحد،
// (2) تكلفة الرأس — لكل حيوان لحد البيع أو النفوق: تكلفة الاقتناء (سعر الشراء أو صفر لو مولود) + نصيبه من تكلفة
// العلف/الأدوية الجماعية لأي دفعة تسمين (FatteningBatches) كان ضمنها (`allocatedCost` من
// computeFatteningBatchResults — انظر fattening-service.js، حسب طريقة توزيع كل دفعة؛ تتوقف تلقائيًا عند
// تاريخ النفوق لو الحيوان نفق وهو لسه بالدفعة، انظر deathRecords هناك) + تكلفة فردية مباشرة (HealthRecords.cost
// + أي مصروف رُبط مباشرة بهذا الحيوان عبر Expenses.linkedAnimalId، انظر getAnimalLinkedExpensesTotal في
// expense-service.js)، مقارنة بسعر بيعه الفردي إن وُجد (ربح/خسارة + نسبة الربح من الإيراد %)، أو — لو نفق بلا
// بيع — بخسارة كاملة (إجمالي التكلفة كخسارة، لا إيراد يقابلها). فلتر "الحالة" (حي/مباع/نافق/تحويل لمخزون
// تجارة) يحصر السجل. تبسيط معروف ومقصود: حيوان لم يدخل أي دفعة تسمين لا يظهر له نصيب علف/أدوية جماعي (لا
// يوجد ربط عام آخر بين مصروف علف عشوائي وحيوان بعينه في النظام — فقط ما رُبط صراحة عبر دفعة تسمين أو ربط فردي مباشر)

let _srAnimals = [];
let _srRevenues = [];
let _srBulkSales = [];
let _srHealthRecords = [];
let _srExpenses = [];
let _srWeights = [];
let _srInventoryMovements = [];
let _srFatteningBatches = [];
let _srDeaths = [];
let _srFeedMedCostByAnimal = {};
let _srEntryNumberByJournalEntryId = new Map();

let _currentExportColumns = null;
let _currentExportRows = null;
let _costExportColumns = null;
let _costExportRows = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('reports');
  renderSidebar('reports-sales');
  renderHeader('تقرير المبيعات وتكلفة الرأس');

  let _srJournalEntries;
  [_srAnimals, _srRevenues, _srBulkSales, _srHealthRecords, _srExpenses, _srWeights, _srInventoryMovements, _srFatteningBatches, _srDeaths, _srJournalEntries] = await Promise.all([
    getAllAnimals(), getAllRevenues(), getAllBulkSales(), getAllHealthRecords(),
    getAllExpenses(), getAllWeightRecords(), getAllInventoryMovements(), getAllFatteningBatches(), getAllDeaths(), getAllJournalEntries(),
  ]);
  _srEntryNumberByJournalEntryId = new Map(_srJournalEntries.map(e => [e.id, e.entryNumber]));

  // نصيب كل حيوان من تكلفة العلف/الأدوية الجماعية، مجمّعًا من كل دفعات التسمين اللي دخلها على مدار الوقت
  // (لو دخل نفس الحيوان أكتر من دفعة، أو دخل نفس الدفعة أكتر من مرة، بيتجمّع النصيب من كل مرة)
  _srFeedMedCostByAnimal = {};
  _srFatteningBatches.forEach(batch => {
    const results = computeFatteningBatchResults(batch, {
      expenses: _srExpenses,
      weightRecords: _srWeights,
      animals: _srAnimals,
      revenues: _srRevenues,
      healthRecords: _srHealthRecords,
      inventoryMovements: _srInventoryMovements,
      deathRecords: _srDeaths,
    });
    results.animalsResults.forEach(r => {
      _srFeedMedCostByAnimal[r.animalId] = (_srFeedMedCostByAnimal[r.animalId] || 0) + (r.allocatedCost || 0);
    });
  });

  document.getElementById('report-from').addEventListener('change', _renderReport);
  document.getElementById('report-to').addEventListener('change', _renderReport);
  document.getElementById('cost-status-filter').addEventListener('change', _renderReport);

  document.getElementById('export-excel-btn').addEventListener('click', () => {
    exportSectionsToExcel('تقرير المبيعات وتكلفة الرأس', [
      { title: 'المبيعات الموحّدة', columns: _currentExportColumns, rows: _currentExportRows },
      { title: 'تكلفة الرأس', columns: _costExportColumns, rows: _costExportRows },
    ]);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    exportSectionsToPdf('تقرير المبيعات وتكلفة الرأس', [
      { title: 'المبيعات الموحّدة', columns: _currentExportColumns, rows: _currentExportRows },
      { title: 'تكلفة الرأس', columns: _costExportColumns, rows: _costExportRows },
    ]);
  });

  _renderReport();
});

function _dateInRange(dateStr, from, to) {
  if (!dateStr) return false;
  if (from && dateStr < from) return false;
  if (to && dateStr > to) return false;
  return true;
}

// تفصيل تكلفة حيوان واحد (اقتناء + نصيب علف/أدوية جماعي + تكلفة فردية مباشرة) — نفس المنطق مستخدَم في قسمَي
// "سجل المبيعات" (لكل حيوان مباع فرديًا) و"تكلفة الرأس" (لكل الحيوانات)، بدالة واحدة تفاديًا لتكرار/تضارب الحساب
function _animalCostBreakdown(a) {
  const acquisitionCost = Number(a.purchasePrice || 0);
  const feedMedCost = _srFeedMedCostByAnimal[a.id] || 0;
  const healthCost = _srHealthRecords
    .filter(h => h.animalId === a.id && !h.isDeleted)
    .reduce((s, h) => s + Number(h.cost || 0), 0);
  const directExpenseCost = getAnimalLinkedExpensesTotal(a.id, _srExpenses);
  const individualCost = healthCost + directExpenseCost;
  const totalCost = acquisitionCost + feedMedCost + individualCost;
  return { acquisitionCost, feedMedCost, individualCost, totalCost };
}

function _renderReport() {
  const from = document.getElementById('report-from').value;
  const to = document.getElementById('report-to').value;

  // ===== المبيعات الموحّدة =====
  // animalId لا يُضبط إلا على إيرادات بيع حيوان فردي (revenue-form-page.js) — لا حاجة لمطابقة نص/حساب البند هنا
  const individualSales = _srRevenues
    .filter(r => r.animalId && ((!from && !to) || _dateInRange(r.date, from, to)))
    .map(r => {
      const animal = _srAnimals.find(a => a.id === r.animalId);
      const amount = Number(r.amount || 0);
      const costAmount = animal ? _animalCostBreakdown(animal).totalCost : 0;
      return {
        date: r.date,
        typeLabel: animal ? (ANIMAL_TYPE_LABELS[animal.type] || animal.type) : '-',
        detailLabel: animal ? `${animal.code} (${animal.breed})` : '-',
        countLabel: '1',
        amount,
        costAmount,
        profitAmount: amount - costAmount,
        sourceLabel: 'بيع فردي',
        journalEntryId: r.journalEntryId || null,
      };
    });

  const bulkSales = [];
  _srBulkSales.forEach(sale => {
    // عمليات source:'transfer' (تحويل داخلي من مخزون التجارة للقطيع، انظر transfer-service.js) وأسطر البيع
    // بسعر صفر معًا ليستا بيعًا فعليًا — طبقتا حماية (المصدر أولاً، ثم القيمة كخط دفاع ثانٍ لأي بيانات قديمة)
    if (sale.source === 'transfer') return;
    (sale.lines || []).forEach(line => {
      const amount = Number(line.count || 0) * Number(line.unitPrice || 0);
      if (amount <= 0) return;
      if (!((!from && !to) || _dateInRange(sale.date, from, to))) return;
      // تكلفة البضاعة المباعة (cogsAmount) محسوبة ومحفوظة وقت البيع نفسه عبر computeSaleLinesCosts()
      // (متوسط تكلفة متحرك، انظر bulk-batch-service.js) — لا إعادة حساب هنا، فقط قراءة اللقطة المحفوظة
      const costAmount = Number(line.cogsAmount || 0) || (Number(line.count || 0) * Number(line.avgCostAtSale || 0));
      bulkSales.push({
        date: sale.date,
        typeLabel: ANIMAL_TYPE_LABELS[line.type] || line.type,
        detailLabel: `${line.breed || '-'} — عملية بيع ${sale.code}`,
        countLabel: formatNumber(line.count),
        amount,
        costAmount,
        profitAmount: amount - costAmount,
        sourceLabel: 'بيع جماعي',
        // قيد واحد لكل عملية بيع جملة (لا لكل سطر بند ضمنها) — كل أسطر نفس sale.code تشترك بنفس رقم القيد
        journalEntryId: sale.journalEntryId || null,
      });
    });
  });

  const allSales = [...individualSales, ...bulkSales].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const salesRows = allSales.map(s => ({
    ...s,
    dateLabel: formatDateArabic(s.date),
    amountLabel: formatCurrency(s.amount),
    costLabel: formatCurrency(s.costAmount),
    profitLabel: `<strong style="color: var(--color-primary-${s.profitAmount >= 0 ? 'green' : 'red'}-dark);">${formatCurrency(s.profitAmount)}</strong>`,
    entryNumber: s.journalEntryId ? (_srEntryNumberByJournalEntryId.get(s.journalEntryId) || '-') : '-',
  }));

  const totalIndividualRevenue = individualSales.reduce((s, r) => s + r.amount, 0);
  const totalBulkRevenue = bulkSales.reduce((s, r) => s + r.amount, 0);
  const totalSalesRevenue = totalIndividualRevenue + totalBulkRevenue;
  const totalSalesCost = allSales.reduce((s, r) => s + r.costAmount, 0);
  const totalSalesProfit = totalSalesRevenue - totalSalesCost;

  // ===== تكلفة الرأس (تراكمي، بمعزل عن فلتر الفترة — لكن قابل للفلترة بحالة الحيوان) =====
  const costStatusFilter = document.getElementById('cost-status-filter').value;
  const deathDateByAnimalId = {};
  _srDeaths.forEach(d => { if (d.animalId) deathDateByAnimalId[d.animalId] = d.deathDate; });

  const nonDeletedAnimals = _srAnimals.filter(a => a.status !== 'deleted' && (!costStatusFilter || a.status === costStatusFilter));
  const costRows = nonDeletedAnimals.map(a => {
    const { acquisitionCost, feedMedCost, individualCost, totalCost } = _animalCostBreakdown(a);

    const saleRecord = _srRevenues.find(r => r.animalId === a.id);
    const salePrice = saleRecord ? Number(saleRecord.amount || 0) : null;

    // ثلاث حالات: (1) مباع فعليًا → ربح/خسارة حقيقي مقابل إيراد البيع، (2) نافق بلا بيع → خسارة كاملة
    // (كل التكلفة بلا أي إيراد يقابلها، لا معنى لنسبة ربح من إيراد صفري)، (3) لسه حي/محوَّل لمخزون التجارة
    // بلا بيع مباشر → لا ربح/خسارة محسومة بعد
    let outcome = null, profit = null, profitMarginPct = null;
    if (salePrice !== null) {
      outcome = 'sold';
      profit = salePrice - totalCost;
      profitMarginPct = salePrice ? (profit / salePrice) * 100 : null;
    } else if (a.status === 'dead') {
      outcome = 'deathLoss';
      profit = -totalCost;
    }

    return {
      code: a.code,
      typeLabel: ANIMAL_TYPE_LABELS[a.type] || a.type,
      breed: a.breed || '-',
      statusBadge: `<span class="badge ${a.status === 'sold' ? 'badge--blue' : a.status === 'dead' ? 'badge--red' : a.status === 'movedToTrade' ? 'badge--gray' : 'badge--green'}">${ANIMAL_STATUS_LABELS[a.status] || a.status}</span>`,
      acquisitionCostLabel: formatCurrency(acquisitionCost),
      feedMedCostLabel: feedMedCost > 0 ? formatCurrency(feedMedCost) : '-',
      individualCostLabel: formatCurrency(individualCost),
      totalCostLabel: formatCurrency(totalCost),
      salePriceLabel: salePrice !== null ? formatCurrency(salePrice) : (outcome === 'deathLoss' ? 'نفق (بلا بيع)' : '-'),
      profitLabel: profit !== null
        ? `<strong style="color: var(--color-primary-${profit >= 0 ? 'green' : 'red'}-dark);">${formatCurrency(profit)}${outcome === 'deathLoss' ? ' (خسارة نفوق)' : ''}</strong>`
        : '-',
      profitMarginLabel: profitMarginPct !== null
        ? `<strong style="color: var(--color-primary-${profitMarginPct >= 0 ? 'green' : 'red'}-dark);">${formatNumber(Math.round(profitMarginPct * 10) / 10)}%</strong>`
        : '-',
      _totalCost: totalCost,
      _profit: profit,
      _profitMarginPct: profitMarginPct,
      _outcome: outcome,
    };
  });

  const soldRows = costRows.filter(r => r._outcome === 'sold');
  const deathLossRows = costRows.filter(r => r._outcome === 'deathLoss');
  const avgCost = costRows.length ? costRows.reduce((s, r) => s + r._totalCost, 0) / costRows.length : 0;
  const avgProfit = soldRows.length ? soldRows.reduce((s, r) => s + r._profit, 0) / soldRows.length : 0;
  const marginRows = soldRows.filter(r => r._profitMarginPct !== null);
  const avgProfitMarginPct = marginRows.length ? marginRows.reduce((s, r) => s + r._profitMarginPct, 0) / marginRows.length : null;
  const totalDeathLoss = deathLossRows.reduce((s, r) => s + Math.abs(r._profit), 0);

  const container = document.getElementById('report-content');
  container.innerHTML = `
    <div class="overview-section-title">ملخّص المبيعات خلال الفترة المحدّدة</div>
    ${kpiGrid([
      { value: formatCurrency(totalIndividualRevenue), label: 'إيراد البيع الفردي', tone: 'blue', icon: '🐑' },
      { value: formatCurrency(totalBulkRevenue), label: 'إيراد البيع الجماعي', tone: 'blue', icon: '📦' },
      { value: formatCurrency(totalSalesRevenue), label: 'إجمالي المبيعات', tone: 'green', icon: '💰' },
      { value: formatNumber(allSales.length), label: 'عدد عمليات البيع', tone: 'blue' },
      { value: formatCurrency(totalSalesCost), label: 'إجمالي التكلفة', tone: 'red' },
      { value: formatCurrency(totalSalesProfit), label: 'إجمالي الربح/الخسارة', tone: totalSalesProfit >= 0 ? 'green' : 'red' },
    ])}

    <div class="overview-section-title">سجل المبيعات</div>
    <div id="sales-table"></div>

    <div class="overview-section-title">تكلفة الرأس <span style="font-size:12px; font-weight:400; color: var(--color-text-secondary);">(رصيد تراكمي لكل حيوان لحد البيع أو النفوق — تكلفة الاقتناء + نصيبه من العلف/الأدوية الجماعية (دفعات التسمين، تتوقف عند تاريخ النفوق) + تكلفته الفردية المباشرة (صحية + مصروفات مربوطة به مباشرة)؛ استخدم فلتر "حالة الحيوان" أعلى الصفحة لحصر السجل)</span></div>
    ${kpiGrid([
      { value: formatNumber(costRows.length), label: 'عدد الرؤوس المحتسبة', tone: 'blue' },
      { value: formatCurrency(avgCost), label: 'متوسط تكلفة الرأس', tone: 'red' },
      { value: formatCurrency(avgProfit), label: 'متوسط ربح الرأس المباع', tone: avgProfit >= 0 ? 'green' : 'red' },
      { value: avgProfitMarginPct !== null ? `${formatNumber(Math.round(avgProfitMarginPct * 10) / 10)}%` : '-', label: 'متوسط نسبة الربح من الإيراد', tone: (avgProfitMarginPct || 0) >= 0 ? 'green' : 'red' },
      { value: formatNumber(deathLossRows.length), label: 'عدد حالات النفوق المحتسبة', tone: deathLossRows.length ? 'red' : 'blue', icon: '💀' },
      { value: formatCurrency(totalDeathLoss), label: 'إجمالي خسائر النفوق', tone: totalDeathLoss > 0 ? 'red' : 'blue', icon: '📉' },
    ], 3)}
    <div id="cost-table"></div>
  `;

  renderDataTable('sales-table', [
    { key: 'dateLabel', label: 'التاريخ', sortable: true },
    { key: 'entryNumber', label: 'رقم القيد', sortable: false },
    { key: 'typeLabel', label: 'النوع', sortable: false },
    { key: 'detailLabel', label: 'التفاصيل', sortable: false },
    { key: 'countLabel', label: 'العدد', sortable: false },
    { key: 'amountLabel', label: 'سعر البيع', sortable: false },
    { key: 'costLabel', label: 'إجمالي التكلفة', sortable: false },
    { key: 'profitLabel', label: 'الربح/الخسارة', sortable: false },
    { key: 'sourceLabel', label: 'المصدر', sortable: false },
  ], salesRows, {
    emptyMessage: 'لا توجد عمليات بيع خلال هذه الفترة',
    onRowClick: (row) => { if (row.journalEntryId) window.location.href = `../accounting/journal-entry-form.html?id=${row.journalEntryId}`; },
    footerRow: {
      dateLabel: 'الإجمالي', entryNumber: '', typeLabel: '', detailLabel: '', countLabel: '',
      amountLabel: formatCurrency(totalSalesRevenue),
      costLabel: formatCurrency(totalSalesCost),
      profitLabel: `<strong style="color: var(--color-primary-${totalSalesProfit >= 0 ? 'green' : 'red'}-dark);">${formatCurrency(totalSalesProfit)}</strong>`,
      sourceLabel: '',
    },
  });

  renderDataTable('cost-table', [
    { key: 'code', label: 'الكود', sortable: true },
    { key: 'typeLabel', label: 'النوع', sortable: true },
    { key: 'breed', label: 'السلالة', sortable: true },
    { key: 'statusBadge', label: 'الحالة', sortable: false },
    { key: 'acquisitionCostLabel', label: 'تكلفة الاقتناء', sortable: false },
    { key: 'feedMedCostLabel', label: 'تكلفة العلف/الأدوية', sortable: false },
    { key: 'individualCostLabel', label: 'تكلفة فردية مباشرة (صحية + مصروفات)', sortable: false },
    { key: 'totalCostLabel', label: 'إجمالي التكلفة', sortable: false },
    { key: 'salePriceLabel', label: 'سعر البيع', sortable: false },
    { key: 'profitLabel', label: 'الربح/الخسارة', sortable: false },
    { key: 'profitMarginLabel', label: 'نسبة الربح من الإيراد', sortable: false },
  ], costRows, {
    emptyMessage: 'لا توجد حيوانات مسجَّلة بعد',
  });

  _currentExportColumns = [
    { key: 'dateLabel', label: 'التاريخ' }, { key: 'entryNumber', label: 'رقم القيد' }, { key: 'typeLabel', label: 'النوع' }, { key: 'detailLabel', label: 'التفاصيل' },
    { key: 'countLabel', label: 'العدد' }, { key: 'amountLabel', label: 'سعر البيع' }, { key: 'costLabel', label: 'إجمالي التكلفة' },
    { key: 'profitLabel', label: 'الربح/الخسارة' }, { key: 'sourceLabel', label: 'المصدر' },
  ];
  _currentExportRows = salesRows;

  _costExportColumns = [
    { key: 'code', label: 'الكود' }, { key: 'typeLabel', label: 'النوع' }, { key: 'breed', label: 'السلالة' },
    { key: 'statusBadge', label: 'الحالة' },
    { key: 'acquisitionCostLabel', label: 'تكلفة الاقتناء' }, { key: 'feedMedCostLabel', label: 'تكلفة العلف/الأدوية' },
    { key: 'individualCostLabel', label: 'تكلفة فردية مباشرة (صحية + مصروفات)' }, { key: 'totalCostLabel', label: 'إجمالي التكلفة' },
    { key: 'salePriceLabel', label: 'سعر البيع' }, { key: 'profitLabel', label: 'الربح/الخسارة' }, { key: 'profitMarginLabel', label: 'نسبة الربح من الإيراد' },
  ];
  _costExportRows = costRows;
}
