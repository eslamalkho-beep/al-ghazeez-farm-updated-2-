// js/services/stock-count-service.js
// جرد دوري للمخزون: يحسب المستهلك = أول المدة + المشتريات − آخر المدة، وعند الاعتماد
// ينشئ تلقائيًا حركة "صادر" (تسوية جرد) في المخزون + قيد يومية (مدين مصروف / دائن مخزون)
// في وحدة المحاسبة — أول نقطة ترحيل تلقائي فعلية في النظام (باقي الوحدات ما زالت قيودها يدوية بقصد)

// تعيين ثابت (تصنيف صنف المخزون ← مفتاحي ربط "المخزون" في شاشة ربط العمليات بالحسابات) — الافتراضي:
// الأعلاف على 61101/11301 والأدوية على 62101/11302 والمعدات/المستلزمات على 74107/11303
const STOCK_COUNT_CATEGORY_MAPPING_KEYS = {
  fodder: { expenseKey: 'inventoryExpenseFodder', assetKey: 'inventoryAssetFodder' },
  medicine: { expenseKey: 'inventoryExpenseMedicine', assetKey: 'inventoryAssetMedicine' },
  equipment: { expenseKey: 'inventoryExpenseEquipment', assetKey: 'inventoryAssetEquipment' },
  other: { expenseKey: 'inventoryExpenseEquipment', assetKey: 'inventoryAssetEquipment' },
};

async function getAllStockCounts() {
  const all = await dbGetAll('StockCounts');
  return all.filter(c => c.status !== 'deleted');
}

async function getStockCountById(id) {
  if (!id) return null;
  return dbGet('StockCounts', id);
}

async function createStockCount(data) {
  return dbAdd('StockCounts', data);
}

async function updateStockCount(id, data) {
  return dbUpdate('StockCounts', id, data);
}

// آخر تاريخ جرد "معتمد" لنفس الصنف (باستثناء الجرد الحالي نفسه عند التعديل) — يُستخدم كبداية تلقائية للفترة التالية
function getLastApprovedStockCountDateForItem(itemId, allStockCounts, excludeId = null) {
  const relevant = allStockCounts
    .filter(c => c.status === 'approved' && c.id !== excludeId)
    .filter(c => (c.lines || []).some(l => Number(l.itemId) === Number(itemId)));
  if (!relevant.length) return null;
  const sorted = [...relevant].sort((a, b) => (a.date < b.date ? 1 : -1));
  return sorted[0].date;
}

// أول المدة + مشتريات الفترة + متوسط مرجّح لسعر الشراء خلال نفس الفترة — لا تحتاج قيمة "آخر المدة" (تُدخَل يدويًا في الصفحة)
// otherOutQty: أي حركات "صادر" أخرى سُجِّلت يدويًا خلال نفس الفترة (تلف/تسوية/استهلاك مسجَّل مباشرة من شاشة الحركات) —
// يجب خصمها قبل اشتقاق "المستهلك غير الموثَّق" من الجرد، وإلا لحدث خصم مزدوج عند ترحيل حركة الاستهلاك الجديدة
function computeStockCountLinePreview(item, periodFrom, date, allMovements) {
  const itemMovements = allMovements.filter(m => Number(m.itemId) === Number(item.id));

  const openingMovements = periodFrom ? itemMovements.filter(m => m.date <= periodFrom) : [];
  const openingQty = periodFrom ? computeItemStockLevel(item, openingMovements).currentQty : 0;

  const periodMovements = itemMovements.filter(m => m.date <= date && (!periodFrom || m.date > periodFrom));
  const periodInMovements = periodMovements.filter(m => m.direction === 'in');
  const otherOutQty = periodMovements.filter(m => m.direction === 'out').reduce((s, m) => s + Number(m.quantity || 0), 0);
  const purchasesQty = periodInMovements.reduce((s, m) => s + Number(m.quantity || 0), 0);

  const pricedPeriodIn = periodInMovements.filter(m => m.unitCost !== null && m.unitCost !== undefined && m.unitCost !== '');
  const pricedQty = pricedPeriodIn.reduce((s, m) => s + Number(m.quantity || 0), 0);
  let unitCostUsed;
  if (pricedQty > 0) {
    const totalValue = pricedPeriodIn.reduce((s, m) => s + Number(m.quantity || 0) * Number(m.unitCost || 0), 0);
    unitCostUsed = Math.round((totalValue / pricedQty) * 100) / 100;
  } else {
    unitCostUsed = getLastPurchasePrice(item, allMovements) || 0;
  }

  return { openingQty, purchasesQty, otherOutQty, unitCostUsed };
}

// يبني سطور القيد اليومية المجمَّعة (بحسب زوج حسابات كل تصنيف) من سطور جرد "مستهلكة" فعليًا
function _buildJournalLinesForStockCount(lines, itemsById, allAccounts, mappings) {
  const totalsByAccountPair = {}; // "expenseId|assetId" -> value
  lines.forEach(line => {
    const value = Number(line.consumedValue || 0);
    if (value <= 0) return;
    const item = itemsById[line.itemId];
    if (!item) return;
    const keys = STOCK_COUNT_CATEGORY_MAPPING_KEYS[item.category] || STOCK_COUNT_CATEGORY_MAPPING_KEYS.other;
    const expenseAccount = getMappedAccount(keys.expenseKey, allAccounts, mappings);
    const assetAccount = getMappedAccount(keys.assetKey, allAccounts, mappings);
    if (!expenseAccount || !assetAccount) return;
    const key = `${expenseAccount.id}|${assetAccount.id}`;
    if (!totalsByAccountPair[key]) totalsByAccountPair[key] = { expenseAccount, assetAccount, value: 0 };
    totalsByAccountPair[key].value += value;
  });

  const journalLines = [];
  Object.values(totalsByAccountPair).forEach(({ expenseAccount, assetAccount, value }) => {
    journalLines.push({ accountId: expenseAccount.id, debit: value, credit: 0 });
    journalLines.push({ accountId: assetAccount.id, debit: 0, credit: value });
  });
  return journalLines;
}

// يرحّل الجرد: ينشئ حركة "صادر" (تسوية جرد) لكل سطر مستهلك + قيد يومية واحد مجمَّع، ويضبط الحالة "معتمد"
async function approveStockCount(id) {
  const count = await getStockCountById(id);
  if (!count) throw new Error('الجرد غير موجود');

  const [allItems, allAccounts, mappings] = await Promise.all([getAllInventoryItems(), getAllAccounts(), loadAccountMappings()]);
  const itemsById = Object.fromEntries(allItems.map(i => [i.id, i]));

  const updatedLines = [];
  for (const line of (count.lines || [])) {
    const item = itemsById[line.itemId];
    let movementId = line.movementId || null;
    if (item && Number(line.consumedQty) > 0) {
      movementId = await createInventoryMovement({
        itemId: item.id,
        direction: 'out',
        quantity: line.consumedQty,
        date: count.date,
        reasonType: 'adjustment',
        unitCost: line.unitCostUsed,
        notes: `استهلاك محسوب تلقائيًا من الجرد بتاريخ ${count.date}`,
      });
    }
    updatedLines.push({ ...line, movementId });
  }

  const journalLines = _buildJournalLinesForStockCount(updatedLines, itemsById, allAccounts, mappings);
  let journalEntryId = null;
  if (journalLines.length) {
    const entryNumber = await generateNextEntryNumber();
    journalEntryId = await createJournalEntry({
      entryNumber,
      date: count.date,
      description: `استهلاك مخزون حسب الجرد بتاريخ ${count.date}`,
      lines: journalLines,
    });
  }

  return updateStockCount(id, { status: 'approved', journalEntryId, lines: updatedLines });
}

// يعكس أثر الاعتماد بالكامل: يحذف الحركات والقيد المرتبطين، ويعيد الجرد لحالة "مسودة" قابلة للتعديل
async function unapproveStockCount(id) {
  const count = await getStockCountById(id);
  if (!count) throw new Error('الجرد غير موجود');

  for (const line of (count.lines || [])) {
    if (line.movementId) await deleteInventoryMovement(line.movementId);
  }
  if (count.journalEntryId) await deleteJournalEntry(count.journalEntryId);

  const revertedLines = (count.lines || []).map(l => ({ ...l, movementId: null }));
  return updateStockCount(id, { status: 'draft', journalEntryId: null, lines: revertedLines });
}

async function deleteStockCount(id) {
  const count = await getStockCountById(id);
  if (count && count.status === 'approved') {
    await unapproveStockCount(id);
  }
  return dbSoftDelete('StockCounts', id);
}
