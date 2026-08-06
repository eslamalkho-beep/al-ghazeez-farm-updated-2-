// js/services/revenue-service.js

async function getAllRevenues() {
  const all = await dbGetAll('Revenues');
  return all.filter(r => r.status !== 'deleted');
}

async function createRevenue(data) {
  return dbAdd('Revenues', data);
}

async function updateRevenue(id, data) {
  return dbUpdate('Revenues', id, data);
}

async function deleteRevenue(id) {
  return dbSoftDelete('Revenues', id);
}
