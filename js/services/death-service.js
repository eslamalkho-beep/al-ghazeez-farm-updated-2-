// js/services/death-service.js

async function getAllDeaths() {
  const all = await dbGetAll('DeathRecords');
  return all.filter(d => !d.isDeleted);
}

async function createDeathRecord(data) {
  const record = await dbAdd('DeathRecords', data);
  if (data.animalId) {
    await updateAnimal(data.animalId, { status: 'dead' });
  }
  return record;
}

async function updateDeathRecord(id, data) {
  return dbUpdate('DeathRecords', id, data);
}

async function deleteDeathRecord(id) {
  return dbSoftDelete('DeathRecords', id);
}

const DEATH_CAUSE_LABELS = {
  disease: 'مرض', accident: 'حادث', old_age: 'كبر سن', unknown: 'غير معروف',
};
