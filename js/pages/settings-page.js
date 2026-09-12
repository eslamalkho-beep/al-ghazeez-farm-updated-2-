// js/pages/settings-page.js

const SETTINGS_KEY = 'alGhazeezFarmSettings';

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('settings');
  renderSidebar('settings');
  renderHeader('الإعدادات');

  _loadFarmSettings();
  _loadAlertsPreferences();

  document.getElementById('farm-settings-form').addEventListener('submit', _handleSettingsSave);
  document.getElementById('farmLogo').addEventListener('change', _handleFarmLogoFileChange);
  document.getElementById('reset-farm-logo-btn').addEventListener('click', _handleResetFarmLogo);
  document.getElementById('alerts-preferences-form').addEventListener('submit', _handleAlertsPreferencesSave);
  document.getElementById('export-data-btn').addEventListener('click', _exportBackup);
  document.getElementById('import-data-file').addEventListener('change', _importBackup);
  document.getElementById('reset-data-btn').addEventListener('click', _confirmResetData);

  document.getElementById('twofa-enable-btn').addEventListener('click', _openEnableTwoFactorModal);
  document.getElementById('twofa-disable-btn').addEventListener('click', _disableOwnTwoFactor);
  document.getElementById('twofa-regen-codes-btn').addEventListener('click', () => {
    const currentUser = getCurrentUser();
    if (currentUser) _regenerateRecoveryCodes(currentUser, _loadTwoFactorStatus);
  });
  await _loadTwoFactorStatus();

  const currentUser = getCurrentUser();
  if (currentUser && resolveRoleKey(currentUser.role) === 'systemAdmin') {
    document.getElementById('user-management-section').style.display = '';
    // ⚠️ زرّ الإضافة يُربَط بحدثه أولاً، بمعزل تمامًا عن نجاح/فشل تحميل جدول المستخدمين أدناه — لو _refreshUsers()
    // رمت خطأ لأي سبب (بيانات تالفة في IndexedDB مثلاً)، كان ذلك يمنع تنفيذ سطر addEventListener التالي أصلاً
    // فيظهر الزر موجودًا لكن بلا أي مستمع حدث إطلاقًا (لا خطأ ظاهر، الزر "لا يعمل" ببساطة بصمت)
    document.getElementById('add-user-btn').addEventListener('click', () => {
      try {
        _openUserModal(null);
      } catch (err) {
        console.error('تعذّر فتح نافذة إضافة مستخدم', err);
        showToast('تعذّر فتح نافذة إضافة مستخدم، راجع الـ Console لمزيد من التفاصيل', 'error');
      }
    });
    try {
      await _refreshUsers();
    } catch (err) {
      console.error('تعذّر تحميل قائمة المستخدمين', err);
      showToast('تعذّر تحميل قائمة المستخدمين، راجع الـ Console لمزيد من التفاصيل', 'error');
    }

    // زر "+" العائم (quick-action-fab.js) يوجّه هنا بـ ?openAddUser=1 — يفتح نافذة إضافة مستخدم تلقائيًا
    // بدل تحميل الصفحة فقط وترك المستخدم يبحث عن الزر بنفسه، بنفس مبدأ باقي اختصارات الزر العائم
    // (تذهب مباشرة لنموذج التسجيل المطلوب لا لصفحة القائمة فقط)
    if (new URLSearchParams(window.location.search).get('openAddUser') === '1') {
      _openUserModal(null);
    }
  }
});

// شعار المزرعة (logoBase64) مُدار بمعزل عن بقية حقول هذا النموذج (كلها نصوص عادية تُقرأ/تُكتب مباشرة من
// عناصر <input>): يحتاج قراءة/تصغير ملف صورة أولاً (نفس أسلوب صورة الموظف — _resizeImageFileToBase64 في
// employee-list-page.js، نسخة مستقلة هنا بمقاس أكبر يناسب شعار الشريط الجانبي/ترويسة PDF معًا). undefined
// = لم يتغيّر (لا تعديل عند الحفظ)، null = إعادة تعيين صريحة للشعار الافتراضي، نص Base64 = شعار جديد
let _pendingFarmLogo;

function _resizeLogoFileToBase64(file, maxSize = 320) {
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
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function _renderFarmLogoPreview(src) {
  document.getElementById('farm-logo-preview').innerHTML =
    `<img src="${src}" alt="شعار المزرعة" style="width:56px; height:56px; border-radius:8px; object-fit:cover; border:1px solid var(--color-border);" />`;
}

async function _handleFarmLogoFileChange(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    _pendingFarmLogo = await _resizeLogoFileToBase64(file);
    _renderFarmLogoPreview(_pendingFarmLogo);
  } catch {
    showToast('تعذّر قراءة الصورة المختارة', 'error');
  }
}

function _handleResetFarmLogo() {
  _pendingFarmLogo = null;
  document.getElementById('farmLogo').value = '';
  _renderFarmLogoPreview(getRootPath('assets/logo.png'));
  showToast('سيُستخدَم الشعار الافتراضي بعد الحفظ', 'info');
}

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

  _pendingFarmLogo = undefined;
  _renderFarmLogoPreview(saved.logoBase64 || getRootPath('assets/logo.png'));
}

function _handleSettingsSave(event) {
  event.preventDefault();
  const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  const settings = {
    ...saved,
    farmName: document.getElementById('farmName').value.trim(),
    ownerName: document.getElementById('ownerName').value.trim(),
    farmPhone: document.getElementById('farmPhone').value.trim(),
    farmLocation: document.getElementById('farmLocation').value.trim(),
  };
  if (_pendingFarmLogo !== undefined) {
    if (_pendingFarmLogo) settings.logoBase64 = _pendingFarmLogo;
    else delete settings.logoBase64;
  }
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  _pendingFarmLogo = undefined;
  showToast('تم حفظ الإعدادات', 'success');
  // تحديث فوري للشريط الجانبي/عنوان الصفحة الحالية بلا انتظار إعادة تحميل (renderSidebar تقرأ نفس المفتاح
  // من جديد في كل استدعاء، انظر _sidebarGetFarmBranding في sidebar.js)
  if (typeof renderSidebar === 'function') renderSidebar('settings');
}

// ===== تفضيلات تنبيهات القطيع (بلوغ السن/المواليد/الوفيات) + حد تنبيه انخفاض الصندوق/البنك =====
// المصدر الوحيد لمنطق القراءة/الكتابة هو getAlertsPreferences()/saveAlertsPreferences()/ALERT_AGE_GROUPS
// و getCashAlertThreshold()/setCashAlertThreshold() (مفتاح localStorage مستقل: 'cashAlertThreshold') —
// كلاهما في alerts-service.js، يُقرآن من computeAllAlerts() عند كل زيارة لمركز التنبيهات/لوحة التحكم،
// بلا حاجة لأي تحديث عند تسجيل مولود/نفوق بعينه أو تغيّر رصيد الصندوق (يُحسبان حيًا). حد الصندوق/البنك
// كان يُدار سابقًا من مركز التنبيهات نفسه، ونُقل هنا ليجتمع مع بقية تفضيلات التنبيهات في مكان واحد.

function _loadAlertsPreferences() {
  document.getElementById('cash-threshold-input').value = getCashAlertThreshold() || '';
  const prefs = getAlertsPreferences();
  ALERT_AGE_GROUPS.forEach(group => {
    const pref = prefs.ageThresholds[group.key] || {};
    document.getElementById(`age-${group.key}-enabled`).checked = !!pref.enabled;
    document.getElementById(`age-${group.key}-months`).value = pref.months || '';
  });
  document.getElementById('alert-birthsMonthly').checked = !!prefs.birthsMonthly;
  document.getElementById('alert-births3Months').checked = !!prefs.births3Months;
  document.getElementById('alert-deathsMonthly').checked = !!prefs.deathsMonthly;
  document.getElementById('alert-deaths3Months').checked = !!prefs.deaths3Months;
  document.getElementById('alert-herdCountChange').checked = !!prefs.herdCountChange;
}

function _handleAlertsPreferencesSave(event) {
  event.preventDefault();
  setCashAlertThreshold(document.getElementById('cash-threshold-input').value);
  const ageThresholds = {};
  ALERT_AGE_GROUPS.forEach(group => {
    const enabled = document.getElementById(`age-${group.key}-enabled`).checked;
    const monthsValue = Number(document.getElementById(`age-${group.key}-months`).value);
    const months = monthsValue > 0 ? monthsValue : null;
    ageThresholds[group.key] = { enabled: enabled && !!months, months };
  });
  saveAlertsPreferences({
    ageThresholds,
    birthsMonthly: document.getElementById('alert-birthsMonthly').checked,
    births3Months: document.getElementById('alert-births3Months').checked,
    deathsMonthly: document.getElementById('alert-deathsMonthly').checked,
    deaths3Months: document.getElementById('alert-deaths3Months').checked,
    herdCountChange: document.getElementById('alert-herdCountChange').checked,
  });
  showToast('تم حفظ تفضيلات التنبيهات', 'success');
}

// ===== التحقق بخطوتين (2FA/TOTP) — إدارة ذاتية لحساب المستخدم الحالي نفسه (متاحة لأي مستخدم مسجّل دخوله،
// بعكس "إدارة المستخدمين والصلاحيات" أدناه المقصورة على مدير النظام). انظر js/services/totp-service.js
// لتفاصيل الخوارزمية، وauth-service.js (login/completeTwoFactorLogin) لتطبيقها الفعلي عند الدخول =====

async function _loadTwoFactorStatus() {
  const currentUser = getCurrentUser();
  if (!currentUser) return;
  // الحقول twoFactorEnabled/twoFactorSecret ليست جزءًا من جلسة localStorage['currentUser'] (انظر
  // _buildSessionUser في auth-service.js) — لا بد من قراءة السجل الفعلي من قاعدة البيانات
  const freshUser = await dbGet('Users', currentUser.id);
  const enabled = !!(freshUser && freshUser.twoFactorEnabled);
  const badge = document.getElementById('twofa-status-badge');
  badge.className = `badge ${enabled ? 'badge--green' : 'badge--gray'}`;
  badge.textContent = enabled ? 'مفعّل' : 'غير مفعّل';
  document.getElementById('twofa-enable-btn').style.display = enabled ? 'none' : '';
  document.getElementById('twofa-regen-codes-btn').style.display = enabled ? '' : 'none';
  document.getElementById('twofa-disable-btn').style.display = enabled ? '' : 'none';
}

// نافذة ربط حساب بالتحقق بخطوتين — عامة تخدم حالتين: (1) المستخدم يربط حسابه هو (_openEnableTwoFactorModal
// أدناه، targetUser = getCurrentUser())، و(2) مدير النظام يربط حساب مستخدم آخر مباشرة من جدول "إدارة
// المستخدمين" (_linkUserTwoFactor أدناه، targetUser = أي سجل من _allUsersCache) — نفس آلية QR/تأكيد الكود
// تمامًا، فرق الحالتين فقط في مصدر targetUser وفي onLinked (أي عرض يُعاد تحديثه بعد النجاح: البطاقة الذاتية
// أو جدول المستخدمين). targetUser يحتاج فقط id/username (للعرض بالـ QR label)
function _openLinkTwoFactorModal(targetUser, onLinked) {
  if (!targetUser) return;
  if (typeof QRCode === 'undefined') {
    showToast('تعذّر تحميل مكوّن رمز QR — تحقق من الاتصال بالإنترنت', 'error');
    return;
  }

  // السرّ يُنشأ هنا فقط مؤقتًا (بذاكرة الصفحة) ولا يُحفظ في قاعدة البيانات إلا بعد تأكيد كود صحيح من تطبيق
  // المصادقة — يمنع ربط 2FA بسرّ لم يُمسح/يُنسخ فعليًا فيقفل صاحب الحساب عن الدخول بالخطأ
  const secret = generateTotpSecret();
  let farmSettings = {};
  try { farmSettings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch (e) { farmSettings = {}; }
  const farmName = (farmSettings.farmName && String(farmSettings.farmName).trim()) || 'مزرعة الغزيز';
  const otpUri = buildTotpAuthUri(secret, targetUser.username, farmName);

  const html = `
    <div style="text-align:center;">
      <div id="twofa-qr-host" style="display:inline-block; margin-bottom: var(--spacing-3);"></div>
      <p style="font-size:13px; color: var(--color-text-secondary); margin-bottom:4px;">
        امسح الكود بتطبيق المصادقة على موبايل المستخدم (Google Authenticator أو ما شابه)، أو أدخل المفتاح يدويًا:
      </p>
      <code style="display:block; direction:ltr; font-size:15px; letter-spacing:2px; background:var(--color-bg); padding:8px 4px; border-radius:var(--radius-sm); margin-bottom: var(--spacing-3); word-break:break-all;">${formatSecretForDisplay(secret)}</code>
    </div>
    <div class="form-group">
      <label for="twofa-confirm-code">أدخل الكود الظاهر بالتطبيق الآن للتأكيد <span class="required">*</span></label>
      <input type="text" id="twofa-confirm-code" class="form-control" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" style="text-align:center; letter-spacing:8px; font-size:18px;" />
    </div>
  `;

  openModal(html, {
    title: `ربط التحقق بخطوتين — ${targetUser.fullName || targetUser.username}`,
    confirmLabel: 'تفعيل',
    onConfirm: async () => {
      const code = document.getElementById('twofa-confirm-code').value;
      if (!/^\d{6}$/.test(String(code || '').trim())) {
        showToast('أدخل كود التحقق المكوَّن من 6 أرقام', 'error');
        return;
      }
      const valid = await verifyTotpCode(secret, code);
      if (!valid) {
        showToast('الكود غير صحيح — تأكد من مزامنة وقت الموبايل وحاول مجددًا', 'error');
        return;
      }
      // رموز احتياطية جديدة تُنشأ لحظة كل ربط (تستبدل أي رموز قديمة تلقائيًا لو كان مربوطًا من قبل) — الحل
      // الوحيد لموقف فقدان الجهاز بلا مدير نظام آخر يقدر يوقف 2FA بدلاً منك (انظر totp-service.js)
      const recoveryCodes = generateRecoveryCodes();
      const recoveryHashes = await hashRecoveryCodes(recoveryCodes);
      await dbUpdate('Users', targetUser.id, {
        twoFactorEnabled: true,
        twoFactorSecret: secret,
        twoFactorRecoveryCodeHashes: recoveryHashes,
      });
      showToast('تم ربط التحقق بخطوتين بنجاح', 'success');
      _showRecoveryCodesModal(recoveryCodes, onLinked);
    },
  });

  new QRCode(document.getElementById('twofa-qr-host'), {
    text: otpUri,
    width: 180,
    height: 180,
    correctLevel: QRCode.CorrectLevel.M,
  });
}

// شاشة تالية (تستبدل محتوى نفس النافذة، بلا تكديس) تعرض الرموز الاحتياطية **نصًا صريحًا لمرة واحدة فقط** —
// بعد إغلاقها تُقرأ فقط كهاش من قاعدة البيانات ولا سبيل لعرضها ثانية (انظر hashRecoveryCode في totp-service.js)
function _showRecoveryCodesModal(codes, onDone) {
  const codesHtml = codes.map(c => `<code style="display:block; direction:ltr; font-size:16px; letter-spacing:1px; padding:4px 0;">${c}</code>`).join('');
  const html = `
    <p style="color: var(--color-primary-red-dark); font-weight:700; margin-bottom: var(--spacing-2);">
      ⚠️ احفظ هذه الرموز الآن بمكان آمن (ورقة، مدير كلمات مرور) — لن تُعرض مرة أخرى بعد إغلاق هذه النافذة.
    </p>
    <p style="font-size:13px; color: var(--color-text-secondary); margin-bottom: var(--spacing-3);">
      كل رمز يُستخدم مرة واحدة فقط بدل كود التطبيق عند تسجيل الدخول — مفيد تحديدًا لو ضاع الجوال أو تعطّل تطبيق
      المصادقة ولا يوجد مدير نظام آخر يقدر يوقف 2FA بدلاً منك.
    </p>
    <div id="recovery-codes-box" style="text-align:center; background: var(--color-bg); border:1px solid var(--color-border); border-radius: var(--radius-sm); padding: var(--spacing-3); margin-bottom: var(--spacing-3);">
      ${codesHtml}
    </div>
    <button type="button" class="btn btn--outline btn--block" id="copy-recovery-codes-btn">نسخ كل الرموز</button>
  `;

  openModal(html, {
    title: 'الرموز الاحتياطية',
    confirmLabel: 'حفظتُها، إغلاق',
    onConfirm: async () => {
      closeModal();
      if (onDone) await onDone();
    },
  });

  document.getElementById('copy-recovery-codes-btn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      showToast('تم نسخ الرموز', 'success');
    } catch (e) {
      showToast('تعذّر النسخ التلقائي — انسخها يدويًا', 'error');
    }
  });
}

// توليد دفعة رموز احتياطية جديدة لحساب مفعّل عليه 2FA بالفعل (بلا حاجة لإعادة مسح QR) — يُبطل الرموز القديمة
// فورًا (استبدال كامل، لا إضافة)، مفيد لو استُهلكت كلها أو فُقدت الورقة التي كُتبت عليها.
// ⚠️ عمدًا لا تستخدم confirmDelete() هنا: تلك تستدعي closeModal() فورًا بعد onConfirmed() بلا انتظارها (لا
// await)، فتُنظّف #modal-root بعد 200ms بصرف النظر عن أي عملية async داخل onConfirmed — لو انتهت عملياتنا هنا
// (hash/dbUpdate) وفتحنا نافذة الرموز الجديدة قبل مرور تلك الـ200ms، يمسحها ذلك المؤقّت المتبقي بمجرد انتهائه.
// نبني نافذة التأكيد يدويًا بدل ذلك ونتجنّب استدعاء closeModal() هنا كليًا — openModal() التالية (داخل
// _showRecoveryCodesModal) تستبدل محتوى #modal-root مباشرة بلا أي مؤقّت معلّق يهدّده
function _regenerateRecoveryCodes(targetUser, onDone) {
  openModal(
    '<p>سيتم إبطال الرموز الاحتياطية القديمة (لو كانت موجودة) وتوليد رموز جديدة تمامًا. هل أنت متأكد؟</p>',
    {
      title: 'توليد رموز احتياطية جديدة',
      confirmLabel: 'توليد',
      onConfirm: async () => {
        const recoveryCodes = generateRecoveryCodes();
        const recoveryHashes = await hashRecoveryCodes(recoveryCodes);
        await dbUpdate('Users', targetUser.id, { twoFactorRecoveryCodeHashes: recoveryHashes });
        _showRecoveryCodesModal(recoveryCodes, onDone);
      },
    }
  );
}

function _openEnableTwoFactorModal() {
  const currentUser = getCurrentUser();
  if (!currentUser) return;
  _openLinkTwoFactorModal(currentUser, _loadTwoFactorStatus);
}

// مدير النظام يربط حساب أي مستخدم آخر مباشرة من جدول "إدارة المستخدمين" (زر "🔐 ربط بالمصادقة" في _drawUsers) —
// مفيد خصوصًا عند إضافة مستخدم جديد: يُضاف الحساب أولاً بكلمة المرور، ثم يُربَط بالمصادقة من نفس الجدول
// (يتطلب موبايل المستخدم فعليًا لمسح الـ QR/إدخال الكود، فالأنسب غالبًا أن يكون المستخدم حاضرًا لحظة الربط)
function _linkUserTwoFactor(userId) {
  const user = _allUsersCache.find(u => u.id === userId);
  if (!user) return;
  _openLinkTwoFactorModal(user, _refreshUsers);
}

function _disableOwnTwoFactor() {
  const currentUser = getCurrentUser();
  if (!currentUser) return;
  confirmDelete('سيتم إيقاف التحقق بخطوتين لحسابك — سيكفي بعدها اسم المستخدم وكلمة المرور فقط للدخول. هل أنت متأكد؟', async () => {
    await dbUpdate('Users', currentUser.id, { twoFactorEnabled: false, twoFactorSecret: null, twoFactorRecoveryCodeHashes: null });
    showToast('تم تعطيل التحقق بخطوتين', 'success');
    await _loadTwoFactorStatus();
  });
}

// إعادة تعيين 2FA لمستخدم آخر (مدير النظام فقط، انظر _drawUsers أدناه) — إنقاذ حساب فقد صاحبه موبايله ولم يعد
// يستطيع توليد الكود؛ يعطّل 2FA تمامًا (لا استرجاع للسرّ القديم) والمستخدم يعيد تفعيله بسرّ جديد لو أراد
function _resetUserTwoFactor(userId) {
  const user = _allUsersCache.find(u => u.id === userId);
  if (!user) return;
  confirmDelete(`سيتم إيقاف التحقق بخطوتين للمستخدم "${user.fullName}" (مفيد مثلاً لو فقد موبايله). هل أنت متأكد؟`, async () => {
    await dbUpdate('Users', userId, { twoFactorEnabled: false, twoFactorSecret: null, twoFactorRecoveryCodeHashes: null });
    showToast('تم إيقاف التحقق بخطوتين لهذا المستخدم', 'success');
    await _refreshUsers();
  });
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

// ===== إدارة المستخدمين والصلاحيات (مدير النظام فقط) =====

let _allUsersCache = [];

// كل صلاحية تُمنح على مستوى الوحدة (module) كاملة، لا على مستوى كل رابط فرعي على حدة — SIDEBAR_LINKS
// الآن يحوي عدة روابط لنفس الوحدة (مثلاً 9 روابط لوحدة herd)، فنجمّعها هنا بمفتاح module فريد واحد
// لكل وحدة (مع تسمية تمثيلية من SIDEBAR_MODULE_LABELS) بدل عرض رابط منفصل لكل صفحة فرعية
function _permissionModules() {
  const moduleKeys = [...new Set(
    SIDEBAR_LINKS.filter(l => l.key !== 'dashboard').map(l => l.module || l.key)
  )];
  return moduleKeys.map(key => ({ key, label: SIDEBAR_MODULE_LABELS[key] || key }));
}

// يُستخرج مفاتيح الوحدات المفعّلة من Users.permissions بصرف النظر عن شكله (مصفوفة قديمة/كائن جديد) —
// null تعني تحديدًا "بلا قائمة صلاحيات محفوظة" (توافق خلفي = وصول كامل)، مختلفة عن مصفوفة/كائن فارغين فعليًا
function _permissionModuleKeysOf(permissions) {
  if (!permissions) return null;
  if (Array.isArray(permissions)) return permissions;
  return Object.keys(permissions);
}

function _fullActionsObject(value) {
  return ACTION_KEYS.reduce((acc, key) => { acc[key] = !!value; return acc; }, {});
}

// يبني حالة مصفوفة الصلاحيات (وحدة × أزرار) القابلة للتحرير من أي شكل صلاحيات (قديم/جديد/افتراضي دور).
// النتيجة: { [moduleKey]: {add,edit,delete,approve,print,export} } لكل وحدة مفعّلة فقط — غياب المفتاح = الوحدة معطّلة
function _normalizePermissionsForEdit(permissions, moduleKeys, rolePresetKeys) {
  const result = {};
  if (permissions === undefined || permissions === null) {
    (rolePresetKeys || []).forEach(key => { if (moduleKeys.includes(key)) result[key] = _fullActionsObject(true); });
    return result;
  }
  if (Array.isArray(permissions)) {
    permissions.forEach(key => { if (moduleKeys.includes(key)) result[key] = _fullActionsObject(true); });
    return result;
  }
  Object.entries(permissions).forEach(([key, value]) => {
    if (!moduleKeys.includes(key)) return;
    if (value === true) {
      result[key] = _fullActionsObject(true);
    } else if (value && typeof value === 'object') {
      result[key] = ACTION_KEYS.reduce((acc, a) => { acc[a] = !!value[a]; return acc; }, {});
    }
  });
  return result;
}

// يعيد رسم حالة مصفوفة الصلاحيات (checked/disabled) في الـ DOM من كائن {[module]: {actions}} مُطبَّع مسبقًا —
// أي وحدة غائبة عن الكائن تُعتبر معطّلة، وأزرارها تُقفَل. وحدة مفعّلة بلا حالة أزرار محددة = وصول كامل افتراضيًا
function _applyPermissionsToMatrix(normalizedPermissions) {
  document.querySelectorAll('.m-module').forEach(cb => {
    const moduleKey = cb.value;
    const enabled = Object.prototype.hasOwnProperty.call(normalizedPermissions, moduleKey);
    cb.checked = enabled;
    document.querySelectorAll(`.m-action[data-module="${moduleKey}"]`).forEach(acb => {
      const actionState = normalizedPermissions[moduleKey];
      acb.checked = actionState ? !!actionState[acb.dataset.action] : true;
      acb.disabled = !enabled;
    });
  });
}

async function _refreshUsers() {
  // مستخدم محذوف ناعمًا (status:'deleted') لا يُعرض إطلاقًا — نفس مبدأ باقي المخازن (Animals/Expenses/...)
  _allUsersCache = (await dbGetAll('Users')).filter(u => u.status !== 'deleted');
  _drawUsers();
}

// عدد مديري النظام النشطين حاليًا (بصرف النظر عن السجل المستثنى إن وُجد) — حارس أخير يمنع تعطيل/حذف آخر
// مدير نظام في النظام ولو بالخطأ، فيبقى دومًا مستخدم واحد على الأقل قادر على إدارة باقي المستخدمين
function _activeSystemAdminCount(excludeUserId) {
  return _allUsersCache.filter(u =>
    u.id !== excludeUserId && resolveRoleKey(u.role) === 'systemAdmin' && u.status !== 'disabled'
  ).length;
}

function _drawUsers() {
  const labelByKey = Object.fromEntries(_permissionModules().map(m => [m.key, m.label]));
  const currentUser = getCurrentUser();
  const rows = _allUsersCache.map(u => {
    const roleKey = resolveRoleKey(u.role);
    const roleInfo = SYSTEM_ROLES.find(r => r.key === roleKey);
    const isFullAccess = roleInfo?.fullAccess;
    const isDisabled = u.status === 'disabled';
    const isSelf = u.id === currentUser?.id;
    return {
      ...u,
      roleBadge: `<span class="badge ${isFullAccess ? 'badge--green' : 'badge--gray'}">${roleInfo?.label || u.role}</span>`,
      statusBadge: `<span class="badge ${isDisabled ? 'badge--gray' : 'badge--green'}">${isDisabled ? 'معطّل' : 'نشط'}</span>`,
      twoFactorBadge: `<span class="badge ${u.twoFactorEnabled ? 'badge--green' : 'badge--gray'}">${u.twoFactorEnabled ? '🔐 مربوط' : 'غير مربوط'}</span>`,
      permissionsSummary: (() => {
        if (isFullAccess) return 'كل الصلاحيات';
        const moduleKeys = _permissionModuleKeysOf(u.permissions);
        return moduleKeys ? (moduleKeys.map(k => labelByKey[k]).filter(Boolean).join('، ') || 'لا صلاحيات') : 'كل الصلاحيات';
      })(),
      // زرا تعطيل/تفعيل وحذف مخفيان تمامًا لصف المستخدم الحالي نفسه (لا يمكن لأحد تعطيل/حذف نفسه، بنفس مبدأ
      // منع تغيير دور النفس عن systemAdmin في _openUserModal) — stopPropagation يمنع فتح نافذة التعديل بالخطأ
      rowActions: isSelf ? '<span style="color: var(--color-text-secondary); font-size:12px;">(حسابك)</span>' : `
        <button type="button" class="btn btn--outline" style="padding:4px 10px; font-size:12px;" onclick="event.stopPropagation(); _toggleUserStatus(${u.id})">${isDisabled ? 'تفعيل' : 'تعطيل'}</button>
        ${u.twoFactorEnabled
          ? `<button type="button" class="btn btn--outline" style="padding:4px 10px; font-size:12px;" onclick="event.stopPropagation(); _resetUserTwoFactor(${u.id})">إيقاف 2FA</button>`
          : `<button type="button" class="btn btn--outline" style="padding:4px 10px; font-size:12px;" onclick="event.stopPropagation(); _linkUserTwoFactor(${u.id})">🔐 ربط بالمصادقة</button>`}
        <button type="button" class="btn btn--danger" style="padding:4px 10px; font-size:12px;" onclick="event.stopPropagation(); _deleteUser(${u.id})">حذف</button>
      `,
    };
  });

  renderDataTable('users-table', [
    { key: 'username', label: 'اسم المستخدم', sortable: true },
    { key: 'fullName', label: 'الاسم الكامل', sortable: true },
    { key: 'phone', label: 'الجوال', sortable: false },
    { key: 'roleBadge', label: 'الدور', sortable: false },
    { key: 'statusBadge', label: 'الحالة', sortable: false },
    { key: 'twoFactorBadge', label: 'التحقق بخطوتين', sortable: false },
    { key: 'permissionsSummary', label: 'الصلاحيات', sortable: false },
    { key: 'rowActions', label: 'إجراءات', sortable: false },
  ], rows, {
    onRowClick: (row) => _openUserModal(row),
    emptyMessage: 'لا يوجد مستخدمون بعد',
  });
}

// تعطيل/تفعيل حساب — بديل أخف من الحذف: الحساب يبقى موجودًا بكل بياناته وصلاحياته لكنه يُمنَع من تسجيل الدخول
// (login() في auth-service.js) دون فقدان أي شيء، عكس الحذف. لا قيد محاسبي/سجلات مرتبطة تتأثر (بخلاف حذف حيوان/
// مصروف مثلاً) — المستخدم فقط طبقة وصول
async function _toggleUserStatus(userId) {
  const user = _allUsersCache.find(u => u.id === userId);
  if (!user) return;
  const willDisable = user.status !== 'disabled';

  if (willDisable && resolveRoleKey(user.role) === 'systemAdmin' && _activeSystemAdminCount(userId) === 0) {
    showToast('لا يمكن تعطيل آخر مدير نظام نشط في التطبيق', 'error');
    return;
  }

  await dbUpdate('Users', userId, { status: willDisable ? 'disabled' : 'active' });
  showToast(willDisable ? 'تم تعطيل الحساب' : 'تم تفعيل الحساب', 'success');
  await _refreshUsers();
}

// حذف مستخدم — حذف ناعم (dbSoftDelete) بنفس اتفاقية باقي المخازن، وليس حذفًا فعليًا: يختفي من القوائم ويُمنع
// من الدخول فورًا (نفس فحص status في login()) لكن يبقى أثره التاريخي (userId/userName) في AuditLog والحقول
// المرجعية القديمة (createdByUserId مثلاً) قابلاً للعرض كما هو، بلا كسر أي سجل سابق
function _deleteUser(userId) {
  const user = _allUsersCache.find(u => u.id === userId);
  if (!user) return;

  if (resolveRoleKey(user.role) === 'systemAdmin' && _activeSystemAdminCount(userId) === 0) {
    showToast('لا يمكن حذف آخر مدير نظام نشط في التطبيق', 'error');
    return;
  }

  confirmDelete(`هل أنت متأكد من حذف المستخدم "${user.fullName}"؟ لن يتمكن بعدها من تسجيل الدخول.`, async () => {
    await dbSoftDelete('Users', userId);
    showToast('تم حذف المستخدم', 'success');
    await _refreshUsers();
  });
}

function _openUserModal(user) {
  const isEdit = !!user;
  const modules = _permissionModules();
  // دور جديد يُنشأ افتراضيًا كـ"مدير مزرعة" (دور مقيّد بصلاحيات حقيقية) لا "مدير نظام" كامل الوصول —
  // أقل امتيازًا افتراضيًا أسلم من منح وصول كامل تلقائي لكل مستخدم جديد يُضاف
  const initialRoleKey = isEdit ? resolveRoleKey(user.role) : 'farmManager';
  const rolePreset = SYSTEM_ROLES.find(r => r.key === initialRoleKey)?.defaultPermissions || [];
  const moduleKeys = modules.map(m => m.key);
  const normalizedPermissions = _normalizePermissionsForEdit(user?.permissions, moduleKeys, rolePreset);

  // مصفوفة وحدة × 6 أزرار (إضافة/تعديل/حذف/اعتماد/طباعة/تصدير) — عرض المودال يبقى 480px كما هو
  // (بلا تعديل على modal.js)، مع تمرير أفقي داخلي للجدول نفسه عبر الغلاف overflow-x:auto أدناه
  const matrixHeaderHtml = ACTION_KEYS.map(a => `<th>${ACTION_LABELS[a]}</th>`).join('');
  const matrixRowsHtml = modules.map(m => {
    const moduleEnabled = Object.prototype.hasOwnProperty.call(normalizedPermissions, m.key);
    const actionState = normalizedPermissions[m.key] || _fullActionsObject(true);
    const actionCellsHtml = ACTION_KEYS.map(action => `
      <td><input type="checkbox" class="m-action" data-module="${m.key}" data-action="${action}" ${actionState[action] ? 'checked' : ''} ${moduleEnabled ? '' : 'disabled'} /></td>
    `).join('');
    return `
      <tr>
        <td class="permissions-matrix__module">
          <label><input type="checkbox" class="m-module" value="${m.key}" ${moduleEnabled ? 'checked' : ''} /> ${m.label}</label>
        </td>
        ${actionCellsHtml}
      </tr>
    `;
  }).join('');

  const checkboxesHtml = `
    <div style="overflow-x:auto;">
      <table class="permissions-matrix">
        <thead><tr><th>الوحدة</th>${matrixHeaderHtml}</tr></thead>
        <tbody>${matrixRowsHtml}</tbody>
      </table>
    </div>
  `;

  const roleOptionsHtml = SYSTEM_ROLES.map(r => `
    <option value="${r.key}" ${initialRoleKey === r.key ? 'selected' : ''}>${r.label}</option>
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
        <select id="m-role" class="form-control">${roleOptionsHtml}</select>
      </div>
      <div class="form-group form-group--full">
        <label>كلمة المرور ${isEdit ? '(اتركها فارغة للإبقاء عليها كما هي)' : '<span class="required">*</span>'}</label>
        <input type="password" id="m-password" class="form-control" autocomplete="new-password" />
      </div>
      <div class="form-group form-group--full">
        <label>الصلاحيات (لكل وحدة: إضافة/تعديل/حذف/اعتماد/طباعة/تصدير)</label>
        <div id="m-permissions-wrap">${checkboxesHtml}</div>
        <p id="m-owner-note" style="display:none; font-size:12px; color: var(--color-text-secondary); margin-top:6px;">مدير النظام لديه وصول كامل لجميع الوحدات تلقائيًا</p>
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
      if (isEdit && user.id === currentUser.id && resolveRoleKey(user.role) === 'systemAdmin' && role !== 'systemAdmin') {
        showToast('لا يمكنك تغيير دورك الخاص عن كونك مدير النظام', 'error'); return;
      }

      const selectedPermissions = {};
      document.querySelectorAll('.m-module:checked').forEach(cb => {
        const moduleKey = cb.value;
        selectedPermissions[moduleKey] = {};
        ACTION_KEYS.forEach(action => {
          const actionCb = document.querySelector(`.m-action[data-module="${moduleKey}"][data-action="${action}"]`);
          selectedPermissions[moduleKey][action] = !!(actionCb && actionCb.checked);
        });
      });
      // مدير النظام يبقى بنفس الشكل القديم (مصفوفة مسطّحة) — وصوله الكامل مضمون عبر resolveRoleKey في
      // hasModuleAccess/hasActionPermission بصرف النظر عن هذه القيمة أصلاً
      const permissions = role === 'systemAdmin' ? modules.map(m => m.key) : selectedPermissions;

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
  const ownerNote = document.getElementById('m-owner-note');
  // تُضبط حالة "معطّل/مفعّل" لكل صناديق المصفوفة (وحدة + أزرار) فقط عند كل تغيير — لا تُستدعى داخل حدث change
  // أدناه لتفادي الكتابة فوق صلاحيات محفوظة مسبقًا عند مجرد فتح النافذة أول مرة (انظر normalizedPermissions أعلاه)
  const syncPermissionState = () => {
    const isSystemAdmin = roleSelect.value === 'systemAdmin';
    ownerNote.style.display = isSystemAdmin ? 'block' : 'none';
    if (isSystemAdmin) {
      document.querySelectorAll('.m-module').forEach(cb => { cb.disabled = true; cb.checked = true; });
      document.querySelectorAll('.m-action').forEach(cb => { cb.disabled = true; cb.checked = true; });
    } else {
      // بعكس مدير النظام: لا نلمس checked هنا إطلاقًا (يُحافَظ على ما ضبطه العرض الأولي/تبديل الدور أعلاه) —
      // فقط نعيد اشتقاق disabled لكل زر من حالة checkbox وحدته هو (لا حالة ثابتة)، لتفادي كسر الاعتماد على
      // ترتيب الاستدعاء بين _applyPermissionsToMatrix وهذه الدالة
      document.querySelectorAll('.m-module').forEach(cb => { cb.disabled = false; });
      document.querySelectorAll('.m-action').forEach(cb => {
        const moduleCb = document.querySelector(`.m-module[value="${cb.dataset.module}"]`);
        cb.disabled = !moduleCb || !moduleCb.checked;
      });
    }
  };
  // تغيير الدور فعليًا من المستخدم (بعكس التحميل الأول للنافذة) يعيد رسم المصفوفة كاملة بالقائمة الافتراضية
  // لهذا الدور تلقائيًا (defaultPermissions، وصول كامل لكل وحدة فيها) — تبقى قابلة للتعديل اليدوي فورًا بعدها
  roleSelect.addEventListener('change', () => {
    if (roleSelect.value !== 'systemAdmin') {
      const preset = SYSTEM_ROLES.find(r => r.key === roleSelect.value)?.defaultPermissions || [];
      _applyPermissionsToMatrix(_normalizePermissionsForEdit(preset, moduleKeys, preset));
      _wireModuleToggles();
    }
    syncPermissionState();
  });
  _wireModuleToggles();
  syncPermissionState();
}

// تفعيل/تعطيل checkbox وحدة يُفعّل/يعطّل الأزرار الستة التابعة لها معه — تفعيل الوحدة (سواء أول مرة أو
// بعد إعادة تفعيلها) يمنحها وصولاً كاملاً افتراضيًا، قابلاً للتعديل اليدوي فورًا بعدها
function _wireModuleToggles() {
  document.querySelectorAll('.m-module').forEach(cb => {
    cb.onchange = () => {
      document.querySelectorAll(`.m-action[data-module="${cb.value}"]`).forEach(acb => {
        acb.disabled = !cb.checked;
        if (cb.checked) acb.checked = true;
      });
    };
  });
}
