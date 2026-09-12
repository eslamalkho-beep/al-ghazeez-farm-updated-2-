// js/components/header.js
// مكوّن الهيدر المشترك بين كل الصفحات

function renderHeader(pageTitle) {
  const container = document.getElementById('header-container');
  if (!container) return;

  const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  const fullName = user ? user.fullName : 'مستخدم';
  const roleLabel = user ? (SYSTEM_ROLES.find(r => r.key === resolveRoleKey(user.role))?.label || user.role) : '';
  const initial = fullName ? fullName.trim().charAt(0) : 'م';

  container.innerHTML = `
    <header class="app-header">
      <div style="display:flex; align-items:center; gap: var(--spacing-3);">
        <button class="app-header__hamburger" id="hamburger-btn" aria-label="فتح القائمة">☰</button>
        <h1 class="app-header__title">${pageTitle}</h1>
      </div>
      <div class="app-header__right">
        <a class="app-header__bell" href="#" id="alerts-bell" title="مركز التنبيهات">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>
          <span class="app-header__badge" id="alerts-badge" style="display:none;">0</span>
        </a>
        <div class="app-header__user">
          <div class="app-header__avatar">${initial}</div>
          <div class="app-header__user-info">
            ${fullName}
            <span>${roleLabel}</span>
          </div>
        </div>
        <a href="#" class="app-header__logout" id="logout-link">تسجيل الخروج</a>
      </div>
    </header>
  `;

  const hamburgerBtn = document.getElementById('hamburger-btn');
  if (hamburgerBtn) hamburgerBtn.addEventListener('click', toggleSidebar);

  const bell = document.getElementById('alerts-bell');
  if (bell && typeof getRootPath === 'function') {
    bell.href = getRootPath('notifications/alerts-center.html');
  }

  const logoutLink = document.getElementById('logout-link');
  if (logoutLink) {
    logoutLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof logout === 'function') logout();
    });
  }

  if (typeof renderQuickActionFab === 'function') {
    renderQuickActionFab();
  }

  refreshAlertsBadge();
}

// ===== عداد غير مقروء على جرس التنبيهات (زي شارة واتساب) — حيّ 100% في كل صفحة =====
// computeAllAlerts() تعتمد على نحو 15 ملف service (انظر alerts-service.js) غير محمَّلة ثابتًا إلا في 3
// صفحات (dashboard/alerts-center/settings، انظر CLAUDE.md). بدل إضافة كل هذه الاعتماديات كوسوم <script>
// ثابتة في عشرات ملفات HTML بالتطبيق (هش ومعرّض للأخطاء)، تُحقن هنا ديناميكيًا عند أول ظهور للهيدر في أي
// صفحة لا تحمّلها أصلاً — فحص كل ملف بدالة/ثابت مميّز فيه لتفادي إعادة تحميل ملف محمَّل ثابتًا بالفعل
// (إعادة تنفيذ `const` على مستوى ملف مرتين تُسبب خطأ SyntaxError/إعادة تعريف)
const _ALERTS_DEPENDENCY_SCRIPTS = [
  { check: () => typeof getAllAnimals === 'function', src: 'js/services/animal-service.js' },
  { check: () => typeof getAllBirths === 'function', src: 'js/services/birth-service.js' },
  { check: () => typeof getAllDeaths === 'function', src: 'js/services/death-service.js' },
  { check: () => typeof getAllVaccinations === 'function', src: 'js/services/vaccination-service.js' },
  { check: () => typeof getAllPregnancies === 'function', src: 'js/services/pregnancy-service.js' },
  { check: () => typeof getAllInventoryItems === 'function', src: 'js/services/inventory-service.js' },
  { check: () => typeof getAllCustodyItems === 'function', src: 'js/services/custody-service.js' },
  { check: () => typeof getAllParties === 'function', src: 'js/services/party-service.js' },
  { check: () => typeof getAllRevenues === 'function', src: 'js/services/revenue-service.js' },
  { check: () => typeof getAllPurchases === 'function', src: 'js/services/purchase-service.js' },
  { check: () => typeof getAllExpenses === 'function', src: 'js/services/expense-service.js' },
  { check: () => typeof loadAccountMappings === 'function', src: 'js/services/account-mapping-service.js' },
  { check: () => typeof getAllAccounts === 'function', src: 'js/services/accounting-service.js' },
  { check: () => typeof calculateAgeInMonths === 'function', src: 'js/utils/formatters.js' },
  { check: () => typeof computeAllAlerts === 'function', src: 'js/services/alerts-service.js' },
];

function _loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = (typeof getRootPath === 'function') ? getRootPath(src) : src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`تعذر تحميل ${src}`));
    document.head.appendChild(script);
  });
}

let _alertsDependenciesPromise = null;

// تحميل تسلسلي (وليس متوازيًا) لتفادي أي تعارض تحميل غير متوقع بين الملفات — التكلفة مرة واحدة فقط لكل
// صفحة (Promise واحد مشترك مخبّأ)، والصفحات التي تحمّل الاعتماديات ثابتًا أصلاً (dashboard/alerts-center/
// settings) لا تُحمِّل شيئًا إضافيًا لأن كل فحص check() يمر بنجاح فورًا
function _ensureAlertsDependenciesLoaded() {
  if (!_alertsDependenciesPromise) {
    _alertsDependenciesPromise = (async () => {
      for (const dep of _ALERTS_DEPENDENCY_SCRIPTS) {
        if (!dep.check()) {
          await _loadScriptOnce(dep.src);
        }
      }
      return typeof computeAllAlerts === 'function';
    })();
  }
  return _alertsDependenciesPromise;
}

async function refreshAlertsBadge() {
  const badge = document.getElementById('alerts-badge');
  if (!badge) return;
  try {
    const ok = await _ensureAlertsDependenciesLoaded();
    if (!ok) return;
    const alerts = await computeAllAlerts();
    const unreadCount = alerts.filter(a => !a.isRead).length;
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  } catch (e) {
    console.warn('تعذر حساب عداد التنبيهات', e);
  }
}
