// js/services/pregnancy-service.js
// سجل حالات الحمل لكل أنثى — status: 'pregnant'|'delivered'|'lost' (منفصل عن حقل الحذف الناعم، انظر
// getAllPregnancies أدناه). يُغذّي تنبيه "قرب الولادة" في alerts-service.js عبر expectedBirthDate لأي سجل
// لا يزال status: 'pregnant'. يتحوّل تلقائيًا إلى 'delivered' عند تسجيل ولادة فعلية لنفس الأم من
// herd/births.html (انظر resolvePregnancyOnBirth أدناه) حتى لا يبقى تنبيه "قرب الولادة" قائمًا بصمت بعد
// وقوع الولادة الفعلية — لا ربط صريح (matingRecordId) بين هذا المخزن و MatingRecords عمدًا (تبسيط: سجلا
// تلقيح/حمل مستقلان، لا تحقق آلي يربط بينهما)

async function getAllPregnancies() {
  const all = await dbGetAll('PregnancyRecords');
  return all.filter(p => p.status !== 'deleted');
}

async function getPregnanciesForAnimal(animalId) {
  const all = await getAllPregnancies();
  return all.filter(p => p.animalId === Number(animalId));
}

async function createPregnancy(data) {
  return dbAdd('PregnancyRecords', { status: 'pregnant', ...data });
}

async function updatePregnancy(id, data) {
  return dbUpdate('PregnancyRecords', id, data);
}

async function deletePregnancy(id) {
  return dbSoftDelete('PregnancyRecords', id);
}

// يُستدعى من births-page.js بعد تسجيل ولادة فعلية بنجاح — يبحث عن أحدث سجل حمل "قائم" (status: 'pregnant')
// لنفس الأم ويحوّله لـ'delivered' تلقائيًا. تخمين بسيط بأحدث سجل مفتوح لنفس الأم (لا ربط صريح بسجل بعينه)،
// كافٍ عمليًا لأن وجود أكثر من حالة حمل مفتوحة لنفس الأنثى في نفس الوقت غير وارد
async function resolvePregnancyOnBirth(motherId, birthDate) {
  if (!motherId) return;
  const openPregnancies = (await getPregnanciesForAnimal(motherId)).filter(p => p.status === 'pregnant');
  if (!openPregnancies.length) return;
  const latest = openPregnancies.sort((a, b) => (b.confirmedDate || '').localeCompare(a.confirmedDate || ''))[0];
  await updatePregnancy(latest.id, { status: 'delivered', actualBirthDate: birthDate });
}

const PREGNANCY_STATUS_LABELS = { pregnant: 'حامل', delivered: 'وضعت', lost: 'فقدان الحمل' };

// متوسط مدة حمل الأغنام/الماعز ≈ 150 يومًا — يُستخدم فقط كاقتراح أولي قابل للتعديل الكامل عند إدخال
// تاريخ الولادة المتوقع (وليس قيدًا مفروضًا)
const PREGNANCY_GESTATION_DAYS = 150;
