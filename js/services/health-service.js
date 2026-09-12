// js/services/health-service.js

async function getAllHealthRecords() {
  const all = await dbGetAll('HealthRecords');
  return all.filter(h => !h.isDeleted);
}

async function getHealthRecordsForAnimal(animalId) {
  const all = await getAllHealthRecords();
  return all.filter(h => h.animalId === Number(animalId));
}

async function _getLatestHealthRecordForAnimal(animalId) {
  const siblings = await getHealthRecordsForAnimal(animalId);
  return siblings.slice().sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id)[0];
}

async function createHealthRecord(data) {
  const id = await dbAdd('HealthRecords', data);
  if (data.resultingHealthStatus) {
    const latest = await _getLatestHealthRecordForAnimal(data.animalId);
    const animal = await getAnimalById(data.animalId);

    if (latest && latest.id === id && animal && animal.status === 'alive') {
      await updateAnimal(data.animalId, { healthStatus: data.resultingHealthStatus });
    }
  }
  return id;
}

async function updateHealthRecord(id, data) {
  const before = await dbGet('HealthRecords', id);
  const updated = await dbUpdate('HealthRecords', id, data);

  const dateChanged = before && data.date !== undefined && data.date !== before.date;
  const statusChanged = before && data.resultingHealthStatus !== undefined && data.resultingHealthStatus !== before.resultingHealthStatus;

  if (before && (dateChanged || statusChanged)) {
    const latest = await _getLatestHealthRecordForAnimal(before.animalId);
    const animal = await getAnimalById(before.animalId);

    if (latest && latest.id === id && latest.resultingHealthStatus && animal && animal.status === 'alive') {
      await updateAnimal(before.animalId, { healthStatus: latest.resultingHealthStatus });
    }
  }

  return updated;
}

async function deleteHealthRecord(id) {
  return dbSoftDelete('HealthRecords', id);
}
