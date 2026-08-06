// js/services/party-service.js
// عملاء وموردون ("تكويدات") — نفس النمط المستخدم في category-service.js

async function getAllParties(type) {
  const all = await dbGetAll('Parties');
  return all.filter(p => p.status !== 'deleted' && (!type || p.type === type));
}

async function getPartyById(id) {
  if (!id) return null;
  return dbGet('Parties', id);
}

async function createParty(data) {
  return dbAdd('Parties', data);
}

async function updateParty(id, data) {
  return dbUpdate('Parties', id, data);
}

async function deleteParty(id) {
  return dbSoftDelete('Parties', id);
}

async function isPartyNameTaken(type, name, excludeId = null) {
  const all = await getAllParties(type);
  return all.some(p => p.name === name && p.id !== excludeId);
}

const PARTY_TYPE_LABELS = { client: 'عميل', supplier: 'مورّد' };
