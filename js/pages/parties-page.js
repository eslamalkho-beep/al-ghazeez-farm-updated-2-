// js/pages/parties-page.js

let _allPartiesCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('parties');
  renderSidebar('parties');
  renderHeader('العملاء والموردون');

  await _refreshParties();

  document.getElementById('add-party-btn').addEventListener('click', () => _openPartyModal(null));
  document.getElementById('filter-type').addEventListener('change', _drawParties);
});

async function _refreshParties() {
  _allPartiesCache = await getAllParties();
  _drawParties();
}

function _drawParties() {
  const typeFilter = document.getElementById('filter-type').value;

  const rows = _allPartiesCache
    .filter(p => !typeFilter || p.type === typeFilter)
    .map(p => ({
      ...p,
      typeBadge: `<span class="badge ${p.type === 'client' ? 'badge--green' : 'badge--blue'}">${PARTY_TYPE_LABELS[p.type] || p.type}</span>`,
      categoryLabel: p.category || '-',
      phoneLabel: p.phone || '-',
      locationBtn: p.locationUrl
        ? `<a href="${p.locationUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation();" class="btn btn--outline btn--sm">📍 الموقع</a>`
        : '-',
    }));

  renderDataTable('parties-table', [
    { key: 'typeBadge', label: 'النوع', sortable: false },
    { key: 'name', label: 'الاسم', sortable: true },
    { key: 'categoryLabel', label: 'التصنيف', sortable: true },
    { key: 'phoneLabel', label: 'الجوال', sortable: false },
    { key: 'address', label: 'العنوان', sortable: false },
    { key: 'locationBtn', label: 'اللوكيشن', sortable: false },
  ], rows, {
    onRowClick: (row) => _openPartyModal(row),
    emptyMessage: 'لا يوجد عملاء أو موردون مكوّدون بعد',
  });
}

function _openPartyModal(party) {
  const isEdit = !!party;
  const html = `
    <form id="party-modal-form" class="form-grid">
      <div class="form-group">
        <label>النوع <span class="required">*</span></label>
        <select id="m-type" class="form-control">
          <option value="client" ${party?.type === 'client' ? 'selected' : ''}>عميل</option>
          <option value="supplier" ${party?.type === 'supplier' || !party ? 'selected' : ''}>مورّد</option>
        </select>
      </div>
      <div class="form-group">
        <label>الاسم <span class="required">*</span></label>
        <input type="text" id="m-name" class="form-control" value="${party?.name || ''}" placeholder="اسم العميل أو المورّد" />
        <span class="form-error">الاسم مطلوب</span>
      </div>
      <div class="form-group">
        <label>التصنيف</label>
        <input type="text" id="m-category" class="form-control" value="${party?.category || ''}" placeholder="مثال: تاجر جملة، مطعم، مزرعة أخرى..." />
      </div>
      <div class="form-group">
        <label>رقم الجوال</label>
        <input type="text" id="m-phone" class="form-control" value="${party?.phone || ''}" placeholder="05xxxxxxxx" />
        <span class="form-error">رقم جوال غير صحيح</span>
      </div>
      <div class="form-group form-group--full">
        <label>العنوان</label>
        <input type="text" id="m-address" class="form-control" value="${party?.address || ''}" />
      </div>
      <div class="form-group form-group--full">
        <label>رابط الموقع (Google Maps)</label>
        <input type="text" id="m-locationUrl" class="form-control" value="${party?.locationUrl || ''}" placeholder="https://maps.google.com/..." />
      </div>
      <div class="form-group form-group--full">
        <label>ملاحظات</label>
        <textarea id="m-notes" class="form-control" rows="2">${party?.notes || ''}</textarea>
      </div>
      ${isEdit ? `
      <div class="form-group form-group--full" style="border-top:1px solid var(--color-border); padding-top: var(--spacing-3);">
        <button type="button" class="btn btn--danger btn--sm" id="delete-party-btn">حذف هذا السجل</button>
      </div>` : ''}
    </form>
  `;

  openModal(html, {
    title: isEdit ? 'تعديل بيانات عميل/مورّد' : 'تكويد عميل/مورّد جديد',
    confirmLabel: 'حفظ',
    onConfirm: async () => {
      const type = document.getElementById('m-type').value;
      const name = document.getElementById('m-name').value.trim();
      const phone = document.getElementById('m-phone').value.trim();

      const validations = [
        { fieldId: 'm-name', validatorFn: isRequired, message: 'الاسم مطلوب' },
      ];
      if (phone) {
        validations.push({ fieldId: 'm-phone', validatorFn: isValidPhone, message: 'رقم جوال غير صحيح' });
      }
      const isValid = validateForm(validations);
      if (!isValid) return;

      const taken = await isPartyNameTaken(type, name, isEdit ? party.id : null);
      if (taken) {
        showToast('هذا الاسم مستخدم بالفعل لنفس النوع', 'error');
        return;
      }

      const data = {
        type,
        name,
        category: document.getElementById('m-category').value.trim(),
        phone,
        address: document.getElementById('m-address').value.trim(),
        locationUrl: document.getElementById('m-locationUrl').value.trim(),
        notes: document.getElementById('m-notes').value.trim(),
      };

      if (isEdit) {
        await updateParty(party.id, data);
      } else {
        await createParty(data);
      }
      showToast('تم الحفظ بنجاح', 'success');
      closeModal();
      await _refreshParties();
    },
  });

  if (isEdit) {
    document.getElementById('delete-party-btn').addEventListener('click', () => {
      confirmDelete(`هل أنت متأكد من حذف "${party.name}"؟ لن يؤثر هذا على السجلات السابقة (مبيعات/مشتريات) المرتبطة به — ستبقى كما هي.`, async () => {
        await deleteParty(party.id);
        showToast('تم الحذف بنجاح', 'success');
        await _refreshParties();
      });
    });
  }
}
