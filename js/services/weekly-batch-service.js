// js/services/weekly-batch-service.js
// أرشفة أسبوعية للقيود اليومية: طبقة تجميع/أرشفة فوق القيود الموجودة فعليًا — لا تُنشئ أي قيد محاسبي جديد
// ولا تدمج القيود في قيد واحد. "إغلاق الأسبوع" يفعل شيئين فقط: (1) يرحّل أي قيد "مسودة" ضمن الفترة (نفس
// postJournalEntry في accounting-service.js، بفحص قفل الفترات لكل قيد على حدة)، ثم (2) يضع نفس رقم الأرشفة
// (weeklyBatchId) على كل قيد ضمن الفترة لم يُؤرشف من قبل. بذلك يبقى لكل قيد قيده وأثره المحاسبي المستقل (دفتر
// الصندوق/تسوية البنوك/التقارير كلها تعمل زي ما هي بلا أي تغيير)، وفي نفس الوقت تحصل على رقم مرجعي واحد
// (`batchNumber`) تؤرشف/تطبع تحته كل قيود الأسبوع دفعة واحدة. قيد أُرشف من قبل (weeklyBatchId موجود) لا يدخل
// في أي أرشفة تالية إلا بعد حذف أرشفته الحالية (deleteWeeklyBatch أدناه).

async function getAllWeeklyBatches() {
  const all = await dbGetAll('WeeklyBatches');
  return all.filter(b => b.status !== 'deleted').sort((a, b) => (b.dateTo || '').localeCompare(a.dateTo || ''));
}

async function getWeeklyBatchById(id) {
  if (!id) return null;
  return dbGet('WeeklyBatches', id);
}

async function generateNextWeeklyBatchCode() {
  const all = await getAllWeeklyBatches();
  const numbers = all
    .map(b => (b.batchNumber && b.batchNumber.startsWith('WK-')) ? parseInt(b.batchNumber.replace('WK-', ''), 10) : 0)
    .filter(n => !isNaN(n));
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `WK-${String(next).padStart(4, '0')}`;
}

// نفس منطق guardPeriodOpenForSave (period-service.js) لكن بلا Toast لكل قيد — إغلاق الأسبوع يجمّع رسالة
// تحذير واحدة في النهاية بدل مقاطعة كل قيد على حدة (بنفس مبدأ isPeriodOpenSilently في journal-entry-list-page.js)
async function _isPeriodOpenForBatch(dateStr) {
  const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  if (user && resolveRoleKey(user.role) === 'systemAdmin') return true;
  return !(await isPeriodClosed(dateStr));
}

function _sumEntryLines(entries) {
  let totalDebit = 0;
  let totalCredit = 0;
  entries.forEach(e => {
    (e.lines || []).forEach(l => {
      totalDebit += Number(l.debit || 0);
      totalCredit += Number(l.credit || 0);
    });
  });
  return { totalDebit, totalCredit };
}

// القيود غير المؤرشفة بعد ضمن فترة [dateFrom, dateTo] — تُستخدم لمعاينة الأرشفة قبل تأكيدها
async function previewWeeklyBatchRange(dateFrom, dateTo) {
  const allEntries = await getAllJournalEntries();
  return allEntries
    .filter(e => e.date >= dateFrom && e.date <= dateTo && !e.weeklyBatchId)
    .sort((a, b) => (a.date === b.date ? a.id - b.id : (a.date < b.date ? -1 : 1)));
}

// يغلق أسبوعًا (أو أي فترة مُختارة): يرحّل مسوداتها ثم يؤرشفها برقم مرجعي واحد. يرمي خطأ فقط إن لم يوجد أي
// قيد قابل للأرشفة إطلاقًا؛ القيود المحظورة بفترة مغلقة تُستثنى بصمت (تُحتسب في blockedByPeriod) وتبقى متاحة
// لأرشفة لاحقة بعد فتح الفترة
async function createWeeklyBatch({ dateFrom, dateTo, notes }) {
  if (!dateFrom || !dateTo || dateFrom > dateTo) {
    throw new Error('يرجى تحديد فترة صحيحة (من ≤ إلى)');
  }

  const candidates = await previewWeeklyBatchRange(dateFrom, dateTo);
  if (!candidates.length) {
    throw new Error('لا توجد قيود غير مؤرشفة ضمن هذه الفترة');
  }

  let postedCount = 0;
  let blockedByPeriod = 0;
  const blockedIds = new Set();
  for (const entry of candidates) {
    if (entry.status !== 'draft') continue;
    if (!(await _isPeriodOpenForBatch(entry.date))) { blockedByPeriod++; blockedIds.add(entry.id); continue; }
    await postJournalEntry(entry.id);
    postedCount++;
  }

  const toArchive = candidates.filter(e => !blockedIds.has(e.id));
  if (!toArchive.length) {
    throw new Error('تعذّرت أرشفة أي قيد ضمن هذه الفترة — كل القيود المرشّحة بفترات محاسبية مغلقة');
  }

  const { totalDebit, totalCredit } = _sumEntryLines(toArchive);
  const batchNumber = await generateNextWeeklyBatchCode();
  const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;

  const batchId = await dbAdd('WeeklyBatches', {
    batchNumber,
    dateFrom,
    dateTo,
    notes: (notes || '').trim(),
    entryIds: toArchive.map(e => e.id),
    entryCount: toArchive.length,
    totalDebit,
    totalCredit,
    createdByUserId: user ? user.id : null,
    createdByUserName: user ? user.fullName : null,
  });

  for (const entry of toArchive) {
    await dbUpdate('JournalEntries', entry.id, { weeklyBatchId: batchId });
  }

  return { batchId, batchNumber, archivedCount: toArchive.length, postedCount, blockedByPeriod };
}

// تفاصيل أرشفة واحدة + كل قيودها (مرتّبة بالتاريخ) — لعرض/طباعة/تصدير المحضر
async function getWeeklyBatchDetails(id) {
  const batch = await getWeeklyBatchById(id);
  if (!batch) return null;
  const allEntries = await getAllJournalEntries();
  const entries = allEntries
    .filter(e => Number(e.weeklyBatchId) === Number(id))
    .sort((a, b) => (a.date === b.date ? a.id - b.id : (a.date < b.date ? -1 : 1)));
  return { batch, entries };
}

// يحذف الأرشفة (حذف ناعم) ويفكّ ربط كل قيودها (weeklyBatchId) حتى تعود قابلة للأرشفة ضمن دفعة لاحقة —
// لا يمس القيود نفسها ولا آثارها المحاسبية بأي شكل
async function deleteWeeklyBatch(id) {
  const batch = await getWeeklyBatchById(id);
  if (!batch) throw new Error('الأرشفة غير موجودة');

  const allEntries = await getAllJournalEntries();
  const entries = allEntries.filter(e => Number(e.weeklyBatchId) === Number(id));
  for (const entry of entries) {
    await dbUpdate('JournalEntries', entry.id, { weeklyBatchId: null });
  }

  return dbSoftDelete('WeeklyBatches', id);
}
