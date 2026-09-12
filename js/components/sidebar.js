// js/components/sidebar.js
// مكوّن الشريط الجانبي المشترك بين كل الصفحات

// كل رابط: key فريد (لتحديد الصفحة الحالية "active" وربط renderSidebar(key) من كل صفحة)،
// module (اختياري — مفتاح الوحدة المستخدم في فحص الصلاحيات hasModuleAccess()/Users.permissions؛
// يُفترض مساويًا لـ key إن غاب) href، icon، label. عدة روابط قد تتشارك نفس module (مثلاً كل صفحات
// "القطيع" التسعة أدناه) فتظهر/تختفي معًا حسب صلاحية واحدة، لكن لكل واحد تظليل "active" مستقل.
const SIDEBAR_LINKS = [
  { key: 'dashboard', label: 'لوحة التحكم', href: getRootPath('dashboard.html'), icon: 'grid' },
  { key: 'alerts-center', module: 'notifications', label: 'مركز التنبيهات', href: getRootPath('notifications/alerts-center.html'), icon: 'bell' },

  // إدارة القطيع
  { key: 'herd', label: 'سجل القطيع', href: getRootPath('herd/herd-list.html'), icon: 'sheep' },
  { key: 'herd-purchase', module: 'herd', label: 'شراء حيوان', href: getRootPath('herd/animal-purchase.html'), icon: 'sheep' },
  { key: 'herd-sale', module: 'herd', label: 'بيع حيوان', href: getRootPath('herd/animal-sale.html'), icon: 'sheep' },
  { key: 'herd-mating', module: 'herd', label: 'سجل التلقيح', href: getRootPath('herd/mating.html'), icon: 'sheep' },
  { key: 'herd-pregnancy', module: 'herd', label: 'سجل الحمل', href: getRootPath('herd/pregnancy.html'), icon: 'sheep' },
  { key: 'herd-births', module: 'herd', label: 'سجل الولادات', href: getRootPath('herd/births.html'), icon: 'sheep' },
  { key: 'herd-deaths', module: 'herd', label: 'سجل النفوق', href: getRootPath('herd/deaths.html'), icon: 'sheep' },
  { key: 'herd-health', module: 'herd', label: 'السجل الصحي', href: getRootPath('herd/health.html'), icon: 'sheep' },
  { key: 'herd-vaccinations', module: 'herd', label: 'التحصينات', href: getRootPath('herd/vaccinations.html'), icon: 'sheep' },
  { key: 'herd-weights', module: 'herd', label: 'سجل الوزن', href: getRootPath('herd/weights.html'), icon: 'sheep' },
  { key: 'herd-fattening', module: 'herd', label: 'سجل التسمين', href: getRootPath('herd/fattening.html'), icon: 'sheep' },
  { key: 'herd-locations', module: 'herd', label: 'الحظائر والمواقع', href: getRootPath('herd/locations.html'), icon: 'sheep' },
  { key: 'herd-animal-count', module: 'herd', label: 'الجرد الحيواني', href: getRootPath('herd/animal-count.html'), icon: 'clipboard' },

  // الشراء والبيع الجماعي (تجارة) — شراء/بيع مستقلّان، كل منهما بقيده المحاسبي الخاص، انظر bulk-batch-service.js
  { key: 'bulk-purchases', module: 'bulk', label: 'مشتريات الجملة', href: getRootPath('bulk/bulk-purchases.html'), icon: 'bulk' },
  { key: 'bulk-sales', module: 'bulk', label: 'مبيعات الجملة', href: getRootPath('bulk/bulk-sales.html'), icon: 'bulk' },
  { key: 'bulk-summary', module: 'bulk', label: 'ملخص الأرصدة', href: getRootPath('bulk/bulk-summary.html'), icon: 'bulk' },
  { key: 'bulk-transfer', module: 'bulk', label: 'تحويل قطيع ↔ تجارة', href: getRootPath('bulk/transfer.html'), icon: 'bulk' },

  // المخازن
  { key: 'inventory', label: 'كتالوج الأصناف', href: getRootPath('inventory/inventory-items.html'), icon: 'warehouse' },
  { key: 'inventory-movements', module: 'inventory', label: 'حركات المخزون', href: getRootPath('inventory/inventory-movements.html'), icon: 'warehouse' },
  { key: 'inventory-stock-counts', module: 'inventory', label: 'جرد المخازن', href: getRootPath('inventory/stock-counts.html'), icon: 'clipboard' },

  // الأصول الثابتة (مجلد fixed-assets وليس assets — الأخير محجوز مسبقًا للشعار الثابت assets/logo.png)
  { key: 'assets', label: 'مدخل الأصول الثابتة', href: getRootPath('fixed-assets/assets-hub.html'), icon: 'building' },
  { key: 'assets-list', module: 'assets', label: 'سجل الأصول', href: getRootPath('fixed-assets/asset-list.html'), icon: 'building' },
  { key: 'assets-depreciation', module: 'assets', label: 'تشغيل إهلاك الفترة', href: getRootPath('fixed-assets/asset-depreciation-run.html'), icon: 'building' },
  { key: 'assets-count', module: 'assets', label: 'جرد الأصول الثابتة', href: getRootPath('fixed-assets/asset-count.html'), icon: 'clipboard' },

  // العمليات المالية
  { key: 'expenses', label: 'المصروفات', href: getRootPath('expenses/expense-list.html'), icon: 'expense' },
  { key: 'revenues', label: 'الإيرادات', href: getRootPath('revenues/revenue-list.html'), icon: 'revenue' },
  { key: 'purchases', label: 'المشتريات', href: getRootPath('purchases/purchase-list.html'), icon: 'cart' },

  // جهات التعامل
  { key: 'parties', label: 'مدخل العملاء والموردين', href: getRootPath('parties/parties-hub.html'), icon: 'contacts' },
  { key: 'parties-list', module: 'parties', label: 'تكويد العملاء والموردين', href: getRootPath('parties/parties.html'), icon: 'contacts' },
  { key: 'parties-collection', module: 'parties', label: 'تحصيل من عميل', href: getRootPath('parties/customer-collection.html'), icon: 'contacts' },
  { key: 'parties-payment', module: 'parties', label: 'سداد لمورّد', href: getRootPath('parties/supplier-payment.html'), icon: 'contacts' },
  { key: 'parties-partner-capital', module: 'parties', label: 'ضخ/سحب فلوس (شريك)', href: getRootPath('parties/partner-capital.html'), icon: 'contacts' },
  { key: 'parties-statement', module: 'parties', label: 'كشف حساب', href: getRootPath('parties/party-statement.html'), icon: 'contacts' },
  { key: 'parties-return-discount', module: 'parties', label: 'مرتجعات وخصومات', href: getRootPath('parties/return-discount.html'), icon: 'contacts' },

  // الموظفون والعهد
  { key: 'employees', label: 'بيانات الموظفين', href: getRootPath('employees/employee-list.html'), icon: 'users' },
  { key: 'custody', label: 'مدخل إدارة العهد', href: getRootPath('custody/custody-hub.html'), icon: 'box' },
  { key: 'custody-issue', module: 'custody', label: 'إصدار عهدة', href: getRootPath('custody/custody-issue.html'), icon: 'box' },
  { key: 'custody-liquidate', module: 'custody', label: 'تصفية عهدة', href: getRootPath('custody/custody-liquidate.html'), icon: 'box' },
  { key: 'custody-settle', module: 'custody', label: 'تسوية عهدة', href: getRootPath('custody/custody-settle.html'), icon: 'box' },
  { key: 'custody-list', module: 'custody', label: 'سجل العهد', href: getRootPath('custody/custody-list.html'), icon: 'box' },
  { key: 'custody-statement', module: 'custody', label: 'كشف حساب موظف', href: getRootPath('custody/employee-statement.html'), icon: 'box' },
  { key: 'custody-wallet', module: 'custody', label: 'محفظة موظف', href: getRootPath('custody/employee-wallet.html'), icon: 'box' },

  // المحاسبة
  { key: 'accounting', label: 'شجرة الحسابات', href: getRootPath('accounting/chart-of-accounts.html'), icon: 'ledger' },
  { key: 'accounting-mappings', module: 'accounting', label: 'ربط العمليات بالحسابات', href: getRootPath('accounting/account-mappings.html'), icon: 'ledger' },
  { key: 'accounting-journal', module: 'accounting', label: 'القيود اليومية', href: getRootPath('accounting/journal-entries.html'), icon: 'ledger' },
  { key: 'accounting-weekly-batches', module: 'accounting', label: 'الأرشفة الأسبوعية للقيود', href: getRootPath('accounting/weekly-batches.html'), icon: 'ledger' },
  { key: 'accounting-cash-transfer', module: 'accounting', label: 'تحويل صندوق ↔ بنك', href: getRootPath('accounting/cash-transfer.html'), icon: 'ledger' },
  { key: 'accounting-period-lock', module: 'accounting', label: 'قفل الفترات المحاسبية', href: getRootPath('accounting/period-lock.html'), icon: 'ledger' },
  { key: 'accounting-fiscal-year-close', module: 'accounting', label: 'إقفال السنة المالية', href: getRootPath('accounting/fiscal-year-close.html'), icon: 'ledger' },
  { key: 'accounting-adjustments', module: 'accounting', label: 'التسويات المحاسبية', href: getRootPath('accounting/adjustments.html'), icon: 'ledger' },
  { key: 'accounting-cash-ledger', module: 'accounting', label: 'دفتر الصندوق والبنك', href: getRootPath('accounting/cash-ledger.html'), icon: 'ledger' },
  { key: 'accounting-cash-count', module: 'accounting', label: 'جرد الصندوق', href: getRootPath('accounting/cash-count.html'), icon: 'clipboard' },
  { key: 'accounting-bank-reconciliation', module: 'accounting', label: 'تسوية البنوك', href: getRootPath('accounting/bank-reconciliation.html'), icon: 'ledger' },

  // التقارير
  { key: 'reports', label: 'تقارير القطيع', href: getRootPath('reports/herd-reports.html'), icon: 'chart' },
  { key: 'reports-health', module: 'reports', label: 'تقارير السجل الصحي', href: getRootPath('reports/health-reports.html'), icon: 'chart' },
  { key: 'reports-sales', module: 'reports', label: 'تقرير المبيعات وتكلفة الرأس', href: getRootPath('reports/sales-report.html'), icon: 'chart' },
  { key: 'reports-revenue', module: 'reports', label: 'تقارير الإيرادات', href: getRootPath('reports/revenue-reports.html'), icon: 'chart' },
  { key: 'reports-expense', module: 'reports', label: 'تقارير المصروفات', href: getRootPath('reports/expense-reports.html'), icon: 'chart' },
  { key: 'reports-purchase', module: 'reports', label: 'تقارير المشتريات', href: getRootPath('reports/purchase-reports.html'), icon: 'chart' },
  { key: 'reports-inventory', module: 'reports', label: 'تقارير المخزون', href: getRootPath('reports/inventory-reports.html'), icon: 'chart' },
  { key: 'reports-assets', module: 'reports', label: 'تقارير الأصول الثابتة', href: getRootPath('reports/asset-reports.html'), icon: 'chart' },
  { key: 'reports-party', module: 'reports', label: 'تقارير العملاء والموردين', href: getRootPath('reports/party-reports.html'), icon: 'chart' },
  { key: 'reports-custody', module: 'reports', label: 'تقارير العهد', href: getRootPath('reports/custody-reports.html'), icon: 'chart' },
  { key: 'reports-fattening', module: 'reports', label: 'تقرير التسمين', href: getRootPath('reports/fattening-reports.html'), icon: 'chart' },
  // ⚠️ module: 'accounting' مقصود (ليس 'reports') — accounting-reports-page.js يستدعي requireAuth('accounting')
  // فعليًا (تقارير محاسبية حسّاسة تتبع صلاحية المحاسبة لا صلاحية التقارير العامة)، فحافظنا على نفس الفحص هنا
  { key: 'reports-accounting', module: 'accounting', label: 'التقارير المحاسبية', href: getRootPath('reports/accounting-reports.html'), icon: 'chart' },
  { key: 'reports-overview', module: 'reports', label: 'التقرير الشامل', href: getRootPath('reports/overview-report.html'), icon: 'chart' },

  // الإعدادات
  { key: 'settings', label: 'الإعدادات العامة', href: getRootPath('settings/settings.html'), icon: 'gear' },
  { key: 'audit-log', module: 'settings', label: 'سجل التدقيق', href: getRootPath('settings/audit-log.html'), icon: 'clipboard' },
];

// تسميات "الوحدة" المستخدمة في قائمة صلاحيات المستخدمين (settings-page.js → _permissionModules) —
// منفصلة عمدًا عن عناوين الروابط الفردية أعلاه (مثل "سجل القطيع") لأن الصلاحية تُمنح على مستوى
// الوحدة كاملة (كل روابط module واحد تظهر/تختفي معًا)، فتحتاج عنوانًا يمثّل الوحدة ككل لا صفحة بعينها
const SIDEBAR_MODULE_LABELS = {
  notifications: 'مركز التنبيهات',
  herd: 'إدارة القطيع',
  bulk: 'الشراء والبيع الجماعي',
  inventory: 'المخازن',
  assets: 'الأصول الثابتة',
  expenses: 'المصروفات',
  revenues: 'الإيرادات',
  purchases: 'المشتريات',
  parties: 'جهات التعامل',
  employees: 'الموظفون',
  custody: 'إدارة العهد',
  accounting: 'المحاسبة',
  reports: 'التقارير',
  settings: 'الإعدادات',
};

// تجميع منطقي للقائمة الجانبية — لوحة التحكم والإشعارات وحدهما تُعرضان مستقلتين أعلى القائمة (صفحة
// واحدة بلا صفحات فرعية لكل منهما)، والبقية مجموعات قابلة للطي (عنصر <details> أصلي بلا جافاسكربت
// إضافي للفتح/الإغلاق) — كل مجموعة هنا تمثّل وحدة وظيفية واحدة من هيكل النظام، وروابطها الداخلية هي
// كل الصفحات الفعلية التابعة لها (بدل رابط واحد فقط للصفحة الرئيسية كما كان سابقًا). ترتيب المفاتيح
// هنا مستقل عن ترتيبها في SIDEBAR_LINKS أعلاه — SIDEBAR_LINKS يبقى المصدر الوحيد للـ href/icon/label
// وفحص الصلاحيات
const SIDEBAR_GROUPS = [
  { id: 'herd', label: 'إدارة القطيع', keys: ['herd', 'herd-purchase', 'herd-sale', 'herd-mating', 'herd-pregnancy', 'herd-births', 'herd-deaths', 'herd-health', 'herd-vaccinations', 'herd-weights', 'herd-fattening', 'herd-locations'] },
  { id: 'bulk', label: 'الشراء والبيع الجماعي', keys: ['bulk-purchases', 'bulk-sales', 'bulk-summary', 'bulk-transfer'] },
  { id: 'warehouses', label: 'المخازن', keys: ['inventory', 'inventory-movements'] },
  { id: 'assets', label: '🏢 الأصول الثابتة', keys: ['assets', 'assets-list', 'assets-depreciation'] },
  // مجموعة "الجرد" تجمع صفحات الجرد الأربع من وحداتها الأصلية (صندوق/مخازن/حيواني/أصول) في قائمة منسدلة
  // مستقلة — كل رابط يحتفظ بصلاحية وحدته الأصلية (module) فالمجموعة تعرض فقط ما يملكه المستخدم منها
  { id: 'counts', label: 'الجرد', keys: ['accounting-cash-count', 'inventory-stock-counts', 'herd-animal-count', 'assets-count'] },
  { id: 'finance', label: 'العمليات المالية', keys: ['expenses', 'revenues', 'purchases'] },
  { id: 'parties', label: 'جهات التعامل', keys: ['parties', 'parties-list', 'parties-collection', 'parties-payment', 'parties-partner-capital', 'parties-statement', 'parties-return-discount'] },
  { id: 'team', label: 'الموظفون والعهد', keys: ['employees', 'custody', 'custody-issue', 'custody-liquidate', 'custody-settle', 'custody-list', 'custody-statement', 'custody-wallet'] },
  { id: 'accounting', label: 'المحاسبة', keys: ['accounting', 'accounting-mappings', 'accounting-journal', 'accounting-weekly-batches', 'accounting-cash-transfer', 'accounting-period-lock', 'accounting-fiscal-year-close', 'accounting-cash-ledger'] },
  // مجموعة "التسويات" مستقلة عن المحاسبة في العرض — تجمع التسويات المحاسبية وتسوية البنوك، وكل رابط
  // يحتفظ بصلاحية وحدته الأصلية (accounting)
  { id: 'settlements', label: 'التسويات', keys: ['accounting-adjustments', 'accounting-bank-reconciliation'] },
  { id: 'reports', label: 'التقارير', keys: ['reports', 'reports-health', 'reports-sales', 'reports-revenue', 'reports-expense', 'reports-purchase', 'reports-inventory', 'reports-assets', 'reports-party', 'reports-custody', 'reports-fattening', 'reports-accounting', 'reports-overview'] },
  { id: 'system', label: 'الإعدادات', keys: ['settings', 'audit-log'] },
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
  building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="10" height="18" rx="1"/><path d="M8 7h2M8 11h2M8 15h2M14 21v-6h6v6"/></svg>',
  clipboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 10h6M9 14h6M9 18h4"/></svg>',
};

// ===== اسم المزرعة وشعارها (قابلان للتخصيص من قسم "بيانات المزرعة" في settings/settings.html) =====
// تُقرآن مباشرة من localStorage (نفس المفتاح 'alGhazeezFarmSettings' الذي تكتب إليه settings-page.js
// عبر SETTINGS_KEY) بدل الاعتماد على ملف service منفصل يحتاج إضافة وسم <script> جديد لكل صفحة تحمّل
// sidebar.js في التطبيق (~80 ملف HTML) — نفس القراءة المكرَّرة (أسطر معدودة) موجودة أيضًا في
// export-utils.js (ترويسة تصدير Excel/PDF) وindex.html (شعار/عنوان صفحة الدخول) لنفس السبب.
// logoBase64 غائب/null = استخدم الشعار الافتراضي الثابت assets/logo.png.
function _sidebarGetFarmBranding() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem('alGhazeezFarmSettings') || '{}');
  } catch (e) {
    saved = {};
  }
  return {
    name: (saved.farmName && String(saved.farmName).trim()) || 'مزرعة الغزيز',
    logoBase64: saved.logoBase64 || null,
  };
}

// عنوان كل صفحة ثابت بصيغة "عنوان الصفحة | مزرعة الغزيز" (أو "مزرعة الغزيز" وحدها في صفحة الدخول) —
// نستبدل الجزء الثابت فقط باسم المزرعة الحالي، بلا مساس بعنوان الصفحة نفسه
function _sidebarApplyFarmNameToTitle(farmName) {
  if (!document.title) return;
  const parts = document.title.split('|');
  if (parts.length >= 2) {
    document.title = `${parts[0].trim()} | ${farmName}`;
  } else if (document.title.trim() === 'مزرعة الغزيز') {
    document.title = farmName;
  }
}

// يحسب المسار الصحيح للرابط اعتمادًا على عمق المجلد الحالي
function getRootPath(target) {
  const depth = window.location.pathname.split('/').filter(Boolean);
  // نحدد العمق بناءً على وجود مجلد فرعي معروف في المسار الحالي
  const knownFolders = ['herd', 'expenses', 'revenues', 'purchases', 'bulk', 'parties', 'inventory', 'fixed-assets', 'employees', 'custody', 'notifications', 'reports', 'settings', 'accounting'];
  const isNested = depth.some(seg => knownFolders.includes(seg));
  return isNested ? '../' + target : target;
}

// حالة فتح/إغلاق مجموعات القائمة الجانبية — تُحفظ في localStorage فتبقى كما تركها المستخدم بين الصفحات
// (بعكس الاعتماد فقط على "المجموعة الحالية مفتوحة" في كل تحميل صفحة، وهو ما يُستخدم فقط كافتراضي أول مرة)
function _readSidebarGroupState() {
  try {
    return JSON.parse(localStorage.getItem('sidebarGroupState') || '{}');
  } catch {
    return {};
  }
}

function renderSidebar(activePageKey) {
  const container = document.getElementById('sidebar-container');
  if (!container) return;

  const visibleLinks = SIDEBAR_LINKS.filter(link => link.key === 'dashboard' || hasModuleAccess(link.module || link.key));
  const linksByKey = Object.fromEntries(visibleLinks.map(l => [l.key, l]));

  const renderLink = (link) => `
    <a href="${link.href}" class="sidebar__link ${link.key === activePageKey ? 'active' : ''}">
      ${SIDEBAR_ICONS[link.icon]}
      <span>${link.label}</span>
    </a>
  `;

  const storedState = _readSidebarGroupState();
  const groupsHtml = SIDEBAR_GROUPS.map(group => {
    const groupLinks = group.keys.map(k => linksByKey[k]).filter(Boolean);
    if (!groupLinks.length) return ''; // كل روابط المجموعة مخفية عن هذا المستخدم (صلاحيات owner محدودة)

    // الضغط على عنوان المجموعة يفتح الشاشة الرئيسية للمجموعة مباشرة (أول رابط فيها)، بينما السهم
    // المجاور هو الوحيد الذي يطوي/يفتح قائمة الصفحات الفرعية — بدل الفتح التلقائي عند أي ضغطة
    const mainLink = groupLinks[0];
    const containsActive = groupLinks.some(l => l.key === activePageKey);
    const isOpen = storedState[group.id] !== undefined ? storedState[group.id] : containsActive;

    return `
      <details class="sidebar__group" data-group-id="${group.id}" ${isOpen ? 'open' : ''}>
        <summary class="sidebar__group-title">
          <a href="${mainLink.href}" class="sidebar__group-title-link">${group.label}</a>
          <svg class="sidebar__group-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
        </summary>
        <div class="sidebar__group-links">
          ${groupLinks.map(renderLink).join('')}
        </div>
      </details>
    `;
  }).join('');

  // روابط "علوية" مستقلة خارج المجموعات القابلة للطي (لوحة التحكم/مركز التنبيهات) — بترتيب ثابت
  const topLevelHtml = ['dashboard', 'alerts-center']
    .map(k => linksByKey[k]).filter(Boolean).map(renderLink).join('');

  const branding = _sidebarGetFarmBranding();
  _sidebarApplyFarmNameToTitle(branding.name);

  container.innerHTML = `
    <aside class="sidebar" id="app-sidebar">
      <div class="sidebar__brand">
        <div class="sidebar__brand-icon"><img src="${branding.logoBase64 || getRootPath('assets/logo.png')}" alt="شعار ${branding.name}" /></div>
        <div class="sidebar__brand-text">
          ${branding.name}
          <span>نظام إدارة المزرعة</span>
        </div>
      </div>
      <nav class="sidebar__nav">
        ${topLevelHtml}
        ${groupsHtml}
      </nav>
    </aside>
    <div class="sidebar-overlay" id="sidebar-overlay"></div>
  `;

  container.querySelectorAll('.sidebar__group').forEach(groupEl => {
    groupEl.addEventListener('toggle', () => {
      const state = _readSidebarGroupState();
      state[groupEl.dataset.groupId] = groupEl.open;
      localStorage.setItem('sidebarGroupState', JSON.stringify(state));
    });
  });

  // عنوان المجموعة رابط مباشر لشاشتها الرئيسية — preventDefault يمنع سلوك <summary> الأصلي (الطي/الفتح)
  // فينتقل للصفحة فورًا دون عرض قائمة الصفحات الفرعية
  container.querySelectorAll('.sidebar__group-title-link').forEach(linkEl => {
    linkEl.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = linkEl.href;
    });
  });

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
