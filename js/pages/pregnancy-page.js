// js/pages/pregnancy-page.js

let _pregnancyAnimalOptions = [];
let _allPregnanciesCache = [];
let _pregnancyFilterAnimalId = null;

const _PREGNANCY_STATUS_BADGE_CLASS = { pregnant: 'badge--blue', delivered: 'badge--green', lost: 'badge--gray' };

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('herd');
  renderSidebar('herd-pregnancy');
  renderHeader('سجل الحمل');

  const params = new URLSearchParams(window.location.search);
  const animalIdParam = params.get('animalId');
  _pregnancyFilterAnimalId = animalIdParam ? Number(animalIdParam) : null;

  _pregnancyAnimalOptions = await getAllAnimals();
  const creatableAnimals = _pregnancyAnimalOptions.filter(a => a.gender === 'female' && a.status === 'alive');

  const animalSelect = document.getElementById('animalId');
  animalSelect.innerHTML = creatableAnimals.length
    ? creatableAnimals.map(a => `<option value="${a.id}">${a.code} — ${ANIMAL_TYPE_LABELS[a.type] || a.type} (${a.breed})</option>`).join('')
    : `<option value="">لا توجد إناث متاحة</option>`;

  if (_pregnancyFilterAnimalId) {
    const animal = _pregnancyAnimalOptions.find(a => a.id === _pregnancyFilterAnimalId);
    if (animal) {
      document.getElementById('page-title').textContent = `سجل الحمل — ${animal.code}`;
      document.getElementById('table-title').textContent = `سجل الحمل — ${animal.code}`;
      document.getElementById('clear-animal-filter-link').style.display = 'inline-flex';

      if (animal.gender === 'female' && animal.status === 'alive') {
        animalSelect.value = String(_pregnancyFilterAnimalId);
      } else {
        document.getElementById('pregnancy-form-card').style.display = 'none';
      }
    }
  }

  document.getElementById('confirmedDate').value = todayIso();
  // اقتراح أولي لتاريخ الولادة المتوقع عند تغيير تاريخ التأكيد (قابل للتعديل الكامل بعدها)
  document.getElementById('confirmedDate').addEventListener('change', (e) => {
    if (!e.target.value) return;
    const suggested = new Date(e.target.value);
    suggested.setDate(suggested.getDate() + PREGNANCY_GESTATION_DAYS);
    document.getElementById('expectedBirthDate').value = suggested.toISOString().slice(0, 10);
  });
  document.getElementById('confirmedDate').dispatchEvent(new Event('change'));

  document.getElementById('pregnancy-form').addEventListener('submit', _handleSubmit);

  document.getElementById('export-excel-btn').addEventListener('click', () => {
    exportRowsToExcel('سجل_الحمل', _pregnancyExportColumns, _pregnancyExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    exportRowsToPdf('سجل الحمل', _pregnancyExportColumns, _pregnancyExportRows);
  });

  await _refreshPregnancyTable();
});

const _pregnancyExportColumns = [
  { key: 'confirmedDateLabel', label: 'تاريخ تأكيد الحمل' },
  { key: 'animalCode', label: 'كود الأنثى' },
  { key: 'expectedBirthDateLabel', label: 'تاريخ الولادة المتوقع' },
  { key: 'statusLabel', label: 'الحالة' },
  { key: 'notes', label: 'ملاحظات' },
];
let _pregnancyExportRows = [];

async function _handleSubmit(e) {
  e.preventDefault();

  const animalId = document.getElementById('animalId').value;
  const confirmedDate = document.getElementById('confirmedDate').value;
  const expectedBirthDate = document.getElementById('expectedBirthDate').value;

  const isValid = validateForm([
    { fieldId: 'animalId', validatorFn: isRequired, message: 'يرجى اختيار الأنثى' },
    { fieldId: 'confirmedDate', validatorFn: isValidDate, message: 'التاريخ مطلوب' },
    { fieldId: 'expectedBirthDate', validatorFn: isValidDate, message: 'تاريخ الولادة المتوقع مطلوب' },
  ]);
  if (!isValid) return;

  const data = {
    animalId: Number(animalId),
    confirmedDate,
    expectedBirthDate,
    notes: document.getElementById('notes').value.trim(),
  };

  const saveBtn = document.getElementById('save-pregnancy-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'جاري الحفظ...';

  try {
    await createPregnancy(data);
    showToast('تم تسجيل حالة الحمل بنجاح', 'success');
    document.getElementById('pregnancy-form').reset();
    document.getElementById('confirmedDate').value = todayIso();
    document.getElementById('confirmedDate').dispatchEvent(new Event('change'));
    if (_pregnancyFilterAnimalId) document.getElementById('animalId').value = String(_pregnancyFilterAnimalId);
    await _refreshPregnancyTable();
  } catch (err) {
    showToast('حدث خطأ أثناء حفظ حالة الحمل', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'حفظ حالة الحمل';
  }
}

async function _refreshPregnancyTable() {
  const allAnimals = await getAllAnimals();
  _allPregnanciesCache = await getAllPregnancies();

  let records = _allPregnanciesCache;
  if (_pregnancyFilterAnimalId) {
    records = records.filter(p => p.animalId === _pregnancyFilterAnimalId);
  }

  const rows = records
    .slice()
    .sort((a, b) => new Date(b.confirmedDate) - new Date(a.confirmedDate))
    .map(p => {
      const animal = allAnimals.find(a => a.id === p.animalId);
      return {
        ...p,
        confirmedDateLabel: formatDateArabic(p.confirmedDate),
        animalCode: animal ? animal.code : '-',
        expectedBirthDateLabel: formatDateArabic(p.expectedBirthDate),
        statusLabel: `<span class="badge ${_PREGNANCY_STATUS_BADGE_CLASS[p.status] || 'badge--gray'}">${PREGNANCY_STATUS_LABELS[p.status] || p.status}</span>`,
        notes: p.notes || '-',
      };
    });

  _pregnancyExportRows = rows.map(r => ({ ...r, statusLabel: PREGNANCY_STATUS_LABELS[r.status] || r.status }));

  renderDataTable('pregnancy-table', [
    { key: 'confirmedDateLabel', label: 'تاريخ تأكيد الحمل', sortable: true },
    { key: 'animalCode', label: 'كود الأنثى', sortable: false },
    { key: 'expectedBirthDateLabel', label: 'تاريخ الولادة المتوقع', sortable: true },
    { key: 'statusLabel', label: 'الحالة', sortable: false },
    { key: 'notes', label: 'ملاحظات', sortable: false },
  ], rows, {
    onRowClick: (row) => _openPregnancyEditModal(row.id),
    emptyMessage: 'لا توجد سجلات حمل بعد',
  });
}

function _openPregnancyEditModal(id) {
  const record = _allPregnanciesCache.find(p => p.id === id);
  if (!record) return;

  const animal = _pregnancyAnimalOptions.find(a => a.id === record.animalId);

  const html = `
    <form id="pregnancy-edit-form" class="form-grid">
      <div class="form-group">
        <label>الأنثى</label>
        <input type="text" class="form-control" value="${animal ? animal.code : '-'}" disabled />
      </div>
      <div class="form-group">
        <label>تاريخ تأكيد الحمل <span class="required">*</span></label>
        <input type="date" id="e-confirmedDate" class="form-control" value="${record.confirmedDate || ''}" />
      </div>
      <div class="form-group">
        <label>تاريخ الولادة المتوقع <span class="required">*</span></label>
        <input type="date" id="e-expectedBirthDate" class="form-control" value="${record.expectedBirthDate || ''}" />
      </div>
      <div class="form-group">
        <label>الحالة</label>
        <select id="e-status" class="form-control">
          <option value="pregnant" ${record.status === 'pregnant' ? 'selected' : ''}>${PREGNANCY_STATUS_LABELS.pregnant}</option>
          <option value="delivered" ${record.status === 'delivered' ? 'selected' : ''}>${PREGNANCY_STATUS_LABELS.delivered}</option>
          <option value="lost" ${record.status === 'lost' ? 'selected' : ''}>${PREGNANCY_STATUS_LABELS.lost}</option>
        </select>
      </div>
      <div class="form-group form-group--full">
        <label>ملاحظات</label>
        <input type="text" id="e-notes" class="form-control" value="${record.notes || ''}" />
      </div>
      <div class="form-group form-group--full" style="border-top:1px solid var(--color-border); padding-top: var(--spacing-3);">
        <button type="button" class="btn btn--danger btn--sm" id="delete-pregnancy-btn">حذف سجل الحمل</button>
      </div>
    </form>
  `;

  openModal(html, {
    title: 'تعديل سجل الحمل',
    confirmLabel: 'حفظ',
    onConfirm: async () => {
      const confirmedDate = document.getElementById('e-confirmedDate').value;
      const expectedBirthDate = document.getElementById('e-expectedBirthDate').value;

      if (!isValidDate(confirmedDate) || !isValidDate(expectedBirthDate)) {
        showToast('يرجى إدخال التواريخ بشكل صحيح', 'error');
        return;
      }

      await updatePregnancy(record.id, {
        confirmedDate,
        expectedBirthDate,
        status: document.getElementById('e-status').value,
        notes: document.getElementById('e-notes').value.trim(),
      });

      showToast('تم حفظ التعديلات', 'success');
      closeModal();
      await _refreshPregnancyTable();
    },
  });

  document.getElementById('delete-pregnancy-btn').addEventListener('click', () => {
    confirmDelete('هل أنت متأكد من حذف سجل الحمل هذا؟', async () => {
      await deletePregnancy(record.id);
      showToast('تم حذف السجل', 'success');
      await _refreshPregnancyTable();
    });
  });
}
