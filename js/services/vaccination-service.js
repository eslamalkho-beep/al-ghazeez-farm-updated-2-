// js/services/vaccination-service.js
// سجل تحصينات دوري لكل حيوان (نوع اللقاح + تاريخ الجرعة + تاريخ الجرعة القادمة) — منفصل عن HealthRecords
// لأنه جدول وقائي مجدوَل يحتاج تذكيرًا تلقائيًا قبل الاستحقاق، بعكس الزيارة العلاجية لحالة طارئة

async function getAllVaccinations() {
  const all = await dbGetAll('Vaccinations');
  return all.filter(v => v.status !== 'deleted');
}

async function getVaccinationsForAnimal(animalId) {
  const all = await getAllVaccinations();
  return all.filter(v => v.animalId === Number(animalId));
}

async function createVaccination(data) {
  return dbAdd('Vaccinations', data);
}

async function updateVaccination(id, data) {
  return dbUpdate('Vaccinations', id, data);
}

async function deleteVaccination(id) {
  return dbSoftDelete('Vaccinations', id);
}
