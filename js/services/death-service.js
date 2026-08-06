// js/services/death-service.js

async function getAllDeaths() {
  const all = await dbGetAll('DeathRecords');
  return all.filter(d => !d.isDeleted);
}

async function createDeathRecord(data) {
  const record = await dbAdd('DeathRecords', data);
  if (data.animalId) {
    const animal = await updateAnimal(data.animalId, { status: 'dead' });
    await createNotification({
      type: 'death',
      title: 'تسجيل حالة نفوق',
      message: `تم تسجيل نفوق الحيوان ${animal.code} بتاريخ ${formatDateArabic(data.deathDate)} (السبب: ${DEATH_CAUSE_LABELS[data.cause] || data.cause || 'غير معروف'})`,
      relatedEntityId: data.animalId,
    });
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
