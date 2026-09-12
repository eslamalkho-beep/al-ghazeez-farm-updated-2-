// js/services/animal-count-service.js
// الجرد الحيواني: جلسة جرد دورية (عادة نهاية السنة المالية) لكل حيوانات القطيع الحية، مع قيمة تقديرية
// لكل حيوان وحالة (موجود/مفقود). توثيق فقط بلا أثر محاسبي (نفس مبدأ FixedAssetCounts) — قيمته التقديرية
// تُستخدم في محضر الجرد ومرجعًا لتقييم المخزون الحيواني في نهاية السنة، بلا قيد تلقائي حاليًا.
// كل سطر يُخزَّن مع لقطة من بيانات الحيوان وقت الجرد (الكود/النوع/الجنس/السلالة) حتى يبقى المحضر
// مقروءًا كاملًا حتى لو حُذف الحيوان لاحقًا.

const ANIMAL_COUNT_RESULT_LABELS = {
  present: 'موجود',
  missing: 'مفقود',
};

async function getAllAnimalCounts() {
  const all = await dbGetAll('AnimalCounts');
  return all.filter(c => c.status !== 'deleted').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

async function getAnimalCountById(id) {
  if (!id) return null;
  return dbGet('AnimalCounts', id);
}

async function createAnimalCount(data) {
  return dbAdd('AnimalCounts', data);
}

async function updateAnimalCount(id, data) {
  return dbUpdate('AnimalCounts', id, data);
}

async function deleteAnimalCount(id) {
  return dbSoftDelete('AnimalCounts', id);
}

// إجماليات جلسة جرد: عدد الموجودين/المفقودين + إجمالي القيمة التقديرية (تحتسب للموجودين فقط)
function computeAnimalCountTotals(count) {
  const lines = count?.lines || [];
  const presentLines = lines.filter(l => l.resultStatus !== 'missing');
  const missingLines = lines.filter(l => l.resultStatus === 'missing');
  return {
    totalCount: lines.length,
    presentCount: presentLines.length,
    missingCount: missingLines.length,
    totalEstimatedValue: presentLines.reduce((s, l) => s + Number(l.estimatedValue || 0), 0),
  };
}
