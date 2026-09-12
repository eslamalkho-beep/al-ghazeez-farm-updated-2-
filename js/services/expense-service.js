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

// إجمالي المصروفات المربوطة مباشرة بحيوان بعينه (Expenses.linkedAnimalId) — تكلفة فردية مباشرة (علاج، دواء
// خاص، أو أي تكلفة أخرى غير مشتركة مع باقي القطيع) بمعزل تام عن السجل الصحي (HealthRecords.cost) وعن أي
// دفعة تسمين (linkedFatteningBatchId، تكلفة مشتركة موزَّعة لا فردية) — انظر Expenses.linkedAnimalId في CLAUDE.md.
// from/to اختياريان لحصر الفترة (مستخدمة من fattening-service.js لحصر فترة تواجد الحيوان بدفعة معيّنة)
function getAnimalLinkedExpensesTotal(animalId, expenses, { from, to } = {}) {
  return (expenses || [])
    .filter(e => e.status !== 'deleted' && Number(e.linkedAnimalId) === Number(animalId)
      && (!from || e.date >= from) && (!to || e.date <= to))
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
}

// أول نقطة ترحيل تلقائي فعلية من وحدة المصروفات للمحاسبة — قيد واحد "مُعاد الصياغة" لكل مصروف
// (يُحدَّث في مكانه عند أي تعديل، لا دورة ذمم دائنة/سداد منفصلة — تبسيط مقصود)
// الحسابات تُحل عبر "ربط العمليات بالحسابات" (account-mapping-service.js): cash/bank لطرق الدفع،
// apControl للمصروف المعلّق بانتظار الاعتماد، expenseFallback دفاعيًا لسجل بلا categoryAccountId
async function syncExpenseJournalEntry(expenseId) {
  const expense = await dbGet('Expenses', expenseId);
  if (!expense || Number(expense.amount) <= 0) return null;

  const [accounts, mappings] = await Promise.all([getAllAccounts(), loadAccountMappings()]);
  // البند صار حسابًا مباشرة من شجرة الحسابات (categoryAccountId) — مطابقة الاسم النصي القديم خط دفاع ثانٍ فقط
  // لسجلات سابقة لم تُرحَّل بعد (انظر _migrateCategoryToAccountIdIfNeeded في seed.js)
  const categoryAccount = (expense.categoryAccountId && accounts.find(a => a.id === expense.categoryAccountId))
    || accounts.find(a => a.type === 'expense' && a.name === expense.category)
    || null;
  const debitAccount = categoryAccount || getMappedAccount('expenseFallback', accounts, mappings);

  // دائن بتراجع تدريجي: حساب البند لهذه الطريقة (catPayCash/Bank:<id>) > العام
  let creditAccount = null;
  const catCashKey = categoryAccount ? `catPayCash:${categoryAccount.id}` : null;
  const catBankKey = categoryAccount ? `catPayBank:${categoryAccount.id}` : null;
  if (expense.status === 'pending') {
    creditAccount = getMappedAccount('expensePayPending', accounts, mappings);
  } else if (expense.paymentMethod === 'cash') {
    creditAccount = getMappedAccountWithFallback([catCashKey, 'expensePayCash'], accounts, mappings);
  } else {
    creditAccount = getMappedAccountWithFallback([catBankKey, 'expensePayBank'], accounts, mappings);
  }

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
