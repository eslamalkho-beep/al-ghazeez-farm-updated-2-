// js/services/period-service.js
// قفل الفترات المحاسبية: سجل واحد لكل شهر (periodKey: 'YYYY-MM') في مخزن AccountingPeriods — غياب سجل لشهر
// معيّن يعني أنه مفتوح ضمنًا (نفس اتفاقية "الغياب = وصول كامل" في Users.permissions). الإنفاذ الفعلي (منع
// الحفظ/الحذف) يتم على مستوى صفحات النماذج عبر guardPeriodOpenForSave أدناه — وليس داخل accounting-service.js
// نفسها، حتى لا يُكسر الترحيل التلقائي في seed.js الذي قد يرحّل قيودًا بتواريخ ماضية عند أول تشغيل بعد أي تحديث.

function getPeriodKey(dateStr) {
  return (dateStr || '').slice(0, 7);
}

// يعتمد على ARABIC_MONTHS المعرَّفة في js/utils/formatters.js — مرجع دالة عادية يُحسم وقت التشغيل، فلا يفرض
// ترتيب تحميل خاص بين period-service.js وformatters.js في وسوم <script>
function formatPeriodLabel(periodKey) {
  if (!periodKey) return '-';
  const [year, month] = periodKey.split('-');
  const monthIndex = Number(month) - 1;
  const monthLabel = (typeof ARABIC_MONTHS !== 'undefined' && ARABIC_MONTHS[monthIndex]) || month;
  return `${monthLabel} ${year}`;
}

async function getAllPeriodRecords() {
  const all = await dbGetAll('AccountingPeriods');
  return all.filter(p => p.status !== 'deleted').sort((a, b) => (b.periodKey || '').localeCompare(a.periodKey || ''));
}

async function getPeriodRecord(periodKey) {
  const all = await getAllPeriodRecords();
  return all.find(p => p.periodKey === periodKey) || null;
}

async function isPeriodClosed(dateStr) {
  const periodKey = getPeriodKey(dateStr);
  if (!periodKey) return false;
  const record = await getPeriodRecord(periodKey);
  return !!(record && record.isClosed);
}

async function closePeriod(periodKey, user) {
  const existing = await getPeriodRecord(periodKey);
  const historyEntry = { action: 'closed', at: new Date().toISOString(), byUserId: user.id, byUserName: user.fullName };

  if (existing) {
    const history = [...(existing.history || []), historyEntry];
    return dbUpdate('AccountingPeriods', existing.id, {
      isClosed: true, closedAt: historyEntry.at, closedByUserId: user.id, closedByUserName: user.fullName, history,
    });
  }

  return dbAdd('AccountingPeriods', {
    periodKey, isClosed: true, closedAt: historyEntry.at, closedByUserId: user.id, closedByUserName: user.fullName,
    history: [historyEntry],
  });
}

async function reopenPeriod(periodKey, user, reason) {
  const existing = await getPeriodRecord(periodKey);
  if (!existing) throw new Error('الفترة غير مغلقة أصلاً');

  const historyEntry = { action: 'reopened', at: new Date().toISOString(), byUserId: user.id, byUserName: user.fullName, reason };
  const history = [...(existing.history || []), historyEntry];

  return dbUpdate('AccountingPeriods', existing.id, {
    isClosed: false, reopenedAt: historyEntry.at, reopenedByUserId: user.id, reopenedByUserName: user.fullName,
    reopenReason: reason, history,
  });
}

// الدالة المُستهلَكة من صفحات النماذج قبل أي حفظ/تعديل/حذف — مدير النظام يتجاوزها دومًا (نفس مبدأ hasModuleAccess/
// hasActionPermission في auth-service.js). تعرض showToast بنفسها عند الرفض فلا حاجة لرسالة إضافية من المستدعي
async function guardPeriodOpenForSave(dateStr) {
  const user = getCurrentUser();
  if (user && resolveRoleKey(user.role) === 'systemAdmin') return true;

  const closed = await isPeriodClosed(dateStr);
  if (!closed) return true;

  showToast(
    `الفترة المحاسبية (${formatPeriodLabel(getPeriodKey(dateStr))}) مغلقة — لا يمكن إضافة أو تعديل عمليات بتاريخ ضمنها. يلزم فتح الفترة أولاً من "قفل الفترات المحاسبية" (مدير النظام فقط).`,
    'error'
  );
  return false;
}
