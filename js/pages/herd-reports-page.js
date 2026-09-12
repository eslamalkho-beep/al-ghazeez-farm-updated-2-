// js/pages/herd-reports-page.js

let _reportAnimals = [];
let _reportBirths = [];
let _reportDeaths = [];
let _reportMatings = [];
let _reportPregnancies = [];
let _activeTab = 'stats';

const _tabTitles = {
  stats: 'إحصائيات القطيع',
  births: 'المواليد خلال فترة',
  byMother: 'المواليد حسب الأم',
  deaths: 'النفوق خلال فترة',
  byType: 'حسب النوع',
  byBreed: 'حسب السلالة',
  mating: 'التلقيح خلال فترة',
  pregnancy: 'الحمل خلال فترة',
};

let _currentExportColumns = null;
let _currentExportRows = null;

// بطاقة "N ذكور / N إناث" داخل قيمة واحدة — خط صغير (15px) بدون بولد (400)، بدل حجم/وزن
// رقم KPI الكبير المعتاد (22px/800)، ونفس حجم عنوان البطاقة عبر _genderSplitLabel
function _genderSplitValue(males, females) {
  return `<span style="font-size:15px; font-weight:400;">${formatNumber(males)} ذكور / ${formatNumber(females)} إناث</span>`;
}

// عنوان بطاقات "توزيع ... حسب الجنس" — خط صغير (15px) بدون بولد (400)، بدل خط عنوان بطاقة KPI
// الصغير المعتاد، تمييزًا لهذه البطاقات الأربع وبنفس حجم/وزن _genderSplitValue
function _genderSplitLabel(text) {
  return `<span style="font-size:15px; font-weight:400;">${text}</span>`;
}

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('reports');
  renderSidebar('reports');
  renderHeader('تقارير القطيع');

  [_reportAnimals, _reportBirths, _reportDeaths, _reportMatings, _reportPregnancies] = await Promise.all([
    getAllAnimals(), getAllBirths(), getAllDeaths(), getAllMatings(), getAllPregnancies(),
  ]);

  const animalFilterSelect = document.getElementById('report-animal-filter');
  const females = _reportAnimals.filter(a => a.gender === 'female').sort((a, b) => (a.code || '').localeCompare(b.code || ''));
  animalFilterSelect.insertAdjacentHTML('beforeend', females.map(a => `<option value="${a.id}">${a.code}</option>`).join(''));
  animalFilterSelect.addEventListener('change', _renderActiveTab);

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

function _renderActiveTab() {
  const from = document.getElementById('report-from').value;
  const to = document.getElementById('report-to').value;
  const animalId = document.getElementById('report-animal-filter').value;
  const container = document.getElementById('report-content');

  const showAnimalFilter = _activeTab === 'mating' || _activeTab === 'pregnancy';
  document.getElementById('report-animal-label').style.display = showAnimalFilter ? '' : 'none';
  document.getElementById('report-animal-filter').style.display = showAnimalFilter ? '' : 'none';

  if (_activeTab === 'stats') return _renderStatsTab(container);
  if (_activeTab === 'births') return _renderBirthsTab(container, from, to);
  if (_activeTab === 'byMother') return _renderByMotherTab(container, from, to);
  if (_activeTab === 'deaths') return _renderDeathsTab(container, from, to);
  if (_activeTab === 'byType') return _renderByTypeTab(container);
  if (_activeTab === 'byBreed') return _renderByBreedTab(container);
  if (_activeTab === 'mating') return _renderMatingTab(container, from, to, animalId);
  if (_activeTab === 'pregnancy') return _renderPregnancyTab(container, from, to, animalId);
}

function _renderStatsTab(container) {
  _currentExportColumns = null;
  _currentExportRows = null;

  const herdListBase = '../herd/herd-list.html';
  const alive = _reportAnimals.filter(a => a.status === 'alive');
  const sheepAlive = alive.filter(a => a.type === 'sheep');
  const goatsAlive = alive.filter(a => a.type === 'goat');
  const sheep = sheepAlive.length;
  const goats = goatsAlive.length;
  const sheepMales = sheepAlive.filter(a => a.gender === 'male').length;
  const sheepFemales = sheepAlive.filter(a => a.gender === 'female').length;
  const goatMales = goatsAlive.filter(a => a.gender === 'male').length;
  const goatFemales = goatsAlive.filter(a => a.gender === 'female').length;
  const sick = alive.filter(a => a.healthStatus === 'sick').length;
  const underTreatment = alive.filter(a => a.healthStatus === 'underTreatment').length;

  container.innerHTML = `
    ${kpiGrid([
      { value: formatNumber(alive.length), label: 'إجمالي القطيع الحي', tone: 'blue', icon: '🐑', href: buildQueryUrl(herdListBase, { status: 'alive' }) },
      { value: formatNumber(sheep), label: 'عدد الأغنام', tone: 'green', href: buildQueryUrl(herdListBase, { type: 'sheep', status: 'alive' }) },
      { value: _genderSplitValue(sheepMales, sheepFemales), label: _genderSplitLabel('توزيع الأغنام حسب الجنس'), tone: 'green' },
      { value: formatNumber(goats), label: 'عدد الماعز', tone: 'blue', href: buildQueryUrl(herdListBase, { type: 'goat', status: 'alive' }) },
      { value: _genderSplitValue(goatMales, goatFemales), label: _genderSplitLabel('توزيع الماعز حسب الجنس'), tone: 'blue' },
      { value: formatNumber(sick), label: 'مريض', tone: 'red', icon: '⚕️', href: buildQueryUrl(herdListBase, { status: 'sick' }) },
      { value: formatNumber(underTreatment), label: 'تحت العلاج', tone: 'red', href: buildQueryUrl(herdListBase, { status: 'underTreatment' }) },
    ])}
    <div class="card"><div class="card__header"><h3>توزيع القطيع حسب النوع</h3></div><div class="chart-box"><canvas id="stats-type-chart"></canvas></div></div>
  `;
  renderPieChart('stats-type-chart', ['غنم', 'ماعز'], [sheep, goats]);
}

function _renderBirthsTab(container, from, to) {
  const filtered = _reportBirths.filter(b => _dateInRange(b.birthDate, from, to));
  const totalOffspring = filtered.reduce((s, b) => s + Number(b.offspringCount || 0), 0);

  // نوع كل مولود (غنم/ماعز) غير مخزَّن على تفاصيل المولود نفسه — نستنتجه من نوع الأم
  // (نفس افتراض `motherTypeFields` عند تكويد المولود تلقائيًا في births-page.js)
  let sheepMales = 0, sheepFemales = 0, goatMales = 0, goatFemales = 0;
  filtered.forEach(b => {
    const motherType = (_reportAnimals.find(a => a.id === b.motherId) || {}).type;
    (b.offspringDetails || []).forEach(o => {
      if (motherType === 'sheep') { if (o.gender === 'male') sheepMales++; else if (o.gender === 'female') sheepFemales++; }
      else if (motherType === 'goat') { if (o.gender === 'male') goatMales++; else if (o.gender === 'female') goatFemales++; }
    });
  });

  const rows = filtered.map(b => ({
    dateLabel: formatDateArabic(b.birthDate),
    motherCode: (_reportAnimals.find(a => a.id === b.motherId) || {}).code || '-',
    offspringCount: b.offspringCount,
    notes: b.veterinarianNotes || '-',
    motherId: b.motherId,
  }));

  container.innerHTML = `
    ${kpiGrid([
      { value: formatNumber(filtered.length), label: 'عدد سجلات الولادة', tone: 'green' },
      { value: formatNumber(totalOffspring), label: 'إجمالي عدد المواليد', tone: 'green' },
      { value: formatNumber(sheepMales + sheepFemales), label: 'مواليد الأغنام', tone: 'green' },
      { value: _genderSplitValue(sheepMales, sheepFemales), label: _genderSplitLabel('توزيع مواليد الأغنام حسب الجنس'), tone: 'green' },
      { value: formatNumber(goatMales + goatFemales), label: 'مواليد الماعز', tone: 'blue' },
      { value: _genderSplitValue(goatMales, goatFemales), label: _genderSplitLabel('توزيع مواليد الماعز حسب الجنس'), tone: 'blue' },
    ])}
    <div id="births-report-table"></div>
  `;
  const columns = [
    { key: 'dateLabel', label: 'تاريخ الولادة', sortable: true },
    { key: 'motherCode', label: 'كود الأم', sortable: false },
    { key: 'offspringCount', label: 'عدد المواليد', sortable: false },
    { key: 'notes', label: 'ملاحظات', sortable: false },
  ];

  const footerRow = rows.length ? {
    dateLabel: 'الإجمالي',
    motherCode: `${formatNumber(filtered.length)} سجل`,
    offspringCount: formatNumber(totalOffspring),
    notes: '',
  } : null;

  _currentExportColumns = columns;
  _currentExportRows = footerRow ? [...rows, footerRow] : rows;

  renderDataTable('births-report-table', columns, rows, {
    emptyMessage: 'لا توجد ولادات مسجّلة خلال هذه الفترة',
    footerRow,
    onRowClick: (row) => { if (row.motherId) window.location.href = `../herd/herd-form.html?id=${row.motherId}`; },
  });
}

function _renderByMotherTab(container, from, to) {
  const filtered = _reportBirths.filter(b => _dateInRange(b.birthDate, from, to));

  const groups = {};
  filtered.forEach(b => {
    if (!groups[b.motherId]) {
      const mother = _reportAnimals.find(a => a.id === b.motherId);
      groups[b.motherId] = { motherId: b.motherId, motherCode: mother ? mother.code : '-', births: [] };
    }
    groups[b.motherId].births.push(b);
  });

  const rows = Object.values(groups).map(g => {
    const offspring = g.births.flatMap(b => b.offspringDetails || []);
    const maleCount = offspring.filter(o => o.gender === 'male').length;
    const femaleCount = offspring.filter(o => o.gender === 'female').length;
    const codes = offspring.map(o => o.animalCode).filter(Boolean).join('، ') || '-';
    const dates = g.births.map(b => formatDateArabic(b.birthDate)).join('، ');
    return {
      motherId: g.motherId,
      motherCode: g.motherCode,
      birthsCount: g.births.length,
      totalOffspring: offspring.length,
      genderBreakdown: `${formatNumber(maleCount)} ذكر / ${formatNumber(femaleCount)} أنثى`,
      dates,
      codes,
    };
  });

  const columns = [
    { key: 'motherCode', label: 'كود الأم', sortable: true },
    { key: 'birthsCount', label: 'عدد مرات الولادة', sortable: true },
    { key: 'totalOffspring', label: 'إجمالي المواليد', sortable: true },
    { key: 'genderBreakdown', label: 'توزيع الجنس', sortable: false },
    { key: 'dates', label: 'تواريخ الولادة', sortable: false },
    { key: 'codes', label: 'أكواد المواليد', sortable: false },
  ];

  const footerRow = rows.length ? {
    motherCode: 'الإجمالي',
    birthsCount: formatNumber(rows.reduce((s, r) => s + r.birthsCount, 0)),
    totalOffspring: formatNumber(rows.reduce((s, r) => s + r.totalOffspring, 0)),
    genderBreakdown: '',
    dates: '',
    codes: '',
  } : null;

  _currentExportColumns = columns;
  _currentExportRows = footerRow ? [...rows, footerRow] : rows;

  container.innerHTML = `<div id="by-mother-report-table"></div>`;
  renderDataTable('by-mother-report-table', columns, rows, {
    emptyMessage: 'لا توجد ولادات مسجّلة خلال هذه الفترة',
    footerRow,
    onRowClick: (row) => { if (row.motherId) window.location.href = `../herd/herd-form.html?id=${row.motherId}`; },
  });
}

function _renderDeathsTab(container, from, to) {
  const filtered = _reportDeaths.filter(d => _dateInRange(d.deathDate, from, to));
  const causeCounts = {};
  filtered.forEach(d => { causeCounts[d.cause] = (causeCounts[d.cause] || 0) + 1; });

  const rows = filtered.map(d => ({
    dateLabel: formatDateArabic(d.deathDate),
    animalCode: (_reportAnimals.find(a => a.id === d.animalId) || {}).code || '-',
    cause: DEATH_CAUSE_LABELS[d.cause] || d.cause,
    details: d.details || '-',
    animalId: d.animalId,
  }));

  container.innerHTML = `
    ${kpiGrid([
      { value: formatNumber(filtered.length), label: 'إجمالي حالات النفوق', tone: 'red' },
      { value: `${formatNumber(_reportAnimals.length ? ((filtered.length / _reportAnimals.length) * 100).toFixed(1) : 0)}%`, label: 'نسبة النفوق من إجمالي القطيع', tone: 'red' },
    ], 2)}
    <div id="deaths-report-table"></div>
  `;
  const columns = [
    { key: 'dateLabel', label: 'تاريخ النفوق', sortable: true },
    { key: 'animalCode', label: 'كود الحيوان', sortable: false },
    { key: 'cause', label: 'السبب', sortable: true },
    { key: 'details', label: 'التفاصيل', sortable: false },
  ];

  const footerRow = rows.length ? {
    dateLabel: 'الإجمالي',
    animalCode: `${formatNumber(filtered.length)} حالة`,
    cause: '',
    details: '',
  } : null;

  _currentExportColumns = columns;
  _currentExportRows = footerRow ? [...rows, footerRow] : rows;

  renderDataTable('deaths-report-table', columns, rows, {
    emptyMessage: 'لا توجد حالات نفوق مسجّلة خلال هذه الفترة',
    footerRow,
    onRowClick: (row) => { if (row.animalId) window.location.href = `../herd/deaths.html?animalId=${row.animalId}`; },
  });
}

function _renderByTypeTab(container) {
  _currentExportColumns = null;
  _currentExportRows = null;

  const herdListBase = '../herd/herd-list.html';
  const alive = _reportAnimals.filter(a => a.status === 'alive');
  const sheep = alive.filter(a => a.type === 'sheep');
  const goats = alive.filter(a => a.type === 'goat');
  const avgWeight = (arr) => arr.length ? (arr.reduce((s, a) => s + Number(a.weight || 0), 0) / arr.length).toFixed(1) : 0;

  container.innerHTML = `
    ${kpiGrid([
      { value: formatNumber(sheep.length), label: 'عدد الأغنام', tone: 'blue', icon: '🐑', href: buildQueryUrl(herdListBase, { type: 'sheep', status: 'alive' }) },
      { value: `${avgWeight(sheep)} كجم`, label: 'متوسط وزن الأغنام', tone: 'blue' },
      { value: formatNumber(goats.length), label: 'عدد الماعز', tone: 'green', icon: '🐐', href: buildQueryUrl(herdListBase, { type: 'goat', status: 'alive' }) },
      { value: `${avgWeight(goats)} كجم`, label: 'متوسط وزن الماعز', tone: 'green' },
    ])}
    <div class="card"><div class="card__header"><h3>مقارنة الأعداد</h3></div><div class="chart-box"><canvas id="type-compare-chart"></canvas></div></div>
  `;
  renderBarChart('type-compare-chart', ['غنم', 'ماعز'], [{ label: 'عدد الرؤوس', data: [sheep.length, goats.length], backgroundColor: ['#1E5FBF', '#1E9E5A'] }]);
}

function _renderByBreedTab(container) {
  const alive = _reportAnimals.filter(a => a.status === 'alive');
  const breeds = [...new Set(alive.map(a => a.breed).filter(Boolean))];
  const rows = breeds.map(breed => {
    const group = alive.filter(a => a.breed === breed);
    const avgWeight = group.length ? (group.reduce((s, a) => s + Number(a.weight || 0), 0) / group.length).toFixed(1) : 0;
    return { breed, count: group.length, avgWeightLabel: `${avgWeight} كجم` };
  });

  const columns = [
    { key: 'breed', label: 'السلالة', sortable: true },
    { key: 'count', label: 'عدد الرؤوس', sortable: true },
    { key: 'avgWeightLabel', label: 'متوسط الوزن', sortable: false },
  ];

  const totalCount = alive.filter(a => a.breed).length;
  const overallAvgWeight = totalCount ? (alive.filter(a => a.breed).reduce((s, a) => s + Number(a.weight || 0), 0) / totalCount).toFixed(1) : 0;
  const footerRow = rows.length ? {
    breed: 'الإجمالي',
    count: formatNumber(totalCount),
    avgWeightLabel: `${overallAvgWeight} كجم`,
  } : null;

  _currentExportColumns = columns;
  _currentExportRows = footerRow ? [...rows, footerRow] : rows;

  container.innerHTML = `<div id="breed-report-table"></div>`;
  renderDataTable('breed-report-table', columns, rows, {
    emptyMessage: 'لا توجد بيانات سلالات كافية بعد',
    footerRow,
    onRowClick: (row) => { window.location.href = `../herd/herd-list.html?breed=${encodeURIComponent(row.breed)}&status=alive`; },
  });
}

function _renderMatingTab(container, from, to, animalId) {
  let filtered = _reportMatings.filter(m => _dateInRange(m.date, from, to));
  if (animalId) filtered = filtered.filter(m => m.animalId === Number(animalId));

  const naturalCount = filtered.filter(m => m.method === 'natural').length;
  const aiCount = filtered.filter(m => m.method === 'ai').length;

  const rows = filtered
    .slice()
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .map(m => ({
      dateLabel: formatDateArabic(m.date),
      animalCode: (_reportAnimals.find(a => a.id === m.animalId) || {}).code || '-',
      methodLabel: MATING_METHOD_LABELS[m.method] || m.method || '-',
      maleInfo: m.maleInfo || '-',
      notes: m.notes || '-',
      animalId: m.animalId,
    }));

  container.innerHTML = `
    ${kpiGrid([
      { value: formatNumber(filtered.length), label: 'عدد سجلات التلقيح', tone: 'blue' },
      { value: formatNumber(naturalCount), label: 'تلقيح طبيعي', tone: 'green' },
      { value: formatNumber(aiCount), label: 'تلقيح اصطناعي', tone: 'blue' },
    ], 3)}
    <div id="mating-report-table"></div>
  `;

  const columns = [
    { key: 'dateLabel', label: 'تاريخ التلقيح', sortable: true },
    { key: 'animalCode', label: 'كود الأنثى', sortable: false },
    { key: 'methodLabel', label: 'نوع التلقيح', sortable: false },
    { key: 'maleInfo', label: 'الفحل / المصدر', sortable: false },
    { key: 'notes', label: 'ملاحظات', sortable: false },
  ];

  const footerRow = rows.length ? {
    dateLabel: 'الإجمالي',
    animalCode: `${formatNumber(filtered.length)} سجل`,
    methodLabel: '',
    maleInfo: '',
    notes: '',
  } : null;

  _currentExportColumns = columns;
  _currentExportRows = footerRow ? [...rows, footerRow] : rows;

  renderDataTable('mating-report-table', columns, rows, {
    emptyMessage: 'لا توجد سجلات تلقيح خلال هذه الفترة',
    footerRow,
    onRowClick: (row) => { if (row.animalId) window.location.href = `../herd/mating.html?animalId=${row.animalId}`; },
  });
}

function _renderPregnancyTab(container, from, to, animalId) {
  let filtered = _reportPregnancies.filter(p => _dateInRange(p.confirmedDate, from, to));
  if (animalId) filtered = filtered.filter(p => p.animalId === Number(animalId));

  const pregnantCount = filtered.filter(p => p.status === 'pregnant').length;
  const deliveredCount = filtered.filter(p => p.status === 'delivered').length;
  const lostCount = filtered.filter(p => p.status === 'lost').length;

  const rows = filtered
    .slice()
    .sort((a, b) => (b.confirmedDate || '').localeCompare(a.confirmedDate || ''))
    .map(p => ({
      confirmedDateLabel: formatDateArabic(p.confirmedDate),
      animalCode: (_reportAnimals.find(a => a.id === p.animalId) || {}).code || '-',
      expectedBirthDateLabel: p.expectedBirthDate ? formatDateArabic(p.expectedBirthDate) : '-',
      statusLabel: PREGNANCY_STATUS_LABELS[p.status] || p.status || '-',
      actualBirthDateLabel: p.actualBirthDate ? formatDateArabic(p.actualBirthDate) : '-',
      notes: p.notes || '-',
      animalId: p.animalId,
    }));

  container.innerHTML = `
    ${kpiGrid([
      { value: formatNumber(filtered.length), label: 'عدد سجلات الحمل', tone: 'blue' },
      { value: formatNumber(pregnantCount), label: 'حالات حمل قائمة', tone: 'green' },
      { value: formatNumber(deliveredCount), label: 'وضعت', tone: 'blue' },
      { value: formatNumber(lostCount), label: 'فقدان حمل', tone: 'red' },
    ], 4)}
    <div id="pregnancy-report-table"></div>
  `;

  const columns = [
    { key: 'confirmedDateLabel', label: 'تاريخ تأكيد الحمل', sortable: true },
    { key: 'animalCode', label: 'كود الأنثى', sortable: false },
    { key: 'expectedBirthDateLabel', label: 'تاريخ الولادة المتوقع', sortable: false },
    { key: 'statusLabel', label: 'الحالة', sortable: true },
    { key: 'actualBirthDateLabel', label: 'تاريخ الولادة الفعلي', sortable: false },
    { key: 'notes', label: 'ملاحظات', sortable: false },
  ];

  const footerRow = rows.length ? {
    confirmedDateLabel: 'الإجمالي',
    animalCode: `${formatNumber(filtered.length)} سجل`,
    expectedBirthDateLabel: '',
    statusLabel: '',
    actualBirthDateLabel: '',
    notes: '',
  } : null;

  _currentExportColumns = columns;
  _currentExportRows = footerRow ? [...rows, footerRow] : rows;

  renderDataTable('pregnancy-report-table', columns, rows, {
    emptyMessage: 'لا توجد سجلات حمل خلال هذه الفترة',
    footerRow,
    onRowClick: (row) => { if (row.animalId) window.location.href = `../herd/pregnancy.html?animalId=${row.animalId}`; },
  });
}
