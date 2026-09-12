// js/services/auth-service.js

const KNOWN_MODULE_FOLDERS = ['herd', 'expenses', 'revenues', 'purchases', 'bulk', 'parties', 'inventory', 'fixed-assets', 'employees', 'custody', 'notifications', 'reports', 'settings', 'accounting'];

// أدوار النظام الرسمية (Users.role) — "systemAdmin" فقط له وصول كامل دائم بصرف النظر عن Users.permissions
// (hasModuleAccess أدناه)؛ الدوران الآخران مقيّدان بصلاحياتهما المحفوظة فعليًا. defaultPermissions هنا مجرد
// تعبئة مبدئية تلقائية لصناديق الاختيار عند اختيار الدور أول مرة في نموذج المستخدم بصفحة الإعدادات
// (settings-page.js) — قابلة للتعديل يدويًا بالكامل بعدها، وليست قيدًا يُفرض لاحقًا
const SYSTEM_ROLES = [
  { key: 'systemAdmin', label: 'مدير النظام', fullAccess: true },
  {
    key: 'farmManager', label: 'مدير المزرعة',
    defaultPermissions: ['herd', 'bulk', 'inventory', 'expenses', 'revenues', 'purchases', 'parties', 'employees', 'custody', 'accounting', 'reports', 'notifications'],
  },
  { key: 'custom', label: 'مستخدم مخصص', defaultPermissions: [] },
];

// توافق خلفي: القيم القديمة لحقل role قبل نظام الأدوار الثلاثة هذا. 'manager' كان يمنح وصولاً كاملاً دائمًا
// (يقابل systemAdmin الآن)، و'owner' كان مقيّدًا بصلاحياته المحفوظة (يقابل custom). سجلات Users المخزَّنة
// فعليًا تُرحَّل مرة واحدة إلى المفاتيح الجديدة عبر _migrateLegacyUserRolesIfNeeded في seed.js، لكن
// resolveRoleKey() هنا طبقة توافق إضافية لأي جلسة (localStorage['currentUser']) تحمل القيمة القديمة قبل
// اكتمال تلك الهجرة (مثلاً مستخدم بقي مسجّلاً دخوله وقت الترحيل)
const LEGACY_ROLE_ALIASES = { manager: 'systemAdmin', owner: 'custom' };

function resolveRoleKey(role) {
  return LEGACY_ROLE_ALIASES[role] || role;
}

// صلاحيات دقيقة على مستوى الزر داخل كل وحدة — طبقة ثانية فوق hasModuleAccess (التي تبقى تتحكم فقط بالوصول
// للوحدة/الشاشة أصلاً). Users.permissions يقبل الآن ثلاثة أشكال (union type، بلا سكريبت ترحيل، التوافق الخلفي
// مضمّن في القراءة عبر hasModuleAccess/hasActionPermission نفسها):
//   - غائب (undefined)            → وصول كامل لكل شيء (كما كان دومًا قبل هذه الميزة)
//   - مصفوفة نصوص قديمة           → وصول كامل لكل الأزرار الستة في كل وحدة مذكورة (العضوية القديمة = وصول كامل)
//   - كائن جديد {[module]: true | {add,edit,delete,approve,print,export}} → true = وصول كامل للوحدة
//     (يُستخدم لـ systemAdmin فقط)، والكائن الفرعي = صلاحيات دقيقة لكل زر (مفتاح غائب = false)
// ⚠️ التطبيق الفعلي (إخفاء/تعطيل الأزرار المقابلة) غير مُعمَّم بعد إلا على وحدة المصروفات كنموذج مرجعي؛ بقية
// الوحدات ما زالت تعمل بمنطق "وصول للوحدة = وصول كامل لكل شيء داخلها" لحين تكرار نفس النمط عليها
const ACTION_KEYS = ['add', 'edit', 'delete', 'approve', 'print', 'export'];
const ACTION_LABELS = { add: 'إضافة', edit: 'تعديل', delete: 'حذف', approve: 'اعتماد', print: 'طباعة', export: 'تصدير' };

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

// يبني كائن جلسة المستخدم (لا يحفظه) — مشترك بين login() المباشر وcompleteTwoFactorLogin() بعد نجاح الخطوة الثانية
function _buildSessionUser(user) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    // يحافظ على الشكل كما هو (مصفوفة قديمة أو كائن جديد) — تحويل أي شكل غير-مصفوفة إلى null كان يمنح
    // وصولاً كاملاً بالخطأ لأي مستخدم صلاحياته مخزَّنة بالشكل الكائني الجديد (null تعني "بلا قائمة صلاحيات
    // محفوظة" في hasModuleAccess/hasActionPermission، أي وصول كامل)
    permissions: user.permissions !== undefined ? user.permissions : null,
  };
}

function _persistSession(sessionUser) {
  localStorage.setItem('currentUser', JSON.stringify(sessionUser));
  localStorage.setItem('lastActivityAt', String(Date.now()));
}

async function login(username, password) {
  const users = await dbGetAll('Users');
  // مستخدم محذوف ناعمًا (status:'deleted') يُعامَل كغير موجود تمامًا — نفس مبدأ باقي المخازن
  const user = users.find(u => u.username === username && u.status !== 'deleted');

  if (!user) {
    return { success: false, user: null, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
  }

  const hashed = await hashPassword(password);
  if (hashed !== user.passwordHash) {
    return { success: false, user: null, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
  }

  // حساب مُعطَّل (status:'disabled', انظر settings-page.js): كلمة المرور صحيحة لكن الدخول مرفوض صراحة —
  // رسالة مختلفة عمدًا عن "بيانات خاطئة" حتى يعرف المستخدم أن حسابه موجود لكنه موقوف لا أن كلمته خاطئة
  if (user.status === 'disabled') {
    return { success: false, user: null, message: 'هذا الحساب معطّل. تواصل مع مدير النظام' };
  }

  // التحقق بخطوتين (TOTP، انظر totp-service.js) مفعّل لهذا المستخدم: كلمة المرور صحيحة لكن الجلسة لا تُنشأ
  // إلا بعد كود تطبيق المصادقة — الصفحة تنتقل لخطوة ثانية وتستدعي completeTwoFactorLogin() أدناه بدل تكرار
  // إدخال كلمة المرور
  if (user.twoFactorEnabled && user.twoFactorSecret) {
    return { success: false, user: null, requiresTwoFactor: true, userId: user.id, message: 'يرجى إدخال كود التحقق بخطوتين' };
  }

  const sessionUser = _buildSessionUser(user);
  _persistSession(sessionUser);
  return { success: true, user: sessionUser, message: 'تم تسجيل الدخول بنجاح' };
}

// الخطوة الثانية من تسجيل الدخول عند تفعيل التحقق بخطوتين — تُستدعى من صفحة الدخول بعد أن أعادت login() أعلاه
// requiresTwoFactor:true، بمعزل عن كلمة المرور نفسها (لا تُمرَّر هنا مجددًا؛ تعذّر الدخول بكود صحيح فقط بلا
// كلمة مرور صحيحة أصلاً مستحيل لأن login() لا تصل لهذا الفرع إلا بعد التحقق من كلمة المرور أولاً)
async function completeTwoFactorLogin(userId, token) {
  const user = await dbGet('Users', userId);
  if (!user || user.status === 'deleted') {
    return { success: false, user: null, message: 'المستخدم غير موجود' };
  }
  if (user.status === 'disabled') {
    return { success: false, user: null, message: 'هذا الحساب معطّل. تواصل مع مدير النظام' };
  }
  if (!user.twoFactorEnabled || !user.twoFactorSecret) {
    return { success: false, user: null, message: 'التحقق بخطوتين غير مفعّل لهذا الحساب' };
  }

  let valid = await verifyTotpCode(user.twoFactorSecret, token);

  // فشل ككود TOTP عادي: جرّب كرمز احتياطي (Recovery Code، انظر totp-service.js) — الحل الوحيد لموقف فقدان
  // الجوال بلا مدير نظام آخر يقدر يوقف 2FA بدلاً منك. الرمز يُستهلك (حذف من القائمة) عند أول استخدام ناجح فقط
  let matchedRecoveryHash = null;
  if (!valid) {
    matchedRecoveryHash = await matchRecoveryCode(token, user.twoFactorRecoveryCodeHashes);
    if (matchedRecoveryHash) valid = true;
  }

  if (!valid) {
    return { success: false, user: null, message: 'كود التحقق أو الرمز الاحتياطي غير صحيح' };
  }

  if (matchedRecoveryHash) {
    const remaining = (user.twoFactorRecoveryCodeHashes || []).filter(h => h !== matchedRecoveryHash);
    await dbUpdate('Users', user.id, { twoFactorRecoveryCodeHashes: remaining });
  }

  const sessionUser = _buildSessionUser(user);
  _persistSession(sessionUser);
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
  if (resolveRoleKey(user.role) === 'systemAdmin') return true;
  if (!user.permissions) return true; // لا قائمة صلاحيات محفوظة = وصول كامل (توافق خلفي)
  if (Array.isArray(user.permissions)) return user.permissions.includes(moduleKey); // شكل قديم
  return Object.prototype.hasOwnProperty.call(user.permissions, moduleKey); // شكل جديد (كائن لكل وحدة)
}

// action من ACTION_KEYS ('add'|'edit'|'delete'|'approve'|'print'|'export'). moduleKey/action اختياريان —
// بلا أحدهما تُرجع true دومًا. تفترض ضمنيًا أن hasModuleAccess(moduleKey) صحيحة أصلاً (تُعيد false مباشرة
// إن لم تكن كذلك) — لا معنى لصلاحية زر داخل وحدة لا يملك المستخدم الوصول لها أصلاً
function hasActionPermission(moduleKey, action) {
  if (!moduleKey || !action) return true;
  const user = getCurrentUser();
  if (!user) return false;
  if (resolveRoleKey(user.role) === 'systemAdmin') return true;
  if (!hasModuleAccess(moduleKey)) return false;
  if (!user.permissions) return true; // توافق خلفي: بلا قائمة صلاحيات محفوظة = وصول كامل
  if (Array.isArray(user.permissions)) return true; // توافق خلفي: عضوية مسطّحة قديمة = وصول كامل لكل الأزرار
  const modulePerm = user.permissions[moduleKey];
  if (modulePerm === true) return true;
  if (modulePerm && typeof modulePerm === 'object') return !!modulePerm[action];
  return false;
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
