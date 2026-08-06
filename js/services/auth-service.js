// js/services/auth-service.js

const KNOWN_MODULE_FOLDERS = ['herd', 'expenses', 'revenues', 'purchases', 'bulk', 'categories', 'parties', 'inventory', 'employees', 'custody', 'notifications', 'reports', 'settings', 'accounting'];

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 دقيقة خمول تُسجّل خروج المستخدم تلقائيًا
let _inactivityWatcherStarted = false;
let _lastActivityWriteAt = 0;

function _isNestedPage() {
  return window.location.pathname.split('/').filter(Boolean).some(seg => KNOWN_MODULE_FOLDERS.includes(seg));
}

async function hashPassword(plainText) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plainText);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function login(username, password) {
  const users = await dbGetAll('Users');
  const user = users.find(u => u.username === username);

  if (!user) {
    return { success: false, user: null, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
  }

  const hashed = await hashPassword(password);
  if (hashed !== user.passwordHash) {
    return { success: false, user: null, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
  }

  const sessionUser = {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    permissions: Array.isArray(user.permissions) ? user.permissions : null,
  };
  localStorage.setItem('currentUser', JSON.stringify(sessionUser));
  localStorage.setItem('lastActivityAt', String(Date.now()));
  return { success: true, user: sessionUser, message: 'تم تسجيل الدخول بنجاح' };
}

function logout() {
  localStorage.removeItem('currentUser');
  localStorage.removeItem('lastActivityAt');
  window.location.href = _isNestedPage() ? '../index.html' : 'index.html';
}

function getCurrentUser() {
  const raw = localStorage.getItem('currentUser');
  if (!raw) return null;
  const lastActivity = Number(localStorage.getItem('lastActivityAt') || 0);
  if (Date.now() - lastActivity > INACTIVITY_TIMEOUT_MS) {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('lastActivityAt');
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

// تُستدعى عند أي نشاط فعلي للمستخدم (حركة فأرة/ضغط مفتاح/نقر/لمس) لتحديث وقت آخر نشاط، بمعدل مخفَّف لتفادي كتابة متكررة على localStorage
function _touchActivity() {
  const now = Date.now();
  if (now - _lastActivityWriteAt < 5000) return;
  _lastActivityWriteAt = now;
  if (localStorage.getItem('currentUser')) {
    localStorage.setItem('lastActivityAt', String(now));
  }
}

// يُشغَّل مرة واحدة لكل تحميل صفحة محمية: يراقب نشاط المستخدم، ويسجّل خروجه تلقائيًا إن بقيت الصفحة مفتوحة بلا نشاط لأكثر من INACTIVITY_TIMEOUT_MS دون الحاجة لتنقّل/تحميل صفحة جديدة
function _startInactivityWatcher() {
  if (_inactivityWatcherStarted) return;
  _inactivityWatcherStarted = true;

  ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'].forEach(evt => {
    document.addEventListener(evt, _touchActivity, { passive: true });
  });

  setInterval(() => {
    if (!getCurrentUser()) {
      logout();
    }
  }, 30 * 1000);
}

// moduleKey اختياري — يطابق مفاتيح SIDEBAR_LINKS (herd/expenses/...). بلا وسيط تُرجع true دومًا
function hasModuleAccess(moduleKey) {
  if (!moduleKey) return true;
  const user = getCurrentUser();
  if (!user) return false;
  if (user.role === 'manager') return true;
  if (!Array.isArray(user.permissions)) return true; // لا قائمة صلاحيات محفوظة = وصول كامل (توافق خلفي)
  return user.permissions.includes(moduleKey);
}

function requireAuth(moduleKey) {
  const user = getCurrentUser();
  if (!user) {
    window.location.href = _isNestedPage() ? '../index.html' : 'index.html';
    return null;
  }
  if (moduleKey && !hasModuleAccess(moduleKey)) {
    window.location.href = _isNestedPage() ? '../dashboard.html' : 'dashboard.html';
    return null;
  }
  localStorage.setItem('lastActivityAt', String(Date.now()));
  _startInactivityWatcher();
  return user;
}
