// js/pages/asset-reports-page.js
// تقارير الأصول الثابتة (المرحلة 1): سجل الأصول/حسب النوع/حسب الموقع/مجمع الإهلاك/القيمة الدفترية/الإهلاك الشهري

let _allAssetsForReports = [];
let _allTransactionsForReports = [];
let _allDepreciationTxnsForReports = [];
let _allCountsForReports = [];
let _locationNameByIdForReports = {};
let _entryNumberByJournalEntryIdForAssets = new Map();
let _activeAssetReportTab = 'all';
let _currentExportColumns = null;
let _currentExportRows = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('reports');
  renderSidebar('reports-assets');
  renderHeader('تقارير الأصول الثابتة');

  const [assets, transactions, locations, counts, journalEntries] = await Promise.all([
    getAllFixedAssets(), getAllFixedAssetTransactions(), getAllLocations(), getAllFixedAssetCounts(), getAllJournalEntries(),
  ]);
  _allAssetsForReports = assets;
  _allTransactionsForReports = transactions;
  _allDepreciationTxnsForReports = transactions.filter(t => t.type === 'depreciation');
  _allCountsForReports = counts;
  _locationNameByIdForReports = Object.fromEntries(locations.map(l => [l.id, l.name]));
  _entryNumberByJournalEntryIdForAssets = new Map(journalEntries.map(e => [e.id, e.entryNumber]));

  document.querySelectorAll('.report-tabs [data-tab]').forEach(btn => {
    btn.addEventListener('click', () => _switchTab(btn.dataset.tab));
  });
  document.getElementById('report-period').addEventListener('change', () => _renderTab());

  document.getElementById('export-excel-btn').addEventListener('click', () => {
    if (_currentExportColumns) exportRowsToExcel('تقرير_الأصول_الثابتة', _currentExportColumns, _currentExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    if (_currentExportColumns) exportRowsToPdf('تقرير الأصول الثابتة', _currentExportColumns, _currentExportRows);
  });

  const now = new Date();
  document.getElementById('report-period').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  _renderTab();
});

function _switchTab(tab) {
  _activeAssetReportTab = tab;
  document.querySelectorAll('.report-tabs [data-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.getElementById('period-filters').style.display = tab === 'monthly' ? '' : 'none';
  _renderTab();
}

// رقم قيد إن وُجد id فعلي، وإلا '-' — دالة مشتركة بين الأقسام الثلاثة التي تعرض "رقم القيد" (سجل الأصول/
// الإهلاك الشهري/المباعة والمستبعدة)
function _assetEntryNumberFor(journalEntryId) {
  return journalEntryId ? (_entryNumberByJournalEntryIdForAssets.get(journalEntryId) || '-') : '-';
}
function _goToJournalEntry(journalEntryId) {
  if (journalEntryId) window.location.href = `../accounting/journal-entry-form.html?id=${journalEntryId}`;
}

const _DETAIL_COLUMNS = [
  { key: 'assetCode', label: 'الكود' },
  { key: 'name', label: 'اسم الأصل' },
  { key: 'typeLabel', label: 'النوع' },
  { key: 'locationLabel', label: 'الموقع' },
  { key: 'entryNumber', label: 'رقم قيد الاقتناء' },
  { key: 'costLabel', label: 'التكلفة' },
  { key: 'depreciationLabel', label: 'مجمع الإهلاك' },
  { key: 'bookValueLabel', label: 'القيمة الدفترية' },
  { key: 'statusLabel', label: 'الحالة' },
];

function _toDetailRow(asset) {
  return {
    assetCode: asset.assetCode,
    name: asset.name,
    typeLabel: FIXED_ASSET_TYPE_LABELS[asset.assetType] || asset.assetType,
    locationLabel: _locationNameByIdForReports[asset.locationId] || '-',
    // قيد الاقتناء الأصلي فقط (FixedAssets.journalEntryId) — لا قيود التحسينات/الإهلاك/البيع اللاحقة، انظر
    // تبويبَي "الإهلاك الشهري"/"المباعة والمستبعدة" أدناه لتلك
    entryNumber: _assetEntryNumberFor(asset.journalEntryId),
    journalEntryId: asset.journalEntryId || null,
    costLabel: formatCurrency(computeAssetCostBasis(asset)),
    depreciationLabel: formatCurrency(asset.accumulatedDepreciation || 0),
    bookValueLabel: formatCurrency(computeAssetBookValue(asset)),
    statusLabel: FIXED_ASSET_STATUS_LABELS[asset.assetStatus] || asset.assetStatus,
    _cost: computeAssetCostBasis(asset),
    _depreciation: Number(asset.accumulatedDepreciation || 0),
    _bookValue: computeAssetBookValue(asset),
  };
}

function _renderDetailTable(assets, options = {}) {
  let rows = assets.map(_toDetailRow);
  if (options.sortByBookValueAsc) rows.sort((a, b) => a._bookValue - b._bookValue);
  if (options.sortByDepreciationDesc) rows.sort((a, b) => b._depreciation - a._depreciation);

  _currentExportColumns = _DETAIL_COLUMNS;
  _currentExportRows = rows;
  document.getElementById('report-content').innerHTML = '<div id="asset-report-table"></div>';
  renderDataTable('asset-report-table', _DETAIL_COLUMNS.map(c => ({ ...c, sortable: true })), rows, {
    emptyMessage: 'لا توجد أصول مطابقة',
    onRowClick: (row) => _goToJournalEntry(row.journalEntryId),
  });
}

const _GROUP_COLUMNS = [
  { key: 'groupLabel', label: 'المجموعة' },
  { key: 'countLabel', label: 'عدد الأصول' },
  { key: 'costLabel', label: 'إجمالي التكلفة' },
  { key: 'depreciationLabel', label: 'إجمالي مجمع الإهلاك' },
  { key: 'bookValueLabel', label: 'إجمالي القيمة الدفترية' },
];

function _renderGroupedTable(assets, groupKeyFn) {
  const groups = {};
  assets.forEach(asset => {
    const { key, label } = groupKeyFn(asset);
    if (!groups[key]) groups[key] = { label, count: 0, cost: 0, depreciation: 0, bookValue: 0 };
    groups[key].count += 1;
    groups[key].cost += computeAssetCostBasis(asset);
    groups[key].depreciation += Number(asset.accumulatedDepreciation || 0);
    groups[key].bookValue += computeAssetBookValue(asset);
  });

  const rows = Object.values(groups).map(g => ({
    groupLabel: g.label,
    countLabel: formatNumber(g.count),
    costLabel: formatCurrency(g.cost),
    depreciationLabel: formatCurrency(g.depreciation),
    bookValueLabel: formatCurrency(g.bookValue),
  }));

  _currentExportColumns = _GROUP_COLUMNS;
  _currentExportRows = rows;
  document.getElementById('report-content').innerHTML = '<div id="asset-report-table"></div>';
  renderDataTable('asset-report-table', _GROUP_COLUMNS.map(c => ({ ...c, sortable: true })), rows, {
    emptyMessage: 'لا توجد بيانات',
  });
}

const _MONTHLY_COLUMNS = [
  { key: 'dateLabel', label: 'تاريخ الترحيل' },
  { key: 'entryNumber', label: 'رقم القيد' },
  { key: 'assetCode', label: 'كود الأصل' },
  { key: 'name', label: 'اسم الأصل' },
  { key: 'typeLabel', label: 'النوع' },
  { key: 'amountLabel', label: 'مبلغ الإهلاك' },
];

function _renderMonthlyTable() {
  const period = document.getElementById('report-period').value;
  const assetsById = Object.fromEntries(_allAssetsForReports.map(a => [a.id, a]));
  const txns = _allDepreciationTxnsForReports.filter(t => !period || t.period === period);

  const rows = txns.map(t => {
    const asset = assetsById[t.assetId];
    return {
      dateLabel: formatDateArabic(t.date),
      entryNumber: _assetEntryNumberFor(t.journalEntryId),
      journalEntryId: t.journalEntryId || null,
      assetCode: asset?.assetCode || '-',
      name: asset?.name || 'أصل محذوف',
      typeLabel: asset ? (FIXED_ASSET_TYPE_LABELS[asset.assetType] || asset.assetType) : '-',
      amountLabel: formatCurrency(t.amount),
    };
  });

  const total = txns.reduce((s, t) => s + Number(t.amount || 0), 0);

  _currentExportColumns = _MONTHLY_COLUMNS;
  _currentExportRows = rows;
  document.getElementById('report-content').innerHTML = '<div id="asset-report-table"></div>';
  renderDataTable('asset-report-table', _MONTHLY_COLUMNS.map(c => ({ ...c, sortable: true })), rows, {
    emptyMessage: 'لا يوجد إهلاك مرحّل لهذا الشهر',
    onRowClick: (row) => _goToJournalEntry(row.journalEntryId),
    footerRow: { dateLabel: '', entryNumber: '', assetCode: '', name: '', typeLabel: 'الإجمالي', amountLabel: formatCurrency(total) },
  });
}

const _SOLD_DISPOSED_COLUMNS = [
  { key: 'dateLabel', label: 'التاريخ' },
  { key: 'entryNumber', label: 'رقم القيد' },
  { key: 'assetCode', label: 'الكود' },
  { key: 'name', label: 'اسم الأصل' },
  { key: 'typeLabel', label: 'النوع' },
  { key: 'statusLabel', label: 'الحالة' },
  { key: 'costLabel', label: 'التكلفة' },
  { key: 'amountLabel', label: 'سعر البيع/الخسارة' },
  { key: 'gainLossLabel', label: 'ربح/خسارة' },
  { key: 'notesLabel', label: 'ملاحظات' },
];

function _renderSoldDisposedTable() {
  const soldDisposedAssets = _allAssetsForReports.filter(a => a.assetStatus === 'sold' || a.assetStatus === 'disposed');
  const rows = soldDisposedAssets.map(asset => {
    const txn = [..._allTransactionsForReports]
      .filter(t => Number(t.assetId) === asset.id && (t.type === 'sale' || t.type === 'disposal'))
      .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    const costBasis = computeAssetCostBasis(asset);
    const accumulatedDepreciation = Number(asset.accumulatedDepreciation || 0);
    const bookValueAtEvent = costBasis - accumulatedDepreciation;
    const gainLoss = asset.assetStatus === 'sold' ? Number(txn?.amount || 0) - bookValueAtEvent : -bookValueAtEvent;
    return {
      dateLabel: txn ? formatDateArabic(txn.date) : '-',
      entryNumber: _assetEntryNumberFor(txn?.journalEntryId),
      journalEntryId: txn?.journalEntryId || null,
      assetCode: asset.assetCode,
      name: asset.name,
      typeLabel: FIXED_ASSET_TYPE_LABELS[asset.assetType] || asset.assetType,
      statusLabel: FIXED_ASSET_STATUS_LABELS[asset.assetStatus] || asset.assetStatus,
      costLabel: formatCurrency(costBasis),
      amountLabel: formatCurrency(txn?.amount || 0),
      gainLossLabel: gainLoss >= 0 ? `ربح ${formatCurrency(gainLoss)}` : `خسارة ${formatCurrency(-gainLoss)}`,
      notesLabel: txn?.notes || '-',
    };
  });

  _currentExportColumns = _SOLD_DISPOSED_COLUMNS;
  _currentExportRows = rows;
  document.getElementById('report-content').innerHTML = '<div id="asset-report-table"></div>';
  renderDataTable('asset-report-table', _SOLD_DISPOSED_COLUMNS.map(c => ({ ...c, sortable: true })), rows, {
    emptyMessage: 'لا توجد أصول مباعة أو مستبعدة بعد',
    onRowClick: (row) => _goToJournalEntry(row.journalEntryId),
  });
}

const _COUNT_REPORT_COLUMNS = [
  { key: 'assetCode', label: 'الكود' },
  { key: 'name', label: 'اسم الأصل' },
  { key: 'typeLabel', label: 'النوع' },
  { key: 'lastCountDateLabel', label: 'آخر جرد' },
  { key: 'lastResultLabel', label: 'نتيجة آخر جرد' },
  { key: 'notesLabel', label: 'ملاحظات آخر جرد' },
];

function _renderCountReportTable() {
  const activeAssets = _allAssetsForReports.filter(a => a.assetStatus !== 'sold' && a.assetStatus !== 'disposed');
  const rows = activeAssets.map(asset => {
    const latest = getLatestCountLineForAsset(asset.id, _allCountsForReports);
    return {
      assetCode: asset.assetCode,
      name: asset.name,
      typeLabel: FIXED_ASSET_TYPE_LABELS[asset.assetType] || asset.assetType,
      lastCountDateLabel: latest ? formatDateArabic(latest.count.date) : 'لم يُجرد بعد',
      lastResultLabel: latest ? (FIXED_ASSET_COUNT_RESULT_LABELS[latest.line.resultStatus] || latest.line.resultStatus) : '-',
      notesLabel: latest?.line.notes || '-',
    };
  });

  _currentExportColumns = _COUNT_REPORT_COLUMNS;
  _currentExportRows = rows;
  document.getElementById('report-content').innerHTML = '<div id="asset-report-table"></div>';
  renderDataTable('asset-report-table', _COUNT_REPORT_COLUMNS.map(c => ({ ...c, sortable: true })), rows, {
    emptyMessage: 'لا توجد أصول نشطة',
  });
}

function _renderTab() {
  const all = _allAssetsForReports;

  switch (_activeAssetReportTab) {
    case 'all':
      return _renderDetailTable(all);
    case 'byType':
      return _renderGroupedTable(all, a => ({ key: a.assetType, label: FIXED_ASSET_TYPE_LABELS[a.assetType] || a.assetType }));
    case 'byLocation':
      return _renderGroupedTable(all, a => ({ key: a.locationId || 'none', label: _locationNameByIdForReports[a.locationId] || 'بلا موقع محدد' }));
    case 'depreciation':
      return _renderDetailTable(all.filter(a => Number(a.accumulatedDepreciation || 0) > 0.01), { sortByDepreciationDesc: true });
    case 'bookValue':
      return _renderDetailTable(all, { sortByBookValueAsc: true });
    case 'monthly':
      return _renderMonthlyTable();
    case 'soldDisposed':
      return _renderSoldDisposedTable();
    case 'countReport':
      return _renderCountReportTable();
    default:
      return _renderDetailTable(all);
  }
}
