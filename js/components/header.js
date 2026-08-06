// js/components/header.js
// مكوّن الهيدر المشترك بين كل الصفحات

function renderHeader(pageTitle) {
  const container = document.getElementById('header-container');
  if (!container) return;

  const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  const fullName = user ? user.fullName : 'مستخدم';
  const roleLabel = user && user.role === 'manager' ? 'مدير المزرعة' : 'صاحب الحلال';
  const initial = fullName ? fullName.trim().charAt(0) : 'م';

  container.innerHTML = `
    <header class="app-header">
      <div style="display:flex; align-items:center; gap: var(--spacing-3);">
        <button class="app-header__hamburger" id="hamburger-btn" aria-label="فتح القائمة">☰</button>
        <h1 class="app-header__title">${pageTitle}</h1>
      </div>
      <div class="app-header__right">
        <div class="app-header__bell" id="notif-bell" title="الإشعارات">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>
          <span class="app-header__badge" id="notif-badge" style="display:none;">0</span>
        </div>
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

  const bell = document.getElementById('notif-bell');
  if (bell) {
    bell.addEventListener('click', () => {
      const target = window.location.pathname.includes('/herd/') ||
        window.location.pathname.includes('/expenses/') ||
        window.location.pathname.includes('/revenues/') ||
        window.location.pathname.includes('/purchases/') ||
        window.location.pathname.includes('/bulk/') ||
        window.location.pathname.includes('/categories/') ||
        window.location.pathname.includes('/parties/') ||
        window.location.pathname.includes('/inventory/') ||
        window.location.pathname.includes('/employees/') ||
        window.location.pathname.includes('/custody/') ||
        window.location.pathname.includes('/notifications/') ||
        window.location.pathname.includes('/reports/') ||
        window.location.pathname.includes('/settings/') ||
        window.location.pathname.includes('/accounting/')
        ? '../notifications/notifications.html'
        : 'notifications/notifications.html';
      window.location.href = target;
    });
  }

  const logoutLink = document.getElementById('logout-link');
  if (logoutLink) {
    logoutLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof logout === 'function') logout();
    });
  }

  if (typeof updateNotificationBadge === 'function') {
    updateNotificationBadge();
  }
}
