// js/pages/health-page.js

let _healthAnimalOptions = [];
let _allHealthCache = [];
let _healthFilterAnimalId = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('herd');
  renderSidebar('herd');
  renderHeader('السجل الصحي');

  const params = new URLSearchParams(window.location.search);
  const animalIdParam = params.get('animalId');
  _healthFilterAnimalId = animalIdParam ? Number(animalIdParam) : null;

  _healthAnimalOptions = await getAllAnimals();
  const creatableAnimals = _healthAnimalOptions.filter(a => a.status === 'alive');

  const animalSelect = document.getElementById('animalId');
  animalSelect.innerHTML = creatableAnimals.length
    ? creatableAnimals.map(a => `<option value="${a.id}">${a.code} — ${ANIMAL_TYPE_LABELS[a.type] || a.type} (${a.breed})</option>`).join('')
    : `<option value="">لا توجد حيوانات متاحة</option>`;

  if (_healthFilterAnimalId) {
    const animal = _healthAnimalOptions.find(a => a.id === _healthFilterAnimalId);
    if (animal) {
      document.getElementById('page-title').textContent = `السجل الصحي — ${animal.code}`;
      document.getElementById('table-title').textContent = `السجل الصحي — ${animal.code}`;
      document.getElementById('clear-animal-filter-link').style.display = 'inline-flex';

      if (animal.status === 'alive') {
        animalSelect.value = String(_healthFilterAnimalId);
      } else {
        document.getElementById('health-form').style.display = 'none';
        document.getElementById('health-form-blocked-note').style.display = 'block';
      }
    }
  }

  document.getElementById('date').value = todayIso();

  document.getElementById('health-form').addEventListener('submit', _handleSubmit);

  document.getElementById('export-excel-btn').addEventListener('click', () => {
    exportRowsToExcel('السجل_الصحي', _healthExportColumns, _healthExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    exportRowsToPdf('السجل الصحي', _healthExportColumns, _healthExportRows);
  });

  await _refreshHealthTable();
});

const _healthExportColumns = [
  { key: 'dateLabel', label: 'التاريخ' },
  { key: 'animalCode', label: 'كود الحيوان' },
  { key: 'diagnosis', label: 'التشخيص' },
  { key: 'treatment', label: 'العلاج' },
  { key: 'veterinarianName', label: 'الطبيب البيطري' },
  { key: 'costLabel', label: 'التكلفة' },
  { key: 'resultLabel', label: 'الحالة الناتجة' },
];
let _healthExportRows = [];

async function _handleSubmit(e) {
  e.preventDefault();

  const animalId = document.getElementById('animalId').value;
  const date = document.getElementById('date').value;
  const diagnosis = document.getElementById('diagnosis').value.trim();

  const isValid = validateForm([
    { fieldId: 'animalId', validatorFn: isRequired, message: 'يرجى اختيار الحيوان' },
    { fieldId: 'date', validatorFn: isValidDate, message: 'التاريخ مطلوب' },
    { fieldId: 'diagnosis', validatorFn: isRequired, message: 'التشخيص مطلوب' },
  ]);
  if (!isValid) return;

  const cost = document.getElementById('cost').value;
  const data = {
    animalId: Number(animalId),
    date,
    diagnosis,
    treatment: document.getElementById('treatment').value.trim(),
    veterinarianName: document.getElementById('veterinarianName').value.trim(),
    cost: cost ? Number(cost) : null,
    resultingHealthStatus: document.getElementById('resultingHealthStatus').value || null,
  };

  const saveBtn = document.getElementById('save-health-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'جاري الحفظ...';

  try {
    await createHealthRecord(data);
    showToast('تم تسجيل السجل الصحي بنجاح', 'success');
    document.getElementById('health-form').reset();
    document.getElementById('date').value = todayIso();
    if (_healthFilterAnimalId) document.getElementById('animalId').value = String(_healthFilterAnimalId);
    await _refreshHealthTable();
  } catch (err) {
    showToast('حدث خطأ أثناء حفظ السجل', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'حفظ السجل';
  }
}

async function _refreshHealthTable() {
  const allAnimals = await getAllAnimals();
  _allHealthCache = await getAllHealthRecords();

  let records = _allHealthCache;
  if (_healthFilterAnimalId) {
    records = records.filter(h => h.animalId === _healthFilterAnimalId);
  }

  const rows = records
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map(h => {
      const animal = allAnimals.find(a => a.id === h.animalId);
      return {
        ...h,
        dateLabel: formatDateArabic(h.date),
        animalCode: animal ? animal.code : '-',
        costLabel: h.cost != null ? formatCurrency(h.cost) : '-',
        resultLabel: h.resultingHealthStatus ? (ANIMAL_HEALTH_LABELS[h.resultingHealthStatus] || h.resultingHealthStatus) : '-',
      };
    });

  _healthExportRows = rows;

  renderDataTable('health-table', [
    { key: 'dateLabel', label: 'التاريخ', sortable: true },
    { key: 'animalCode', label: 'كود الحيوان', sortable: false },
    { key: 'diagnosis', label: 'التشخيص', sortable: false },
    { key: 'treatment', label: 'العلاج', sortable: false },
    { key: 'veterinarianName', label: 'الطبيب البيطري', sortable: false },
    { key: 'costLabel', label: 'التكلفة', sortable: false },
    { key: 'resultLabel', label: 'الحالة الناتجة', sortable: false },
  ], rows, {
    onRowClick: (row) => _openHealthEditModal(row.id),
    emptyMessage: 'لا توجد سجلات صحية بعد',
  });
}

function _openHealthEditModal(id) {
  const record = _allHealthCache.find(h => h.id === id);
  if (!record) return;

  const animal = _healthAnimalOptions.find(a => a.id === record.animalId);

  const html = `
    <form id="health-edit-form" class="form-grid">
      <div class="form-group">
        <label>الحيوان</label>
        <input type="text" class="form-control" value="${animal ? animal.code : '-'}" disabled />
      </div>
      <div class="form-group">
        <label>التاريخ <span class="required">*</span></label>
        <input type="date" id="e-date" class="form-control" value="${record.date || ''}" />
      </div>
      <div class="form-group form-group--full">
        <label>التشخيص <span class="required">*</span></label>
        <input type="text" id="e-diagnosis" class="form-control" value="${record.diagnosis || ''}" />
      </div>
      <div class="form-group form-group--full">
        <label>العلاج</label>
        <input type="text" id="e-treatment" class="form-control" value="${record.treatment || ''}" />
      </div>
      <div class="form-group">
        <label>اسم الطبيب البيطري</label>
        <input type="text" id="e-veterinarianName" class="form-control" value="${record.veterinarianName || ''}" />
      </div>
      <div class="form-group">
        <label>تكلفة العلاج (ر.س)</label>
        <input type="number" id="e-cost" class="form-control" min="0" step="0.01" value="${record.cost ?? ''}" />
      </div>
      <div class="form-group form-group--full">
        <label>تحديث الحالة الصحية للحيوان إلى</label>
        <select id="e-resultingHealthStatus" class="form-control">
          <option value="" ${!record.resultingHealthStatus ? 'selected' : ''}>بدون تغيير</option>
          <option value="healthy" ${record.resultingHealthStatus === 'healthy' ? 'selected' : ''}>سليم</option>
          <option value="sick" ${record.resultingHealthStatus === 'sick' ? 'selected' : ''}>مريض</option>
          <option value="underTreatment" ${record.resultingHealthStatus === 'underTreatment' ? 'selected' : ''}>تحت العلاج</option>
          <option value="quarantine" ${record.resultingHealthStatus === 'quarantine' ? 'selected' : ''}>حجر صحي</option>
        </select>
        ${animal && animal.status !== 'alive' ? '<span style="font-size:12px; color:var(--color-text-secondary);">الحيوان نافق/مباع — لن يتم تحديث حالته الصحية حتى لو غُيّر هذا الخيار</span>' : ''}
      </div>
      <div class="form-group form-group--full" style="border-top:1px solid var(--color-border); padding-top: var(--spacing-3);">
        <button type="button" class="btn btn--danger btn--sm" id="delete-health-btn">حذف السجل الصحي</button>
      </div>
    </form>
  `;

  openModal(html, {
    title: 'تعديل السجل الصحي',
    confirmLabel: 'حفظ',
    onConfirm: async () => {
      const date = document.getElementById('e-date').value;
      const diagnosis = document.getElementById('e-diagnosis').value.trim();

      if (!isValidDate(date) || !isRequired(diagnosis)) {
        showToast('يرجى إدخال التاريخ والتشخيص بشكل صحيح', 'error');
        return;
      }

      const cost = document.getElementById('e-cost').value;
      await updateHealthRecord(record.id, {
        date,
        diagnosis,
        treatment: document.getElementById('e-treatment').value.trim(),
        veterinarianName: document.getElementById('e-veterinarianName').value.trim(),
        cost: cost ? Number(cost) : null,
        resultingHealthStatus: document.getElementById('e-resultingHealthStatus').value || null,
      });

      showToast('تم حفظ التعديلات', 'success');
      closeModal();
      await _refreshHealthTable();
    },
  });

  document.getElementById('delete-health-btn').addEventListener('click', () => {
    confirmDelete('هل أنت متأكد من حذف هذا السجل الصحي؟', async () => {
      await deleteHealthRecord(record.id);
      showToast('تم حذف السجل', 'success');
      await _refreshHealthTable();
    });
  });
}
