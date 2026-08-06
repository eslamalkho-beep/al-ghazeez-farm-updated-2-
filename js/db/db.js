// js/db/db.js
// طبقة تجريدية وحيدة للتعامل مع IndexedDB — كل الخدمات تستخدم هذه الدوال فقط

const DB_NAME = 'AlGhazeezFarmDB';
const DB_VERSION = 12;

const OBJECT_STORES = [
  'Users', 'Animals', 'BirthRecords', 'DeathRecords', 'HealthRecords',
  'Expenses', 'Revenues', 'Purchases', 'Employees', 'CustodyItems', 'Notifications', 'Categories', 'Attachments',
  'BulkPurchases', 'BulkSales', 'BulkExpenses', 'BulkBatches', 'Parties',
  'InventoryItems', 'InventoryMovements', 'ChartOfAccounts', 'JournalEntries', 'StockCounts',
  'Locations', 'WeightRecords', 'Vaccinations', 'Transfers',
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
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.add({ ...record, createdAt: record.createdAt || new Date().toISOString() });
    req.onsuccess = () => resolve(req.result);
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
    req.onsuccess = () => resolve(merged);
    req.onerror = () => reject(req.error);
  });
}

async function dbSoftDelete(storeName, id) {
  const existing = await dbGet(storeName, id);
  if (!existing) throw new Error(`السجل غير موجود في ${storeName}`);
  return dbUpdate(storeName, id, { status: 'deleted', isDeleted: true });
}

async function dbHardDelete(storeName, id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(Number(id));
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

async function dbQuery(storeName, filterFn) {
  const all = await dbGetAll(storeName);
  return all.filter(filterFn);
}
