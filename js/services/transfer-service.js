// js/services/transfer-service.js
// تحويل قطيع↔تجارة: حيوان فردي متتبَّع في Animals يخرج من القطيع ليصبح عددًا ضمن تركيبة في دفعة BulkBatches
// (والعكس). كلا الاتجاهين لا يُنشئان أي أثر مالي جديد (سعر الوحدة صفر دومًا في بند الدفعة الناتج) — القيمة
// الحقيقية للحيوان محفوظة بالفعل في مكان واحد فقط (Animals.purchasePrice) فلا يصح احتسابها مرتين كمصروف/إيراد
// جملة أيضًا. Transfers هنا سجل تدقيق فقط (append-only، بلا تعديل/حذف) — لا يُغيَّر بعد إنشائه.

async function getAllTransfers() {
  const all = await dbGetAll('Transfers');
  return all.filter(t => t.status !== 'deleted');
}

// قطيع → تجارة: يُخرج حيوانًا حيًا من التتبع الفردي ويضيفه كعدد (بقيمة صفرية) لبند شراء في دفعة قائمة
async function transferAnimalToTrade({ animalId, batchId, date, valuation, notes }) {
  const animal = await getAnimalById(animalId);
  if (!animal) throw new Error('الحيوان غير موجود');
  if (animal.status !== 'alive') throw new Error('لا يمكن تحويل حيوان غير حي لمخزون التجارة');

  const batch = await getBulkBatchById(batchId);
  if (!batch) throw new Error('الدفعة غير موجودة');

  const purchaseLines = [...(batch.purchaseLines || []), {
    partyId: null, type: animal.type, gender: animal.gender, breed: animal.breed, count: 1, unitPrice: 0,
  }];
  await updateBulkBatch(batchId, { purchaseLines });
  await updateAnimal(animalId, { status: 'movedToTrade' });
  await syncBulkBatchJournalEntry(batchId);

  return dbAdd('Transfers', { kind: 'herdToTrade', date, animalId, batchId, valuation: valuation || null, notes: notes || '' });
}

// تجارة → قطيع: يسحب رأسًا واحدًا (بقيمة صفرية في بند بيع بالدفعة) ويُنشئ له بطاقة Animals فردية جديدة
async function transferTradeToAnimal({ batchId, type, gender, breed, date, valuation, notes }) {
  const batch = await getBulkBatchById(batchId);
  if (!batch) throw new Error('الدفعة غير موجودة');

  const saleLines = [...(batch.saleLines || []), {
    partyId: null, date, type, gender, breed, count: 1, unitPrice: 0,
  }];
  await updateBulkBatch(batchId, { saleLines });
  await syncBulkBatchJournalEntry(batchId);

  const code = await generateNextAnimalCode();
  const animalId = await createAnimal({
    code, type, gender, breed,
    birthDate: null,
    healthStatus: 'healthy',
    source: 'purchased',
    purchasePrice: valuation || null,
    notes: `أُدخل للقطيع من مخزون التجارة (دفعة ${batch.code})${notes ? ' — ' + notes : ''}`,
  });

  await dbAdd('Transfers', { kind: 'tradeToHerd', date, animalId, batchId, valuation: valuation || null, notes: notes || '' });
  return animalId;
}
