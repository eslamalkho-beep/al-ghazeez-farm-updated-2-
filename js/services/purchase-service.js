// js/services/purchase-service.js

async function getAllPurchases() {
  const all = await dbGetAll('Purchases');
  return all.filter(p => p.status !== 'deleted');
}

async function createPurchase(data) {
  return dbAdd('Purchases', data);
}

async function updatePurchase(id, data) {
  return dbUpdate('Purchases', id, data);
}

async function deletePurchase(id) {
  return dbSoftDelete('Purchases', id);
}

// ترحيل تلقائي من المشتريات للمحاسبة — نفس مبدأ syncExpenseJournalEntry تمامًا (وحدة منفصلة مقصودة عن
// المصروفات التشغيلية، لكن بنفس طبيعة القيد: مدين حساب البند المرتبط، دائن الصندوق/البنك حسب طريقة الدفع
// أو "ذمم دائنة" إن كان بانتظار الاعتماد)
const PURCHASE_FALLBACK_ACCOUNT_CODE = '5080'; // مصروفات أخرى — لبند بلا ربط حساب في شاشة التكويدات
const PURCHASE_CREDIT_ACCOUNT_CODE_BY_PAYMENT = { cash: '1000', transfer: '1010', cheque: '1010' };
const PURCHASE_PAYABLE_ACCOUNT_CODE = '2000'; // ذمم دائنة — أثناء status === 'pending' (لم يُدفع بعد)

async function syncPurchaseJournalEntry(purchaseId) {
  const purchase = await dbGet('Purchases', purchaseId);
  if (!purchase || Number(purchase.amount) <= 0) return null;

  const [categories, accounts] = await Promise.all([getAllCategories('purchase'), getAllAccounts()]);
  const category = categories.find(c => c.name === purchase.category);
  const debitAccount = (category && category.linkedAccountId && accounts.find(a => a.id === category.linkedAccountId))
    || getAccountByCode(PURCHASE_FALLBACK_ACCOUNT_CODE, accounts);

  const creditCode = purchase.status === 'pending'
    ? PURCHASE_PAYABLE_ACCOUNT_CODE
    : (PURCHASE_CREDIT_ACCOUNT_CODE_BY_PAYMENT[purchase.paymentMethod] || PURCHASE_CREDIT_ACCOUNT_CODE_BY_PAYMENT.cash);
  const creditAccount = getAccountByCode(creditCode, accounts);

  if (!debitAccount || !creditAccount) return null; // دفاعي: حساب أساسي محذوف يدويًا من شجرة الحسابات

  const lines = [
    { accountId: debitAccount.id, debit: Number(purchase.amount), credit: 0 },
    { accountId: creditAccount.id, debit: 0, credit: Number(purchase.amount) },
  ];
  const description = `مشترى: ${purchase.category} بتاريخ ${purchase.date}`;

  const existingEntry = purchase.journalEntryId ? await getJournalEntryById(purchase.journalEntryId) : null;
  if (existingEntry && existingEntry.status !== 'deleted') {
    await updateJournalEntry(existingEntry.id, { date: purchase.date, description, lines });
    return existingEntry.id;
  }

  const entryNumber = await generateNextEntryNumber();
  const newEntryId = await createJournalEntry({ entryNumber, date: purchase.date, description, lines });
  await dbUpdate('Purchases', purchaseId, { journalEntryId: newEntryId });
  return newEntryId;
}

// يحذف القيد اليومية المرتبط بمشترى (يُستدعى قبل حذف المشترى نفسه)
async function reversePurchaseJournalEntry(purchaseId) {
  const purchase = await dbGet('Purchases', purchaseId);
  if (purchase && purchase.journalEntryId) {
    await deleteJournalEntry(purchase.journalEntryId);
  }
}
