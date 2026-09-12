// js/pages/mating-page.js

let _matingAnimalOptions = [];
let _allMatingsCache = [];
let _matingFilterAnimalId = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('herd');
  renderSidebar('herd-mating');
  renderHeader('سجل التلقيح');

  const params = new URLSearchParams(window.location.search);
  const animalIdParam = params.get('animalId');
  _matingFilterAnimalId = animalIdParam ? Number(animalIdParam) : null;

  _matingAnimalOptions = await getAllAnimals();
  const creatableAnimals = _matingAnimalOptions.filter(a => a.gender === 'female' && a.status === 'alive');

  const animalSelect = document.getElementById('animalId');
  animalSelect.innerHTML = creatableAnimals.length
    ? creatableAnimals.map(a => `<option value="${a.id}">${a.code} — ${ANIMAL_TYPE_LABELS[a.type] || a.type} (${a.breed})</option>`).join('')
    : `<option value="">لا توجد إناث متاحة</option>`;

  if (_matingFilterAnimalId) {
    const animal = _matingAnimalOptions.find(a => a.id === _matingFilterAnimalId);
    if (animal) {
      document.getElementById('page-title').textContent = `سجل التلقيح — ${animal.code}`;
      document.getElementById('table-title').textContent = `سجل التلقيح — ${animal.code}`;
      document.getElementById('clear-animal-filter-link').style.display = 'inline-flex';

      const addPregnancyLink = document.getElementById('add-pregnancy-link');
      addPregnancyLink.href = `pregnancy.html?animalId=${animal.id}`;
      addPregnancyLink.style.display = 'inline-flex';

      if (animal.gender === 'female' && animal.status === 'alive') {
        animalSelect.value = String(_matingFilterAnimalId);
      } else {
        document.getElementById('mating-form-card').style.display = 'none';
      }
    }
  }

  document.getElementById('date').value = todayIso();

  document.getElementById('mating-form').addEventListener('submit', _handleSubmit);

  document.getElementById('export-excel-btn').addEventListener('click', () => {
    exportRowsToExcel('سجل_التلقيح', _matingExportColumns, _matingExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    exportRowsToPdf('سجل التلقيح', _matingExportColumns, _matingExportRows);
  });

  await _refreshMatingTable();
});

const _matingExportColumns = [
  { key: 'dateLabel', label: 'تاريخ التلقيح' },
  { key: 'animalCode', label: 'كود الأنثى' },
  { key: 'methodLabel', label: 'نوع التلقيح' },
  { key: 'maleInfo', label: 'الفحل / المصدر' },
  { key: 'notes', label: 'ملاحظات' },
];
let _matingExportRows = [];

async function _handleSubmit(e) {
  e.preventDefault();

  const animalId = document.getElementById('animalId').value;
  const date = document.getElementById('date').value;

  const isValid = validateForm([
    { fieldId: 'animalId', validatorFn: isRequired, message: 'يرجى اختيار الأنثى' },
    { fieldId: 'date', validatorFn: isValidDate, message: 'التاريخ مطلوب' },
  ]);
  if (!isValid) return;

  const data = {
    animalId: Number(animalId),
    date,
    method: document.getElementById('method').value,
    maleInfo: document.getElementById('maleInfo').value.trim(),
    notes: document.getElementById('notes').value.trim(),
  };

  const saveBtn = document.getElementById('save-mating-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'جاري الحفظ...';

  try {
    await createMating(data);
    showToast('تم تسجيل التلقيح بنجاح', 'success');
    document.getElementById('mating-form').reset();
    document.getElementById('date').value = todayIso();
    if (_matingFilterAnimalId) document.getElementById('animalId').value = String(_matingFilterAnimalId);
    await _refreshMatingTable();
  } catch (err) {
    showToast('حدث خطأ أثناء حفظ التلقيح', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'حفظ التلقيح';
  }
}

async function _refreshMatingTable() {
  const allAnimals = await getAllAnimals();
  _allMatingsCache = await getAllMatings();

  let records = _allMatingsCache;
  if (_matingFilterAnimalId) {
    records = records.filter(m => m.animalId === _matingFilterAnimalId);
  }

  const rows = records
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map(m => {
      const animal = allAnimals.find(a => a.id === m.animalId);
      return {
        ...m,
        dateLabel: formatDateArabic(m.date),
        animalCode: animal ? animal.code : '-',
        methodLabel: MATING_METHOD_LABELS[m.method] || m.method || '-',
        maleInfo: m.maleInfo || '-',
        notes: m.notes || '-',
      };
    });

  _matingExportRows = rows;

  renderDataTable('mating-table', [
    { key: 'dateLabel', label: 'تاريخ التلقيح', sortable: true },
    { key: 'animalCode', label: 'كود الأنثى', sortable: false },
    { key: 'methodLabel', label: 'نوع التلقيح', sortable: false },
    { key: 'maleInfo', label: 'الفحل / المصدر', sortable: false },
    { key: 'notes', label: 'ملاحظات', sortable: false },
  ], rows, {
    onRowClick: (row) => _openMatingEditModal(row.id),
    emptyMessage: 'لا توجد سجلات تلقيح بعد',
  });
}

function _openMatingEditModal(id) {
  const record = _allMatingsCache.find(m => m.id === id);
  if (!record) return;

  const animal = _matingAnimalOptions.find(a => a.id === record.animalId);

  const html = `
    <form id="mating-edit-form" class="form-grid">
      <div class="form-group">
        <label>الأنثى</label>
        <input type="text" class="form-control" value="${animal ? animal.code : '-'}" disabled />
      </div>
      <div class="form-group">
        <label>تاريخ التلقيح <span class="required">*</span></label>
        <input type="date" id="e-date" class="form-control" value="${record.date || ''}" />
      </div>
      <div class="form-group">
        <label>نوع التلقيح</label>
        <select id="e-method" class="form-control">
          <option value="natural" ${record.method !== 'ai' ? 'selected' : ''}>طبيعي</option>
          <option value="ai" ${record.method === 'ai' ? 'selected' : ''}>اصطناعي</option>
        </select>
      </div>
      <div class="form-group">
        <label>الفحل / مصدر التلقيح</label>
        <input type="text" id="e-maleInfo" class="form-control" value="${record.maleInfo || ''}" />
      </div>
      <div class="form-group form-group--full">
        <label>ملاحظات</label>
        <input type="text" id="e-notes" class="form-control" value="${record.notes || ''}" />
      </div>
      <div class="form-group form-group--full" style="border-top:1px solid var(--color-border); padding-top: var(--spacing-3);">
        <button type="button" class="btn btn--danger btn--sm" id="delete-mating-btn">حذف سجل التلقيح</button>
      </div>
    </form>
  `;

  openModal(html, {
    title: 'تعديل سجل التلقيح',
    confirmLabel: 'حفظ',
    onConfirm: async () => {
      const date = document.getElementById('e-date').value;

      if (!isValidDate(date)) {
        showToast('يرجى إدخال التاريخ بشكل صحيح', 'error');
        return;
      }

      await updateMating(record.id, {
        date,
        method: document.getElementById('e-method').value,
        maleInfo: document.getElementById('e-maleInfo').value.trim(),
        notes: document.getElementById('e-notes').value.trim(),
      });

      showToast('تم حفظ التعديلات', 'success');
      closeModal();
      await _refreshMatingTable();
    },
  });

  document.getElementById('delete-mating-btn').addEventListener('click', () => {
    confirmDelete('هل أنت متأكد من حذف سجل التلقيح هذا؟', async () => {
      await deleteMating(record.id);
      showToast('تم حذف السجل', 'success');
      await _refreshMatingTable();
    });
  });
}
