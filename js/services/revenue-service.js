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
// دائن حساب البند المرتبط أو "إيرادات أخرى" إن لم يُربط بحساب من شاشة التكويدات)
const REVENUE_FALLBACK_ACCOUNT_CODE = '4020'; // إيرادات أخرى — لبند بلا ربط حساب في شاشة التكويدات
const REVENUE_DEBIT_ACCOUNT_CODE_BY_METHOD = { cash: '1000', transfer: '1010' };

async function syncRevenueJournalEntry(revenueId) {
  const revenue = await dbGet('Revenues', revenueId);
  if (!revenue || Number(revenue.amount) <= 0) return null;

  const [categories, accounts] = await Promise.all([getAllCategories('revenue'), getAllAccounts()]);
  const category = categories.find(c => c.name === revenue.category);
  const creditAccount = (category && category.linkedAccountId && accounts.find(a => a.id === category.linkedAccountId))
    || getAccountByCode(REVENUE_FALLBACK_ACCOUNT_CODE, accounts);

  const debitCode = REVENUE_DEBIT_ACCOUNT_CODE_BY_METHOD[revenue.receiveMethod] || REVENUE_DEBIT_ACCOUNT_CODE_BY_METHOD.cash;
  const debitAccount = getAccountByCode(debitCode, accounts);

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
