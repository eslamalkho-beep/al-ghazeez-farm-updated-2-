// js/components/sidebar.js
// مكوّن الشريط الجانبي المشترك بين كل الصفحات

const SIDEBAR_LINKS = [
  { key: 'dashboard', label: 'لوحة التحكم', href: getRootPath('dashboard.html'), icon: 'grid' },
  { key: 'herd', label: 'إدارة القطيع', href: getRootPath('herd/herd-list.html'), icon: 'sheep' },
  { key: 'expenses', label: 'المصروفات', href: getRootPath('expenses/expense-list.html'), icon: 'expense' },
  { key: 'revenues', label: 'الإيرادات', href: getRootPath('revenues/revenue-list.html'), icon: 'revenue' },
  { key: 'purchases', label: 'المشتريات', href: getRootPath('purchases/purchase-list.html'), icon: 'cart' },
  { key: 'bulk', label: 'الشراء والبيع الجماعي', href: getRootPath('bulk/bulk-batches.html'), icon: 'bulk' },
  { key: 'categories', label: 'تكويدات', href: getRootPath('categories/categories.html'), icon: 'tag' },
  { key: 'parties', label: 'العملاء والموردون', href: getRootPath('parties/parties.html'), icon: 'contacts' },
  { key: 'inventory', label: 'المخزون والمستلزمات', href: getRootPath('inventory/inventory-items.html'), icon: 'warehouse' },
  { key: 'accounting', label: 'المحاسبة', href: getRootPath('accounting/chart-of-accounts.html'), icon: 'ledger' },
  { key: 'employees', label: 'الموظفون', href: getRootPath('employees/employee-list.html'), icon: 'users' },
  { key: 'custody', label: 'إدارة العهد', href: getRootPath('custody/custody-list.html'), icon: 'box' },
  { key: 'notifications', label: 'الإشعارات', href: getRootPath('notifications/notifications.html'), icon: 'bell' },
  { key: 'reports', label: 'التقارير', href: getRootPath('reports/herd-reports.html'), icon: 'chart' },
  { key: 'settings', label: 'الإعدادات', href: getRootPath('settings/settings.html'), icon: 'gear' },
];

const SIDEBAR_ICONS = {
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  sheep: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><path d="M9 10h.01M15 10h.01M9 15c1 1 5 1 6 0"/></svg>',
  expense: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  revenue: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17l6-6 4 4 8-8M21 7v6h-6"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6M16 8.5a3 3 0 1 1 4 2.8M17 14c2.5 0 5 1.7 5 5"/></svg>',
  box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8l9-5 9 5-9 5-9-5zM3 8v8l9 5 9-5V8M12 13v8"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 0 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 0 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 0 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.36.62.99 1 1.55 1H21a2 2 0 0 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.6 12.6L12.9 20.3a2 2 0 0 1-2.83 0l-6.37-6.37a2 2 0 0 1 0-2.83L11.4 3.4A2 2 0 0 1 12.8 2.8L20 3l.2 7.2a2 2 0 0 1-.6 1.4z"/><circle cx="16" cy="7" r="1.2"/></svg>',
  cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1.3"/><circle cx="18" cy="21" r="1.3"/><path d="M2.5 3h2.5l2.4 12.2a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 7H6"/></svg>',
  bulk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 12l9 4 9-4M3 17l9 4 9-4"/></svg>',
  contacts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="10" r="2.3"/><path d="M8 17c0-2 1.8-3.3 4-3.3s4 1.3 4 3.3"/></svg>',
  warehouse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10l9-6 9 6v9a1 1 0 0 1-1 1h-4v-7H8v7H4a1 1 0 0 1-1-1v-9z"/></svg>',
  ledger: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
};

// يحسب المسار الصحيح للرابط اعتمادًا على عمق المجلد الحالي
function getRootPath(target) {
  const depth = window.location.pathname.split('/').filter(Boolean);
  // نحدد العمق بناءً على وجود مجلد فرعي معروف في المسار الحالي
  const knownFolders = ['herd', 'expenses', 'revenues', 'purchases', 'bulk', 'categories', 'parties', 'inventory', 'employees', 'custody', 'notifications', 'reports', 'settings', 'accounting'];
  const isNested = depth.some(seg => knownFolders.includes(seg));
  return isNested ? '../' + target : target;
}

function renderSidebar(activePageKey) {
  const container = document.getElementById('sidebar-container');
  if (!container) return;

  const visibleLinks = SIDEBAR_LINKS.filter(link => link.key === 'dashboard' || hasModuleAccess(link.key));
  const linksHtml = visibleLinks.map(link => `
    <a href="${link.href}" class="sidebar__link ${link.key === activePageKey ? 'active' : ''}">
      ${SIDEBAR_ICONS[link.icon]}
      <span>${link.label}</span>
    </a>
  `).join('');

  container.innerHTML = `
    <aside class="sidebar" id="app-sidebar">
      <div class="sidebar__brand">
        <div class="sidebar__brand-icon"><img src="${getRootPath('assets/logo.png')}" alt="شعار مزرعة الغزيز" /></div>
        <div class="sidebar__brand-text">
          مزرعة الغزيز
          <span>نظام إدارة المزرعة</span>
        </div>
      </div>
      <nav class="sidebar__nav">
        ${linksHtml}
      </nav>
    </aside>
    <div class="sidebar-overlay" id="sidebar-overlay"></div>
  `;

  const overlay = document.getElementById('sidebar-overlay');
  overlay.addEventListener('click', closeSidebar);
}

function toggleSidebar() {
  document.getElementById('app-sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('show');
}

function closeSidebar() {
  document.getElementById('app-sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('show');
}
