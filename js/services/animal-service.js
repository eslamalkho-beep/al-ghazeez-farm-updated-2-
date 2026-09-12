// js/services/animal-service.js

async function getAllAnimals() {
  const all = await dbGetAll('Animals');
  return all.filter(a => a.status !== 'deleted');
}

async function getAnimalById(id) {
  return dbGet('Animals', id);
}

async function createAnimal(data) {
  return dbAdd('Animals', { ...data, status: data.status || 'alive' });
}

async function updateAnimal(id, data) {
  return dbUpdate('Animals', id, data);
}

async function deleteAnimal(id) {
  return dbSoftDelete('Animals', id);
}

async function isAnimalCodeTaken(code, excludeId = null) {
  const all = await getAllAnimals();
  return all.some(a => a.code === code && a.id !== excludeId);
}

// بادئة تكويد القطيع حسب النوع: الأغنام SH- والماعز GO- (بدل البادئة القديمة GZ- للجميع) — الأكواد
// القديمة GZ-xxxx تبقى كما هي، والعدّاد مستقل لكل بادئة (SH-0001 وGO-0001 يبدآن منفصلين)
const ANIMAL_CODE_PREFIX_BY_TYPE = { sheep: 'SH-', goat: 'GO-' };

async function generateNextAnimalCode(type) {
  const prefix = ANIMAL_CODE_PREFIX_BY_TYPE[type] || ANIMAL_CODE_PREFIX_BY_TYPE.sheep;
  const all = await getAllAnimals();
  const numbers = all
    .map(a => (a.code && a.code.startsWith(prefix)) ? parseInt(a.code.replace(prefix, ''), 10) : 0)
    .filter(n => !isNaN(n));
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

const ANIMAL_TYPE_LABELS = { sheep: 'غنم', goat: 'ماعز' };
const ANIMAL_GENDER_LABELS = { male: 'ذكر', female: 'أنثى' };
const ANIMAL_HEALTH_LABELS = {
  healthy: 'سليم', sick: 'مريض', underTreatment: 'تحت العلاج', quarantine: 'حجر صحي',
};
const ANIMAL_STATUS_LABELS = { alive: 'حي', dead: 'نافق', sold: 'مباع', movedToTrade: 'تحويل لمخزون التجارة' };
