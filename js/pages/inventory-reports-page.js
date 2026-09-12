// js/pages/inventory-reports-page.js

let _allInventoryItemsForReport = [];
let _allInventoryMovementsForReport = [];
let _currentExportColumns = null;
let _currentExportRows = null;
let _currentMovementExportColumns = null;
let _currentMovementExportRows = null;
// ربط كل حركة تلقائية (relatedExpenseId/relatedPurchaseId) برقم القيد المحاسبي لمصدرها — نفس نمط عمود
// "رقم القيد" في inventory-movement-list-page.js/revenue-list-page.js
let _journalEntryIdByExpenseIdForInvReport = new Map();
let _journalEntryIdByPurchaseIdForInvReport = new Map();
let _entryNumberByJournalEntryIdForInvReport = new Map();

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('reports');
  renderSidebar('reports-inventory');
  renderHeader('تقارير المخزون');

  const [items, movements, expenses, purchases, journalEntries] = await Promise.all([
    getAllInventoryItems(),
    getAllInventoryMovements(),
    getAllExpenses(),
    getAllPurchases(),
    getAllJournalEntries(),
  ]);
  _allInventoryItemsForReport = items;
  _allInventoryMovementsForReport = movements;
  _journalEntryIdByExpenseIdForInvReport = new Map(expenses.filter(e => e.journalEntryId).map(e => [e.id, e.journalEntryId]));
  _journalEntryIdByPurchaseIdForInvReport = new Map(purchases.filter(p => p.journalEntryId).map(p => [p.id, p.journalEntryId]));
  _entryNumberByJournalEntryIdForInvReport = new Map(journalEntries.map(e => [e.id, e.entryNumber]));

  const itemSelect = document.getElementById('report-item');
  itemSelect.innerHTML = `<option value="">-- كل الأصناف --</option>` +
    [..._allInventoryItemsForReport]
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'))
      .map(i => `<option value="${i.id}">${i.name}</option>`).join('');
  itemSelect.addEventListener('change', _renderInventoryReport);

  document.getElementById('report-from').addEventListener('change', _renderInventoryReport);
  document.getElementById('report-to').addEventListener('change', _renderInventoryReport);
  document.getElementById('reset-period-btn').addEventListener('click', () => {
    document.getElementById('report-from').value = '';
    document.getElementById('report-to').value = '';
    _renderInventoryReport();
  });

  // التصدير (Excel/PDF) يضم قسمين معًا في نفس الملف: الرصيد لكل صنف + سجل الحركات خلال الفترة
  document.getElementById('export-excel-btn').addEventListener('click', () => {
    exportSectionsToExcel('تقرير المخزون', [
      { title: 'الرصيد لكل صنف', columns: _currentExportColumns, rows: _currentExportRows },
      { title: 'سجل الحركات', columns: _currentMovementExportColumns, rows: _currentMovementExportRows },
    ]);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    exportSectionsToPdf('تقرير المخزون', [
      { title: 'الرصيد لكل صنف', columns: _currentExportColumns, rows: _currentExportRows },
      { title: 'سجل الحركات', columns: _currentMovementExportColumns, rows: _currentMovementExportRows },
    ]);
  });

  _renderInventoryReport();
});

// رقم القيد المحاسبي لمصدر حركة تلقائية (مصروف أو مشترى)، أو null لحركة يدوية/بلا قيد بعد — نسخة طبق
// الأصل من نفس الدالة في inventory-movement-list-page.js
function _journalEntryNumberForInvReportMovement(movement) {
  let journalEntryId = null;
  if (movement.relatedExpenseId) journalEntryId = _journalEntryIdByExpenseIdForInvReport.get(movement.relatedExpenseId) || null;
  else if (movement.relatedPurchaseId) journalEntryId = _journalEntryIdByPurchaseIdForInvReport.get(movement.relatedPurchaseId) || null;
  if (!journalEntryId) return null;
  const entryNumber = _entryNumberByJournalEntryIdForInvReport.get(journalEntryId);
  return entryNumber ? { journalEntryId, entryNumber } : null;
}

function _renderInventoryReport() {
  const from = document.getElementById('report-from').value;
  const to = document.getElementById('report-to').value;
  const itemFilterValue = document.getElementById('report-item').value;
  const itemFilterId = itemFilterValue ? Number(itemFilterValue) : null;
  const isPeriodMode = !!(from || to); // أي تاريخ مُدخل (من أو إلى) يكفي لتفعيل وضع "الفترة" فورًا بلا حاجة لأي زر إضافي
  const asOfDate = to || todayIso();
  const periodLabel = isPeriodMode ? 'خلال الفترة' : 'الإجمالي (كل الفترات)';

  // اختيار صنف معيّن يقصر كل شيء (KPIs/رسم التوزيع/جدول الأرصدة/سجل الحركات) عليه وحده — بفلترة الحركات
  // من هذه النقطة المبكرة فقط، فتنعكس تلقائيًا على كل الحسابات التالية بلا تكرار الفلتر في كل قسم
  const itemsInScope = itemFilterId ? _allInventoryItemsForReport.filter(i => i.id === itemFilterId) : _allInventoryItemsForReport;
  const periodMovements = _allInventoryMovementsForReport.filter(m =>
    (!from || m.date >= from) && (!to || m.date <= to) && (!itemFilterId || m.itemId === itemFilterId)
  );
  const asOfMovements = _allInventoryMovementsForReport.filter(m => m.date <= asOfDate && (!itemFilterId || m.itemId === itemFilterId));

  const incomingCount = periodMovements.filter(m => m.direction === 'in').length;
  const outgoingCount = periodMovements.filter(m => m.direction === 'out').length;

  // في وضع "تحديد فترة": الرصيد = صافي حركة الفترة فقط (وارد − صادر، بصرف النظر عن أي رصيد قبلها)،
  // وآخر سعر شراء يُحسب من مشتريات الفترة نفسها فقط — لا تُحسب حالة "تحت حد الطلب" (مفهوم يخص الرصيد الفعلي
  // اللحظي لا صافي حركة فترة)، وتُستبعد الأصناف التي لم تتحرك إطلاقًا خلال الفترة.
  // في وضع "الحالي": الرصيد تراكمي فعلي كما في تاريخ "إلى" (أو اليوم)، وتظهر كل الأصناف المكوَّدة دومًا.
  let itemRows = itemsInScope.map(item => {
    const periodIn = periodMovements.filter(m => m.itemId === item.id && m.direction === 'in').reduce((s, m) => s + Number(m.quantity || 0), 0);
    const periodOut = periodMovements.filter(m => m.itemId === item.id && m.direction === 'out').reduce((s, m) => s + Number(m.quantity || 0), 0);

    if (isPeriodMode) {
      const netQty = periodIn - periodOut;
      const periodLastPrice = getLastPurchasePrice(item, periodMovements);
      return {
        nameLabel: item.name,
        categoryLabel: INVENTORY_CATEGORY_LABELS[item.category] || item.category,
        unitLabel: item.unit || '-',
        periodInLabel: formatNumber(periodIn),
        periodOutLabel: formatNumber(periodOut),
        balanceLabel: (netQty > 0 ? '+' : '') + formatNumber(netQty),
        lastPriceLabel: periodLastPrice !== null ? formatCurrency(periodLastPrice) : '-',
        _hasActivity: periodIn > 0 || periodOut > 0,
      };
    }

    const { currentQty, isLowStock } = computeItemStockLevel(item, asOfMovements);
    const lastPrice = getLastPurchasePrice(item, asOfMovements);
    return {
      nameLabel: item.name,
      categoryLabel: INVENTORY_CATEGORY_LABELS[item.category] || item.category,
      unitLabel: item.unit || '-',
      periodInLabel: formatNumber(periodIn),
      periodOutLabel: formatNumber(periodOut),
      balanceLabel: formatNumber(currentQty),
      lastPriceLabel: lastPrice !== null ? formatCurrency(lastPrice) : '-',
      thresholdLabel: isRequired(item.reorderThreshold) ? formatNumber(item.reorderThreshold) : '-',
      statusLabel: isLowStock ? '<span class="badge badge--red">منخفض</span>' : '<span class="badge badge--green">متوفر</span>',
      isLowStock,
    };
  });

  const lowStockCount = isPeriodMode ? 0 : itemRows.filter(r => r.isLowStock).length;
  if (isPeriodMode) itemRows = itemRows.filter(r => r._hasActivity);

  const reasonCounts = {};
  periodMovements.forEach(m => {
    reasonCounts[m.reasonType] = (reasonCounts[m.reasonType] || 0) + 1;
  });
  const reasonKeys = Object.keys(reasonCounts);

  const container = document.getElementById('report-content');
  container.innerHTML = `
    ${kpiGrid([
      isPeriodMode
        ? { value: formatNumber(itemRows.length), label: 'أصناف تحرّكت خلال الفترة', tone: 'blue', icon: '📦' }
        : { value: formatNumber(itemsInScope.length), label: itemFilterId ? 'الصنف المختار' : 'عدد الأصناف المكوَّدة', tone: 'blue', icon: '📦' },
      isPeriodMode
        ? { value: formatNumber(incomingCount + outgoingCount), label: 'إجمالي عدد الحركات خلال الفترة', tone: 'blue', icon: '🔄' }
        : { value: formatNumber(lowStockCount), label: `أصناف تحت حد الطلب (كما في ${formatDateArabic(asOfDate)})`, tone: lowStockCount > 0 ? 'red' : 'blue', icon: '📉' },
      { value: formatNumber(incomingCount), label: `حركات وارد (${periodLabel})`, tone: 'green', icon: '⬇️' },
      { value: formatNumber(outgoingCount), label: `حركات صادر (${periodLabel})`, tone: 'red', icon: '⬆️' },
    ])}
    <div class="card" style="margin-bottom: var(--spacing-3);">
      <div class="card__header"><h3>توزيع حركات المخزون حسب السبب (${periodLabel})</h3></div>
      <div class="chart-box"><canvas id="inv-reason-chart"></canvas></div>
    </div>

    <div class="overview-section-title" style="font-size:15px; font-weight:800; margin-bottom: var(--spacing-2);">${isPeriodMode ? 'صافي حركة كل صنف' : 'الرصيد لكل صنف'} <span style="font-size:12px; font-weight:400; color: var(--color-text-secondary);">${isPeriodMode ? '(خلال الفترة المختارة فقط)' : `(كما في ${formatDateArabic(asOfDate)})`}</span></div>
    <div id="inv-report-table"></div>

    <div class="overview-section-title" style="font-size:15px; font-weight:800; margin: var(--spacing-4) 0 var(--spacing-2);">سجل الحركات (${periodLabel})</div>
    <div id="inv-movements-table"></div>
  `;

  renderPieChart(
    'inv-reason-chart',
    reasonKeys.map(k => INVENTORY_REASON_LABELS[k] || k),
    reasonKeys.map(k => reasonCounts[k]),
  );

  const columns = [
    { key: 'nameLabel', label: 'الصنف', sortable: true },
    { key: 'categoryLabel', label: 'التصنيف', sortable: true },
    { key: 'unitLabel', label: 'الوحدة', sortable: false },
    { key: 'periodInLabel', label: `وارد (${periodLabel})`, sortable: false },
    { key: 'periodOutLabel', label: `صادر (${periodLabel})`, sortable: false },
    { key: 'balanceLabel', label: isPeriodMode ? 'صافي الحركة (وارد − صادر)' : 'الرصيد', sortable: false },
    { key: 'lastPriceLabel', label: isPeriodMode ? 'آخر سعر شراء خلال الفترة' : 'آخر سعر شراء (للوحدة)', sortable: false },
    ...(isPeriodMode ? [] : [
      { key: 'thresholdLabel', label: 'حد الطلب', sortable: false },
      { key: 'statusLabel', label: 'الحالة', sortable: false },
    ]),
  ];

  _currentExportColumns = columns;
  _currentExportRows = itemRows;

  renderDataTable('inv-report-table', columns, itemRows, {
    searchable: false,
    pageSize: itemRows.length || 1,
    emptyMessage: isPeriodMode ? 'لا توجد حركة على أي صنف خلال هذه الفترة' : 'لا توجد أصناف مخزون مكوَّدة بعد',
  });

  const movementRows = [...periodMovements]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map(m => {
      const item = _allInventoryItemsForReport.find(i => i.id === m.itemId);
      const entryRef = _journalEntryNumberForInvReportMovement(m);
      return {
        dateLabel: formatDateArabic(m.date),
        itemLabel: item ? item.name : 'صنف محذوف',
        directionBadge: m.direction === 'in' ? '<span class="badge badge--green">وارد</span>' : '<span class="badge badge--red">صادر</span>',
        quantityLabel: formatNumber(m.quantity),
        unitCostLabel: isRequired(m.unitCost) ? formatCurrency(m.unitCost) : '-',
        reasonLabel: INVENTORY_REASON_LABELS[m.reasonType] || m.reasonType || '-',
        entryNumberLink: entryRef
          ? `<a href="../accounting/journal-entry-form.html?id=${entryRef.journalEntryId}">${entryRef.entryNumber}</a>`
          : '-',
        notes: m.notes || '-',
      };
    });

  const movementColumns = [
    { key: 'dateLabel', label: 'التاريخ', sortable: true },
    { key: 'itemLabel', label: 'الصنف', sortable: true },
    { key: 'directionBadge', label: 'الاتجاه', sortable: false },
    { key: 'quantityLabel', label: 'الكمية', sortable: false },
    { key: 'unitCostLabel', label: 'تكلفة الوحدة', sortable: false },
    { key: 'reasonLabel', label: 'السبب', sortable: true },
    { key: 'entryNumberLink', label: 'رقم القيد', sortable: false },
    { key: 'notes', label: 'ملاحظات', sortable: false },
  ];

  _currentMovementExportColumns = movementColumns;
  _currentMovementExportRows = movementRows;

  renderDataTable('inv-movements-table', movementColumns, movementRows, {
    emptyMessage: 'لا توجد حركات مسجّلة خلال هذه الفترة',
  });
}
