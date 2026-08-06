// js/pages/weights-page.js

let _weightAnimalOptions = [];
let _allWeightsCache = [];
let _weightFilterAnimalId = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('herd');
  renderSidebar('herd');
  renderHeader('سجل الوزن');

  const params = new URLSearchParams(window.location.search);
  const animalIdParam = params.get('animalId');
  _weightFilterAnimalId = animalIdParam ? Number(animalIdParam) : null;

  _weightAnimalOptions = await getAllAnimals();
  const creatableAnimals = _weightAnimalOptions.filter(a => a.status === 'alive');

  const animalSelect = document.getElementById('animalId');
  animalSelect.innerHTML = creatableAnimals.length
    ? creatableAnimals.map(a => `<option value="${a.id}">${a.code} — ${ANIMAL_TYPE_LABELS[a.type] || a.type} (${a.breed})</option>`).join('')
    : `<option value="">لا توجد حيوانات متاحة</option>`;

  if (_weightFilterAnimalId) {
    const animal = _weightAnimalOptions.find(a => a.id === _weightFilterAnimalId);
    if (animal) {
      document.getElementById('page-title').textContent = `سجل الوزن — ${animal.code}`;
      document.getElementById('table-title').textContent = `سجل الوزن — ${animal.code}`;
      document.getElementById('clear-animal-filter-link').style.display = 'inline-flex';

      if (animal.status === 'alive') {
        animalSelect.value = String(_weightFilterAnimalId);
      } else {
        document.getElementById('weight-form-card').style.display = 'none';
      }
    }
  }

  document.getElementById('date').value = todayIso();

  document.getElementById('weight-form').addEventListener('submit', _handleSubmit);

  document.getElementById('export-excel-btn').addEventListener('click', () => {
    exportRowsToExcel('سجل_الوزن', _weightExportColumns, _weightExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    exportRowsToPdf('سجل الوزن', _weightExportColumns, _weightExportRows);
  });

  await _refreshWeightTable();
});

const _weightExportColumns = [
  { key: 'dateLabel', label: 'التاريخ' },
  { key: 'animalCode', label: 'كود الحيوان' },
  { key: 'weightLabel', label: 'الوزن' },
  { key: 'notes', label: 'ملاحظات' },
];
let _weightExportRows = [];

async function _handleSubmit(e) {
  e.preventDefault();

  const animalId = document.getElementById('animalId').value;
  const date = document.getElementById('date').value;
  const weight = document.getElementById('weight').value;

  const isValid = validateForm([
    { fieldId: 'animalId', validatorFn: isRequired, message: 'يرجى اختيار الحيوان' },
    { fieldId: 'date', validatorFn: isValidDate, message: 'التاريخ مطلوب' },
    { fieldId: 'weight', validatorFn: isPositiveNumber, message: 'أدخل وزنًا صحيحًا' },
  ]);
  if (!isValid) return;

  const data = {
    animalId: Number(animalId),
    date,
    weight: Number(weight),
    notes: document.getElementById('notes').value.trim(),
  };

  const saveBtn = document.getElementById('save-weight-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'جاري الحفظ...';

  try {
    await createWeightRecord(data);
    showToast('تم تسجيل الوزن بنجاح', 'success');
    document.getElementById('weight-form').reset();
    document.getElementById('date').value = todayIso();
    if (_weightFilterAnimalId) document.getElementById('animalId').value = String(_weightFilterAnimalId);
    await _refreshWeightTable();
  } catch (err) {
    showToast('حدث خطأ أثناء حفظ الوزن', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'حفظ الوزن';
  }
}

async function _refreshWeightTable() {
  const allAnimals = await getAllAnimals();
  _allWeightsCache = await getAllWeightRecords();

  let records = _allWeightsCache;
  if (_weightFilterAnimalId) {
    records = records.filter(w => w.animalId === _weightFilterAnimalId);
  }

  const rows = records
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map(w => {
      const animal = allAnimals.find(a => a.id === w.animalId);
      return {
        ...w,
        dateLabel: formatDateArabic(w.date),
        animalCode: animal ? animal.code : '-',
        weightLabel: `${formatNumber(w.weight || 0)} كجم`,
      };
    });

  _weightExportRows = rows;

  renderDataTable('weight-table', [
    { key: 'dateLabel', label: 'التاريخ', sortable: true },
    { key: 'animalCode', label: 'كود الحيوان', sortable: false },
    { key: 'weightLabel', label: 'الوزن', sortable: false },
    { key: 'notes', label: 'ملاحظات', sortable: false },
  ], rows, {
    onRowClick: (row) => _openWeightEditModal(row.id),
    emptyMessage: 'لا توجد سجلات وزن بعد',
  });
}

function _openWeightEditModal(id) {
  const record = _allWeightsCache.find(w => w.id === id);
  if (!record) return;

  const animal = _weightAnimalOptions.find(a => a.id === record.animalId);

  const html = `
    <form id="weight-edit-form" class="form-grid">
      <div class="form-group">
        <label>الحيوان</label>
        <input type="text" class="form-control" value="${animal ? animal.code : '-'}" disabled />
      </div>
      <div class="form-group">
        <label>التاريخ <span class="required">*</span></label>
        <input type="date" id="e-date" class="form-control" value="${record.date || ''}" />
      </div>
      <div class="form-group">
        <label>الوزن (كجم) <span class="required">*</span></label>
        <input type="number" id="e-weight" class="form-control" min="0" step="0.1" value="${record.weight ?? ''}" />
      </div>
      <div class="form-group form-group--full">
        <label>ملاحظات</label>
        <input type="text" id="e-notes" class="form-control" value="${record.notes || ''}" />
      </div>
      <div class="form-group form-group--full" style="border-top:1px solid var(--color-border); padding-top: var(--spacing-3);">
        <button type="button" class="btn btn--danger btn--sm" id="delete-weight-btn">حذف سجل الوزن</button>
      </div>
    </form>
  `;

  openModal(html, {
    title: 'تعديل سجل الوزن',
    confirmLabel: 'حفظ',
    onConfirm: async () => {
      const date = document.getElementById('e-date').value;
      const weight = document.getElementById('e-weight').value;

      if (!isValidDate(date) || !isPositiveNumber(weight)) {
        showToast('يرجى إدخال التاريخ والوزن بشكل صحيح', 'error');
        return;
      }

      await updateWeightRecord(record.id, {
        date,
        weight: Number(weight),
        notes: document.getElementById('e-notes').value.trim(),
      });

      showToast('تم حفظ التعديلات', 'success');
      closeModal();
      await _refreshWeightTable();
    },
  });

  document.getElementById('delete-weight-btn').addEventListener('click', () => {
    confirmDelete('هل أنت متأكد من حذف سجل الوزن هذا؟', async () => {
      await deleteWeightRecord(record.id);
      showToast('تم حذف السجل', 'success');
      await _refreshWeightTable();
    });
  });
}
