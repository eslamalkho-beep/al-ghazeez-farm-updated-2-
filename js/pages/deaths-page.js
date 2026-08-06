// js/pages/deaths-page.js

let _allAnimalsCache = [];
let _aliveAnimals = [];
let _deathsFilterAnimalId = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('herd');
  renderSidebar('herd');
  renderHeader('سجل النفوق');

  _allAnimalsCache = await getAllAnimals();
  _aliveAnimals = _allAnimalsCache.filter(a => a.status === 'alive');

  document.getElementById('cause').innerHTML = Object.entries(DEATH_CAUSE_LABELS)
    .map(([value, label]) => `<option value="${value}">${label}</option>`).join('');

  document.getElementById('deathDate').value = todayIso();

  const params = new URLSearchParams(window.location.search);
  const animalIdParam = params.get('animalId');
  _deathsFilterAnimalId = animalIdParam ? Number(animalIdParam) : null;
  _populateAnimalSelect(animalIdParam);

  if (_deathsFilterAnimalId) {
    const animal = _allAnimalsCache.find(a => a.id === _deathsFilterAnimalId);
    if (animal) {
      document.getElementById('page-title').textContent = `سجل النفوق — ${animal.code}`;
      document.getElementById('table-title').textContent = `سجل النفوق — ${animal.code}`;
      document.getElementById('clear-animal-filter-link').style.display = 'inline-flex';
    }
  }

  document.getElementById('death-form').addEventListener('submit', _handleSubmit);

  document.getElementById('export-excel-btn').addEventListener('click', () => {
    exportRowsToExcel('سجل_النفوق', _deathsExportColumns, _deathsExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    exportRowsToPdf('سجل النفوق', _deathsExportColumns, _deathsExportRows);
  });

  await _refreshDeathsTable();
});

const _deathsExportColumns = [
  { key: 'dateLabel', label: 'تاريخ النفوق' },
  { key: 'animalCode', label: 'كود الحيوان' },
  { key: 'causeLabel', label: 'السبب' },
  { key: 'ageAtDeath', label: 'العمر وقت النفوق' },
  { key: 'details', label: 'التفاصيل' },
];
let _deathsExportRows = [];

function _populateAnimalSelect(preselectAnimalId = null) {
  const select = document.getElementById('animalId');
  select.innerHTML = _aliveAnimals.length
    ? _aliveAnimals.map(a => `<option value="${a.id}">${a.code} — ${ANIMAL_TYPE_LABELS[a.type] || a.type} (${a.breed})</option>`).join('')
    : `<option value="">لا توجد حيوانات حية</option>`;

  if (preselectAnimalId) select.value = String(preselectAnimalId);
}

async function _handleSubmit(e) {
  e.preventDefault();

  const animalId = document.getElementById('animalId').value;
  const deathDate = document.getElementById('deathDate').value;

  const isValid = validateForm([
    { fieldId: 'animalId', validatorFn: isRequired, message: 'يرجى اختيار الحيوان' },
    { fieldId: 'deathDate', validatorFn: isValidDate, message: 'التاريخ مطلوب' },
  ]);
  if (!isValid) return;

  const saveBtn = document.getElementById('save-death-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'جاري الحفظ...';

  try {
    await createDeathRecord({
      animalId: Number(animalId),
      deathDate,
      cause: document.getElementById('cause').value,
      details: document.getElementById('details').value.trim(),
    });

    showToast('تم تسجيل النفوق بنجاح', 'success');
    document.getElementById('death-form').reset();
    document.getElementById('deathDate').value = todayIso();

    _allAnimalsCache = await getAllAnimals();
    _aliveAnimals = _allAnimalsCache.filter(a => a.status === 'alive');
    _populateAnimalSelect();
    document.getElementById('cause').value = 'disease';

    await _refreshDeathsTable();
  } catch (err) {
    showToast('حدث خطأ أثناء حفظ سجل النفوق', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'حفظ';
  }
}

let _allDeathsCache = [];

async function _refreshDeathsTable() {
  _allDeathsCache = await getAllDeaths();

  let records = _allDeathsCache;
  if (_deathsFilterAnimalId) {
    records = records.filter(d => d.animalId === _deathsFilterAnimalId);
  }

  const rows = records.map(d => {
    const animal = _allAnimalsCache.find(a => a.id === d.animalId);
    return {
      ...d,
      dateLabel: formatDateArabic(d.deathDate),
      animalCode: animal ? animal.code : '-',
      causeLabel: DEATH_CAUSE_LABELS[d.cause] || d.cause,
      ageAtDeath: animal ? calculateAgeLabel(animal.birthDate, d.deathDate) : '-',
      details: d.details || '-',
    };
  });

  _deathsExportRows = rows;

  renderDataTable('deaths-table', [
    { key: 'dateLabel', label: 'تاريخ النفوق', sortable: true },
    { key: 'animalCode', label: 'كود الحيوان', sortable: false },
    { key: 'causeLabel', label: 'السبب', sortable: true },
    { key: 'ageAtDeath', label: 'العمر وقت النفوق', sortable: false },
    { key: 'details', label: 'التفاصيل', sortable: false },
  ], rows, {
    onRowClick: (row) => _openDeathEditModal(row.id),
    emptyMessage: 'لا توجد حالات نفوق مسجّلة بعد',
  });
}

function _openDeathEditModal(id) {
  const record = _allDeathsCache.find(d => d.id === id);
  if (!record) return;

  const currentAnimal = _allAnimalsCache.find(a => a.id === record.animalId);
  const selectableAnimals = _allAnimalsCache.filter(a => a.status === 'alive' || a.id === record.animalId);

  const html = `
    <form id="death-edit-form" class="form-grid">
      <div class="form-group">
        <label>الحيوان <span class="required">*</span></label>
        <select id="e-animalId" class="form-control">
          ${selectableAnimals.map(a => `<option value="${a.id}" ${a.id === record.animalId ? 'selected' : ''}>${a.code} — ${ANIMAL_TYPE_LABELS[a.type] || a.type} (${a.breed})</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>تاريخ النفوق <span class="required">*</span></label>
        <input type="date" id="e-deathDate" class="form-control" value="${record.deathDate || ''}" />
      </div>
      <div class="form-group">
        <label>السبب</label>
        <select id="e-cause" class="form-control">
          ${Object.entries(DEATH_CAUSE_LABELS).map(([value, label]) => `<option value="${value}" ${record.cause === value ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group form-group--full">
        <label>التفاصيل</label>
        <input type="text" id="e-details" class="form-control" value="${record.details || ''}" />
      </div>
      <div class="form-group form-group--full" style="border-top:1px solid var(--color-border); padding-top: var(--spacing-3);">
        <button type="button" class="btn btn--danger btn--sm" id="delete-death-btn">حذف سجل النفوق</button>
      </div>
    </form>
  `;

  openModal(html, {
    title: 'تعديل سجل النفوق',
    confirmLabel: 'حفظ',
    onConfirm: async () => {
      const animalId = Number(document.getElementById('e-animalId').value);
      const deathDate = document.getElementById('e-deathDate').value;
      const cause = document.getElementById('e-cause').value;
      const details = document.getElementById('e-details').value.trim();

      if (!isRequired(String(animalId)) || !isValidDate(deathDate)) {
        showToast('يرجى اختيار الحيوان والتاريخ بشكل صحيح', 'error');
        return;
      }

      await updateDeathRecord(record.id, { animalId, deathDate, cause, details });

      if (animalId !== record.animalId) {
        if (currentAnimal) await updateAnimal(currentAnimal.id, { status: 'alive' });
        await updateAnimal(animalId, { status: 'dead' });
      }

      showToast('تم حفظ التعديلات', 'success');
      closeModal();
      _allAnimalsCache = await getAllAnimals();
      _aliveAnimals = _allAnimalsCache.filter(a => a.status === 'alive');
      _populateAnimalSelect();
      await _refreshDeathsTable();
    },
  });

  document.getElementById('delete-death-btn').addEventListener('click', () => {
    confirmDelete('هل أنت متأكد من حذف سجل النفوق؟ سيتم إرجاع حالة الحيوان إلى "حي".', async () => {
      await deleteDeathRecord(record.id);
      if (currentAnimal) await updateAnimal(currentAnimal.id, { status: 'alive' });
      showToast('تم حذف سجل النفوق', 'success');
      _allAnimalsCache = await getAllAnimals();
      _aliveAnimals = _allAnimalsCache.filter(a => a.status === 'alive');
      _populateAnimalSelect();
      await _refreshDeathsTable();
    });
  });
}
