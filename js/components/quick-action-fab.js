// js/components/quick-action-fab.js
// زر عائم موحّد لعمليات التسجيل الشائعة — بدل التنقل لصفحة الوحدة أولًا ثم الضغط على "+ تكويد"،
// هذا الزر ثابت في كل صفحة محمية ويفتح قائمة اختصارات تنقل مباشرة لنموذج التسجيل المطلوب.
// يُستدعى تلقائيًا من renderHeader() — أي صفحة تحمّل هذا الملف
// وتستدعي renderHeader() تحصل على الزر مجانًا دون كود إضافي في سكريبت الصفحة نفسها.

// href نسبي من جذر التطبيق دومًا — يُمرَّر عبر getRootPath() (معرّفة في sidebar.js) ليُصحَّح تلقائيًا
// حسب عمق المجلد الحالي، بنفس آلية روابط القائمة الجانبية تمامًا
const QUICK_ACTIONS = [
  { moduleKey: 'expenses', label: 'إضافة مصروف', href: 'expenses/expense-form.html', icon: 'expense' },
  { moduleKey: 'revenues', label: 'إضافة إيراد', href: 'revenues/revenue-form.html', icon: 'revenue' },
  { moduleKey: 'purchases', label: 'إضافة مشتريات', href: 'purchases/purchase-form.html', icon: 'cart' },
  // بوابتا اختيار نوع الشراء/البيع (أصل للتربية أو تجارة للبيع السريع) — توجّهان تلقائيًا لنموذج القطيع أو الدفعة الجماعية
  { moduleKey: 'herd', label: 'شراء أغنام (حيوان جديد)', href: 'herd/animal-purchase.html', icon: 'sheep' },
  { moduleKey: 'herd', label: 'بيع أغنام (حيوان)', href: 'herd/animal-sale.html', icon: 'sheep' },
  { moduleKey: 'herd', label: 'الجرد الحيواني', href: 'herd/animal-count.html', icon: 'sheep' },
  { moduleKey: 'inventory', label: 'جرد المخازن', href: 'inventory/stock-count-form.html', icon: 'warehouse' },
  { moduleKey: 'accounting', label: 'تحويل صندوق ↔ بنك', href: 'accounting/cash-transfer.html', icon: 'ledger' },
  { moduleKey: 'bulk', label: 'تحويل قطيع ↔ تجارة', href: 'bulk/transfer.html', icon: 'bulk' },
  { moduleKey: 'custody', label: 'إصدار عهدة', href: 'custody/custody-issue.html', icon: 'box' },
  { moduleKey: 'assets', label: 'إضافة أصل ثابت', href: 'fixed-assets/asset-form.html', icon: 'building' },
  // إدارة المستخدمين مقصورة على مدير النظام دومًا (نفس شرط ظهور القسم في settings.html) — moduleKey: 'settings'
  // وحده غير كافٍ (أي مستخدم بصلاحية "الإعدادات العامة" يملك وصول الوحدة، لكن قسم المستخدمين نفسه مقصور على
  // systemAdmin فقط)، فالفلترة أدناه في renderQuickActionFab() تتحقق أيضًا من systemAdminOnly صراحة.
  // openAddUser=1 يُقرأ في settings-page.js ليفتح نافذة "إضافة مستخدم" تلقائيًا بدل تحميل الصفحة فقط
  { moduleKey: 'settings', label: 'إضافة مستخدم', href: 'settings/settings.html?openAddUser=1', icon: 'users', systemAdminOnly: true },
];

function renderQuickActionFab() {
  if (document.getElementById('quick-action-fab')) return; // تفادي التكرار لو استُدعيت أكثر من مرة
  if (typeof getCurrentUser === 'function' && !getCurrentUser()) return; // دفاعي: لا تُعرض بلا جلسة مسجّلة
  if (typeof getRootPath !== 'function') return; // دفاعي: sidebar.js لم يُحمَّل بعد في هذه الصفحة

  const visibleActions = QUICK_ACTIONS.filter(a => {
    if (a.systemAdminOnly) {
      const cu = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
      const roleKey = cu ? (typeof resolveRoleKey === 'function' ? resolveRoleKey(cu.role) : cu.role) : null;
      if (roleKey !== 'systemAdmin') return false;
    }
    return typeof hasModuleAccess !== 'function' || hasModuleAccess(a.moduleKey);
  });
  if (!visibleActions.length) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'quick-fab';
  wrapper.id = 'quick-action-fab';
  wrapper.innerHTML = `
    <div class="quick-fab__menu" id="quick-fab-menu">
      ${visibleActions.map(a => `
        <a href="${getRootPath(a.href)}" class="quick-fab__item">
          <span class="quick-fab__item-icon">${(typeof SIDEBAR_ICONS !== 'undefined' && SIDEBAR_ICONS[a.icon]) || ''}</span>
          <span>${a.label}</span>
        </a>
      `).join('')}
    </div>
    <button type="button" class="quick-fab__btn" id="quick-fab-btn" aria-label="عملية جديدة" aria-haspopup="true" aria-expanded="false">
      <span class="quick-fab__btn-icon">+</span>
    </button>
  `;
  document.body.appendChild(wrapper);

  const btn = document.getElementById('quick-fab-btn');
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = wrapper.classList.toggle('quick-fab--open');
    btn.setAttribute('aria-expanded', String(isOpen));
  });

  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) _closeQuickActionFab();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') _closeQuickActionFab();
  });
}

function _closeQuickActionFab() {
  const wrapper = document.getElementById('quick-action-fab');
  const btn = document.getElementById('quick-fab-btn');
  if (wrapper) wrapper.classList.remove('quick-fab--open');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}
