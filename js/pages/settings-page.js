// js/pages/settings-page.js

const SETTINGS_KEY = 'alGhazeezFarmSettings';

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('settings');
  renderSidebar('settings');
  renderHeader('الإعدادات');

  _loadFarmSettings();

  document.getElementById('farm-settings-form').addEventListener('submit', _handleSettingsSave);
  document.getElementById('export-data-btn').addEventListener('click', _exportBackup);
  document.getElementById('import-data-file').addEventListener('change', _importBackup);
  document.getElementById('reset-data-btn').addEventListener('click', _confirmResetData);

  const currentUser = getCurrentUser();
  if (currentUser && currentUser.role === 'manager') {
    document.getElementById('user-management-section').style.display = '';
    await _refreshUsers();
    document.getElementById('add-user-btn').addEventListener('click', () => _openUserModal(null));
  }
});

function _loadFarmSettings() {
  const defaults = {
    farmName: 'مزرعة الغزيز',
    ownerName: '',
    farmPhone: '',
    farmLocation: '',
  };
  const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  const settings = { ...defaults, ...saved };

  Object.entries(settings).forEach(([key, value]) => {
    const field = document.getElementById(key);
    if (field) field.value = value;
  });
}

function _handleSettingsSave(event) {
  event.preventDefault();
  const settings = {
    farmName: document.getElementById('farmName').value.trim(),
    ownerName: document.getElementById('ownerName').value.trim(),
    farmPhone: document.getElementById('farmPhone').value.trim(),
    farmLocation: document.getElementById('farmLocation').value.trim(),
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  showToast('تم حفظ الإعدادات', 'success');
}

// المرفقات تُخزَّن كـ Blob في IndexedDB، وBlob لا يمكن تحويله إلى JSON مباشرة —
// لذا نحوّله إلى Base64 عند التصدير ونعيده Blob عند الاستيراد، لبقية المخازن لا داعي لأي تحويل
async function _blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function _base64ToBlob(dataUrl, mimeType) {
  const base64 = String(dataUrl).split(',')[1] || dataUrl;
  const byteString = atob(base64);
  const bytes = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

async function _exportBackup() {
  const backup = {
    exportedAt: new Date().toISOString(),
    settings: JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'),
    stores: {},
  };

  for (const storeName of OBJECT_STORES) {
    const items = await dbGetAll(storeName);
    if (storeName === 'Attachments') {
      backup.stores[storeName] = await Promise.all(items.map(async item => ({
        ...item, blob: await _blobToBase64(item.blob),
      })));
    } else {
      backup.stores[storeName] = items;
    }
  }

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `al-ghazeez-backup-${todayIso()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast('تم تجهيز النسخة الاحتياطية', 'success');
}

async function _importBackup(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const backup = JSON.parse(text);
    if (!backup.stores || typeof backup.stores !== 'object') {
      throw new Error('Invalid backup format');
    }

    confirmDelete('سيتم استبدال البيانات الحالية بالنسخة المختارة. هل تريد المتابعة؟', async () => {
      await _replaceDatabaseWithBackup(backup);
      showToast('تم استيراد النسخة الاحتياطية', 'success');
      setTimeout(() => window.location.reload(), 600);
    });
  } catch (error) {
    showToast('ملف النسخة الاحتياطية غير صالح', 'error');
  } finally {
    event.target.value = '';
  }
}

async function _replaceDatabaseWithBackup(backup) {
  for (const storeName of OBJECT_STORES) {
    const items = Array.isArray(backup.stores[storeName]) ? backup.stores[storeName] : [];
    await _clearStore(storeName);
    for (const item of items) {
      if (storeName === 'Attachments' && typeof item.blob === 'string') {
        await dbAdd(storeName, { ...item, blob: _base64ToBlob(item.blob, item.fileType) });
      } else {
        await dbAdd(storeName, item);
      }
    }
  }
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(backup.settings || {}));
}

async function _clearStore(storeName) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.clear();
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

function _confirmResetData() {
  confirmDelete('سيتم حذف كل بيانات التطبيق من هذا المتصفح وتسجيل الخروج. هل أنت متأكد؟', () => {
    if (_dbInstance) {
      _dbInstance.close();
      _dbInstance = null;
    }
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => {
      localStorage.removeItem('currentUser');
      localStorage.removeItem(SETTINGS_KEY);
      showToast('تم حذف البيانات', 'success');
      setTimeout(() => { window.location.href = '../index.html'; }, 700);
    };
    request.onerror = () => showToast('تعذر حذف قاعدة البيانات', 'error');
  });
}

// ===== إدارة المستخدمين والصلاحيات (مدير المزرعة فقط) =====

let _allUsersCache = [];

function _permissionModules() {
  return SIDEBAR_LINKS.filter(l => l.key !== 'dashboard');
}

async function _refreshUsers() {
  _allUsersCache = await dbGetAll('Users');
  _drawUsers();
}

function _drawUsers() {
  const labelByKey = Object.fromEntries(_permissionModules().map(m => [m.key, m.label]));
  const rows = _allUsersCache.map(u => ({
    ...u,
    roleBadge: `<span class="badge ${u.role === 'manager' ? 'badge--green' : 'badge--gray'}">${u.role === 'owner' ? 'صاحب الحلال' : 'مدير المزرعة'}</span>`,
    permissionsSummary: u.role === 'manager'
      ? 'كل الصلاحيات'
      : (Array.isArray(u.permissions)
        ? (u.permissions.map(k => labelByKey[k]).filter(Boolean).join('، ') || 'لا صلاحيات')
        : 'كل الصلاحيات'),
  }));

  renderDataTable('users-table', [
    { key: 'username', label: 'اسم المستخدم', sortable: true },
    { key: 'fullName', label: 'الاسم الكامل', sortable: true },
    { key: 'phone', label: 'الجوال', sortable: false },
    { key: 'roleBadge', label: 'الدور', sortable: false },
    { key: 'permissionsSummary', label: 'الصلاحيات', sortable: false },
  ], rows, {
    onRowClick: (row) => _openUserModal(row),
    emptyMessage: 'لا يوجد مستخدمون بعد',
  });
}

function _openUserModal(user) {
  const isEdit = !!user;
  const modules = _permissionModules();
  const currentPermissions = Array.isArray(user?.permissions) ? user.permissions : modules.map(m => m.key);

  const checkboxesHtml = modules.map(m => `
    <label style="display:flex; align-items:center; gap:6px; font-weight:400;">
      <input type="checkbox" class="m-permission" value="${m.key}" ${currentPermissions.includes(m.key) ? 'checked' : ''} />
      ${m.label}
    </label>
  `).join('');

  const html = `
    <form id="user-modal-form" class="form-grid">
      <div class="form-group">
        <label>اسم المستخدم <span class="required">*</span></label>
        <input type="text" id="m-username" class="form-control" value="${user?.username || ''}" ${isEdit ? 'disabled' : ''} />
      </div>
      <div class="form-group">
        <label>الاسم الكامل <span class="required">*</span></label>
        <input type="text" id="m-fullName" class="form-control" value="${user?.fullName || ''}" />
      </div>
      <div class="form-group">
        <label>الجوال</label>
        <input type="text" id="m-phone" class="form-control" value="${user?.phone || ''}" />
      </div>
      <div class="form-group">
        <label>الدور <span class="required">*</span></label>
        <select id="m-role" class="form-control">
          <option value="manager" ${user?.role !== 'owner' ? 'selected' : ''}>مدير المزرعة</option>
          <option value="owner" ${user?.role === 'owner' ? 'selected' : ''}>صاحب الحلال</option>
        </select>
      </div>
      <div class="form-group form-group--full">
        <label>كلمة المرور ${isEdit ? '(اتركها فارغة للإبقاء عليها كما هي)' : '<span class="required">*</span>'}</label>
        <input type="password" id="m-password" class="form-control" autocomplete="new-password" />
      </div>
      <div class="form-group form-group--full">
        <label>الصلاحيات (الوحدات المتاحة)</label>
        <div id="m-permissions-wrap" style="display:flex; flex-wrap:wrap; gap:12px;">${checkboxesHtml}</div>
        <p id="m-owner-note" style="display:none; font-size:12px; color: var(--color-text-secondary); margin-top:6px;">مدير المزرعة لديه وصول كامل لجميع الوحدات تلقائيًا</p>
      </div>
    </form>
  `;

  openModal(html, {
    title: isEdit ? 'تعديل بيانات المستخدم' : 'إضافة مستخدم جديد',
    confirmLabel: 'حفظ',
    onConfirm: async () => {
      const username = document.getElementById('m-username').value.trim();
      const fullName = document.getElementById('m-fullName').value.trim();
      const phone = document.getElementById('m-phone').value.trim();
      const role = document.getElementById('m-role').value;
      const password = document.getElementById('m-password').value;

      if (!isRequired(username)) { showToast('اسم المستخدم مطلوب', 'error'); return; }
      if (!isRequired(fullName)) { showToast('الاسم الكامل مطلوب', 'error'); return; }

      const duplicate = _allUsersCache.some(u => u.username === username && u.id !== user?.id);
      if (duplicate) { showToast('اسم المستخدم مستخدم بالفعل', 'error'); return; }

      if (!isEdit && (!password || password.length < 6)) {
        showToast('كلمة المرور مطلوبة (6 أحرف على الأقل)', 'error'); return;
      }
      if (isEdit && password && password.length < 6) {
        showToast('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'error'); return;
      }

      const currentUser = getCurrentUser();
      if (isEdit && user.id === currentUser.id && user.role === 'manager' && role !== 'manager') {
        showToast('لا يمكنك تغيير دورك الخاص عن كونك مدير المزرعة', 'error'); return;
      }

      const selectedPermissions = Array.from(document.querySelectorAll('.m-permission:checked')).map(cb => cb.value);
      const permissions = role === 'manager' ? modules.map(m => m.key) : selectedPermissions;

      const data = { username, fullName, phone, role, permissions };
      if (password) data.passwordHash = await hashPassword(password);

      if (isEdit) {
        await dbUpdate('Users', user.id, data);
      } else {
        await dbAdd('Users', data);
      }
      showToast('تم الحفظ بنجاح', 'success');
      closeModal();
      await _refreshUsers();
    },
  });

  const roleSelect = document.getElementById('m-role');
  const permissionCheckboxes = document.querySelectorAll('.m-permission');
  const ownerNote = document.getElementById('m-owner-note');
  const syncPermissionState = () => {
    const isManager = roleSelect.value === 'manager';
    ownerNote.style.display = isManager ? 'block' : 'none';
    permissionCheckboxes.forEach(cb => {
      cb.disabled = isManager;
      if (isManager) cb.checked = true;
    });
  };
  roleSelect.addEventListener('change', syncPermissionState);
  syncPermissionState();
}
