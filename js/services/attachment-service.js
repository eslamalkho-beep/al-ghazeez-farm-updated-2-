// js/services/attachment-service.js
// أرشفة مرفقات الفواتير (صور/PDF) لسجلات المصروفات والإيرادات والمشتريات

async function getAttachmentsForRecord(recordType, recordId) {
  const all = await dbQuery('Attachments', a => a.recordType === recordType && a.recordId === Number(recordId));
  return all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function addAttachment(recordType, recordId, file) {
  return dbAdd('Attachments', {
    recordType,
    recordId: Number(recordId),
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
    blob: file,
  });
}

async function deleteAttachment(id) {
  return dbHardDelete('Attachments', id);
}
