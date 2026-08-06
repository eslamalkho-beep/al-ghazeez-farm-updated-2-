// js/services/bulk-batch-service.js
// دفعات الشراء والبيع الجماعي — سجل واحد يحوي بنود شراء (يوم واحد) وبنود بيع/مصاريف (كل بند بتاريخه الخاص)

async function getAllBulkBatches() {
  const all = await dbGetAll('BulkBatches');
  return all.filter(b => b.status !== 'deleted');
}

async function getBulkBatchById(id) {
  return dbGet('BulkBatches', id);
}

async function createBulkBatch(data) {
  return dbAdd('BulkBatches', data);
}

async function updateBulkBatch(id, data) {
  return dbUpdate('BulkBatches', id, data);
}

async function deleteBulkBatch(id) {
  return dbSoftDelete('BulkBatches', id);
}

async function generateNextBulkBatchCode() {
  const all = await getAllBulkBatches();
  const numbers = all
    .map(b => (b.code && b.code.startsWith('DF-')) ? parseInt(b.code.replace('DF-', ''), 10) : 0)
    .filter(n => !isNaN(n));
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `DF-${String(next).padStart(4, '0')}`;
}

// يحسب مجاميع دفعة واحدة من بنودها — لا شيء من هذا مخزَّن، يُحسب دائمًا حيًا
function computeBulkBatchTotals(batch) {
  const purchaseLines = batch.purchaseLines || [];
  const saleLines = batch.saleLines || [];
  const expenseLines = batch.expenseLines || [];

  const totalPurchaseCount = purchaseLines.reduce((s, l) => s + Number(l.count || 0), 0);
  const totalPurchaseCost = purchaseLines.reduce((s, l) => s + Number(l.count || 0) * Number(l.unitPrice || 0), 0);
  const totalSaleCount = saleLines.reduce((s, l) => s + Number(l.count || 0), 0);
  const totalSaleRevenue = saleLines.reduce((s, l) => s + Number(l.count || 0) * Number(l.unitPrice || 0), 0);
  const totalExpenses = expenseLines.reduce((s, l) => s + Number(l.amount || 0), 0);
  const netRevenue = totalSaleRevenue - totalPurchaseCost - totalExpenses;
  const remainingCount = totalPurchaseCount - totalSaleCount;

  return { totalPurchaseCount, totalPurchaseCost, totalSaleCount, totalSaleRevenue, totalExpenses, netRevenue, remainingCount };
}

// ===== ترحيل تلقائي للمحاسبة =====
// قيد واحد "مُعاد الصياغة" لكل دفعة (نفس مبدأ syncExpenseJournalEntry) يعكس أثر بنود الشراء/البيع/المصاريف
// كلها معًا. تبسيطان معروفان مقصودان: (1) القيد بأكمله يُؤرَّخ بـ purchaseDate الدفعة، وليس بتواريخ بنود
// البيع/المصاريف الفعلية المتفرقة لاحقًا — الدفعة تُعامَل كحدث محاسبي واحد. (2) لا يوجد حقل طريقة دفع على
// مستوى الدفعة فيُفترض دومًا حساب "الصندوق" (1000) لكل الأطراف النقدية.
const BULK_CASH_ACCOUNT_CODE = '1000';
const BULK_PURCHASE_EXPENSE_ACCOUNT_CODE = '5060';
const BULK_SALE_REVENUE_ACCOUNT_CODE = '4010';
const BULK_MISC_EXPENSE_ACCOUNT_CODE = '5070';

// يُصافي مجموعة أزواج مدين/دائن إلى سطر واحد بحد أقصى لكل حساب (بدل تكرار "الصندوق" في أكثر من سطر لنفس القيد)،
// مع الحفاظ رياضيًا على توازن إجمالي المدين = إجمالي الدائن للقيد ككل
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

async function syncBulkBatchJournalEntry(batchId) {
  const batch = await getBulkBatchById(batchId);
  if (!batch) return null;

  const totals = computeBulkBatchTotals(batch);
  const accounts = await getAllAccounts();
  const cashAccount = getAccountByCode(BULK_CASH_ACCOUNT_CODE, accounts);
  const purchaseExpenseAccount = getAccountByCode(BULK_PURCHASE_EXPENSE_ACCOUNT_CODE, accounts);
  const saleRevenueAccount = getAccountByCode(BULK_SALE_REVENUE_ACCOUNT_CODE, accounts);
  const miscExpenseAccount = getAccountByCode(BULK_MISC_EXPENSE_ACCOUNT_CODE, accounts);
  if (!cashAccount || !purchaseExpenseAccount || !saleRevenueAccount || !miscExpenseAccount) return null; // دفاعي

  const pairs = [];
  if (totals.totalPurchaseCost > 0) {
    pairs.push({ accountId: purchaseExpenseAccount.id, debit: totals.totalPurchaseCost, credit: 0 });
    pairs.push({ accountId: cashAccount.id, debit: 0, credit: totals.totalPurchaseCost });
  }
  if (totals.totalSaleRevenue > 0) {
    pairs.push({ accountId: cashAccount.id, debit: totals.totalSaleRevenue, credit: 0 });
    pairs.push({ accountId: saleRevenueAccount.id, debit: 0, credit: totals.totalSaleRevenue });
  }
  if (totals.totalExpenses > 0) {
    pairs.push({ accountId: miscExpenseAccount.id, debit: totals.totalExpenses, credit: 0 });
    pairs.push({ accountId: cashAccount.id, debit: 0, credit: totals.totalExpenses });
  }
  const lines = _netJournalLinesByAccount(pairs);

  if (!lines.length) {
    if (batch.journalEntryId) {
      await deleteJournalEntry(batch.journalEntryId);
      await dbUpdate('BulkBatches', batchId, { journalEntryId: null });
    }
    return null;
  }

  const description = `دفعة شراء وبيع جماعي ${batch.code} بتاريخ ${batch.purchaseDate}`;
  const existingEntry = batch.journalEntryId ? await getJournalEntryById(batch.journalEntryId) : null;
  if (existingEntry && existingEntry.status !== 'deleted') {
    await updateJournalEntry(existingEntry.id, { date: batch.purchaseDate, description, lines });
    return existingEntry.id;
  }

  const entryNumber = await generateNextEntryNumber();
  const newEntryId = await createJournalEntry({ entryNumber, date: batch.purchaseDate, description, lines });
  await dbUpdate('BulkBatches', batchId, { journalEntryId: newEntryId });
  return newEntryId;
}

// يحذف القيد اليومية المرتبط بدفعة (يُستدعى قبل حذف الدفعة نفسها)
async function reverseBulkBatchJournalEntry(batchId) {
  const batch = await getBulkBatchById(batchId);
  if (batch && batch.journalEntryId) {
    await deleteJournalEntry(batch.journalEntryId);
  }
}
