// js/services/audit-service.js
// قراءة سجل التدقيق (AuditLog) فقط — يُكتَب تلقائيًا من _logAudit() في js/db/db.js عند كل dbAdd/dbUpdate/
// dbHardDelete على أي مخزن (باستثناء AuditLog نفسه)، بلا أي نقطة كتابة أخرى في التطبيق. هذه الخدمة للعرض
// فقط، تستهلكها settings/audit-log.html (مقصورة على مدير النظام)

const AUDIT_ACTION_LABELS = { create: 'إنشاء', update: 'تعديل', delete: 'حذف (ناعم)', hardDelete: 'حذف نهائي' };

// تسميات عربية لأسماء المخازن الأكثر أهمية للمستخدم — أي مخزن غير مذكور هنا يُعرض باسمه التقني كما هو
// (مخازن قديمة متوقفة مثل Notifications/Categories/BulkBatches لن تظهر أصلاً لأن لا كتابة جديدة عليها)
const AUDIT_STORE_LABELS = {
  Users: 'مستخدم', Animals: 'حيوان', BirthRecords: 'ولادة', DeathRecords: 'نفوق', HealthRecords: 'سجل صحي',
  Expenses: 'مصروف', Revenues: 'إيراد', Purchases: 'مشترى', Employees: 'موظف', CustodyItems: 'عهدة',
  CustodySettlements: 'تسوية عهدة', Attachments: 'مرفق', Parties: 'طرف (عميل/مورّد)',
  PartyTransactions: 'سند/مرتجع طرف', InventoryItems: 'صنف مخزون', InventoryMovements: 'حركة مخزون',
  ChartOfAccounts: 'حساب', JournalEntries: 'قيد يومية', StockCounts: 'جرد مخزون', Locations: 'موقع/حظيرة',
  WeightRecords: 'وزن', Vaccinations: 'تحصين', MatingRecords: 'تلقيح', PregnancyRecords: 'حمل',
  FixedAssets: 'أصل ثابت', FixedAssetTransactions: 'حركة أصل ثابت', FixedAssetCounts: 'جرد أصول ثابتة',
  AccountingPeriods: 'فترة محاسبية', Adjustments: 'تسوية محاسبية', CashCounts: 'جرد صندوق',
  BankStatementLines: 'سطر كشف بنك', AccountMappings: 'ربط حساب', AnimalCounts: 'جرد حيواني',
  BulkPurchaseBatches: 'شراء جملة', BulkSaleBatches: 'بيع جملة',
};

function getAuditStoreLabel(storeName) {
  return AUDIT_STORE_LABELS[storeName] || storeName;
}

async function getAllAuditLogs() {
  const all = await dbGetAll('AuditLog');
  return all.sort((a, b) => (a.at === b.at ? b.id - a.id : (a.at < b.at ? 1 : -1))); // الأحدث أولاً
}

// أسماء المخازن/المستخدمين الظاهرة فعليًا في السجل — لتعبئة قوائم الفلترة ديناميكيًا بدل قائمة ثابتة قد
// تحوي مخازن بلا أي حركة فعلاً
function getDistinctAuditFacets(logs) {
  const stores = new Map();
  const users = new Map();
  logs.forEach(l => {
    if (!stores.has(l.storeName)) stores.set(l.storeName, getAuditStoreLabel(l.storeName));
    const uKey = l.userId || `name:${l.userName}`;
    if (!users.has(uKey)) users.set(uKey, l.userName || 'نظام');
  });
  return {
    stores: [...stores.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ar')),
    users: [...users.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ar')),
  };
}
