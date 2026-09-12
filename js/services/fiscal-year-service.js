// js/services/fiscal-year-service.js
// إقفال السنة المالية: قيد إقفال حقيقي يُصفّر كل حسابات الإيرادات والمصروفات لسنة ميلادية كاملة (YYYY-01-01 ←
// YYYY-12-31) وينقل صافي الربح/الخسارة إلى حساب حقوق ملكية — لا "نسخ"/"ترحيل" فعلي لبيانات القطيع/المخزون/
// الذمم/العهد (تبقى في نفس دفتر الأستاذ المستمر برصيدها الحالي كما هي، بلا أي أثر لهذه الميزة عليها؛ فقط
// حسابات الإيرادات والمصروفات — وهي ما يُقفل تقليديًا في نهاية كل سنة مالية — تتأثر).
//
// آلية الأرباح ثلاثية المستوى (مبنية أصلاً في شجرة الحسابات، seed.js): 32103 "صافي ربح السنة الحالية" يستقبل
// نتيجة كل إقفال سنوي على حدة؛ عند إقفال سنة جديدة يُنقَل أولاً أي رصيد سابق متبقٍ في 32103 (نتيجة إقفال سنة
// أقدم لم تُنقَل بعد) إلى 32101 "أرباح سنوات سابقة" بقيد ترحيل مستقل (مؤرَّخ أول يوم في السنة الجديدة)، ثم
// يُنشأ قيد الإقفال الفعلي لهذه السنة على 32103 من جديد. بهذا يبقى 32103 دومًا يعكس نتيجة "آخر سنة أُقفلت فقط"
// و32101 يتراكم نتائج كل ما قبلها — دون أي حاجة لتعديل computeBalanceSheet/computeIncomeStatement الحيّتين في
// accounting-service.js: بعد الإقفال تُصفَّر حسابات الإيرادات/المصروفات ضمن السنة المُقفلة (لأن قيد الإقفال
// يحمل سطورًا معاكسة بنفس المبلغ)، فيستمر صافي الدخل الحيّ المحسوب هناك (تراكمي منذ البداية) بعرض نتيجة السنة
// غير المُقفلة الحالية فقط تلقائيًا — بلا أي منطق إضافي.
//
// الإقفال/إعادة الفتح إلزاميًا بالترتيب الزمني (سنة تلو الأخرى) لتفادي تضارب سلسلة 32101↔32103 — نفس مبدأ
// "لا تكديس" المتّبع في نوافذ التطبيق، هنا على مستوى تسلسل السنوات. مقصور بالكامل على مدير النظام
// (resolveRoleKey(role) === 'systemAdmin')، نفس مبدأ period-lock.html.

const FISCAL_YEAR_ACCOUNT_CODES = {
  currentYear: '32103', // صافي ربح السنة الحالية
  priorYears: '32101', // أرباح سنوات سابقة
};

const FISCAL_YEAR_CLOSING_PREFIX = 'إقفال سنة مالية:';
const FISCAL_YEAR_APPROPRIATION_PREFIX = 'ترحيل نتيجة سنة سابقة:';

async function getAllFiscalYearRecords() {
  const all = await dbGetAll('FiscalYears');
  return all.filter(y => y.status !== 'deleted').sort((a, b) => (b.yearKey || '').localeCompare(a.yearKey || ''));
}

async function getFiscalYearRecord(yearKey) {
  const all = await getAllFiscalYearRecords();
  return all.find(y => y.yearKey === String(yearKey)) || null;
}

async function isFiscalYearClosed(yearKey) {
  const record = await getFiscalYearRecord(yearKey);
  return !!(record && record.isClosed);
}

function _yearBounds(yearKey) {
  return { from: `${yearKey}-01-01`, to: `${yearKey}-12-31` };
}

// يبني سطر القيد الذي "يُصفّر" رصيد حساب إيراد/مصروف واحد (على الجهة المعاكسة لطبيعته)، أو null إن كان
// رصيده صفرًا أصلاً خلال السنة (لا داعي لسطر بمبلغ صفري في القيد)
function _zeroingLine(account, balance) {
  if (!account || Math.abs(balance) < 0.01) return null;
  const amount = Math.abs(balance);
  const debitsAccount = account.normalBalance === 'credit' ? balance > 0 : balance < 0;
  return debitsAccount
    ? { accountId: account.id, debit: amount, credit: 0 }
    : { accountId: account.id, debit: 0, credit: amount };
}

// فحص ترتيب الإقفال الزمني: لا يمكن إقفال سنة والسنة السابقة لها (إن كان لها سجل) لم تُقفل بعد، ولا إقفال
// سنة بعد إقفال سنة لاحقة لها فعليًا (بالاعتماد فقط على السجلات الموجودة — سنة بلا سجل إطلاقًا لا تُعامَل
// "مفتوحة" مانعة، حتى لا يُفرَض إقفال كل التاريخ القديم قبل أول استخدام لهذه الميزة)
function _validateCloseOrder(yearKey, records) {
  const existing = records.find(r => r.yearKey === String(yearKey));
  if (existing && existing.isClosed) return `السنة المالية ${yearKey} مغلقة بالفعل`;

  const prevRecord = records.find(r => r.yearKey === String(Number(yearKey) - 1));
  if (prevRecord && !prevRecord.isClosed) {
    return `يجب إقفال السنة المالية ${prevRecord.yearKey} أولاً (الإقفال يكون بالترتيب الزمني)`;
  }

  const laterClosed = records.filter(r => Number(r.yearKey) > Number(yearKey) && r.isClosed);
  if (laterClosed.length) {
    return `لا يمكن إقفال هذه السنة لأن سنة لاحقة (${laterClosed[0].yearKey}) مغلقة بالفعل`;
  }
  return null;
}

// معاينة إقفال سنة قبل تأكيدها — بلا أي كتابة. يعيد استخدام computeIncomeStatement نفسها الموجودة أصلاً في
// accounting-service.js (نفس الأرقام الظاهرة في قائمة الدخل/الميزانية) حتى تبقى نتيجة الإقفال متطابقة تمامًا
// مع ما يعرضه التطبيق أصلاً لهذه السنة
async function computeFiscalYearClosingPreview(yearKey) {
  yearKey = String(yearKey);
  const records = await getAllFiscalYearRecords();
  const blocker = _validateCloseOrder(yearKey, records);

  // سنة مغلقة بالفعل: قيد إقفالها نفسه (مؤرَّخ داخل حدود نفس السنة) يُصفّر إيراداتها/مصروفاتها في أي حساب حيّ
  // لاحق — نعرض الأرقام المحفوظة وقت الإقفال بدل إعادة حساب مضلِّلة تشمل قيد الإقفال ذاته فتظهر صفرًا
  const existing = records.find(r => r.yearKey === yearKey);
  if (existing && existing.isClosed) {
    return {
      yearKey, ..._yearBounds(yearKey),
      totalRevenue: existing.totalRevenue || 0, totalExpense: existing.totalExpense || 0, netIncome: existing.netIncome || 0,
      revenueRows: [], expenseRows: [], hasMovements: false, appropriationAmount: 0, missingAccounts: false, blocker,
    };
  }

  const [accounts, allPostedEntries] = await Promise.all([getAllAccounts(), getPostedJournalEntries()]);
  const { from, to } = _yearBounds(yearKey);
  const yearEntries = allPostedEntries.filter(e => e.date >= from && e.date <= to);

  const { revenueRows, expenseRows, totalRevenue, totalExpense, netIncome } = computeIncomeStatement(accounts, yearEntries);
  const nonZeroRevenueRows = revenueRows.filter(r => Math.abs(r.amount) >= 0.01);
  const nonZeroExpenseRows = expenseRows.filter(r => Math.abs(r.amount) >= 0.01);

  const priorYearsAccount = getAccountByCode(FISCAL_YEAR_ACCOUNT_CODES.priorYears, accounts);
  const currentYearAccount = getAccountByCode(FISCAL_YEAR_ACCOUNT_CODES.currentYear, accounts);
  const missingAccounts = !priorYearsAccount || !currentYearAccount;

  const entriesBeforeYear = allPostedEntries.filter(e => e.date < from);
  const priorBalance = currentYearAccount ? computeAccountBalance(currentYearAccount, entriesBeforeYear).balance : 0;
  const appropriationAmount = Math.abs(priorBalance) >= 0.01 ? Math.abs(priorBalance) : 0;

  return {
    yearKey: String(yearKey), from, to,
    totalRevenue, totalExpense, netIncome,
    revenueRows: nonZeroRevenueRows, expenseRows: nonZeroExpenseRows,
    hasMovements: nonZeroRevenueRows.length > 0 || nonZeroExpenseRows.length > 0,
    appropriationAmount, missingAccounts, blocker,
  };
}

// ينفّذ الإقفال الفعلي: (1) يرحّل أي رصيد سابق متبقٍ في 32103 إلى 32101 بقيد مستقل، (2) يُنشئ قيد الإقفال
// (يُصفّر كل حسابات الإيرادات/المصروفات لهذه السنة، والفرق إلى 32103)، (3) يقفل الأشهر الاثني عشر للسنة تلقائيًا
// (period-service.js) حتى لا تُضاف/تُعدَّل عمليات بتاريخ ضمنها لاحقًا بلا صلاحية مدير النظام
async function closeFiscalYear(yearKey, user) {
  yearKey = String(yearKey);
  if (!/^\d{4}$/.test(yearKey)) throw new Error('سنة غير صحيحة');

  const preview = await computeFiscalYearClosingPreview(yearKey);
  if (preview.blocker) throw new Error(preview.blocker);
  if (preview.missingAccounts) {
    throw new Error('حسابا "أرباح سنوات سابقة" (32101) و"صافي ربح السنة الحالية" (32103) مطلوبان في شجرة الحسابات لإتمام الإقفال');
  }
  if (!preview.hasMovements) throw new Error('لا توجد أي حركات إيرادات أو مصروفات مرحّلة ضمن هذه السنة لإقفالها');

  const accounts = await getAllAccounts();
  const currentYearAccount = getAccountByCode(FISCAL_YEAR_ACCOUNT_CODES.currentYear, accounts);
  const priorYearsAccount = getAccountByCode(FISCAL_YEAR_ACCOUNT_CODES.priorYears, accounts);
  const nowIso = new Date().toISOString();

  let appropriationJournalEntryId = null;
  if (preview.appropriationAmount > 0) {
    const entriesBeforeYear = (await getPostedJournalEntries()).filter(e => e.date < preview.from);
    const priorBalance = computeAccountBalance(currentYearAccount, entriesBeforeYear).balance;
    const amount = Math.abs(priorBalance);
    const lines = priorBalance > 0
      ? [{ accountId: currentYearAccount.id, debit: amount, credit: 0 }, { accountId: priorYearsAccount.id, debit: 0, credit: amount }]
      : [{ accountId: priorYearsAccount.id, debit: amount, credit: 0 }, { accountId: currentYearAccount.id, debit: 0, credit: amount }];

    appropriationJournalEntryId = await createJournalEntry({
      entryNumber: await generateNextEntryNumber(),
      date: preview.from,
      description: `${FISCAL_YEAR_APPROPRIATION_PREFIX} ترحيل نتيجة السنوات السابقة إلى الأرباح المتراكمة (قبل إقفال سنة ${yearKey})`,
      lines, status: 'posted', postedAt: nowIso, postedByUserId: user?.id || null, postedByUserName: user?.fullName || '',
    });
  }

  const closingLines = [];
  preview.revenueRows.forEach(r => { const l = _zeroingLine(r.account, r.amount); if (l) closingLines.push(l); });
  preview.expenseRows.forEach(r => { const l = _zeroingLine(r.account, r.amount); if (l) closingLines.push(l); });

  if (Math.abs(preview.netIncome) >= 0.01) {
    closingLines.push(preview.netIncome > 0
      ? { accountId: currentYearAccount.id, debit: 0, credit: preview.netIncome }
      : { accountId: currentYearAccount.id, debit: Math.abs(preview.netIncome), credit: 0 });
  }

  const { isBalanced } = validateJournalEntryBalance(closingLines);
  if (!isBalanced) throw new Error('تعذّر بناء قيد إقفال متوازن — راجع شجرة الحسابات');

  const closingJournalEntryId = await createJournalEntry({
    entryNumber: await generateNextEntryNumber(),
    date: preview.to,
    description: `${FISCAL_YEAR_CLOSING_PREFIX} ${yearKey} (صافي ${preview.netIncome >= 0 ? 'ربح' : 'خسارة'} ${formatCurrency(Math.abs(preview.netIncome))})`,
    lines: closingLines, status: 'posted', postedAt: nowIso, postedByUserId: user?.id || null, postedByUserName: user?.fullName || '',
  });

  let monthsClosed = 0;
  for (let m = 1; m <= 12; m++) {
    const periodKey = `${yearKey}-${String(m).padStart(2, '0')}`;
    const periodRecord = await getPeriodRecord(periodKey);
    if (periodRecord && periodRecord.isClosed) continue;
    await closePeriod(periodKey, user);
    monthsClosed++;
  }

  const existingRecord = await getFiscalYearRecord(yearKey);
  const historyEntry = { action: 'closed', at: nowIso, byUserId: user?.id || null, byUserName: user?.fullName || '' };
  const payload = {
    isClosed: true, closedAt: nowIso, closedByUserId: user?.id || null, closedByUserName: user?.fullName || '',
    closingJournalEntryId, appropriationJournalEntryId,
    totalRevenue: preview.totalRevenue, totalExpense: preview.totalExpense, netIncome: preview.netIncome,
  };

  if (existingRecord) {
    payload.history = [...(existingRecord.history || []), historyEntry];
    await dbUpdate('FiscalYears', existingRecord.id, payload);
  } else {
    payload.yearKey = yearKey;
    payload.history = [historyEntry];
    await dbAdd('FiscalYears', payload);
  }

  return {
    netIncome: preview.netIncome, totalRevenue: preview.totalRevenue, totalExpense: preview.totalExpense,
    closingJournalEntryId, appropriationJournalEntryId, monthsClosed,
  };
}

// يعكس إقفال سنة: يحذف قيدي الإقفال/الترحيل (حذف ناعم، فيخرجان من كل الأرصدة/التقارير فورًا) ويعيد فتح
// أشهرها الاثني عشر. مقصور على أحدث سنة مغلقة (بالترتيب الزمني العكسي) لنفس سبب _validateCloseOrder أعلاه
async function reopenFiscalYear(yearKey, user, reason) {
  yearKey = String(yearKey);
  const records = await getAllFiscalYearRecords();
  const record = records.find(r => r.yearKey === yearKey);
  if (!record || !record.isClosed) throw new Error('هذه السنة المالية غير مغلقة أصلاً');

  const laterClosed = records
    .filter(r => Number(r.yearKey) > Number(yearKey) && r.isClosed)
    .sort((a, b) => Number(a.yearKey) - Number(b.yearKey));
  if (laterClosed.length) {
    throw new Error(`يجب إعادة فتح السنة المالية ${laterClosed[0].yearKey} أولاً (إعادة الفتح بالترتيب الزمني العكسي)`);
  }

  if (record.closingJournalEntryId) await deleteJournalEntry(record.closingJournalEntryId);
  if (record.appropriationJournalEntryId) await deleteJournalEntry(record.appropriationJournalEntryId);

  for (let m = 1; m <= 12; m++) {
    const periodKey = `${yearKey}-${String(m).padStart(2, '0')}`;
    const periodRecord = await getPeriodRecord(periodKey);
    if (periodRecord && periodRecord.isClosed) {
      await reopenPeriod(periodKey, user, reason || `إعادة فتح السنة المالية ${yearKey}`);
    }
  }

  const historyEntry = { action: 'reopened', at: new Date().toISOString(), byUserId: user?.id || null, byUserName: user?.fullName || '', reason };
  return dbUpdate('FiscalYears', record.id, {
    isClosed: false, reopenedAt: historyEntry.at, reopenedByUserId: user?.id || null, reopenedByUserName: user?.fullName || '',
    reopenReason: reason, closingJournalEntryId: null, appropriationJournalEntryId: null,
    history: [...(record.history || []), historyEntry],
  });
}
