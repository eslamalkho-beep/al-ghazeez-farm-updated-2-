// js/services/fattening-service.js
// سجل التسمين — دفعة (batch) تضم عدة حيوانات تتغذى مع بعض في نفس الفترة، لتوزيع تكلفة العلف عليها وحساب
// تكلفة الكيلو الواحد المُكتسَب والربح الفعلي عند البيع (نمط "دفعة جماعية" — انظر CLAUDE.md).
// تكلفة الدفعة الجماعية تُجمَع من مصدرين مستقلّين معًا:
//   1) Expenses المرتبطة بالدفعة عبر الحقل الاختياري linkedFatteningBatchId (يُضبط من expense-form.html،
//      لأي مصروف جديد كالعلف/الأدوية المشتراة خصيصًا لهذه الدفعة — بمعزل تام عن ربط المخزون
//      linkedInventoryItemId، الاثنان مستقلان ويمكن استخدامهما معًا على نفس المصروف).
//   2) InventoryMovements (حركات صادر) المرتبطة بالدفعة عبر linkedFatteningBatchId، لصرف مباشر من مخزون
//      علف/أدوية موجود أصلاً بلا مصروف جديد (يُضبط من inventory-movements.html) — تكلفتها = الكمية × تكلفة
//      الوحدة المُدخلة على الحركة نفسها.
// كل حيوان في الدفعة يحمل أيضًا تكلفة صحية فردية منفصلة (HealthRecords.cost) لا تدخل في التوزيع الجماعي.
// طريقة توزيع التكلفة الجماعية على حيوانات الدفعة قابلة للاختيار لكل دفعة (batch.allocationMethod، انظر
// FATTENING_ALLOCATION_METHODS أدناه)؛ الغياب (دفعات قديمة قبل هذه الميزة) يُعامَل كـ'days' — نفس السلوك
// الافتراضي الأصلي قبل إضافة الخيارات.

const FATTENING_ALLOCATION_METHODS = ['days', 'equal', 'weight'];
const FATTENING_ALLOCATION_METHOD_LABELS = {
  days: 'حسب أيام الإقامة',
  equal: 'بالتساوي على الرؤوس',
  weight: 'حسب الوزن',
};

function _normalizeAllocationMethod(method) {
  return FATTENING_ALLOCATION_METHODS.includes(method) ? method : 'days';
}

async function getAllFatteningBatches() {
  const all = await dbGetAll('FatteningBatches');
  return all.filter(b => b.status !== 'deleted');
}

async function getFatteningBatch(id) {
  return dbGet('FatteningBatches', Number(id));
}

async function generateNextFatteningBatchCode() {
  const all = await getAllFatteningBatches();
  const numbers = all
    .map(b => (b.batchNumber && b.batchNumber.startsWith('FTN-')) ? parseInt(b.batchNumber.replace('FTN-', ''), 10) : 0)
    .filter(n => !isNaN(n));
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `FTN-${String(next).padStart(4, '0')}`;
}

async function createFatteningBatch({ startDate, notes, locationId, allocationMethod }) {
  const batchNumber = await generateNextFatteningBatchCode();
  return dbAdd('FatteningBatches', {
    batchNumber,
    startDate,
    endDate: null,
    notes: notes || '',
    locationId: locationId ? Number(locationId) : null,
    allocationMethod: _normalizeAllocationMethod(allocationMethod),
    status: 'active',
    animals: [],
  });
}

// تعديل بيانات الدفعة الوصفية (ملاحظات/الحظيرة/طريقة توزيع التكلفة) — لا يمس قائمة الحيوانات ولا الحالة
async function updateFatteningBatchDetails(id, { notes, locationId, allocationMethod }) {
  return dbUpdate('FatteningBatches', id, {
    notes: notes || '',
    locationId: locationId ? Number(locationId) : null,
    allocationMethod: _normalizeAllocationMethod(allocationMethod),
  });
}

async function deleteFatteningBatch(id) {
  return dbSoftDelete('FatteningBatches', id);
}

// إغلاق الدفعة: يضبط تاريخ النهاية، ويخرج تلقائيًا أي حيوان لم يُخرَج بعد بنفس التاريخ (بلا وزن خروج —
// يُحسب من آخر سجل وزن معروف عند العرض)
async function closeFatteningBatch(id, endDate) {
  const batch = await getFatteningBatch(id);
  if (!batch) throw new Error('الدفعة غير موجودة');
  const animals = (batch.animals || []).map(a => a.exitDate ? a : { ...a, exitDate: endDate });
  return dbUpdate('FatteningBatches', id, { status: 'closed', endDate, animals });
}

async function reopenFatteningBatch(id) {
  return dbUpdate('FatteningBatches', id, { status: 'active', endDate: null });
}

// إضافة حيوان للدفعة — لو الدفعة مربوطة بحظيرة (locationId)، يُنقَل الحيوان تلقائيًا لنفس الحظيرة
// (Animals.locationId) ليعكس دخوله الفعلي لها، بنفس فكرة "الحظيرة → الدفعة → الحيوان" الهرمية
async function addAnimalToBatch(batchId, { animalId, entryDate, entryWeight }) {
  const batch = await getFatteningBatch(batchId);
  if (!batch) throw new Error('الدفعة غير موجودة');
  const animals = [...(batch.animals || [])];
  const alreadyActive = animals.some(a => a.animalId === Number(animalId) && !a.exitDate);
  if (alreadyActive) throw new Error('هذا الحيوان موجود بالفعل ضمن الدفعة');
  animals.push({
    animalId: Number(animalId),
    entryDate,
    entryWeight: entryWeight || null,
    exitDate: null,
    exitWeight: null,
  });
  const result = await dbUpdate('FatteningBatches', batchId, { animals });
  if (batch.locationId) {
    await dbUpdate('Animals', Number(animalId), { locationId: batch.locationId });
  }
  return result;
}

// إخراج حيوان من الدفعة (بيع/نقل/انتهاء تسمين) بلا إغلاق الدفعة نفسها
async function removeAnimalFromBatch(batchId, animalId, { exitDate, exitWeight }) {
  const batch = await getFatteningBatch(batchId);
  if (!batch) throw new Error('الدفعة غير موجودة');
  const animals = (batch.animals || []).map(a =>
    (a.animalId === Number(animalId) && !a.exitDate) ? { ...a, exitDate, exitWeight: exitWeight || null } : a
  );
  return dbUpdate('FatteningBatches', batchId, { animals });
}

// حذف دخول حيوان بالكامل من سجل الدفعة (تصحيح خطأ إدخال) — يحذف آخر دخول له (نشط أو مغلق) بلا أثر رجعي
async function removeAnimalEntry(batchId, animalId) {
  const batch = await getFatteningBatch(batchId);
  if (!batch) throw new Error('الدفعة غير موجودة');
  const animals = [...(batch.animals || [])];
  let lastIndex = -1;
  animals.forEach((a, idx) => { if (a.animalId === Number(animalId)) lastIndex = idx; });
  if (lastIndex === -1) return batch;
  animals.splice(lastIndex, 1);
  return dbUpdate('FatteningBatches', batchId, { animals });
}

function _daysBetween(dateFrom, dateTo) {
  const a = new Date(dateFrom);
  const b = new Date(dateTo);
  const diff = Math.round((b - a) / 86400000);
  return Math.max(1, diff + 1); // شامل يوم الدخول
}

function _latestWeightOnOrBefore(weightRecords, animalId, dateStr) {
  const list = weightRecords
    .filter(w => w.animalId === animalId && w.date && w.date <= dateStr)
    .sort((x, y) => new Date(y.date) - new Date(x.date));
  return list.length ? list[0].weight : null;
}

// إجمالي تكلفة الدفعة الجماعية من مصدرين معًا: مصروفات مرتبطة (Expenses.linkedFatteningBatchId) + حركات
// صرف مخزون مرتبطة مباشرة (InventoryMovements.linkedFatteningBatchId، الاتجاه 'out' فقط — تكلفتها كمية ×
// تكلفة الوحدة المُدخلة على الحركة). بلا تمييز نوع المصروف (علف/أدوية/فيتامينات/غيرها) ولا سبب حركة المخزون
function computeBatchLinkedCost(batchId, expenses, inventoryMovements) {
  const expenseCost = (expenses || [])
    .filter(e => e.status !== 'deleted' && Number(e.linkedFatteningBatchId) === Number(batchId))
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const movementCost = (inventoryMovements || [])
    .filter(m => m.status !== 'deleted' && m.direction === 'out' && Number(m.linkedFatteningBatchId) === Number(batchId))
    .reduce((sum, m) => sum + ((Number(m.quantity) || 0) * (Number(m.unitCost) || 0)), 0);
  return expenseCost + movementCost;
}

// نتائج تفصيلية لكل حيوان في الدفعة + ملخص الدفعة — توزيع التكلفة الجماعية (علف/أدوية/فيتامينات من
// المصروفات وحركات صرف المخزون المرتبطة معًا) حسب طريقة التوزيع المختارة للدفعة (batch.allocationMethod):
//   'days'  (الافتراضي): نصيب كل حيوان من إجمالي "أيام التغذية" لكل حيوانات الدفعة — حيوان دخل متأخرًا أو
//           خرج مبكرًا يأخذ نصيبًا أقل تلقائيًا.
//   'equal': بالتساوي على كل حيوان في الدفعة بصرف النظر عن مدة تواجده.
//   'weight': حسب نصيب كل حيوان من إجمالي متوسط الوزن (متوسط وزن الدخول/الخروج) — حيوان أثقل يأخذ نصيبًا
//           أكبر (منطق "الحيوان الأثقل يأكل أكثر").
// تُضاف لكل حيوان تكلفة فردية مباشرة منفصلة — لا مشتركة بين الدفعة ولا تتأثر بطريقة التوزيع — من مصدرين:
// HealthRecords.cost (علاج/تحصين خاص بحيوان بعينه) + Expenses.linkedAnimalId (أي مصروف آخر رُبط مباشرة
// بهذا الحيوان تحديدًا من expense-form.html، انظر getAnimalLinkedExpensesTotal في expense-service.js)
// deathRecords (اختياري): لو الحيوان نفق وهو لسه بالدفعة بلا exitDate صريح، تتوقف "أيام التغذية"/نصيبه من
// التكلفة الجماعية عند تاريخ النفوق (DeathRecords.deathDate) بدل الاستمرار حتى إغلاق الدفعة أو اليوم —
// حتى لا يُحمَّل حيوان نافق تكلفة علف بعد وفاته فعليًا (انظر sales-report-page.js لعرض خسارة النفوق الكاملة)
function computeFatteningBatchResults(batch, { expenses, weightRecords, animals, revenues, healthRecords, inventoryMovements, deathRecords }) {
  const todayStr = todayIso();
  const entries = batch.animals || [];
  const totalLinkedCost = computeBatchLinkedCost(batch.id, expenses, inventoryMovements);
  const allocationMethod = _normalizeAllocationMethod(batch.allocationMethod);

  const deathDateByAnimalId = {};
  (deathRecords || []).forEach(d => { if (d.animalId) deathDateByAnimalId[d.animalId] = d.deathDate; });

  const withMeta = entries.map(entry => {
    let effectiveEndDate = entry.exitDate || batch.endDate || todayStr;
    const deathDate = deathDateByAnimalId[entry.animalId];
    if (!entry.exitDate && deathDate && deathDate < effectiveEndDate) effectiveEndDate = deathDate;
    const days = _daysBetween(entry.entryDate, effectiveEndDate);
    const animal = animals.find(a => a.id === entry.animalId);
    const entryWeight = entry.entryWeight ?? _latestWeightOnOrBefore(weightRecords, entry.animalId, entry.entryDate) ?? animal?.weight ?? null;
    const exitWeight = entry.exitWeight
      ?? _latestWeightOnOrBefore(weightRecords, entry.animalId, effectiveEndDate)
      ?? animal?.weight
      ?? null;
    const avgWeight = (entryWeight != null && exitWeight != null)
      ? (entryWeight + exitWeight) / 2
      : (entryWeight ?? exitWeight ?? null);
    return { entry, animal, effectiveEndDate, days, entryWeight, exitWeight, avgWeight };
  });

  // "نصيب" كل حيوان (basis) حسب طريقة التوزيع — نسبته من إجمالي النصيب هي حصته من التكلفة الجماعية.
  // في طريقة 'weight': حيوان بلا أي بيانات وزن (basis = 0) لا يأخذ أي نصيب من التكلفة الجماعية (يبقى فقط
  // بتكلفته الصحية الفردية إن وُجدت) — بدل قسمة تعسفية بلا أساس فعلي.
  let totalBasis = 0;
  const withBasis = withMeta.map(m => {
    const basis = allocationMethod === 'equal' ? 1
      : allocationMethod === 'weight' ? (m.avgWeight != null ? m.avgWeight : 0)
      : m.days;
    totalBasis += basis;
    return { ...m, basis };
  });

  const animalsResults = withBasis.map(({ entry, animal, effectiveEndDate, days, entryWeight, exitWeight, basis }) => {
    const weightGain = (entryWeight != null && exitWeight != null) ? (exitWeight - entryWeight) : null;
    const allocatedCost = totalBasis > 0 ? Math.round((totalLinkedCost * (basis / totalBasis)) * 100) / 100 : 0;

    const healthCost = (healthRecords || [])
      .filter(h => h.animalId === entry.animalId && h.date >= entry.entryDate && h.date <= effectiveEndDate)
      .reduce((sum, h) => sum + (Number(h.cost) || 0), 0);

    const directExpenseCost = getAnimalLinkedExpensesTotal(entry.animalId, expenses, { from: entry.entryDate, to: effectiveEndDate });
    const individualCost = healthCost + directExpenseCost;

    const saleRevenue = (revenues || [])
      .filter(r => r.status !== 'deleted' && r.animalId === entry.animalId)
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

    const totalCost = allocatedCost + individualCost;
    const costPerKgGain = (weightGain && weightGain > 0) ? Math.round((totalCost / weightGain) * 100) / 100 : null;
    const netProfit = saleRevenue > 0 ? Math.round((saleRevenue - totalCost) * 100) / 100 : null;

    return {
      animalId: entry.animalId,
      animal,
      entryDate: entry.entryDate,
      exitDate: entry.exitDate,
      isActive: !entry.exitDate,
      days,
      entryWeight,
      exitWeight,
      weightGain,
      allocatedCost,
      healthCost,
      directExpenseCost,
      individualCost,
      totalCost,
      costPerKgGain,
      saleRevenue,
      netProfit,
    };
  });

  const totalAnimalDays = withMeta.reduce((sum, r) => sum + r.days, 0);
  const totalWeightGain = animalsResults.reduce((sum, r) => sum + (r.weightGain || 0), 0);
  const avgCostPerKg = totalWeightGain > 0 ? Math.round((totalLinkedCost / totalWeightGain) * 100) / 100 : null;

  return {
    totalLinkedCost,
    allocationMethod,
    totalAnimalDays,
    costPerAnimalDay: totalAnimalDays > 0 ? Math.round((totalLinkedCost / totalAnimalDays) * 100) / 100 : 0,
    totalWeightGain,
    avgCostPerKg,
    animalsResults,
  };
}
