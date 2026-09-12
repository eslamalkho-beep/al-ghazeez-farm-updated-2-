// js/pages/health-reports-page.js

let _reportAnimals = [];
let _reportHealthRecords = [];
let _activeTab = 'stats';

const _tabTitles = {
  stats: 'إحصائيات السجل الصحي',
  records: 'السجلات خلال فترة',
  byAnimal: 'حسب الحيوان',
  byVet: 'حسب الطبيب البيطري',
};

let _currentExportColumns = null;
let _currentExportRows = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('reports');
  renderSidebar('reports-health');
  renderHeader('تقارير السجل الصحي');

  [_reportAnimals, _reportHealthRecords] = await Promise.all([
    getAllAnimals(), getAllHealthRecords(),
  ]);

  document.querySelectorAll('.report-tab[data-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.report-tab[data-tab]').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      _activeTab = tab.dataset.tab;
      _renderActiveTab();
    });
  });

  document.getElementById('report-from').addEventListener('change', _renderActiveTab);
  document.getElementById('report-to').addEventListener('change', _renderActiveTab);

  document.getElementById('export-excel-btn').addEventListener('click', () => {
    if (!_currentExportRows) { showToast('لا يوجد جدول متاح للتصدير في هذا العرض', 'warning'); return; }
    exportRowsToExcel(_tabTitles[_activeTab] || 'تقرير', _currentExportColumns, _currentExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    if (!_currentExportRows) { showToast('لا يوجد جدول متاح للتصدير في هذا العرض', 'warning'); return; }
    exportRowsToPdf(_tabTitles[_activeTab] || 'تقرير', _currentExportColumns, _currentExportRows);
  });

  _renderActiveTab();
});

function _dateInRange(dateStr, from, to) {
  if (!dateStr) return false;
  if (from && dateStr < from) return false;
  if (to && dateStr > to) return false;
  return true;
}

function _filteredRecords(from, to) {
  return _reportHealthRecords.filter(h => _dateInRange(h.date, from, to));
}

function _animalCode(animalId) {
  const animal = _reportAnimals.find(a => a.id === animalId);
  return animal ? animal.code : '-';
}

function _resultLabel(status) {
  return status ? (ANIMAL_HEALTH_LABELS[status] || status) : 'غير محدد';
}

function _renderActiveTab() {
  const from = document.getElementById('report-from').value;
  const to = document.getElementById('report-to').value;
  const container = document.getElementById('report-content');

  if (_activeTab === 'stats') return _renderStatsTab(container, from, to);
  if (_activeTab === 'records') return _renderRecordsTab(container, from, to);
  if (_activeTab === 'byAnimal') return _renderByAnimalTab(container, from, to);
  if (_activeTab === 'byVet') return _renderByVetTab(container, from, to);
}

function _renderStatsTab(container, from, to) {
  _currentExportColumns = null;
  _currentExportRows = null;

  const filtered = _filteredRecords(from, to);
  const totalCost = filtered.reduce((s, h) => s + Number(h.cost || 0), 0);
  const avgCost = filtered.length ? (totalCost / filtered.length) : 0;

  // أعداد الحيوانات حسب حالتها الصحية الحالية — لحظية دائمًا، لا تتأثر بفلتر الفترة
  // (نفس منطق "أعداد القطيع الحالية" في تقارير القطيع/التقرير الشامل)
  const aliveAnimals = _reportAnimals.filter(a => a.status === 'alive');
  const sickCount = aliveAnimals.filter(a => a.healthStatus === 'sick').length;
  const underTreatmentCount = aliveAnimals.filter(a => a.healthStatus === 'underTreatment').length;
  const recoveredCount = aliveAnimals.filter(a => a.healthStatus === 'healthy' && _reportHealthRecords.some(h =>
    h.animalId === a.id && (h.resultingHealthStatus === 'sick' || h.resultingHealthStatus === 'underTreatment' || h.resultingHealthStatus === 'quarantine')
  )).length;

  const statusCounts = { healthy: 0, sick: 0, underTreatment: 0, quarantine: 0, none: 0 };
  filtered.forEach(h => {
    if (h.resultingHealthStatus && statusCounts.hasOwnProperty(h.resultingHealthStatus)) {
      statusCounts[h.resultingHealthStatus]++;
    } else {
      statusCounts.none++;
    }
  });

  const herdListBase = '../herd/herd-list.html';
  container.innerHTML = `
    ${kpiGrid([
      { value: formatNumber(filtered.length), label: 'عدد السجلات خلال الفترة', tone: 'blue', icon: '🩺', onclick: "document.getElementById('tab-btn-records').click()" },
      { value: formatNumber(sickCount), label: 'عدد الحيوانات المريضة حاليًا', tone: 'red', href: buildQueryUrl(herdListBase, { status: 'sick' }) },
      { value: formatNumber(recoveredCount), label: 'عدد الحيوانات المشفاة', tone: 'green' },
      { value: formatNumber(underTreatmentCount), label: 'عدد الحيوانات تحت العلاج حاليًا', tone: 'blue', href: buildQueryUrl(herdListBase, { status: 'underTreatment' }) },
    ])}
    ${kpiGrid([
      { value: formatCurrency(totalCost), label: 'إجمالي تكلفة العلاج خلال الفترة', tone: 'green' },
      { value: formatCurrency(avgCost), label: 'متوسط التكلفة للسجل', tone: 'blue' },
    ], 2)}
    <div class="card"><div class="card__header"><h3>توزيع الحالة الناتجة عن السجلات خلال الفترة</h3></div><div class="chart-box"><canvas id="stats-status-chart"></canvas></div></div>
  `;
  renderPieChart('stats-status-chart',
    ['سليم', 'مريض', 'تحت العلاج', 'حجر صحي', 'غير محدد'],
    [statusCounts.healthy, statusCounts.sick, statusCounts.underTreatment, statusCounts.quarantine, statusCounts.none]
  );
}

function _renderRecordsTab(container, from, to) {
  const filtered = _filteredRecords(from, to).slice().sort((a, b) => new Date(a.date) - new Date(b.date));
  const totalCost = filtered.reduce((s, h) => s + Number(h.cost || 0), 0);

  const rows = filtered.map(h => ({
    dateLabel: formatDateArabic(h.date),
    animalCode: _animalCode(h.animalId),
    diagnosis: h.diagnosis || '-',
    treatment: h.treatment || '-',
    veterinarianName: h.veterinarianName || '-',
    costLabel: h.cost != null ? formatCurrency(h.cost) : '-',
    resultLabel: _resultLabel(h.resultingHealthStatus),
    animalId: h.animalId,
  }));

  container.innerHTML = `
    ${kpiGrid([
      { value: formatNumber(filtered.length), label: 'عدد السجلات خلال الفترة', tone: 'blue' },
      { value: formatCurrency(totalCost), label: 'إجمالي التكلفة خلال الفترة', tone: 'green' },
    ], 2)}
    <div id="health-records-report-table"></div>
  `;
  const columns = [
    { key: 'dateLabel', label: 'التاريخ', sortable: true },
    { key: 'animalCode', label: 'كود الحيوان', sortable: false },
    { key: 'diagnosis', label: 'التشخيص', sortable: false },
    { key: 'treatment', label: 'العلاج', sortable: false },
    { key: 'veterinarianName', label: 'الطبيب البيطري', sortable: false },
    { key: 'costLabel', label: 'التكلفة', sortable: false },
    { key: 'resultLabel', label: 'الحالة الناتجة', sortable: false },
  ];

  const footerRow = rows.length ? {
    dateLabel: 'الإجمالي',
    animalCode: `${formatNumber(filtered.length)} سجل`,
    diagnosis: '', treatment: '', veterinarianName: '',
    costLabel: formatCurrency(totalCost),
    resultLabel: '',
  } : null;

  _currentExportColumns = columns;
  _currentExportRows = footerRow ? [...rows, footerRow] : rows;

  renderDataTable('health-records-report-table', columns, rows, {
    emptyMessage: 'لا توجد سجلات صحية مسجّلة خلال هذه الفترة',
    footerRow,
    onRowClick: (row) => { if (row.animalId) window.location.href = `../herd/health.html?animalId=${row.animalId}`; },
  });
}

function _renderByAnimalTab(container, from, to) {
  const filtered = _filteredRecords(from, to);

  const groups = {};
  filtered.forEach(h => {
    if (!groups[h.animalId]) groups[h.animalId] = [];
    groups[h.animalId].push(h);
  });

  const rows = Object.entries(groups).map(([animalId, records]) => {
    const sorted = records.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    const totalCost = records.reduce((s, h) => s + Number(h.cost || 0), 0);
    return {
      animalCode: _animalCode(Number(animalId)),
      recordsCount: records.length,
      totalCostLabel: formatCurrency(totalCost),
      lastDateLabel: formatDateArabic(sorted[0].date),
      lastResultLabel: _resultLabel(sorted[0].resultingHealthStatus),
      animalId: Number(animalId),
    };
  }).sort((a, b) => b.recordsCount - a.recordsCount);

  const columns = [
    { key: 'animalCode', label: 'كود الحيوان', sortable: true },
    { key: 'recordsCount', label: 'عدد السجلات', sortable: true },
    { key: 'totalCostLabel', label: 'إجمالي التكلفة', sortable: false },
    { key: 'lastDateLabel', label: 'آخر زيارة', sortable: false },
    { key: 'lastResultLabel', label: 'آخر حالة ناتجة', sortable: false },
  ];

  const totalRecords = rows.reduce((s, r) => s + r.recordsCount, 0);
  const totalCostAll = filtered.reduce((s, h) => s + Number(h.cost || 0), 0);
  const footerRow = rows.length ? {
    animalCode: 'الإجمالي',
    recordsCount: formatNumber(totalRecords),
    totalCostLabel: formatCurrency(totalCostAll),
    lastDateLabel: '', lastResultLabel: '',
  } : null;

  _currentExportColumns = columns;
  _currentExportRows = footerRow ? [...rows, footerRow] : rows;

  container.innerHTML = `<div id="health-by-animal-report-table"></div>`;
  renderDataTable('health-by-animal-report-table', columns, rows, {
    emptyMessage: 'لا توجد سجلات صحية مسجّلة خلال هذه الفترة',
    footerRow,
    onRowClick: (row) => { if (row.animalId) window.location.href = `../herd/health.html?animalId=${row.animalId}`; },
  });
}

function _renderByVetTab(container, from, to) {
  const filtered = _filteredRecords(from, to);

  const groups = {};
  filtered.forEach(h => {
    const key = h.veterinarianName && h.veterinarianName.trim() ? h.veterinarianName.trim() : 'غير محدد';
    if (!groups[key]) groups[key] = [];
    groups[key].push(h);
  });

  const rows = Object.entries(groups).map(([vetName, records]) => {
    const totalCost = records.reduce((s, h) => s + Number(h.cost || 0), 0);
    return {
      veterinarianName: vetName,
      recordsCount: records.length,
      totalCostLabel: formatCurrency(totalCost),
      avgCostLabel: formatCurrency(records.length ? totalCost / records.length : 0),
    };
  }).sort((a, b) => b.recordsCount - a.recordsCount);

  const columns = [
    { key: 'veterinarianName', label: 'الطبيب البيطري', sortable: true },
    { key: 'recordsCount', label: 'عدد الزيارات', sortable: true },
    { key: 'totalCostLabel', label: 'إجمالي التكلفة', sortable: false },
    { key: 'avgCostLabel', label: 'متوسط التكلفة', sortable: false },
  ];

  const totalRecords = rows.reduce((s, r) => s + r.recordsCount, 0);
  const totalCostAll = filtered.reduce((s, h) => s + Number(h.cost || 0), 0);
  const footerRow = rows.length ? {
    veterinarianName: 'الإجمالي',
    recordsCount: formatNumber(totalRecords),
    totalCostLabel: formatCurrency(totalCostAll),
    avgCostLabel: '',
  } : null;

  _currentExportColumns = columns;
  _currentExportRows = footerRow ? [...rows, footerRow] : rows;

  container.innerHTML = `
    <div id="health-by-vet-report-table"></div>
    <div class="card"><div class="card__header"><h3>عدد الزيارات لكل طبيب بيطري</h3></div><div class="chart-box"><canvas id="by-vet-chart"></canvas></div></div>
  `;
  renderDataTable('health-by-vet-report-table', columns, rows, { emptyMessage: 'لا توجد سجلات صحية مسجّلة خلال هذه الفترة', footerRow });

  if (rows.length) {
    renderBarChart('by-vet-chart', rows.map(r => r.veterinarianName), [
      { label: 'عدد الزيارات', data: rows.map(r => r.recordsCount), backgroundColor: '#1E5FBF' },
    ]);
  }
}
