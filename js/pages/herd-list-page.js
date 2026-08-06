// js/pages/herd-list-page.js

let _allAnimalsCache = [];
let _deathDateByAnimalId = {};
let _saleDateByAnimalId = {};
let _locationNameById = {};

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('herd');
  renderSidebar('herd');
  renderHeader('سجل القطيع');

  const [animals, deaths, revenues, locations] = await Promise.all([getAllAnimals(), getAllDeaths(), getAllRevenues(), getAllLocations()]);
  _allAnimalsCache = animals;

  _deathDateByAnimalId = {};
  deaths.forEach(d => { if (d.animalId) _deathDateByAnimalId[d.animalId] = d.deathDate; });

  _saleDateByAnimalId = {};
  revenues
    .filter(r => r.category === 'بيع حيوان' && r.animalId)
    .forEach(r => { _saleDateByAnimalId[r.animalId] = r.date; });

  _locationNameById = {};
  locations.forEach(l => { _locationNameById[l.id] = l.name; });

  const breeds = [...new Set(_allAnimalsCache.map(a => a.breed).filter(Boolean))].sort();
  document.getElementById('filter-breed').innerHTML += breeds.map(b => `<option value="${b}">${b}</option>`).join('');

  const params = new URLSearchParams(window.location.search);
  if (params.get('type')) document.getElementById('filter-type').value = params.get('type');
  if (params.get('status')) document.getElementById('filter-status').value = params.get('status');
  if (params.get('breed')) document.getElementById('filter-breed').value = params.get('breed');
  if (params.get('gender')) document.getElementById('filter-gender').value = params.get('gender');

  drawHerdTable();

  document.getElementById('filter-type').addEventListener('change', drawHerdTable);
  document.getElementById('filter-status').addEventListener('change', drawHerdTable);
  document.getElementById('filter-breed').addEventListener('change', drawHerdTable);
  document.getElementById('filter-gender').addEventListener('change', drawHerdTable);

  document.getElementById('export-excel-btn').addEventListener('click', () => {
    exportRowsToExcel('سجل_القطيع', _herdExportColumns, _herdExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    exportRowsToPdf('سجل القطيع', _herdExportColumns, _herdExportRows);
  });
});

const _herdExportColumns = [
  { key: 'code', label: 'الكود' },
  { key: 'typeLabel', label: 'النوع' },
  { key: 'breed', label: 'السلالة' },
  { key: 'genderLabel', label: 'الجنس' },
  { key: 'weightLabel', label: 'الوزن' },
  { key: 'birthDateLabel', label: 'تاريخ الميلاد/الاقتناء' },
  { key: 'ageLabel', label: 'العمر الحالي' },
  { key: 'locationLabel', label: 'الحظيرة/الموقع' },
  { key: 'statusBadge', label: 'الحالة' },
];
let _herdExportRows = [];

function drawHerdTable() {
  const typeFilter = document.getElementById('filter-type').value;
  const statusFilter = document.getElementById('filter-status').value;
  const breedFilter = document.getElementById('filter-breed').value;
  const genderFilter = document.getElementById('filter-gender').value;

  let rows = _allAnimalsCache.filter(a =>
    (!typeFilter || a.type === typeFilter) &&
    (!breedFilter || a.breed === breedFilter) &&
    (!genderFilter || a.gender === genderFilter) &&
    (!statusFilter || (statusFilter === 'alive' ? a.status === 'alive' : _displayStatus(a) === statusFilter))
  );

  rows = rows.map(a => {
    const ageEndDate = a.status === 'dead' ? _deathDateByAnimalId[a.id]
      : a.status === 'sold' ? _saleDateByAnimalId[a.id]
      : null;
    return {
      ...a,
      typeLabel: ANIMAL_TYPE_LABELS[a.type] || a.type,
      genderLabel: ANIMAL_GENDER_LABELS[a.gender] || a.gender,
      statusBadge: _statusBadge(_displayStatus(a)),
      weightLabel: `${formatNumber(a.weight || 0)} كجم`,
      birthDateLabel: formatDateArabic(a.birthDate),
      ageLabel: calculateAgeLabel(a.birthDate, ageEndDate),
      locationLabel: _locationNameById[a.locationId] || '-',
    };
  });

  _herdExportRows = rows;

  renderDataTable('herd-table', [
    { key: 'code', label: 'الكود', sortable: true },
    { key: 'typeLabel', label: 'النوع', sortable: true },
    { key: 'breed', label: 'السلالة', sortable: true },
    { key: 'genderLabel', label: 'الجنس', sortable: true },
    { key: 'weightLabel', label: 'الوزن', sortable: false },
    { key: 'birthDateLabel', label: 'تاريخ الميلاد/الاقتناء', sortable: true },
    { key: 'ageLabel', label: 'العمر الحالي', sortable: false },
    { key: 'locationLabel', label: 'الحظيرة/الموقع', sortable: true },
    { key: 'statusBadge', label: 'الحالة', sortable: false },
  ], rows, {
    onRowClick: (row) => { window.location.href = `herd-form.html?id=${row.id}`; },
    emptyMessage: 'لا توجد حيوانات مطابقة لهذا الفلتر',
  });
}

// حيوان نافق/مباع يُعرض بحالة دورة حياته فقط، وليس بحالته الصحية الأخيرة قبل ذلك
function _displayStatus(a) {
  if (a.status === 'dead' || a.status === 'sold') return a.status;
  return a.healthStatus;
}

function _statusBadge(status) {
  const map = {
    healthy: 'badge--green', sick: 'badge--red', underTreatment: 'badge--warning', quarantine: 'badge--gray',
    dead: 'badge--red', sold: 'badge--blue',
  };
  const label = ANIMAL_HEALTH_LABELS[status] || ANIMAL_STATUS_LABELS[status] || status;
  return `<span class="badge ${map[status] || 'badge--gray'}">${label}</span>`;
}
