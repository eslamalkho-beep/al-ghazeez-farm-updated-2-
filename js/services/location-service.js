// js/services/location-service.js
// حظائر/مواقع القطيع — "تكويدات" بسيطة (اسم فقط) بنفس نمط party-service.js الأساسي،
// تُربَط بـ Animals.locationId

async function getAllLocations() {
  const all = await dbGetAll('Locations');
  return all.filter(l => l.status !== 'deleted');
}

async function getLocationById(id) {
  if (!id) return null;
  return dbGet('Locations', id);
}

async function createLocation(data) {
  return dbAdd('Locations', data);
}

async function updateLocation(id, data) {
  return dbUpdate('Locations', id, data);
}

async function deleteLocation(id) {
  return dbSoftDelete('Locations', id);
}

async function isLocationNameTaken(name, excludeId = null) {
  const all = await getAllLocations();
  return all.some(l => l.name === name && l.id !== excludeId);
}
