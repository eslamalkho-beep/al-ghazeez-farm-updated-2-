// js/services/adjustment-service.js
// التسويات المحاسبية: مصروف/إيراد مستحق، مصروف/إيراد مقدم، وفرق صندوق سريع — نفس روح custody-service.js
// (فتح ← تسوية لاحقة، كل مرحلة قيدها الخاص). لا تكرار لآليات التسوية الموجودة فعليًا في وحدات أخرى: فروقات
// الجرد (stock-count-service.js)، تسويات العهد (custody-service.js)، تسويات العملاء/الموردين
// (party-service.js → createReturnOrDiscount) — انظر accounting/adjustments.html لروابط سريعة إليها.

const ADJUSTMENT_TYPE_LABELS = {
  accruedExpense: 'مصروف مستحق',
  accruedRevenue: 'إيراد مستحق',
  prepaidExpense: 'مصروف مقدم',
  deferredRevenue: 'إيراد مقدم',
  cashDifference: 'فرق صندوق',
};

// مفتاح ربط "التسويات المحاسبية" لكل نوع استحقاق/دفع مقدم — يُستخدم كطرف ثابت في القيد الأول والتسوية معًا
// (يُحل عبر account-mapping-service.js): الإيرادات المستحقة على ذمم مدينة أخرى، المصروفات المقدمة على
// مصروفات مدفوعة مقدمًا، والمستحقات/الإيرادات المقدمة (خصوم) على مصروفات مستحقة أخرى
const ADJUSTMENT_CONTROL_MAPPING_KEY = {
  accruedExpense: 'accruedExpenseControl',
  accruedRevenue: 'accruedRevenueControl',
  prepaidExpense: 'prepaidExpenseControl',
  deferredRevenue: 'deferredRevenueControl',
};

async function getAllAdjustments() {
  const all = await dbGetAll('Adjustments');
  return all.filter(a => a.status !== 'deleted').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

async function getAdjustmentById(id) {
  if (!id) return null;
  return dbGet('Adjustments', id);
}

async function _postAdjustmentJournal({ date, description, debitAccountId, creditAccountId, value }) {
  if (!debitAccountId || !creditAccountId || !(value > 0)) return null; // دفاعي: حساب أساسي محذوف يدويًا أو قيمة صفرية
  const lines = [
    { accountId: debitAccountId, debit: value, credit: 0 },
    { accountId: creditAccountId, debit: 0, credit: value },
  ];
  const entryNumber = await generateNextEntryNumber();
  return createJournalEntry({ entryNumber, date, description, lines });
}

// ينشئ تسوية جديدة + قيدها الفوري. أنواع الاستحقاق/الدفع المقدم الأربعة تبقى status:'open' بانتظار settleAdjustment
// لاحقًا؛ 'cashDifference' يُغلَق فورًا status:'settled' (قيد واحد كافٍ، لا تسوية لاحقة له)
async function createAdjustment(data) {
  const amount = Number(data.amount || 0);
  if (!(amount > 0)) throw new Error('المبلغ غير صحيح');

  const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  const [accounts, mappings] = await Promise.all([getAllAccounts(), loadAccountMappings()]);
  const typeLabel = ADJUSTMENT_TYPE_LABELS[data.type];
  if (!typeLabel) throw new Error('نوع تسوية غير معروف');

  let debitAccount, creditAccount, status = 'open';

  if (data.type === 'accruedExpense' || data.type === 'prepaidExpense') {
    const controlAccount = getMappedAccount(ADJUSTMENT_CONTROL_MAPPING_KEY[data.type], accounts, mappings);
    if (data.type === 'accruedExpense') {
      const categoryAccount = accounts.find(a => a.id === Number(data.categoryAccountId));
      if (!categoryAccount) throw new Error('يرجى اختيار حساب المصروف');
      debitAccount = categoryAccount;
      creditAccount = controlAccount;
    } else {
      const cashAccount = getAccountByCode(data.cashAccountCode, accounts);
      if (!cashAccount) throw new Error('يرجى اختيار الصندوق أو البنك');
      debitAccount = controlAccount;
      creditAccount = cashAccount;
    }
  } else if (data.type === 'accruedRevenue' || data.type === 'deferredRevenue') {
    const controlAccount = getMappedAccount(ADJUSTMENT_CONTROL_MAPPING_KEY[data.type], accounts, mappings);
    if (data.type === 'accruedRevenue') {
      const categoryAccount = accounts.find(a => a.id === Number(data.categoryAccountId));
      if (!categoryAccount) throw new Error('يرجى اختيار حساب الإيراد');
      debitAccount = controlAccount;
      creditAccount = categoryAccount;
    } else {
      const cashAccount = getAccountByCode(data.cashAccountCode, accounts);
      if (!cashAccount) throw new Error('يرجى اختيار الصندوق أو البنك');
      debitAccount = cashAccount;
      creditAccount = controlAccount;
    }
  } else if (data.type === 'cashDifference') {
    const cashAccount = getAccountByCode(data.cashAccountCode, accounts);
    if (!cashAccount) throw new Error('يرجى اختيار الصندوق أو البنك');
    if (data.direction !== 'shortage' && data.direction !== 'overage') throw new Error('يرجى اختيار اتجاه الفرق');
    const diffAccount = getMappedAccount(
      data.direction === 'shortage' ? 'cashShortage' : 'cashOverage', accounts, mappings
    );
    debitAccount = data.direction === 'shortage' ? diffAccount : cashAccount;
    creditAccount = data.direction === 'shortage' ? cashAccount : diffAccount;
    status = 'settled';
  } else {
    throw new Error('نوع تسوية غير معروف');
  }

  const journalEntryId = await _postAdjustmentJournal({
    date: data.date,
    description: `${typeLabel}${data.description ? ' — ' + data.description : ''}`,
    debitAccountId: debitAccount?.id, creditAccountId: creditAccount?.id, value: amount,
  });
  if (!journalEntryId) throw new Error('تعذّر إنشاء القيد المحاسبي — تأكد من وجود الحسابات الأساسية اللازمة');

  return dbAdd('Adjustments', {
    type: data.type, date: data.date, amount, description: data.description || '',
    categoryAccountId: data.categoryAccountId ? Number(data.categoryAccountId) : null,
    cashAccountCode: data.cashAccountCode || null,
    direction: data.direction || null,
    status, journalEntryId,
    createdByUserId: currentUser?.id || null, createdByUserName: currentUser?.fullName || '',
  });
}

// يبني قيد التسوية المعاكس ويغلق السجل status:'settled' — غير متاحة لـ'cashDifference' (تُغلَق فورًا عند الإنشاء)
async function settleAdjustment(id, input) {
  const adjustment = await getAdjustmentById(id);
  if (!adjustment) throw new Error('التسوية غير موجودة');
  if (adjustment.type === 'cashDifference') throw new Error('فرق الصندوق يُغلَق فورًا عند التسجيل، لا حاجة لتسوية لاحقة');
  if (adjustment.status !== 'open') throw new Error('هذه التسوية مغلقة بالفعل');

  const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  const [accounts, mappings] = await Promise.all([getAllAccounts(), loadAccountMappings()]);
  const controlAccount = getMappedAccount(ADJUSTMENT_CONTROL_MAPPING_KEY[adjustment.type], accounts, mappings);

  let debitAccount, creditAccount;
  if (adjustment.type === 'accruedExpense') {
    const cashAccount = getAccountByCode(input.cashAccountCode, accounts);
    if (!cashAccount) throw new Error('يرجى اختيار الصندوق أو البنك');
    debitAccount = controlAccount; creditAccount = cashAccount;
  } else if (adjustment.type === 'accruedRevenue') {
    const cashAccount = getAccountByCode(input.cashAccountCode, accounts);
    if (!cashAccount) throw new Error('يرجى اختيار الصندوق أو البنك');
    debitAccount = cashAccount; creditAccount = controlAccount;
  } else if (adjustment.type === 'prepaidExpense') {
    const categoryAccount = accounts.find(a => a.id === Number(input.categoryAccountId));
    if (!categoryAccount) throw new Error('يرجى اختيار حساب المصروف');
    debitAccount = categoryAccount; creditAccount = controlAccount;
  } else if (adjustment.type === 'deferredRevenue') {
    const categoryAccount = accounts.find(a => a.id === Number(input.categoryAccountId));
    if (!categoryAccount) throw new Error('يرجى اختيار حساب الإيراد');
    debitAccount = controlAccount; creditAccount = categoryAccount;
  } else {
    throw new Error('نوع تسوية غير معروف');
  }

  const settledJournalEntryId = await _postAdjustmentJournal({
    date: input.date,
    description: `تسوية ${ADJUSTMENT_TYPE_LABELS[adjustment.type]}${adjustment.description ? ' — ' + adjustment.description : ''}`,
    debitAccountId: debitAccount?.id, creditAccountId: creditAccount?.id, value: Number(adjustment.amount),
  });
  if (!settledJournalEntryId) throw new Error('تعذّر إنشاء قيد التسوية — تأكد من وجود الحسابات الأساسية اللازمة');

  return dbUpdate('Adjustments', id, {
    status: 'settled', settledDate: input.date, settledJournalEntryId,
    settledByUserId: currentUser?.id || null, settledByUserName: currentUser?.fullName || '',
    // نحفظ الحساب الذي اختير وقت التسوية أيضًا (كان ناقصًا وقت الإنشاء) لعرضه لاحقًا في السجل الزمني
    categoryAccountId: input.categoryAccountId ? Number(input.categoryAccountId) : adjustment.categoryAccountId,
    cashAccountCode: input.cashAccountCode || adjustment.cashAccountCode,
  });
}

async function deleteAdjustment(id) {
  const adjustment = await getAdjustmentById(id);
  if (adjustment) {
    if (adjustment.journalEntryId) await deleteJournalEntry(adjustment.journalEntryId);
    if (adjustment.settledJournalEntryId) await deleteJournalEntry(adjustment.settledJournalEntryId);
  }
  return dbSoftDelete('Adjustments', id);
}
