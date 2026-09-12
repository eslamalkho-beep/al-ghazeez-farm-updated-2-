// js/services/bulk-batch-service.js
// الشراء والبيع الجماعي: عمليتا شراء/بيع مستقلتان تمامًا (كل عملية سجل خاص بها، وقيد محاسبي خاص بها) —
// الشراء يُرسمَل كأصل "مخزون الشراء والبيع الجماعي" (1035) بدل تحميله كمصروف فوري، والبيع يُثبت الإيراد
// **و**تكلفة البضاعة المباعة (COGS) معًا، بناءً على متوسط تكلفة متحرك محسوب من كل عمليات الشراء لنفس
// التركيبة (نوع/جنس/سلالة) — بذلك لا يظهر الربح الحقيقي إلا عند البيع الفعلي. هذا يحل محل نموذج "الدفعات"
// القديم (BulkBatches، ما زال اسمه في OBJECT_STORES كأرشيف صامت فقط) الذي كان يحمّل تكلفة الشراء كمصروف
// فوري بصرف النظر عن حصول بيع فعلي أم لا.

// ===== الشراء =====

async function getAllBulkPurchases() {
  const all = await dbGetAll('BulkPurchaseBatches');
  return all.filter(p => p.status !== 'deleted');
}

async function getBulkPurchaseById(id) {
  return dbGet('BulkPurchaseBatches', id);
}

async function createBulkPurchase(data) {
  return dbAdd('BulkPurchaseBatches', data);
}

async function updateBulkPurchase(id, data) {
  return dbUpdate('BulkPurchaseBatches', id, data);
}

async function deleteBulkPurchase(id) {
  return dbSoftDelete('BulkPurchaseBatches', id);
}

async function generateNextBulkPurchaseCode() {
  const all = await getAllBulkPurchases();
  const numbers = all
    .map(p => (p.code && p.code.startsWith('DFP-')) ? parseInt(p.code.replace('DFP-', ''), 10) : 0)
    .filter(n => !isNaN(n));
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `DFP-${String(next).padStart(4, '0')}`;
}

// ===== البيع =====

async function getAllBulkSales() {
  const all = await dbGetAll('BulkSaleBatches');
  return all.filter(s => s.status !== 'deleted');
}

async function getBulkSaleById(id) {
  return dbGet('BulkSaleBatches', id);
}

async function createBulkSale(data) {
  return dbAdd('BulkSaleBatches', data);
}

async function updateBulkSale(id, data) {
  return dbUpdate('BulkSaleBatches', id, data);
}

async function deleteBulkSale(id) {
  return dbSoftDelete('BulkSaleBatches', id);
}

async function generateNextBulkSaleCode() {
  const all = await getAllBulkSales();
  const numbers = all
    .map(s => (s.code && s.code.startsWith('DFS-')) ? parseInt(s.code.replace('DFS-', ''), 10) : 0)
    .filter(n => !isNaN(n));
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `DFS-${String(next).padStart(4, '0')}`;
}

// ===== الأرصدة ومتوسط التكلفة (محسوبة حيًا دومًا) =====

function _bulkGroupKey(line) {
  return `${line.type}|${line.gender}|${(line.breed || '').trim().toLowerCase()}`;
}

// يجمّع كل عمليات الشراء/البيع حسب تركيبة نوع/جنس/سلالة، ويحسب متوسط تكلفة متحرك (إجمالي تكلفة الشراء ÷
// إجمالي عدد الشراء لنفس التركيبة — من الشراء فقط، لا تؤثر عمليات البيع على المتوسط إطلاقًا) والرصيد الحالي
// وإجمالي الربح. بنفس مبدأ computeAccountBalance(account, allEntries, asOfDate) في accounting-service.js:
// مرّر asOfDate لحساب الأرصدة "كما في تاريخ" سابق بدل الرصيد الحالي (مستخدم لتجميد متوسط التكلفة وقت حفظ
// عملية بيع بتاريخ معيّن، ولعرض معاينة حيّة أثناء تعبئة النموذج)
function computeBulkGroupBalances(purchases, sales, asOfDate = null) {
  const groups = {};
  const ensureGroup = (line) => {
    const key = _bulkGroupKey(line);
    if (!groups[key]) {
      groups[key] = {
        type: line.type, gender: line.gender, breed: line.breed,
        purchasedCount: 0, purchasedCost: 0, soldCount: 0, soldRevenue: 0, cogs: 0,
      };
    }
    return groups[key];
  };

  (purchases || []).forEach(p => {
    if (asOfDate && p.date > asOfDate) return;
    (p.lines || []).forEach(line => {
      const g = ensureGroup(line);
      g.purchasedCount += Number(line.count || 0);
      g.purchasedCost += Number(line.count || 0) * Number(line.unitPrice || 0);
    });
  });

  (sales || []).forEach(s => {
    if (asOfDate && s.date > asOfDate) return;
    (s.lines || []).forEach(line => {
      const g = ensureGroup(line);
      g.soldCount += Number(line.count || 0);
      g.soldRevenue += Number(line.count || 0) * Number(line.unitPrice || 0);
      g.cogs += Number(line.cogsAmount || 0);
    });
  });

  return Object.values(groups).map(g => ({
    ...g,
    avgCost: g.purchasedCount > 0 ? g.purchasedCost / g.purchasedCount : 0,
    remainingCount: g.purchasedCount - g.soldCount,
    grossProfit: g.soldRevenue - g.cogs,
  }));
}

// غلاف مبسّط فوق computeBulkGroupBalances لعرض متوسط التكلفة/الكمية المتاحة حيًا أثناء إدخال بند بيع
// (asOfDate يُقصَد به هنا "كما في" تاريخ عملية البيع نفسها، حتى لا تدخل عمليات شراء لاحقة في حساب متوسط
// عملية بيع أقدم منها تاريخيًا)
function getGroupAverageCost(type, gender, breed, purchases, asOfDate = null) {
  const key = `${type}|${gender}|${(breed || '').trim().toLowerCase()}`;
  const groups = computeBulkGroupBalances(purchases, [], asOfDate);
  const match = groups.find(g => _bulkGroupKey(g) === key);
  return match ? { avgCost: match.avgCost, availableCount: match.purchasedCount - match.soldCount } : { avgCost: 0, availableCount: 0 };
}

// يحسب avgCostAtSale/cogsAmount لكل بند بيع بناءً على متوسط تكلفة الشراء لنفس التركيبة "كما في" تاريخ
// العملية — تُستدعى وقت حفظ عملية بيع (جديدة أو مُعدَّلة) لتجميد القيمة وقتها (snapshot). لا تُعاد حسابها
// تلقائيًا لاحقًا حتى لو عُدِّلت بيانات شراء قديمة بعد ذلك — نفس فلسفة عدم إعادة الحساب بأثر رجعي المتّبعة
// في باقي أتمتة المحاسبة بالمشروع (مثل تعديل مصروف مرتبط بتسوية عهدة)
function computeSaleLinesCosts(rawLines, allPurchases, asOfDate) {
  return rawLines.map(line => {
    const { avgCost } = getGroupAverageCost(line.type, line.gender, line.breed, allPurchases, asOfDate);
    const cogsAmount = Number(line.count || 0) * avgCost;
    return { ...line, avgCostAtSale: avgCost, cogsAmount };
  });
}

// ===== ترحيل تلقائي للمحاسبة =====
// كل بند جملة (نوع/جنس/سلالة) يُرحَّل على حساب الورقة المناسب له في الشجرة الهرمية بدل حساب واحد عام —
// بند الجملة لا يحمل تصنيف عمر (أمهات/حملان)، فتقريب مقصود موثّق: إناث الأغنام على "أمهات أغنام" وذكورها
// على "كباش أغنام" (والعكس للماعز)، وتكلفة البضاعة المباعة على حساب النوع كاملًا. الحسابات قابلة للتغيير
// من شاشة "ربط العمليات بالحسابات" (مفاتيح مجموعة bulk)
const _BULK_LINE_MAPPING_KEYS = {
  'sheep|male': { inventoryKey: 'bulkInventorySheepMale', revenueKey: 'bulkRevenueSheepMale', cogsKey: 'bulkCogsSheep' },
  'sheep|female': { inventoryKey: 'bulkInventorySheepFemale', revenueKey: 'bulkRevenueSheepFemale', cogsKey: 'bulkCogsSheep' },
  'goat|male': { inventoryKey: 'bulkInventoryGoatMale', revenueKey: 'bulkRevenueGoatMale', cogsKey: 'bulkCogsGoat' },
  'goat|female': { inventoryKey: 'bulkInventoryGoatFemale', revenueKey: 'bulkRevenueGoatFemale', cogsKey: 'bulkCogsGoat' },
};

// يُصافي مجموعة أزواج مدين/دائن إلى سطر واحد بحد أقصى لكل حساب (بدل تكرار نفس الحساب في أكثر من سطر لنفس
// القيد)، مع الحفاظ رياضيًا على توازن إجمالي المدين = إجمالي الدائن للقيد ككل
function _netJournalLinesByAccount(pairs) {
  const totals = {};
  pairs.forEach(({ accountId, debit, credit }) => {
    if (!totals[accountId]) totals[accountId] = { debit: 0, credit: 0 };
    totals[accountId].debit += Number(debit || 0);
    totals[accountId].credit += Number(credit || 0);
  });
  return Object.entries(totals)
    .map(([accountId, { debit, credit }]) => {
      const net = debit - credit;
      if (Math.abs(net) < 0.01) return null;
      return net > 0
        ? { accountId: Number(accountId), debit: net, credit: 0 }
        : { accountId: Number(accountId), debit: 0, credit: -net };
    })
    .filter(Boolean);
}

// source: 'transfer' (عملية أُنشئت من transfer-service.js لنقل حيوان بين القطيع ومخزون التجارة) تُستثنى
// بالكامل من الترحيل المحاسبي — لا قيد إطلاقًا — لأنها تحويل داخلي بحت بلا أي حركة نقدية حقيقية، رغم أن
// سعر وحدتها (القيمة التقديرية إن أُدخلت) يدخل بشكل طبيعي في حساب متوسط التكلفة عبر computeBulkGroupBalances
async function syncBulkPurchaseJournalEntry(purchaseId) {
  const purchase = await getBulkPurchaseById(purchaseId);
  if (!purchase) return null;
  if (purchase.source === 'transfer') return null;

  const totalCost = (purchase.lines || []).reduce((s, l) => s + Number(l.count || 0) * Number(l.unitPrice || 0), 0);
  const [accounts, mappings] = await Promise.all([getAllAccounts(), loadAccountMappings()]);
  const cashAccount = getMappedAccount('cash', accounts, mappings);
  if (!cashAccount) return null; // دفاعي

  // مدين مخزون كل بند على ورقة نوعه/جنسه (بدل حساب مخزون جملة واحد) — دائن الصندوق بالإجمالي
  const pairs = [];
  (purchase.lines || []).forEach(line => {
    const lineCost = Number(line.count || 0) * Number(line.unitPrice || 0);
    if (!(lineCost > 0)) return;
    const keys = _BULK_LINE_MAPPING_KEYS[`${line.type}|${line.gender}`];
    const inventoryAccount = keys && getMappedAccount(keys.inventoryKey, accounts, mappings);
    if (!inventoryAccount) return;
    pairs.push({ accountId: inventoryAccount.id, debit: lineCost, credit: 0 });
  });
  if (totalCost > 0) pairs.push({ accountId: cashAccount.id, debit: 0, credit: totalCost });

  const lines = _netJournalLinesByAccount(pairs);

  if (!lines.length) {
    if (purchase.journalEntryId) {
      await deleteJournalEntry(purchase.journalEntryId);
      await dbUpdate('BulkPurchaseBatches', purchaseId, { journalEntryId: null });
    }
    return null;
  }

  const description = `شراء جملة ${purchase.code} بتاريخ ${purchase.date}`;
  const existingEntry = purchase.journalEntryId ? await getJournalEntryById(purchase.journalEntryId) : null;
  if (existingEntry && existingEntry.status !== 'deleted') {
    await updateJournalEntry(existingEntry.id, { date: purchase.date, description, lines });
    return existingEntry.id;
  }

  const entryNumber = await generateNextEntryNumber();
  const newEntryId = await createJournalEntry({ entryNumber, date: purchase.date, description, lines });
  await dbUpdate('BulkPurchaseBatches', purchaseId, { journalEntryId: newEntryId });
  return newEntryId;
}

async function reverseBulkPurchaseJournalEntry(purchaseId) {
  const purchase = await getBulkPurchaseById(purchaseId);
  if (purchase && purchase.journalEntryId) {
    await deleteJournalEntry(purchase.journalEntryId);
  }
}

async function syncBulkSaleJournalEntry(saleId) {
  const sale = await getBulkSaleById(saleId);
  if (!sale) return null;
  if (sale.source === 'transfer') return null;

  const totalRevenue = (sale.lines || []).reduce((s, l) => s + Number(l.count || 0) * Number(l.unitPrice || 0), 0);
  const totalCogs = (sale.lines || []).reduce((s, l) => s + Number(l.cogsAmount || 0), 0);

  const [accounts, mappings] = await Promise.all([getAllAccounts(), loadAccountMappings()]);
  const cashAccount = getMappedAccount('cash', accounts, mappings);
  if (!cashAccount) return null; // دفاعي

  // قيد مركّب: دائن الإيراد لكل بند على ورقة مبيعات نوعه/جنسه، مدين تكلفة البضاعة المباعة لكل بند على
  // ورقة تكلفة نوعه، دائن مخزون كل بند بنفس التكلفة — ثم صافي الأسطر لكل حساب عبر _netJournalLinesByAccount
  const pairs = [];
  if (totalRevenue > 0) pairs.push({ accountId: cashAccount.id, debit: totalRevenue, credit: 0 });
  (sale.lines || []).forEach(line => {
    const lineRevenue = Number(line.count || 0) * Number(line.unitPrice || 0);
    const lineCogs = Number(line.cogsAmount || 0);
    const keys = _BULK_LINE_MAPPING_KEYS[`${line.type}|${line.gender}`];
    if (!keys) return;

    if (lineRevenue > 0) {
      const revenueAccount = getMappedAccount(keys.revenueKey, accounts, mappings);
      if (revenueAccount) pairs.push({ accountId: revenueAccount.id, debit: 0, credit: lineRevenue });
    }
    if (lineCogs > 0) {
      const cogsAccount = getMappedAccount(keys.cogsKey, accounts, mappings);
      const inventoryAccount = getMappedAccount(keys.inventoryKey, accounts, mappings);
      if (cogsAccount) pairs.push({ accountId: cogsAccount.id, debit: lineCogs, credit: 0 });
      if (inventoryAccount) pairs.push({ accountId: inventoryAccount.id, debit: 0, credit: lineCogs });
    }
  });
  const lines = _netJournalLinesByAccount(pairs);

  if (!lines.length) {
    if (sale.journalEntryId) {
      await deleteJournalEntry(sale.journalEntryId);
      await dbUpdate('BulkSaleBatches', saleId, { journalEntryId: null });
    }
    return null;
  }

  const description = `بيع جملة ${sale.code} بتاريخ ${sale.date}`;
  const existingEntry = sale.journalEntryId ? await getJournalEntryById(sale.journalEntryId) : null;
  if (existingEntry && existingEntry.status !== 'deleted') {
    await updateJournalEntry(existingEntry.id, { date: sale.date, description, lines });
    return existingEntry.id;
  }

  const entryNumber = await generateNextEntryNumber();
  const newEntryId = await createJournalEntry({ entryNumber, date: sale.date, description, lines });
  await dbUpdate('BulkSaleBatches', saleId, { journalEntryId: newEntryId });
  return newEntryId;
}

async function reverseBulkSaleJournalEntry(saleId) {
  const sale = await getBulkSaleById(saleId);
  if (sale && sale.journalEntryId) {
    await deleteJournalEntry(sale.journalEntryId);
  }
}
