// js/services/inventory-service.js
// المخزون والمستلزمات: كتالوج أصناف (أعلاف/أدوية/معدات) + حركات وارد/صادر
// الرصيد الحالي محسوب حيًا من الحركات (نفس مبدأ computeBulkGroupBalances)، وليس مخزَّنًا

const INVENTORY_CATEGORY_LABELS = { fodder: 'أعلاف', medicine: 'أدوية', equipment: 'معدات', other: 'أخرى' };
const INVENTORY_REASON_LABELS = { purchase: 'شراء', consumption: 'استهلاك', damage: 'تالف/هالك', adjustment: 'تسوية جرد', custody: 'عهدة', other: 'أخرى' };

async function getAllInventoryItems() {
  const all = await dbGetAll('InventoryItems');
  return all.filter(i => i.status !== 'deleted');
}

async function getInventoryItemById(id) {
  if (!id) return null;
  return dbGet('InventoryItems', id);
}

async function createInventoryItem(data) {
  return dbAdd('InventoryItems', data);
}

async function updateInventoryItem(id, data) {
  return dbUpdate('InventoryItems', id, data);
}

async function deleteInventoryItem(id) {
  return dbSoftDelete('InventoryItems', id);
}

async function isInventoryItemNameTaken(name, excludeId = null) {
  const all = await getAllInventoryItems();
  return all.some(i => i.name === name && i.id !== excludeId);
}

async function getAllInventoryMovements(itemId = null) {
  const all = await dbGetAll('InventoryMovements');
  return all.filter(m => m.status !== 'deleted' && (!itemId || m.itemId === Number(itemId)));
}

// تُستخدم من expense-form-page.js لإيجاد حركة المخزون المُنشأة تلقائيًا (إن وُجدت) من مصروف معيّن، لتحديثها/حذفها عند تعديل/حذف المصروف
async function getInventoryMovementByExpenseId(expenseId) {
  const all = await getAllInventoryMovements();
  return all.find(m => m.relatedExpenseId === Number(expenseId)) || null;
}

// نفس مبدأ getInventoryMovementByExpenseId أعلاه لكن لمشترى (Purchases.linkedInventoryItemId) — انظر
// purchase-form-page.js/_syncPurchaseInventoryLink
async function getInventoryMovementByPurchaseId(purchaseId) {
  const all = await getAllInventoryMovements();
  return all.find(m => m.relatedPurchaseId === Number(purchaseId)) || null;
}

// الرصيد الحالي وحالة "منخفض" لصنف واحد بناءً على مجموعة حركات معطاة (وارد − صادر)
function computeItemStockLevel(item, allMovements) {
  const itemMovements = allMovements.filter(m => m.itemId === item.id);
  const totalIn = itemMovements.filter(m => m.direction === 'in').reduce((s, m) => s + Number(m.quantity || 0), 0);
  const totalOut = itemMovements.filter(m => m.direction === 'out').reduce((s, m) => s + Number(m.quantity || 0), 0);
  const currentQty = totalIn - totalOut;
  const hasThreshold = item.reorderThreshold !== null && item.reorderThreshold !== undefined && item.reorderThreshold !== '';
  const isLowStock = hasThreshold && currentQty <= Number(item.reorderThreshold);
  return { currentQty, isLowStock };
}

// آخر سعر شراء مسجَّل لهذا الصنف (تكلفة وحدة من أحدث حركة "وارد" تحمل unitCost)، أو null إن لم تُسجَّل أي تكلفة بعد
function getLastPurchasePrice(item, allMovements) {
  const priced = allMovements.filter(m =>
    m.itemId === item.id && m.direction === 'in' &&
    m.unitCost !== null && m.unitCost !== undefined && m.unitCost !== ''
  );
  if (!priced.length) return null;
  const sorted = [...priced].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (b.id || 0) - (a.id || 0);
  });
  return Number(sorted[0].unitCost);
}

// إنشاء حركة مخزون جديدة — تنبيه "نفاد الأعلاف" حيّ عبر مركز التنبيهات (alerts-service.js)، لا كتابة هنا
async function createInventoryMovement(data) {
  return dbAdd('InventoryMovements', data);
}

async function updateInventoryMovement(id, data) {
  return dbUpdate('InventoryMovements', id, data);
}

async function deleteInventoryMovement(id) {
  return dbSoftDelete('InventoryMovements', id);
}
