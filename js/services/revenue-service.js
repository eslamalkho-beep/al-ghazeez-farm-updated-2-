// js/services/revenue-service.js

async function getAllRevenues() {
  const all = await dbGetAll('Revenues');
  return all.filter(r => r.status !== 'deleted');
}

async function createRevenue(data) {
  return dbAdd('Revenues', data);
}

async function updateRevenue(id, data) {
  return dbUpdate('Revenues', id, data);
}

async function deleteRevenue(id) {
  return dbSoftDelete('Revenues', id);
}

// ترحيل تلقائي من الإيرادات للمحاسبة — بنفس مبدأ syncExpenseJournalEntry في expense-service.js:
// قيد واحد "مُعاد الصياغة" لكل إيراد، يُحدَّث في مكانه عند أي تعديل (مدين الصندوق/البنك حسب طريقة التحصيل،
// دائن حساب البند المرتبط أو "إيرادات أخرى" إن لم يُربط بحساب من شاشة التكويدات).
// الحسابات تُحل عبر "ربط العمليات بالحسابات": cash/bank/arControl لطرق التحصيل، revenueFallback دفاعيًا.
// 'credit' (آجل): البيع لم يُحصَّل بعد — يدين "العملاء والذمم المدينة" بدل الصندوق/البنك مباشرة؛ يتطلب دومًا
// partyId (يُفرَض في revenue-form-page.js). يُسوّى لاحقًا عبر سند تحصيل (createCollection في party-service.js)
// الذي يُنشئ قيدًا منفصلاً بلا لمس هذا القيد الأصلي — نفس مبدأ عدم إعادة كتابة قيد الإصدار عند تسوية عهدة
async function syncRevenueJournalEntry(revenueId) {
  const revenue = await dbGet('Revenues', revenueId);
  if (!revenue || Number(revenue.amount) <= 0) return null;

  const [accounts, mappings] = await Promise.all([getAllAccounts(), loadAccountMappings()]);
  // البند صار حسابًا مباشرة من شجرة الحسابات (categoryAccountId) — مطابقة الاسم النصي القديم خط دفاع ثانٍ فقط
  // لسجلات سابقة لم تُرحَّل بعد (انظر _migrateCategoryToAccountIdIfNeeded في seed.js)
  const categoryAccount = (revenue.categoryAccountId && accounts.find(a => a.id === revenue.categoryAccountId))
    || accounts.find(a => a.type === 'revenue' && a.name === revenue.category)
    || null;
  const creditAccount = categoryAccount || getMappedAccount('revenueFallback', accounts, mappings);

  // مدين بتراجع تدريجي: حساب العميل المخصص (partyAccount:<id>) > حساب البند لهذه الطريقة
  // (catReceiveCash/Bank/Credit:<id> — يمكن ربط مبيعات سوق مثلاً بحساب "العملاء - السوق") > العام
  let debitAccount = null;
  const catCashKey = categoryAccount ? `catReceiveCash:${categoryAccount.id}` : null;
  const catBankKey = categoryAccount ? `catReceiveBank:${categoryAccount.id}` : null;
  const catCreditKey = categoryAccount ? `catReceiveCredit:${categoryAccount.id}` : null;
  if (revenue.receiveMethod === 'credit') {
    const partyKey = revenue.partyId ? `partyAccount:${revenue.partyId}` : null;
    debitAccount = getMappedAccountWithFallback([partyKey, catCreditKey, 'revenueReceiveCredit'], accounts, mappings);
  } else if (revenue.receiveMethod === 'cash') {
    debitAccount = getMappedAccountWithFallback([catCashKey, 'revenueReceiveCash'], accounts, mappings);
  } else {
    debitAccount = getMappedAccountWithFallback([catBankKey, 'revenueReceiveBank'], accounts, mappings);
  }

  if (!debitAccount || !creditAccount) return null; // دفاعي: حساب أساسي محذوف يدويًا من شجرة الحسابات

  const lines = [
    { accountId: debitAccount.id, debit: Number(revenue.amount), credit: 0 },
    { accountId: creditAccount.id, debit: 0, credit: Number(revenue.amount) },
  ];
  const description = `إيراد: ${revenue.category} بتاريخ ${revenue.date}`;

  const existingEntry = revenue.journalEntryId ? await getJournalEntryById(revenue.journalEntryId) : null;
  if (existingEntry && existingEntry.status !== 'deleted') {
    await updateJournalEntry(existingEntry.id, { date: revenue.date, description, lines });
    return existingEntry.id;
  }

  const entryNumber = await generateNextEntryNumber();
  const newEntryId = await createJournalEntry({ entryNumber, date: revenue.date, description, lines });
  await dbUpdate('Revenues', revenueId, { journalEntryId: newEntryId });
  return newEntryId;
}

// يحذف القيد اليومية المرتبط بإيراد (يُستدعى قبل حذف الإيراد نفسه)
async function reverseRevenueJournalEntry(revenueId) {
  const revenue = await dbGet('Revenues', revenueId);
  if (revenue && revenue.journalEntryId) {
    await deleteJournalEntry(revenue.journalEntryId);
  }
}
