// js/services/accounting-service.js
// محاسبة حقيقية بقيد مزدوج: شجرة حسابات + قيود يومية. هذا الملف نفسه لا يعرف شيئًا عن المصروفات/الإيرادات/
// إلخ — الترحيل التلقائي مُنفَّذ في كل خدمة مصدر (sync*JournalEntry في expense-service.js/revenue-service.js/
// purchase-service.js/bulk-batch-service.js (شراء/بيع الجملة)، وكذلك عند اعتماد الجرد في stock-count-service.js)، وكلها تستدعي
// الدوال العامة هنا (createJournalEntry/updateJournalEntry/deleteJournalEntry/getAccountByCode...). عهد
// الموظفين (CustodyItems) لا يزال بلا ترحيل تلقائي؛ القيود اليدوية من هذه الصفحة تبقى متاحة دومًا لأي
// تسوية أو تصحيح إضافي لا يغطيه الترحيل التلقائي.

const ACCOUNT_TYPE_LABELS = {
  asset: 'أصول',
  liability: 'خصوم',
  equity: 'حقوق ملكية',
  revenue: 'إيرادات',
  expense: 'مصروفات',
};

// القائمة المالية التي يظهر فيها الحساب (حقل financialStatement في شجرة الحسابات الهرمية)
const ACCOUNT_FINANCIAL_STATEMENT_LABELS = {
  balanceSheet: 'المركز المالي',
  incomeStatement: 'قائمة الدخل',
};

// الرصيد الطبيعي لكل نوع حساب: الأصول والمصروفات مدينة الطبيعة، البقية دائنة الطبيعة
const ACCOUNT_NORMAL_BALANCE_BY_TYPE = {
  asset: 'debit',
  expense: 'debit',
  liability: 'credit',
  equity: 'credit',
  revenue: 'credit',
};

// ===== شجرة الحسابات =====

async function getAllAccounts() {
  const all = await dbGetAll('ChartOfAccounts');
  return all.filter(a => a.status !== 'deleted');
}

async function getAccountById(id) {
  if (!id) return null;
  return dbGet('ChartOfAccounts', id);
}

async function createAccount(data) {
  return dbAdd('ChartOfAccounts', data);
}

async function updateAccount(id, data) {
  return dbUpdate('ChartOfAccounts', id, data);
}

async function isAccountCodeTaken(code, excludeId = null) {
  const all = await getAllAccounts();
  return all.some(a => a.code === code && a.id !== excludeId);
}

// بحث بسيط بالكود ضمن قائمة حسابات محمَّلة مسبقًا — تستخدمها خدمات الترحيل التلقائي (مثل stock-count-service.js)
function getAccountByCode(code, allAccounts) {
  return allAccounts.find(a => a.code === code) || null;
}

// حسابات المصروفات/الإيرادات "التشغيلية" القابلة للاختيار كبند مباشرة عند تسجيل مصروف/إيراد — تحل محل
// مخزن Categories المُلغى: بدل بند منفصل يُربط اختياريًا بحساب، صار الحساب نفسه هو البند. isCategoryAccount
// تُضبط false فقط على حسابات "تحكّم" تُستخدم حصرًا من ترحيل تلقائي في وحدة أخرى (مردودات الذمم، تكلفة
// المبيعات، الإهلاك...) ولا ينبغي ظهورها كخيار يدوي؛ غيابها (undefined على حسابات قديمة/مخصصة) يُعامَل كـ true.
// مع الشجرة الهرمية صار الشرط مركّبًا: isPostable !== false يستبعد "الرؤوس" (حسابات التجميع غير القابلة
// للترحيل) حتى لا تظهر كخيار بند يدوي — البند اليدوي دومًا حساب ورقة (قابل للترحيل). accountType دومًا
// 'expense' أو 'revenue'. ⚠️ المشتريات **لا** تستخدم هذه الدالة — بنودها مقصورة على فرع "113 المخزون"
// تحديدًا، انظر getPurchaseCategoryAccounts أدناه
async function getCategoryAccounts(accountType) {
  const all = await getAllAccounts();
  return all
    .filter(a => a.type === accountType && a.isCategoryAccount !== false && a.isPostable !== false)
    .sort((a, b) => (a.code || '').localeCompare(b.code || ''));
}

// بنود "المشترى" (purchase-form-page.js) — قرار عمل نهائي من صاحب المشروع (بعد تجربة قصر البند على الأصول
// الثابتة "13" فقط، ثم توسيعه لكل حسابات type:'asset'، ثم تضييقه هنا نهائيًا): قائمة "البند" مقصورة على أوراق
// فرع **"113 المخزون"** فقط (مخزون الأعلاف/الأدوية والمستلزمات البيطرية/مواد ومستلزمات المزرعة) — لا صندوق/
// بنك/ذمم/مخزون حيواني/أصول ثابتة. كل مشترى يُرسمَل مدينًا لحساب مخزون مباشرة (رسملة كأصل مخزون، لا تحميل فوري
// كمصروف) — مستقل تمامًا عن وحدة "المخزون والمستلزمات" (`InventoryItems`/`InventoryMovements`) القائمة أصلاً؛
// هذا مسار محاسبي بحت (قيد فقط)، بلا أي ربط بكميات/أصناف تلك الوحدة (بعكس `Expenses.linkedInventoryItemId`)
async function getPurchaseCategoryAccounts() {
  const all = await getAllAccounts();
  return all
    .filter(a => a.type === 'asset' && /^113/.test(String(a.code || '')) && a.isPostable !== false)
    .sort((a, b) => (a.code || '').localeCompare(b.code || ''));
}

// حسابات "قابلة للترحيل" فقط (أوراق الشجرة) — قائمة اختيار الحساب في نموذج القيد اليدوي، حتى لا يُرحَّل
// يدويًا على حساب رأس (تجميعي). الحسابات القديمة/المخصصة بلا حقل isPostable تُعامَل قابلة للترحيل ضمنيًا
async function getPostableAccounts() {
  const all = await getAllAccounts();
  return all
    .filter(a => a.isPostable !== false)
    .sort((a, b) => (a.code || '').localeCompare(b.code || ''));
}

// هل الحساب من حسابات "إيرادات بيع الحيوانات" (411*/412*)؟ — نفس الفحص القديم على الكود الثابت 4000
// بعد تفريع بيع الحيوانات لحسابات متعددة (أمهات/كباش/حملان/تيوس/جديان): أي ورقة تحت هذين الفرعين تُظهر
// حقل اختيار الحيوان في نموذج الإيراد وتربط البيع بحيوان
function isAnimalSaleAccount(account) {
  if (!account) return false;
  return /^41[12]/.test(String(account.code || ''));
}

async function getCategoryAccountNames(accountType) {
  const accounts = await getCategoryAccounts(accountType);
  return accounts.map(a => a.name);
}

// هل لهذا الحساب حركات فعلية مرحّلة ضمن أي قيد يومية (يدوي أو تلقائي، مسودة أو مُرحَّل)؟ — تُستخدم لتنبيه
// المستخدم قبل تعديل حساب "نشط" فعليًا في السجلات المحاسبية (بعكس isAccountInUse الأشمل أدناه المستخدمة لمنع
// الحذف، والتي تشمل أيضًا وجود أبناء/ربط كبند بلا أي حركة قيد فعلية)
async function isAccountUsedInJournalEntries(accountId) {
  const entries = await getAllJournalEntries();
  return entries.some(entry => (entry.lines || []).some(line => Number(line.accountId) === Number(accountId)));
}

// يمنع حذف حساب مستخدم فعليًا: مستخدم في أي قيد يومية، أو له حسابات أبناء تحته، أو مرتبط كبند
// (categoryAccountId) في مصروف/إيراد/مشترى/تسوية — حتى لا تبقى مراجع تشير لحساب محذوف أو يتيتم أبناء
async function isAccountInUse(accountId) {
  if (await isAccountUsedInJournalEntries(accountId)) return true;

  const accounts = await getAllAccounts();
  const hasChildren = accounts.some(a => a.parentCode === (accounts.find(x => x.id === accountId) || {}).code);
  if (hasChildren) return true;

  const linkedStores = ['Expenses', 'Revenues', 'Purchases', 'Adjustments'];
  for (const store of linkedStores) {
    const linked = await dbQuery(store, r => Number(r.categoryAccountId) === Number(accountId));
    if (linked.length) return true;
  }
  return false;
}

async function deleteAccount(id) {
  return dbSoftDelete('ChartOfAccounts', id);
}

// ===== القيود اليومية =====

async function getAllJournalEntries() {
  const all = await dbGetAll('JournalEntries');
  return all.filter(e => e.status !== 'deleted');
}

async function getJournalEntryById(id) {
  if (!id) return null;
  return dbGet('JournalEntries', id);
}

async function generateNextEntryNumber() {
  const all = await getAllJournalEntries();
  const numbers = all
    .map(e => (e.entryNumber && e.entryNumber.startsWith('JE-')) ? parseInt(e.entryNumber.replace('JE-', ''), 10) : 0)
    .filter(n => !isNaN(n));
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `JE-${String(next).padStart(4, '0')}`;
}

// افتراضي 'draft' لأي قيد لا يحدد status صراحة — الترحيل التلقائي (كل sync*JournalEntry في خدمات المصادر)
// لا يرسل status إطلاقًا فيتحفّظ قيده "مسودة" بانتظار المراجعة اليدوية (لا يؤثر على أي رصيد/تقرير حتى
// يُرحَّل عبر postJournalEntry أدناه)؛ القيد اليدوي المباشر (journal-entry-form-page.js) يرسل
// status:'posted' صراحة فيترحّل فورًا كما كان دومًا. القيود القديمة بلا حقل status تُعامَل 'posted' ضمنيًا
// (انظر getPostedJournalEntries) فلا حاجة لأي migration بأثر رجعي
async function createJournalEntry(data) {
  return dbAdd('JournalEntries', { status: 'draft', ...data });
}

async function updateJournalEntry(id, data) {
  return dbUpdate('JournalEntries', id, data);
}

async function deleteJournalEntry(id) {
  return dbSoftDelete('JournalEntries', id);
}

// كل القيود عدا "مسودة" — المصدر الوحيد الصحيح لأي حساب رصيد/تقرير/تنبيه (ميزان المراجعة، دفتر الصندوق/
// البنك، تسوية البنوك، جرد الصندوق، تنبيه انخفاض الرصيد)؛ القيد المسودة لا يجب أن يؤثر على أي منها حتى
// يُرحَّل. القيود القديمة بلا status (undefined !== 'draft') تُحتسب مُرحَّلة ضمنيًا — توافق خلفي بلا migration
async function getPostedJournalEntries() {
  const all = await getAllJournalEntries();
  return all.filter(e => e.status !== 'draft');
}

// يرحّل قيدًا مسودة فيصبح مؤثرًا على الأرصدة/التقارير. بلا فحص قفل الفترات المحاسبية هنا عمدًا — نفس مبدأ
// الفصل المتّبع في هذا الملف: guardPeriodOpenForSave (period-service.js) تُستدعى من مستوى الصفحة المستدعية
async function postJournalEntry(id) {
  const entry = await getJournalEntryById(id);
  if (!entry) throw new Error('القيد غير موجود');
  const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  return updateJournalEntry(id, {
    status: 'posted',
    postedAt: new Date().toISOString(),
    postedByUserId: user ? user.id : null,
    postedByUserName: user ? user.fullName : null,
  });
}

// يعيد قيدًا مُرحَّلاً لحالة مسودة (تراجع بعد اكتشاف خطأ مثلاً) — نفس مبدأ عدم فحص قفل الفترات هنا
async function revertJournalEntryToDraft(id) {
  const entry = await getJournalEntryById(id);
  if (!entry) throw new Error('القيد غير موجود');
  return updateJournalEntry(id, { status: 'draft', postedAt: null, postedByUserId: null, postedByUserName: null });
}

// يتحقق أن إجمالي المدين = إجمالي الدائن لسطور قيد واحد (شرط الحفظ الأساسي في القيد المزدوج)
function validateJournalEntryBalance(lines) {
  const totalDebit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;
  return { isBalanced, totalDebit, totalCredit };
}

// ===== حسابات حيّة (غير مخزَّنة) — بنفس مبدأ computeBulkGroupBalances/computeItemStockLevel =====

// رصيد حساب واحد حتى تاريخ معيّن (أو حتى اليوم إن لم يُحدَّد)، بالاتجاه الطبيعي لنوعه
function computeAccountBalance(account, allEntries, asOfDate = null) {
  const relevantEntries = asOfDate ? allEntries.filter(e => e.date <= asOfDate) : allEntries;
  let totalDebit = 0, totalCredit = 0;
  relevantEntries.forEach(entry => {
    (entry.lines || []).forEach(line => {
      if (Number(line.accountId) !== Number(account.id)) return;
      totalDebit += Number(line.debit || 0);
      totalCredit += Number(line.credit || 0);
    });
  });
  const balance = account.normalBalance === 'debit' ? totalDebit - totalCredit : totalCredit - totalDebit;
  return { totalDebit, totalCredit, balance };
}

// دفتر حساب واحد: كل سطر قيد يلمس هذا الحساب مرتّبًا بالتاريخ مع رصيد جارٍ (نفس مبدأ computeAccountBalance
// لكن تفصيليًا سطرًا سطرًا لا إجماليًا فقط) — تُستخدم من دفتر الصندوق/البنك وتسوية البنوك معًا
function computeAccountLedgerRows(account, allEntries) {
  const relevantEntries = allEntries
    .filter(e => (e.lines || []).some(l => Number(l.accountId) === Number(account.id)))
    .sort((a, b) => (a.date === b.date ? a.id - b.id : (a.date < b.date ? -1 : 1)));

  const rows = [];
  relevantEntries.forEach(entry => {
    (entry.lines || []).forEach(line => {
      if (Number(line.accountId) !== Number(account.id)) return;
      const debit = Number(line.debit || 0);
      const credit = Number(line.credit || 0);
      const signedAmount = account.normalBalance === 'debit' ? debit - credit : credit - debit;
      rows.push({
        date: entry.date, entryId: entry.id, entryNumber: entry.entryNumber, description: entry.description,
        debit, credit, signedAmount,
      });
    });
  });

  let running = 0;
  return rows.map(r => { running += r.signedAmount; return { ...r, runningBalance: running }; });
}

// ميزان المراجعة: رصيد كل حساب في عمود مدين أو دائن حسب طبيعته وإشارة الرصيد
function computeTrialBalance(allAccounts, allEntries, asOfDate = null) {
  const rows = allAccounts.map(account => {
    const { balance } = computeAccountBalance(account, allEntries, asOfDate);
    const debitBalance = balance >= 0 === (account.normalBalance === 'debit') ? Math.abs(balance) : 0;
    const creditBalance = !(balance >= 0 === (account.normalBalance === 'debit')) ? Math.abs(balance) : 0;
    return { account, debitBalance, creditBalance };
  });
  const totalDebit = rows.reduce((s, r) => s + r.debitBalance, 0);
  const totalCredit = rows.reduce((s, r) => s + r.creditBalance, 0);
  return { rows, totalDebit, totalCredit };
}

// قائمة الدخل: إجمالي حسابات الإيرادات ناقص إجمالي حسابات المصروفات خلال فترة [from, to]
function computeIncomeStatement(allAccounts, allEntries, from = null, to = null) {
  const periodEntries = allEntries.filter(e => (!from || e.date >= from) && (!to || e.date <= to));
  const revenueAccounts = allAccounts.filter(a => a.type === 'revenue');
  const expenseAccounts = allAccounts.filter(a => a.type === 'expense');

  const revenueRows = revenueAccounts.map(account => ({ account, amount: computeAccountBalance(account, periodEntries).balance }));
  const expenseRows = expenseAccounts.map(account => ({ account, amount: computeAccountBalance(account, periodEntries).balance }));

  const totalRevenue = revenueRows.reduce((s, r) => s + r.amount, 0);
  const totalExpense = expenseRows.reduce((s, r) => s + r.amount, 0);
  const netIncome = totalRevenue - totalExpense;

  return { revenueRows, expenseRows, totalRevenue, totalExpense, netIncome };
}

// ===== تحويل الصندوق ↔ البنك =====
// وصلة رفيعة فوق createJournalEntry: تحويل نقدي بين حسابي "الصندوق" و"البنك" (بشكل افتراضي 11101/11102،
// وقابلان للتغيير من شاشة "ربط العمليات بالحسابات" — مفاتيح cash/bank) — قيد يومية عادي بسطرين، لا يحتاج
// مخزنًا جديدًا (يظهر تلقائيًا في سجل القيود وميزان المراجعة).
// يُوسَم وصفه بسابقة ثابتة "تحويل صندوق↔بنك:" حتى يمكن فلترته لعرض سجل التحويلات بمعزل عن باقي القيود
const CASH_BANK_TRANSFER_PREFIX = 'تحويل صندوق↔بنك:';

async function createCashBankTransfer({ date, direction, amount, notes }) {
  const [accounts, mappings] = await Promise.all([getAllAccounts(), loadAccountMappings()]);
  const cashAccount = getMappedAccount('cash', accounts, mappings);
  const bankAccount = getMappedAccount('bank', accounts, mappings);
  if (!cashAccount || !bankAccount) throw new Error('حسابا الصندوق/البنك غير موجودين في شجرة الحسابات — راجع ربط العمليات بالحسابات');

  const fromAccount = direction === 'cashToBank' ? cashAccount : bankAccount;
  const toAccount = direction === 'cashToBank' ? bankAccount : cashAccount;
  const directionLabel = direction === 'cashToBank' ? 'من الصندوق إلى البنك' : 'من البنك إلى الصندوق';

  const lines = [
    { accountId: toAccount.id, debit: Number(amount), credit: 0 },
    { accountId: fromAccount.id, debit: 0, credit: Number(amount) },
  ];
  const description = `${CASH_BANK_TRANSFER_PREFIX} ${directionLabel}${notes ? ' — ' + notes : ''}`;

  const entryNumber = await generateNextEntryNumber();
  return createJournalEntry({ entryNumber, date, description, lines });
}

// سجل التحويلات المعروض في صفحة cash-transfer.html — يُشتق من القيود الموسومة بالسابقة الثابتة أعلاه،
// وليس مخزَّنًا في مكان منفصل
async function getAllCashBankTransfers() {
  const entries = await getAllJournalEntries();
  return entries
    .filter(e => e.description && e.description.startsWith(CASH_BANK_TRANSFER_PREFIX))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

// الميزانية العمومية كما في تاريخ معيّن: أصول مقابل خصوم + حقوق ملكية (مع صافي الدخل الحيّ كـ"أرباح غير مرحّلة")
// ملاحظة: fiscal-year-service.js (إقفال السنة المالية) يُنشئ قيد إقفال حقيقي يُصفّر حسابات الإيرادات/المصروفات
// لأي سنة أُقفلت وينقل نتيجتها لحساب حقوق ملكية (32103/32101) — فلا حاجة لتعديل هذه الدالة: صافي الدخل الحيّ
// أدناه (تراكمي منذ البداية) يعود تلقائيًا يعكس نتيجة السنة الحالية غير المُقفلة فقط بمجرد وجود قيد الإقفال،
// دون أي منطق إضافي هنا
function computeBalanceSheet(allAccounts, allEntries, asOfDate) {
  const assetAccounts = allAccounts.filter(a => a.type === 'asset');
  const liabilityAccounts = allAccounts.filter(a => a.type === 'liability');
  const equityAccounts = allAccounts.filter(a => a.type === 'equity');

  const assetRows = assetAccounts.map(account => ({ account, amount: computeAccountBalance(account, allEntries, asOfDate).balance }));
  const liabilityRows = liabilityAccounts.map(account => ({ account, amount: computeAccountBalance(account, allEntries, asOfDate).balance }));
  const equityRows = equityAccounts.map(account => ({ account, amount: computeAccountBalance(account, allEntries, asOfDate).balance }));

  const { netIncome } = computeIncomeStatement(allAccounts, allEntries, null, asOfDate);

  const totalAssets = assetRows.reduce((s, r) => s + r.amount, 0);
  const totalLiabilities = liabilityRows.reduce((s, r) => s + r.amount, 0);
  const totalEquity = equityRows.reduce((s, r) => s + r.amount, 0) + netIncome;

  return { assetRows, liabilityRows, equityRows, netIncome, totalAssets, totalLiabilities, totalEquity };
}

// ===== الشجرة الهرمية (حسابات أب/فرعي) =====

// يبني خريطة الهرم من قائمة حسابات: byCode (كود → حساب)، childrenByParentCode (كود الأب → أبناء مرتبين
// بالكود)، depthByCode (عمق كل حساب بعدد أسلافه — جذور الشجرة عمقها 0). الحسابات المخصصة القديمة بلا
// parentCode تُعامَل كجذور ضمنيًا وتظهر في نهاية الشجرة
function getAccountHierarchy(accounts) {
  const byCode = new Map(accounts.map(a => [a.code, a]));

  const childrenByParentCode = new Map();
  accounts.forEach(a => {
    const key = a.parentCode || '';
    if (!childrenByParentCode.has(key)) childrenByParentCode.set(key, []);
    childrenByParentCode.get(key).push(a);
  });
  childrenByParentCode.forEach(list => list.sort((a, b) => (a.code || '').localeCompare(b.code || '')));

  const depthByCode = new Map();
  const resolveDepth = (account) => {
    if (!account) return 0;
    if (depthByCode.has(account.code)) return depthByCode.get(account.code);
    const parent = account.parentCode ? byCode.get(account.parentCode) : null;
    const depth = parent ? resolveDepth(parent) + 1 : 0;
    depthByCode.set(account.code, depth);
    return depth;
  };
  accounts.forEach(resolveDepth);

  return { byCode, childrenByParentCode, depthByCode };
}

// إجمالي مدين/دائن حساب واحد مع كل أحفاده (المباشرين وغير المباشرين) — خام بدون تحويل لاتجاه الطبيعة،
// بنفس مبدأ computeAccountBalance لكن على الشجرة الفرعية كاملة. stopAtDifferentType (اختياري) يتوقف عن
// النزول لأبناء من نوع مختلف (لجذر مختلط مثل 8 "إيرادات ومصروفات أخرى" الذي يحوي فرعي 81 مصروفات و82 إيرادات)
function computeAccountSubtreeTotals(account, hierarchy, allEntries, asOfDate = null, stopAtDifferentType = false) {
  const relevantEntries = asOfDate ? allEntries.filter(e => e.date <= asOfDate) : allEntries;
  const totalsByAccount = new Map();
  relevantEntries.forEach(entry => {
    (entry.lines || []).forEach(line => {
      const key = Number(line.accountId);
      if (!totalsByAccount.has(key)) totalsByAccount.set(key, { debit: 0, credit: 0 });
      const agg = totalsByAccount.get(key);
      agg.debit += Number(line.debit || 0);
      agg.credit += Number(line.credit || 0);
    });
  });

  const walk = (acc) => {
    let debit = 0;
    let credit = 0;
    const own = totalsByAccount.get(Number(acc.id));
    if (own) { debit += own.debit; credit += own.credit; }
    (hierarchy.childrenByParentCode.get(acc.code) || []).forEach(child => {
      if (stopAtDifferentType && child.type !== acc.type) return;
      const childTotals = walk(child);
      debit += childTotals.debit;
      credit += childTotals.credit;
    });
    return { debit, credit };
  };

  return walk(account);
}

// إجمالي مدين/دائن "خاص" بحساب واحد فقط (بلا أحفاده) — مفيد لحساب مجاميع القوائم بلا احتساب الرؤوس أكثر
// من مرة (المجاميع تُبنى من الأوراق، بينما الرؤوس تُعرض بإجمالي شجرتها الفرعية)
function computeAccountOwnTotals(account, allEntries, asOfDate = null) {
  const relevantEntries = asOfDate ? allEntries.filter(e => e.date <= asOfDate) : allEntries;
  let debit = 0;
  let credit = 0;
  relevantEntries.forEach(entry => {
    (entry.lines || []).forEach(line => {
      if (Number(line.accountId) !== Number(account.id)) return;
      debit += Number(line.debit || 0);
      credit += Number(line.credit || 0);
    });
  });
  return { debit, credit };
}
