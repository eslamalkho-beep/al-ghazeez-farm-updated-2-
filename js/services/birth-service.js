// js/services/birth-service.js

async function getAllBirths() {
  const all = await dbGetAll('BirthRecords');
  return all.filter(b => !b.isDeleted);
}

async function createBirthRecord(data) {
  return dbAdd('BirthRecords', data);
}

async function updateBirthRecord(id, data) {
  return dbUpdate('BirthRecords', id, data);
}

async function deleteBirthRecord(id) {
  return dbSoftDelete('BirthRecords', id);
}
