// js/pages/vaccinations-page.js

let _vaccinationAnimalOptions = [];
let _allVaccinationsCache = [];
let _vaccinationFilterAnimalId = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('herd');
  renderSidebar('herd');
  renderHeader('سجل التحصينات');

  const params = new URLSearchParams(window.location.search);
  const animalIdParam = params.get('animalId');
  _vaccinationFilterAnimalId = animalIdParam ? Number(animalIdParam) : null;

  _vaccinationAnimalOptions = await getAllAnimals();
  const creatableAnimals = _vaccinationAnimalOptions.filter(a => a.status === 'alive');

  const animalSelect = document.getElementById('animalId');
  animalSelect.innerHTML = creatableAnimals.length
    ? creatableAnimals.map(a => `<option value="${a.id}">${a.code} — ${ANIMAL_TYPE_LABELS[a.type] || a.type} (${a.breed})</option>`).join('')
    : `<option value="">لا توجد حيوانات متاحة</option>`;

  if (_vaccinationFilterAnimalId) {
    const animal = _vaccinationAnimalOptions.find(a => a.id === _vaccinationFilterAnimalId);
    if (animal) {
      document.getElementById('page-title').textContent = `سجل التحصينات — ${animal.code}`;
      document.getElementById('table-title').textContent = `سجل التحصينات — ${animal.code}`;
      document.getElementById('clear-animal-filter-link').style.display = 'inline-flex';

      if (animal.status === 'alive') {
        animalSelect.value = String(_vaccinationFilterAnimalId);
      } else {
        document.getElementById('vaccination-form-card').style.display = 'none';
      }
    }
  }

  document.getElementById('date').value = todayIso();

  document.getElementById('vaccination-form').addEventListener('submit', _handleSubmit);

  document.getElementById('export-excel-btn').addEventListener('click', () => {
    exportRowsToExcel('سجل_التحصينات', _vaccinationExportColumns, _vaccinationExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    exportRowsToPdf('سجل التحصينات', _vaccinationExportColumns, _vaccinationExportRows);
  });

  await _refreshVaccinationTable();
  await _checkUpcomingVaccinationNotifications();
});

const _vaccinationExportColumns = [
  { key: 'dateLabel', label: 'تاريخ الجرعة' },
  { key: 'animalCode', label: 'كود الحيوان' },
  { key: 'vaccineName', label: 'نوع اللقاح' },
  { key: 'nextDueDateLabel', label: 'الجرعة القادمة' },
  { key: 'notes', label: 'ملاحظات' },
];
let _vaccinationExportRows = [];

async function _handleSubmit(e) {
  e.preventDefault();

  const animalId = document.getElementById('animalId').value;
  const date = document.getElementById('date').value;
  const vaccineName = document.getElementById('vaccineName').value.trim();
  const nextDueDate = document.getElementById('nextDueDate').value;

  const isValid = validateForm([
    { fieldId: 'animalId', validatorFn: isRequired, message: 'يرجى اختيار الحيوان' },
    { fieldId: 'vaccineName', validatorFn: isRequired, message: 'نوع اللقاح مطلوب' },
    { fieldId: 'date', validatorFn: isValidDate, message: 'التاريخ مطلوب' },
  ]);
  if (!isValid) return;

  const data = {
    animalId: Number(animalId),
    vaccineName,
    date,
    nextDueDate: nextDueDate || null,
    notes: document.getElementById('notes').value.trim(),
  };

  const saveBtn = document.getElementById('save-vaccination-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'جاري الحفظ...';

  try {
    await createVaccination(data);
    showToast('تم تسجيل التحصين بنجاح', 'success');
    document.getElementById('vaccination-form').reset();
    document.getElementById('date').value = todayIso();
    if (_vaccinationFilterAnimalId) document.getElementById('animalId').value = String(_vaccinationFilterAnimalId);
    await _refreshVaccinationTable();
  } catch (err) {
    showToast('حدث خطأ أثناء حفظ التحصين', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'حفظ التحصين';
  }
}

async function _refreshVaccinationTable() {
  const allAnimals = await getAllAnimals();
  _allVaccinationsCache = await getAllVaccinations();

  let records = _allVaccinationsCache;
  if (_vaccinationFilterAnimalId) {
    records = records.filter(v => v.animalId === _vaccinationFilterAnimalId);
  }

  const rows = records
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map(v => {
      const animal = allAnimals.find(a => a.id === v.animalId);
      return {
        ...v,
        dateLabel: formatDateArabic(v.date),
        animalCode: animal ? animal.code : '-',
        nextDueDateLabel: v.nextDueDate ? formatDateArabic(v.nextDueDate) : '-',
      };
    });

  _vaccinationExportRows = rows;

  renderDataTable('vaccination-table', [
    { key: 'dateLabel', label: 'تاريخ الجرعة', sortable: true },
    { key: 'animalCode', label: 'كود الحيوان', sortable: false },
    { key: 'vaccineName', label: 'نوع اللقاح', sortable: false },
    { key: 'nextDueDateLabel', label: 'الجرعة القادمة', sortable: true },
    { key: 'notes', label: 'ملاحظات', sortable: false },
  ], rows, {
    onRowClick: (row) => _openVaccinationEditModal(row.id),
    emptyMessage: 'لا توجد سجلات تحصين بعد',
  });
}

// ينشئ إشعار type: 'vaccination' لكل تحصين موعد جرعته القادمة خلال 7 أيام (أو تجاوزه فعلًا) ولحيوان لا يزال
// حيًا، ولا يُعاد التنبيه إن وُجد إشعار غير مقروء بالفعل لنفس سجل التحصين — بنفس مبدأ _checkStaleCustodyNotifications
// في custody-list-page.js (فحص عند كل تحميل للصفحة بدل جدولة خلفية، مناسب لتطبيق محلي بلا خادم)
async function _checkUpcomingVaccinationNotifications() {
  const DUE_SOON_MS = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const allAnimals = await getAllAnimals();

  const dueSoonItems = _allVaccinationsCache.filter(v => {
    if (!v.nextDueDate) return false;
    const animal = allAnimals.find(a => a.id === v.animalId);
    if (!animal || animal.status !== 'alive') return false;
    return new Date(v.nextDueDate).getTime() - now <= DUE_SOON_MS;
  });
  if (!dueSoonItems.length) return;

  const existingNotifs = await getAllNotifications();
  const alreadyNotifiedIds = new Set(
    existingNotifs
      .filter(n => n.type === 'vaccination' && !n.isRead)
      .map(n => n.relatedEntityId)
  );

  for (const item of dueSoonItems) {
    if (alreadyNotifiedIds.has(item.id)) continue;
    const animal = allAnimals.find(a => a.id === item.animalId);
    const isOverdue = new Date(item.nextDueDate).getTime() < now;
    await createNotification({
      type: 'vaccination',
      title: isOverdue ? 'جرعة تحصين متأخرة' : 'موعد تحصين قادم',
      message: `الحيوان ${animal ? animal.code : ''} — لقاح "${item.vaccineName}" ${isOverdue ? 'تجاوز موعده بتاريخ' : 'مستحق بتاريخ'} ${formatDateArabic(item.nextDueDate)}`,
      relatedEntityId: item.id,
    });
  }
}

function _openVaccinationEditModal(id) {
  const record = _allVaccinationsCache.find(v => v.id === id);
  if (!record) return;

  const animal = _vaccinationAnimalOptions.find(a => a.id === record.animalId);

  const html = `
    <form id="vaccination-edit-form" class="form-grid">
      <div class="form-group">
        <label>الحيوان</label>
        <input type="text" class="form-control" value="${animal ? animal.code : '-'}" disabled />
      </div>
      <div class="form-group">
        <label>نوع اللقاح <span class="required">*</span></label>
        <input type="text" id="e-vaccineName" class="form-control" value="${record.vaccineName || ''}" />
      </div>
      <div class="form-group">
        <label>تاريخ الجرعة <span class="required">*</span></label>
        <input type="date" id="e-date" class="form-control" value="${record.date || ''}" />
      </div>
      <div class="form-group">
        <label>تاريخ الجرعة القادمة</label>
        <input type="date" id="e-nextDueDate" class="form-control" value="${record.nextDueDate || ''}" />
      </div>
      <div class="form-group form-group--full">
        <label>ملاحظات</label>
        <input type="text" id="e-notes" class="form-control" value="${record.notes || ''}" />
      </div>
      <div class="form-group form-group--full" style="border-top:1px solid var(--color-border); padding-top: var(--spacing-3);">
        <button type="button" class="btn btn--danger btn--sm" id="delete-vaccination-btn">حذف سجل التحصين</button>
      </div>
    </form>
  `;

  openModal(html, {
    title: 'تعديل سجل التحصين',
    confirmLabel: 'حفظ',
    onConfirm: async () => {
      const vaccineName = document.getElementById('e-vaccineName').value.trim();
      const date = document.getElementById('e-date').value;

      if (!isRequired(vaccineName) || !isValidDate(date)) {
        showToast('يرجى إدخال نوع اللقاح والتاريخ بشكل صحيح', 'error');
        return;
      }

      await updateVaccination(record.id, {
        vaccineName,
        date,
        nextDueDate: document.getElementById('e-nextDueDate').value || null,
        notes: document.getElementById('e-notes').value.trim(),
      });

      showToast('تم حفظ التعديلات', 'success');
      closeModal();
      await _refreshVaccinationTable();
    },
  });

  document.getElementById('delete-vaccination-btn').addEventListener('click', () => {
    confirmDelete('هل أنت متأكد من حذف سجل التحصين هذا؟', async () => {
      await deleteVaccination(record.id);
      showToast('تم حذف السجل', 'success');
      await _refreshVaccinationTable();
    });
  });
}
