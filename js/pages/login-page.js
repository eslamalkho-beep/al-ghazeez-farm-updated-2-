// js/pages/login-page.js

// اسم المزرعة وشعارها المخصّصان من settings-page.js (نفس مفتاح localStorage 'alGhazeezFarmSettings')
// — صفحة الدخول لا تحمّل sidebar.js فتحتاج نفس القراءة المكرَّرة بمعزل عنه (انظر تعليق _sidebarGetFarmBranding
// في sidebar.js). تُطبَّق فورًا قبل أي شيء آخر حتى تظهر صحيحة من أول لحظة رسم الصفحة.
function _applyLoginPageBranding() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem('alGhazeezFarmSettings') || '{}');
  } catch (e) {
    saved = {};
  }
  const farmName = (saved.farmName && String(saved.farmName).trim()) || 'مزرعة الغزيز';
  const logoSrc = saved.logoBase64 || 'assets/logo.png';

  const logoImg = document.querySelector('.login-card__logo img');
  if (logoImg) {
    logoImg.src = logoSrc;
    logoImg.alt = `شعار ${farmName}`;
  }
  const titleEl = document.querySelector('.login-card__title');
  if (titleEl) titleEl.textContent = farmName;
  document.title = `تسجيل الدخول | ${farmName}`;
}
_applyLoginPageBranding();

// ===== الوضع الليلي — data-theme مضبوطة مسبقًا من السكريبت المضمَّن في <head> (تفاديًا لومضة الوضع الخاطئ) =====
function _initLoginThemeToggle() {
  const btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;

  const applyIcon = (theme) => {
    btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  };
  applyIcon(document.documentElement.getAttribute('data-theme') || 'light');

  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
    applyIcon(next);
  });
}
_initLoginThemeToggle();

// ===== تذكرني — يحفظ اسم المستخدم وكلمة المرور محليًا (localStorage) لأكثر من حساب معًا، ويعرضهم كقائمة
// منسدلة عند الوقوف على حقل اسم المستخدم (اختيار حساب يُعبّئ الحقلين تلقائيًا معًا). savedLoginAccounts:
// [{username, password}, ...], الأحدث أولاً =====
const SAVED_ACCOUNTS_KEY = 'savedLoginAccounts';
const LEGACY_REMEMBER_KEY = 'rememberedCredentials'; // شكل قديم (حساب واحد فقط) قبل هذه الميزة

function _loadSavedAccounts() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_ACCOUNTS_KEY) || 'null');
    if (Array.isArray(saved)) return saved.filter(a => a && a.username);
  } catch (e) {}

  // ترحيل لمرة واحدة من الشكل القديم (رابط localStorage مباشر بحساب واحد) للمصفوفة الجديدة
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_REMEMBER_KEY) || 'null');
    if (legacy && legacy.username) {
      const migrated = [{ username: legacy.username, password: legacy.password }];
      localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(migrated));
      localStorage.removeItem(LEGACY_REMEMBER_KEY);
      return migrated;
    }
  } catch (e) {}
  return [];
}

function _saveAccount(username, password) {
  try {
    const accounts = _loadSavedAccounts().filter(a => a.username !== username);
    accounts.unshift({ username, password });
    localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch (e) {}
}

function _removeAccount(username) {
  try {
    const accounts = _loadSavedAccounts().filter(a => a.username !== username);
    localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch (e) {}
}

function _escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

document.addEventListener('DOMContentLoaded', async () => {
  // إن كان المستخدم مسجّلاً دخوله بالفعل، وجّهه مباشرة للوحة التحكم
  const existingUser = getCurrentUser();
  if (existingUser) {
    window.location.href = 'dashboard.html';
    return;
  }

  await seedDatabaseIfEmpty();

  const form = document.getElementById('login-form');
  const errorBox = document.getElementById('login-error-box');
  const welcomeBox = document.getElementById('login-welcome-box');
  const submitBtn = document.getElementById('login-submit-btn');
  const togglePassword = document.getElementById('toggle-password');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const rememberCheckbox = document.getElementById('remember-me');
  const forgotLink = document.getElementById('forgot-password-link');
  const usernameSuggestions = document.getElementById('username-suggestions');

  // ===== خطوة التحقق بخطوتين (TOTP) — تظهر فقط للمستخدمين المفعّل لديهم 2FA (انظر Users.twoFactorEnabled) =====
  const twofaForm = document.getElementById('twofa-form');
  const twofaCodeInput = document.getElementById('twofa-code');
  const twofaSubmitBtn = document.getElementById('twofa-submit-btn');
  const twofaBackBtn = document.getElementById('twofa-back-btn');
  const twofaLostDeviceLink = document.getElementById('twofa-lost-device-link');
  // بيانات محفوظة مؤقتًا بين نجاح خطوة كلمة المرور وإكمال خطوة كود التحقق — لا تُحفظ في أي مكان دائم قبل نجاح الدخول فعليًا
  let _pendingLogin = null;

  function _showTwoFactorStep(userId, username, password) {
    _pendingLogin = { userId, username, password };
    form.style.display = 'none';
    twofaForm.style.display = '';
    errorBox.style.display = 'none';
    twofaCodeInput.value = '';
    twofaCodeInput.focus();
  }

  function _showCredentialsStep() {
    _pendingLogin = null;
    twofaForm.style.display = 'none';
    form.style.display = '';
    errorBox.style.display = 'none';
  }

  function _finishLoginSuccess(result, username, password) {
    if (rememberCheckbox.checked) {
      _saveAccount(username, password);
    } else {
      _removeAccount(username);
    }
    const displayName = (result.user && (result.user.fullName || result.user.username)) || username;
    showToast(`مرحبًا بك، ${displayName}`, 'success');
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 400);
  }

  // ===== قائمة الحسابات المحفوظة المنسدلة — تظهر عند الوقوف على/الكتابة في حقل اسم المستخدم =====
  function _closeUsernameSuggestions() {
    usernameSuggestions.classList.remove('username-suggestions--show');
    usernameSuggestions.innerHTML = '';
  }

  function _openUsernameSuggestions(filterText) {
    const accounts = _loadSavedAccounts();
    if (!accounts.length) { _closeUsernameSuggestions(); return; }

    const filtered = filterText
      ? accounts.filter(a => a.username.toLowerCase().includes(filterText.trim().toLowerCase()))
      : accounts;
    if (!filtered.length) { _closeUsernameSuggestions(); return; }

    usernameSuggestions.innerHTML = filtered.map(a => `
      <li data-username="${_escapeHtml(a.username)}">
        <span>👤 ${_escapeHtml(a.username)}</span>
        <span class="us-remove" data-remove="${_escapeHtml(a.username)}" title="نسيان هذا الحساب">✕</span>
      </li>
    `).join('');
    usernameSuggestions.classList.add('username-suggestions--show');
  }

  usernameInput.addEventListener('focus', () => _openUsernameSuggestions(usernameInput.value.trim()));
  usernameInput.addEventListener('input', () => _openUsernameSuggestions(usernameInput.value.trim()));
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#username-group')) _closeUsernameSuggestions();
  });

  usernameSuggestions.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('[data-remove]');
    if (removeBtn) {
      e.stopPropagation();
      _removeAccount(removeBtn.dataset.remove);
      _openUsernameSuggestions(usernameInput.value.trim());
      return;
    }
    const item = e.target.closest('li[data-username]');
    if (!item) return;
    const chosen = _loadSavedAccounts().find(a => a.username === item.dataset.username);
    if (!chosen) return;
    usernameInput.value = chosen.username;
    passwordInput.value = chosen.password;
    rememberCheckbox.checked = true;
    _closeUsernameSuggestions();
    passwordInput.focus();
  });

  twofaBackBtn.addEventListener('click', _showCredentialsStep);

  // فقد الموبايل/تطبيق المصادقة لا يعمل: لا يوجد "استرجاع ذاتي" ممكن (السرّ محفوظ فقط في التطبيق المفقود) —
  // الحل الوحيد هو تدخّل مدير النظام (زر "إيقاف 2FA" لهذا المستخدم من صفحة الإعدادات، انظر _resetUserTwoFactor
  // في settings-page.js)، وبعدها يدخل المستخدم بكلمة المرور فقط ويربط جهازًا جديدًا من جديد
  twofaLostDeviceLink.addEventListener('click', (e) => {
    e.preventDefault();
    const username = (_pendingLogin && _pendingLogin.username) || '';
    openModal(
      `<p>إن كان لديك أحد <strong>الرموز الاحتياطية</strong> (ظهرت لك مرة واحدة عند تفعيل التحقق بخطوتين)، أدخله في نفس حقل الكود أعلاه بدلاً من كود التطبيق.</p>
       <p>لا رموز احتياطية متبقية؟ تواصل مع مدير النظام وأبلغه باسم المستخدم${username ? ` <strong>"${username}"</strong>` : ''}
       ليوقف التحقق بخطوتين لحسابك من صفحة الإعدادات ← إدارة المستخدمين والصلاحيات.
       بعدها ستتمكن من الدخول بكلمة المرور فقط، ويمكنك ربط جهاز جديد لاحقًا من نفس الصفحة.</p>`,
      { title: 'فقدت الوصول لتطبيق المصادقة؟', hideFooter: true }
    );
  });

  // تعبئة تلقائية + رسالة ترحيب فقط لو محفوظ حساب واحد بالضبط (لا لبس في أيهما) — لو أكثر من حساب، تُترك
  // الحقول فارغة ويختار المستخدم من القائمة المنسدلة عند الوقوف على حقل اسم المستخدم (انظر أعلاه)
  const savedAccounts = _loadSavedAccounts();
  if (savedAccounts.length === 1) {
    usernameInput.value = savedAccounts[0].username;
    passwordInput.value = savedAccounts[0].password;
    rememberCheckbox.checked = true;
    welcomeBox.textContent = `مرحبًا بعودتك، ${savedAccounts[0].username} 👋`;
    welcomeBox.style.display = 'block';
  }

  togglePassword.addEventListener('click', () => {
    const isHidden = passwordInput.type === 'password';
    passwordInput.type = isHidden ? 'text' : 'password';
    togglePassword.textContent = isHidden ? 'إخفاء' : 'إظهار';
  });

  forgotLink.addEventListener('click', (e) => {
    e.preventDefault();
    openModal(
      '<p>لإعادة تعيين كلمة المرور، يرجى التواصل مع مدير النظام مباشرة.</p>',
      { title: 'نسيت كلمة المرور؟', hideFooter: true }
    );
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.style.display = 'none';

    const isValid = validateForm([
      { fieldId: 'username', validatorFn: isRequired, message: 'هذا الحقل مطلوب' },
      { fieldId: 'password', validatorFn: isRequired, message: 'هذا الحقل مطلوب' },
    ]);
    if (!isValid) return;

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    submitBtn.disabled = true;
    submitBtn.textContent = 'جاري تسجيل الدخول...';

    try {
      const result = await login(username, password);
      if (result.success) {
        _finishLoginSuccess(result, username, password);
      } else if (result.requiresTwoFactor) {
        _showTwoFactorStep(result.userId, username, password);
      } else {
        errorBox.textContent = result.message;
        errorBox.style.display = 'block';
      }
    } catch (err) {
      errorBox.textContent = 'حدث خطأ غير متوقع، حاول مرة أخرى';
      errorBox.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'تسجيل الدخول';
    }
  });

  twofaForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.style.display = 'none';

    const isValid = validateForm([
      {
        fieldId: 'twofa-code',
        validatorFn: (v) => /^\d{6}$/.test(String(v || '').trim()) || RECOVERY_CODE_PATTERN.test(String(v || '').trim()),
        message: 'أدخل كود التحقق المكوَّن من 6 أرقام، أو رمزًا احتياطيًا',
      },
    ]);
    if (!isValid) return;

    if (!_pendingLogin) {
      _showCredentialsStep();
      return;
    }

    twofaSubmitBtn.disabled = true;
    twofaSubmitBtn.textContent = 'جاري التحقق...';

    try {
      const result = await completeTwoFactorLogin(_pendingLogin.userId, twofaCodeInput.value);
      if (result.success) {
        _finishLoginSuccess(result, _pendingLogin.username, _pendingLogin.password);
      } else {
        errorBox.textContent = result.message;
        errorBox.style.display = 'block';
      }
    } catch (err) {
      errorBox.textContent = 'حدث خطأ غير متوقع، حاول مرة أخرى';
      errorBox.style.display = 'block';
    } finally {
      twofaSubmitBtn.disabled = false;
      twofaSubmitBtn.textContent = 'تحقّق ودخول';
    }
  });
});
