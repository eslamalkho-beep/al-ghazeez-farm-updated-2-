// js/pages/employee-list-page.js

const JOB_TITLES = ['راعي', 'بيطري', 'عامل عام', 'محاسب', 'مشرف'];
const EMP_STATUS_LABELS = { active: 'نشط', terminated: 'منتهي الخدمة', leave: 'إجازة' };

let _allEmployeesCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('employees');
  renderSidebar('employees');
  renderHeader('سجل الموظفين');

  await _refreshEmployees();

  document.getElementById('add-employee-btn').addEventListener('click', () => _openEmployeeModal(null));
});

async function _refreshEmployees() {
  const all = await dbGetAll('Employees');
  _allEmployeesCache = all.filter(e => e.status !== 'deleted');
  _drawEmployees();
}

function _drawEmployees() {
  const rows = _allEmployeesCache.map(e => ({
    ...e,
    statusBadge: `<span class="badge ${e.status === 'active' ? 'badge--green' : e.status === 'leave' ? 'badge--warning' : 'badge--gray'}">${EMP_STATUS_LABELS[e.status] || e.status}</span>`,
    salaryLabel: formatCurrency(e.salary),
    hireDateLabel: formatDateArabic(e.hireDate),
  }));

  renderDataTable('employee-table', [
    { key: 'employeeCode', label: 'الرقم الوظيفي', sortable: true },
    { key: 'fullName', label: 'الاسم', sortable: true },
    { key: 'jobTitle', label: 'الوظيفة', sortable: true },
    { key: 'phone', label: 'الجوال', sortable: false },
    { key: 'salaryLabel', label: 'الراتب', sortable: false },
    { key: 'hireDateLabel', label: 'تاريخ التعيين', sortable: false },
    { key: 'statusBadge', label: 'الحالة', sortable: false },
  ], rows, {
    onRowClick: (row) => _openEmployeeModal(row),
    emptyMessage: 'لا يوجد موظفون مسجّلون بعد',
  });
}

function _openEmployeeModal(employee) {
  const isEdit = !!employee;
  const html = `
    <form id="employee-modal-form" class="form-grid">
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

      ${isEdit ? `
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

  if (isEdit) {
    document.getElementById('delete-employee-btn').addEventListener('click', () => {
      confirmDelete('هل أنت متأكد من حذف هذا الموظف؟ ستبقى سجلات العهد المرتبطة به كما هي وتظهر باسم "موظف محذوف".', async () => {
        await dbSoftDelete('Employees', employee.id);
        showToast('تم حذف الموظف', 'success');
        await _refreshEmployees();
      });
    });
  }
}
