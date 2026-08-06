// js/services/weight-service.js
// سجل وزن تاريخي لكل حيوان (تاريخ + وزن) — منحنى نمو بدل رقم وزن ثابت وحيد. نفس مبدأ التزامن في
// health-service.js: تسجيل/تعديل وزن يُحدِّث Animals.weight تلقائيًا فقط عند التأثير على "آخر" سجل وزن
// لهذا الحيوان تحديدًا (بالمقارنة بالتاريخ)، حتى يبقى عمود "الوزن" في سجل القطيع مطابقًا لآخر قراءة فعليًا

async function getAllWeightRecords() {
  const all = await dbGetAll('WeightRecords');
  return all.filter(w => w.status !== 'deleted');
}

async function getWeightRecordsForAnimal(animalId) {
  const all = await getAllWeightRecords();
  return all.filter(w => w.animalId === Number(animalId));
}

async function _getLatestWeightRecordForAnimal(animalId) {
  const siblings = await getWeightRecordsForAnimal(animalId);
  return siblings.slice().sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id)[0];
}

async function createWeightRecord(data) {
  const id = await dbAdd('WeightRecords', data);
  const latest = await _getLatestWeightRecordForAnimal(data.animalId);
  if (latest && latest.id === id) {
    await updateAnimal(data.animalId, { weight: data.weight });
  }
  return id;
}

async function updateWeightRecord(id, data) {
  const before = await dbGet('WeightRecords', id);
  const updated = await dbUpdate('WeightRecords', id, data);

  const dateChanged = before && data.date !== undefined && data.date !== before.date;
  const weightChanged = before && data.weight !== undefined && data.weight !== before.weight;

  if (before && (dateChanged || weightChanged)) {
    const latest = await _getLatestWeightRecordForAnimal(before.animalId);
    if (latest && latest.id === id) {
      await updateAnimal(before.animalId, { weight: updated.weight });
    }
  }

  return updated;
}

async function deleteWeightRecord(id) {
  const record = await dbGet('WeightRecords', id);
  const result = await dbSoftDelete('WeightRecords', id);

  if (record) {
    const latest = await _getLatestWeightRecordForAnimal(record.animalId);
    if (latest) {
      await updateAnimal(record.animalId, { weight: latest.weight });
    }
  }

  return result;
}
