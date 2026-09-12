// js/pages/asset-list-page.js

let _allAssetsCache = [];
let _locationNameById = {};

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('assets');
  renderSidebar('assets-list');
  renderHeader('سجل الأصول الثابتة');

  if (!hasActionPermission('assets', 'add')) {
    document.getElementById('add-asset-btn').style.display = 'none';
  }
  if (!hasActionPermission('assets', 'export')) {
    document.getElementById('export-excel-btn').style.display = 'none';
  }
  if (!hasActionPermission('assets', 'export') || !hasActionPermission('assets', 'print')) {
    document.getElementById('export-pdf-btn').style.display = 'none';
  }

  const [assets, locations] = await Promise.all([getAllFixedAssets(), getAllLocations()]);
  _allAssetsCache = assets;
  _locationNameById = Object.fromEntries(locations.map(l => [l.id, l.name]));

  const typeFilter = document.getElementById('filter-type');
  Object.entries(FIXED_ASSET_TYPE_LABELS).forEach(([value, label]) => {
    typeFilter.innerHTML += `<option value="${value}">${label}</option>`;
  });
  typeFilter.addEventListener('change', _drawTable);

  document.getElementById('export-excel-btn').addEventListener('click', () => {
    exportRowsToExcel('سجل_الأصول_الثابتة', _assetExportColumns, _assetExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    exportRowsToPdf('سجل الأصول الثابتة', _assetExportColumns, _assetExportRows);
  });

  _drawTable();
});

const _assetExportColumns = [
  { key: 'assetCode', label: 'الكود' },
  { key: 'name', label: 'اسم الأصل' },
  { key: 'typeLabel', label: 'النوع' },
  { key: 'locationLabel', label: 'الموقع' },
  { key: 'costLabel', label: 'التكلفة' },
  { key: 'depreciationLabel', label: 'مجمع الإهلاك' },
  { key: 'bookValueLabel', label: 'القيمة الدفترية' },
  { key: 'statusLabel', label: 'الحالة' },
];
let _assetExportRows = [];

function _drawTable() {
  const typeFilter = document.getElementById('filter-type').value;
  const rows = _allAssetsCache
    .filter(a => !typeFilter || a.assetType === typeFilter)
    .map(a => ({
      ...a,
      typeLabel: FIXED_ASSET_TYPE_LABELS[a.assetType] || a.assetType,
      locationLabel: _locationNameById[a.locationId] || '-',
      costLabel: formatCurrency(computeAssetCostBasis(a)),
      depreciationLabel: formatCurrency(a.accumulatedDepreciation || 0),
      bookValueLabel: formatCurrency(computeAssetBookValue(a)),
      statusLabel: FIXED_ASSET_STATUS_LABELS[a.assetStatus] || a.assetStatus,
    }));

  _assetExportRows = rows;

  renderDataTable('asset-table', [
    { key: 'assetCode', label: 'الكود', sortable: true },
    { key: 'name', label: 'اسم الأصل', sortable: true },
    { key: 'typeLabel', label: 'النوع', sortable: true },
    { key: 'locationLabel', label: 'الموقع', sortable: true },
    { key: 'costLabel', label: 'التكلفة', sortable: false },
    { key: 'depreciationLabel', label: 'مجمع الإهلاك', sortable: false },
    { key: 'bookValueLabel', label: 'القيمة الدفترية', sortable: false },
    { key: 'statusLabel', label: 'الحالة', sortable: false },
  ], rows, {
    onRowClick: (row) => { window.location.href = `asset-card.html?id=${row.id}`; },
    emptyMessage: 'لا توجد أصول ثابتة مسجّلة بعد',
  });
}
