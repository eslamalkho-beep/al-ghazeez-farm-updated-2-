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
// المصروفات التشغيلية، لكن بنفس طبيعة القيد: مدين حساب البند المرتبط، دائن حسب طريقة الدفع).
// الحسابات تُحل عبر "ربط العمليات بالحسابات" بتراجع تدريجي (الأكثر تحديدًا يفوز):
// دائن: حساب المورّد المخصص (partyAccount:<id>) > حساب البند لهذه الطريقة (catPayCash/Bank/Credit:<id>) > العام
// مدين: حساب المخزون المرتبط بالبند (catInventory:<id> — يُرسمَل الشراء على المخزون بدل المصروف إن حُدِّد)
// > حساب البند نفسه > purchaseFallback دفاعيًا
async function syncPurchaseJournalEntry(purchaseId) {
  const purchase = await dbGet('Purchases', purchaseId);
  if (!purchase || Number(purchase.amount) <= 0) return null;

  const [accounts, mappings] = await Promise.all([getAllAccounts(), loadAccountMappings()]);
  // البند صار حسابًا مباشرة من شجرة الحسابات (categoryAccountId) — مطابقة الاسم النصي القديم خط دفاع ثانٍ فقط
  // لسجلات سابقة لم تُرحَّل بعد (انظر _migrateCategoryToAccountIdIfNeeded في seed.js)
  const categoryAccount = (purchase.categoryAccountId && accounts.find(a => a.id === purchase.categoryAccountId))
    || accounts.find(a => a.type === 'expense' && a.name === purchase.category)
    || null;

  const inventoryKey = categoryAccount ? `catInventory:${categoryAccount.id}` : null;
  const inventoryAccount = inventoryKey ? getMappedAccount(inventoryKey, accounts, mappings) : null;
  const debitAccount = inventoryAccount || categoryAccount || getMappedAccount('purchaseFallback', accounts, mappings);

  let creditAccount = null;
  const catCashKey = categoryAccount ? `catPayCash:${categoryAccount.id}` : null;
  const catBankKey = categoryAccount ? `catPayBank:${categoryAccount.id}` : null;
  const catCreditKey = categoryAccount ? `catPayCredit:${categoryAccount.id}` : null;
  if (purchase.status === 'pending') {
    creditAccount = getMappedAccount('purchasePayPending', accounts, mappings);
  } else if (purchase.paymentMethod === 'credit') {
    const partyKey = purchase.partyId ? `partyAccount:${purchase.partyId}` : null;
    creditAccount = getMappedAccountWithFallback([partyKey, catCreditKey, 'purchasePayCredit'], accounts, mappings);
  } else if (purchase.paymentMethod === 'cash') {
    creditAccount = getMappedAccountWithFallback([catCashKey, 'purchasePayCash'], accounts, mappings);
  } else {
    creditAccount = getMappedAccountWithFallback([catBankKey, 'purchasePayBank'], accounts, mappings);
  }

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
