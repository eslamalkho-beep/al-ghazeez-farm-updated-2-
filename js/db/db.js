// js/db/db.js
// طبقة تجريدية وحيدة للتعامل مع IndexedDB — كل الخدمات تستخدم هذه الدوال فقط

const DB_NAME = 'AlGhazeezFarmDB';
const DB_VERSION = 27;

const OBJECT_STORES = [
  'Users', 'Animals', 'BirthRecords', 'DeathRecords', 'HealthRecords',
  'Expenses', 'Revenues', 'Purchases', 'Employees', 'CustodyItems', 'Notifications', 'Categories', 'Attachments',
  'BulkPurchases', 'BulkSales', 'BulkExpenses', 'BulkBatches', 'BulkPurchaseBatches', 'BulkSaleBatches', 'Parties',
  'InventoryItems', 'InventoryMovements', 'ChartOfAccounts', 'JournalEntries', 'StockCounts',
  'Locations', 'WeightRecords', 'Vaccinations', 'Transfers', 'CustodySettlements', 'PartyTransactions',
  'MatingRecords', 'PregnancyRecords', 'FixedAssets', 'FixedAssetTransactions', 'FixedAssetCounts',
  'AccountingPeriods', 'Adjustments', 'CashCounts', 'BankStatementLines', 'AccountMappings', 'AnimalCounts',
  'AuditLog', 'WeeklyBatches', 'FatteningBatches', 'FiscalYears',
];

let _dbInstance = null;

function openDatabase() {
  if (_dbInstance) return Promise.resolve(_dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      OBJECT_STORES.forEach(storeName => {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true });
        }
      });
    };

    request.onsuccess = (event) => {
      _dbInstance = event.target.result;
      resolve(_dbInstance);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

async function dbAdd(storeName, record) {
  const db = await openDatabase();
  const toInsert = { ...record, createdAt: record.createdAt || new Date().toISOString() };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.add(toInsert);
    req.onsuccess = () => {
      _logAudit(storeName, req.result, 'create', null, { ...toInsert, id: req.result });
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(storeName, id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(Number(id));
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetAll(storeName) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbUpdate(storeName, id, updatedFields) {
  const existing = await dbGet(storeName, id);
  if (!existing) throw new Error(`السجل غير موجود في ${storeName}`);
  const merged = { ...existing, ...updatedFields, id: Number(id), updatedAt: new Date().toISOString() };

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(merged);
    req.onsuccess = () => {
      const action = (existing.status !== 'deleted' && merged.status === 'deleted') ? 'delete' : 'update';
      _logAudit(storeName, merged.id, action, existing, merged);
      resolve(merged);
    };
    req.onerror = () => reject(req.error);
  });
}

async function dbSoftDelete(storeName, id) {
  const existing = await dbGet(storeName, id);
  if (!existing) throw new Error(`السجل غير موجود في ${storeName}`);
  return dbUpdate(storeName, id, { status: 'deleted', isDeleted: true });
}

async function dbHardDelete(storeName, id) {
  const existing = await dbGet(storeName, id).catch(() => null);
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(Number(id));
    req.onsuccess = () => {
      _logAudit(storeName, Number(id), 'hardDelete', existing, null);
      resolve(true);
    };
    req.onerror = () => reject(req.error);
  });
}

async function dbQuery(storeName, filterFn) {
  const all = await dbGetAll(storeName);
  return all.filter(filterFn);
}

// ===== سجل التدقيق (AuditLog) — يُكتَب تلقائيًا من الدوال أعلاه لكل مخزن (باستثناء AuditLog نفسه)، بلا أي
// نقطة كتابة أخرى في التطبيق. ثانوي دومًا: أي خطأ في الكتابة لا يوقف العملية الأساسية (catch صامت + تحذير
// بالـconsole فقط). القراءة/العرض من audit-service.js (سجل التدقيق مقصور على مدير النظام، انظر
// settings/audit-log.html في CLAUDE.md)
const _AUDIT_SKIP_FIELDS = ['updatedAt', 'createdAt', 'id'];
// قيم لا تُخزَّن كما هي في سجل التدقيق (هاش كلمة مرور/ملف ثنائي) — تُستبدل بعلامة "محجوب" مع الإبقاء على
// حقيقة أن الحقل تغيّر
const _AUDIT_REDACTED_FIELDS = ['passwordHash', 'blob'];

function _auditRedactValue(field, value) {
  if (!_AUDIT_REDACTED_FIELDS.includes(field)) return value;
  return value === undefined ? undefined : '(محجوب)';
}

function _diffRecordFields(before, after) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  const changes = [];
  keys.forEach(key => {
    if (_AUDIT_SKIP_FIELDS.includes(key)) return;
    const oldVal = before ? before[key] : undefined;
    const newVal = after ? after[key] : undefined;
    if (JSON.stringify(oldVal) === JSON.stringify(newVal)) return;
    changes.push({ field: key, oldValue: _auditRedactValue(key, oldVal), newValue: _auditRedactValue(key, newVal) });
  });
  return changes;
}

function _sanitizeAuditSnapshot(record) {
  if (!record) return null;
  const clone = { ...record };
  _AUDIT_REDACTED_FIELDS.forEach(field => {
    if (field in clone) clone[field] = _auditRedactValue(field, clone[field]);
  });
  return clone;
}

async function _logAudit(storeName, recordId, action, before, after) {
  if (storeName === 'AuditLog') return;
  try {
    let changes = null;
    if (action === 'update' || action === 'delete') {
      changes = _diffRecordFields(before, after);
      if (!changes.length) return; // لا تغيير فعلي في القيم (مثلاً حفظ بلا تعديل) — لا داعي لتسجيله
    }

    const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    const entry = {
      storeName, recordId, action, changes,
      snapshot: (action === 'create' || action === 'hardDelete') ? _sanitizeAuditSnapshot(after || before) : null,
      userId: currentUser?.id || null,
      userName: currentUser?.fullName || currentUser?.username || 'نظام',
      at: new Date().toISOString(),
    };

    const db = await openDatabase();
    const tx = db.transaction('AuditLog', 'readwrite');
    tx.objectStore('AuditLog').add(entry);
  } catch (err) {
    console.warn('تعذّر تسجيل حركة التدقيق', err);
  }
}
