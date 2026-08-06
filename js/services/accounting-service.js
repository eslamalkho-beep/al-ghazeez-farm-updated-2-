// js/services/accounting-service.js
// محاسبة حقيقية بقيد مزدوج: شجرة حسابات + قيود يومية. هذا الملف نفسه لا يعرف شيئًا عن المصروفات/الإيرادات/
// إلخ — الترحيل التلقائي مُنفَّذ في كل خدمة مصدر (sync*JournalEntry في expense-service.js/revenue-service.js/
// purchase-service.js/bulk-batch-service.js، وكذلك عند اعتماد الجرد في stock-count-service.js)، وكلها تستدعي
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

// يمنع حذف حساب مستخدم فعليًا في أي قيد يومية (حتى لا تبقى قيود تشير لحساب محذوف)
async function isAccountInUse(accountId) {
  const entries = await getAllJournalEntries();
  return entries.some(entry => (entry.lines || []).some(line => Number(line.accountId) === Number(accountId)));
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

async function createJournalEntry(data) {
  return dbAdd('JournalEntries', data);
}

async function updateJournalEntry(id, data) {
  return dbUpdate('JournalEntries', id, data);
}

async function deleteJournalEntry(id) {
  return dbSoftDelete('JournalEntries', id);
}

// يتحقق أن إجمالي المدين = إجمالي الدائن لسطور قيد واحد (شرط الحفظ الأساسي في القيد المزدوج)
function validateJournalEntryBalance(lines) {
  const totalDebit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;
  return { isBalanced, totalDebit, totalCredit };
}

// ===== حسابات حيّة (غير مخزَّنة) — بنفس مبدأ computeBulkBatchTotals/computeItemStockLevel =====

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

// الميزانية العمومية كما في تاريخ معيّن: أصول مقابل خصوم + حقوق ملكية (مع صافي الدخل التراكمي كـ"أرباح غير مرحّلة")
// تبسيط معروف: لا يوجد إجراء إقفال فترة رسمي في هذا النظام، فصافي الدخل يُحسب حيًا حتى asOfDate بدل أن يُرحَّل فعليًا لحساب رأس المال
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
