// js/services/mating-service.js
// سجل تلقيح دوري لكل أنثى — منفصل عن PregnancyRecords لأن التلقيح لا يُثمر حملاً مؤكدًا دومًا؛ يُستخدم
// حاليًا كمرجع تاريخي فقط لتتبّع محاولات التلقيح (لا يُغذّي أي تنبيه تلقائي، بعكس PregnancyRecords)

async function getAllMatings() {
  const all = await dbGetAll('MatingRecords');
  return all.filter(m => m.status !== 'deleted');
}

async function getMatingsForAnimal(animalId) {
  const all = await getAllMatings();
  return all.filter(m => m.animalId === Number(animalId));
}

async function createMating(data) {
  return dbAdd('MatingRecords', data);
}

async function updateMating(id, data) {
  return dbUpdate('MatingRecords', id, data);
}

async function deleteMating(id) {
  return dbSoftDelete('MatingRecords', id);
}

const MATING_METHOD_LABELS = { natural: 'طبيعي', ai: 'تلقيح اصطناعي' };
