// js/pages/locations-page.js

let _allLocationsCache = [];
let _allAnimalsForLocationsCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('herd');
  renderSidebar('herd-locations');
  renderHeader('الحظائر والمواقع');

  _allAnimalsForLocationsCache = await getAllAnimals();
  await _refreshLocations();

  document.getElementById('add-location-btn').addEventListener('click', () => _openLocationModal(null));
});

async function _refreshLocations() {
  _allLocationsCache = await getAllLocations();
  _drawLocations();
}

function _drawLocations() {
  const rows = _allLocationsCache.map(l => ({
    ...l,
    animalCountLabel: String(_allAnimalsForLocationsCache.filter(a => a.status === 'alive' && a.locationId === l.id).length),
  }));

  renderDataTable('locations-table', [
    { key: 'name', label: 'اسم الحظيرة/الموقع', sortable: true },
    { key: 'animalCountLabel', label: 'عدد الرؤوس الحالية', sortable: true },
    { key: 'notes', label: 'ملاحظات', sortable: false },
  ], rows, {
    onRowClick: (row) => _openLocationModal(row),
    emptyMessage: 'لا توجد حظائر/مواقع مكوّدة بعد',
  });
}

function _openLocationModal(location) {
  const isEdit = !!location;
  const html = `
    <form id="location-modal-form" class="form-grid">
      <div class="form-group form-group--full">
        <label>اسم الحظيرة/الموقع <span class="required">*</span></label>
        <input type="text" id="m-name" class="form-control" value="${location?.name || ''}" placeholder="مثال: حظيرة 1 — قسم أ" />
      </div>
      <div class="form-group form-group--full">
        <label>ملاحظات</label>
        <input type="text" id="m-notes" class="form-control" value="${location?.notes || ''}" />
      </div>
      ${isEdit ? `
      <div class="form-group form-group--full" style="border-top:1px solid var(--color-border); padding-top: var(--spacing-3);">
        <button type="button" class="btn btn--danger btn--sm" id="delete-location-btn">حذف هذه الحظيرة</button>
      </div>` : ''}
    </form>
  `;

  openModal(html, {
    title: isEdit ? 'تعديل حظيرة/موقع' : 'إضافة حظيرة/موقع جديد',
    confirmLabel: 'حفظ',
    onConfirm: async () => {
      const name = document.getElementById('m-name').value.trim();
      const notes = document.getElementById('m-notes').value.trim();

      if (!isRequired(name)) {
        showToast('اسم الحظيرة مطلوب', 'error');
        return;
      }

      const taken = await isLocationNameTaken(name, isEdit ? location.id : null);
      if (taken) {
        showToast('هذا الاسم مستخدم بالفعل', 'error');
        return;
      }

      if (isEdit) {
        await updateLocation(location.id, { name, notes });
      } else {
        await createLocation({ name, notes });
      }
      showToast('تم الحفظ بنجاح', 'success');
      closeModal();
      await _refreshLocations();
    },
  });

  if (isEdit) {
    document.getElementById('delete-location-btn').addEventListener('click', () => {
      confirmDelete(`هل أنت متأكد من حذف "${location.name}"؟ لن يؤثر هذا على الحيوانات المرتبطة بها حاليًا — سيبقى اسم الحظيرة مسجَّلاً على بطاقاتها.`, async () => {
        await deleteLocation(location.id);
        showToast('تم الحذف بنجاح', 'success');
        await _refreshLocations();
      });
    });
  }
}
