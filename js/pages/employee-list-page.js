// js/pages/employee-list-page.js

const JOB_TITLES = ['راعي', 'بيطري', 'عامل عام', 'محاسب', 'مشرف'];
const EMP_STATUS_LABELS = { active: 'نشط', terminated: 'منتهي الخدمة', leave: 'إجازة' };

let _allEmployeesCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('employees');
  renderSidebar('employees');
  renderHeader('سجل الموظفين');

  if (!hasActionPermission('employees', 'add')) {
    document.getElementById('add-employee-btn').style.display = 'none';
  }

  // الزرّ يُربَط بحدثه أولاً بمعزل عن نجاح/فشل تحميل الجدول أدناه (نفس مبدأ settings-page.js) — لو
  // _refreshEmployees() رمت خطأ، لا يبقى الزرّ بلا مستمع حدث بصمت
  document.getElementById('add-employee-btn').addEventListener('click', () => _openEmployeeModal(null));
  try {
    await _refreshEmployees();
  } catch (err) {
    console.error('تعذّر تحميل قائمة الموظفين', err);
    showToast('تعذّر تحميل قائمة الموظفين، راجع الـ Console لمزيد من التفاصيل', 'error');
  }
});

async function _refreshEmployees() {
  const all = await dbGetAll('Employees');
  _allEmployeesCache = all.filter(e => e.status !== 'deleted');
  _drawEmployees();
}

function _drawEmployees() {
  const rows = _allEmployeesCache.map(e => ({
    ...e,
    nameWithAvatar: `<div style="display:flex; align-items:center; gap:8px;">${employeeAvatarHtml(e, 26)}<span>${e.fullName}</span></div>`,
    statusBadge: `<span class="badge ${e.status === 'active' ? 'badge--green' : e.status === 'leave' ? 'badge--warning' : 'badge--gray'}">${EMP_STATUS_LABELS[e.status] || e.status}</span>`,
    salaryLabel: formatCurrency(e.salary),
    hireDateLabel: formatDateArabic(e.hireDate),
  }));

  renderDataTable('employee-table', [
    { key: 'employeeCode', label: 'الرقم الوظيفي', sortable: true },
    { key: 'nameWithAvatar', label: 'الاسم', sortable: false },
    { key: 'jobTitle', label: 'الوظيفة', sortable: true },
    { key: 'phone', label: 'الجوال', sortable: false },
    { key: 'salaryLabel', label: 'الراتب', sortable: false },
    { key: 'hireDateLabel', label: 'تاريخ التعيين', sortable: false },
    { key: 'statusBadge', label: 'الحالة', sortable: false },
  ], rows, {
    onRowClick: (row) => {
      if (!hasActionPermission('employees', 'edit')) {
        showToast('ليس لديك صلاحية تعديل بيانات الموظفين', 'error');
        return;
      }
      _openEmployeeModal(row);
    },
    emptyMessage: 'لا يوجد موظفون مسجّلون بعد',
  });
}

// يقرأ ملف صورة ويصغّره عبر canvas (حد أقصى 200×200) قبل تحويله Base64 — تفاديًا لتضخّم IndexedDB بصور كبيرة
function _resizeImageFileToBase64(file, maxSize = 200) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('تعذّرت قراءة الصورة'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

let _pendingEmployeePhoto; // Base64 الصورة الجديدة المختارة في النموذج المفتوح حاليًا (undefined = لم تتغيّر)

function _openEmployeeModal(employee) {
  const isEdit = !!employee;
  _pendingEmployeePhoto = undefined;

  const html = `
    <form id="employee-modal-form" class="form-grid">
      <div class="form-group form-group--full" style="display:flex; align-items:center; gap:12px;">
        <div id="photo-preview">${employeeAvatarHtml(employee, 56)}</div>
        <div style="flex:1;">
          <label>صورة الموظف</label>
          <input type="file" id="m-photo" class="form-control" accept="image/*" />
        </div>
      </div>
      <div class="form-group form-group--full">
        <label>الاسم الكامل <span class="required">*</span></label>
        <input type="text" id="m-fullName" class="form-control" value="${employee?.fullName || ''}" />
      </div>
      <div class="form-group">
        <label>الرقم الوظيفي</label>
        <input type="text" id="m-employeeCode" class="form-control" value="${employee?.employeeCode || `EMP-${String(_allEmployeesCache.length + 1).padStart(3, '0')}`}" />
      </div>
      <div class="form-group">
        <label>الجوال</label>
        <input type="text" id="m-phone" class="form-control" value="${employee?.phone || ''}" />
      </div>
      <div class="form-group">
        <label>الوظيفة</label>
        <select id="m-jobTitle" class="form-control">
          ${JOB_TITLES.map(j => `<option value="${j}" ${employee?.jobTitle === j ? 'selected' : ''}>${j}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>تاريخ التعيين</label>
        <input type="date" id="m-hireDate" class="form-control" value="${employee?.hireDate || todayIso()}" />
      </div>
      <div class="form-group">
        <label>الراتب الشهري</label>
        <input type="number" id="m-salary" class="form-control" value="${employee?.salary ?? ''}" />
      </div>
      <div class="form-group">
        <label>الحالة</label>
        <select id="m-status" class="form-control">
          <option value="active" ${employee?.status === 'active' ? 'selected' : ''}>نشط</option>
          <option value="leave" ${employee?.status === 'leave' ? 'selected' : ''}>إجازة</option>
          <option value="terminated" ${employee?.status === 'terminated' ? 'selected' : ''}>منتهي الخدمة</option>
        </select>
      </div>

      ${isEdit && hasActionPermission('employees', 'delete') ? `
      <div class="form-group form-group--full" style="border-top:1px solid var(--color-border); padding-top: var(--spacing-3);">
        <button type="button" class="btn btn--danger btn--sm" id="delete-employee-btn">حذف هذا الموظف</button>
      </div>` : ''}
    </form>
  `;

  openModal(html, {
    title: isEdit ? 'تعديل بيانات الموظف' : 'تكويد موظف جديد',
    confirmLabel: 'حفظ',
    onConfirm: async () => {
      const fullName = document.getElementById('m-fullName').value.trim();
      if (!isRequired(fullName)) {
        showToast('اسم الموظف مطلوب', 'error');
        return;
      }
      const data = {
        fullName,
        employeeCode: document.getElementById('m-employeeCode').value.trim(),
        phone: document.getElementById('m-phone').value.trim(),
        jobTitle: document.getElementById('m-jobTitle').value,
        hireDate: document.getElementById('m-hireDate').value,
        salary: Number(document.getElementById('m-salary').value || 0),
        status: document.getElementById('m-status').value,
      };
      if (_pendingEmployeePhoto !== undefined) data.photoBase64 = _pendingEmployeePhoto;
      if (isEdit) {
        await dbUpdate('Employees', employee.id, data);
      } else {
        await dbAdd('Employees', data);
      }
      showToast('تم الحفظ بنجاح', 'success');
      closeModal();
      await _refreshEmployees();
    },
  });

  document.getElementById('m-photo').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      _pendingEmployeePhoto = await _resizeImageFileToBase64(file);
      document.getElementById('photo-preview').innerHTML = `<img src="${_pendingEmployeePhoto}" alt="" style="width:56px; height:56px; border-radius:50%; object-fit:cover;" />`;
    } catch {
      showToast('تعذّر قراءة الصورة المختارة', 'error');
    }
  });

  if (isEdit && hasActionPermission('employees', 'delete')) {
    document.getElementById('delete-employee-btn').addEventListener('click', () => {
      confirmDelete('هل أنت متأكد من حذف هذا الموظف؟ ستبقى سجلات العهد المرتبطة به كما هي وتظهر باسم "موظف محذوف".', async () => {
        await dbSoftDelete('Employees', employee.id);
        showToast('تم حذف الموظف', 'success');
        await _refreshEmployees();
      });
    });
  }
}
