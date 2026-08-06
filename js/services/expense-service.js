// js/services/expense-service.js

async function getAllExpenses() {
  const all = await dbGetAll('Expenses');
  return all.filter(e => e.status !== 'deleted');
}

async function createExpense(data) {
  return dbAdd('Expenses', data);
}

async function updateExpense(id, data) {
  return dbUpdate('Expenses', id, data);
}

async function deleteExpense(id) {
  return dbSoftDelete('Expenses', id);
}

// أول نقطة ترحيل تلقائي فعلية من وحدة المصروفات للمحاسبة — قيد واحد "مُعاد الصياغة" لكل مصروف
// (يُحدَّث في مكانه عند أي تعديل، لا دورة ذمم دائنة/سداد منفصلة — تبسيط مقصود)
const EXPENSE_FALLBACK_ACCOUNT_CODE = '5080'; // مصروفات أخرى — لبند بلا ربط حساب في شاشة التكويدات
const EXPENSE_CREDIT_ACCOUNT_CODE_BY_PAYMENT = { cash: '1000', transfer: '1010', cheque: '1010' };
const EXPENSE_PAYABLE_ACCOUNT_CODE = '2000'; // ذمم دائنة — أثناء status === 'pending' (لم يُدفع بعد)

// ينشئ/يحدّث قيد يومية يعكس الحالة الحالية للمصروف (مدين حساب البند المرتبط أو "مصروفات أخرى"،
// دائن حسب طريقة الدفع أو "ذمم دائنة" إن كان بانتظار الاعتماد)، ويخزّن journalEntryId على المصروف نفسه للتتبّع
async function syncExpenseJournalEntry(expenseId) {
  const expense = await dbGet('Expenses', expenseId);
  if (!expense || Number(expense.amount) <= 0) return null;

  const [categories, accounts] = await Promise.all([getAllCategories('expense'), getAllAccounts()]);
  const category = categories.find(c => c.name === expense.category);
  const debitAccount = (category && category.linkedAccountId && accounts.find(a => a.id === category.linkedAccountId))
    || getAccountByCode(EXPENSE_FALLBACK_ACCOUNT_CODE, accounts);

  const creditCode = expense.status === 'pending'
    ? EXPENSE_PAYABLE_ACCOUNT_CODE
    : (EXPENSE_CREDIT_ACCOUNT_CODE_BY_PAYMENT[expense.paymentMethod] || EXPENSE_CREDIT_ACCOUNT_CODE_BY_PAYMENT.cash);
  const creditAccount = getAccountByCode(creditCode, accounts);

  if (!debitAccount || !creditAccount) return null; // دفاعي: حساب أساسي محذوف يدويًا من شجرة الحسابات

  const lines = [
    { accountId: debitAccount.id, debit: Number(expense.amount), credit: 0 },
    { accountId: creditAccount.id, debit: 0, credit: Number(expense.amount) },
  ];
  const description = `مصروف: ${expense.category} بتاريخ ${expense.date}`;

  const existingEntry = expense.journalEntryId ? await getJournalEntryById(expense.journalEntryId) : null;
  if (existingEntry && existingEntry.status !== 'deleted') {
    await updateJournalEntry(existingEntry.id, { date: expense.date, description, lines });
    return existingEntry.id;
  }

  const entryNumber = await generateNextEntryNumber();
  const newEntryId = await createJournalEntry({ entryNumber, date: expense.date, description, lines });
  await dbUpdate('Expenses', expenseId, { journalEntryId: newEntryId });
  return newEntryId;
}

// يحذف القيد اليومية المرتبط بمصروف (يُستدعى قبل حذف المصروف نفسه)
async function reverseExpenseJournalEntry(expenseId) {
  const expense = await dbGet('Expenses', expenseId);
  if (expense && expense.journalEntryId) {
    await deleteJournalEntry(expense.journalEntryId);
  }
}
