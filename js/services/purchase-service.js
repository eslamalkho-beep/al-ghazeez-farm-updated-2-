// js/services/purchase-service.js

async function getAllPurchases() {
  const all = await dbGetAll('Purchases');
  return all.filter(p => p.status !== 'deleted');
}

async function createPurchase(data) {
  return dbAdd('Purchases', data);
}

async function updatePurchase(id, data) {
  return dbUpdate('Purchases', id, data);
}

async function deletePurchase(id) {
  return dbSoftDelete('Purchases', id);
}
