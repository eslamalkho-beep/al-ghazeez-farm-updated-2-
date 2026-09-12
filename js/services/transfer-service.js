// js/services/transfer-service.js
// تحويل قطيع↔تجارة: حيوان فردي متتبَّع في Animals يخرج من القطيع ليصبح رأسًا ضمن مخزون التجارة (والعكس).
// كل تحويل يُنشئ بنفسه عملية شراء/بيع جماعي مستقلة بند واحد (بدل اختيار دفعة قائمة يُضاف إليها — الرصيد
// الآن يُحسب عبر تركيبة نوع/جنس/سلالة على كل عمليات الشراء/البيع معًا، لا لكل عملية بمفردها، فلا حاجة لاختيار
// "دفعة مستهدفة"). القيمة التقديرية (إن أُدخلت) تُستخدم كسعر وحدة حقيقي في بند الشراء/البيع الناتج حتى تدخل
// بعدل في حساب متوسط التكلفة لبقية المخزون — لكن الحقل source:'transfer' يستثني هذه العملية بالكامل من أي
// قيد محاسبي (لا أثر نقدي حقيقي وقت التحويل، القيمة الحقيقية للحيوان محفوظة أصلاً في Animals.purchasePrice
// فلا يصح احتسابها مرة أخرى). Transfers هنا سجل تدقيق فقط (append-only، بلا تعديل/حذف).

async function getAllTransfers() {
  const all = await dbGetAll('Transfers');
  return all.filter(t => t.status !== 'deleted');
}

// قطيع → تجارة: يُخرج حيوانًا حيًا من التتبع الفردي وينشئ له عملية شراء جماعي مستقلة (بند واحد بعدد 1)
async function transferAnimalToTrade({ animalId, date, valuation, notes }) {
  const animal = await getAnimalById(animalId);
  if (!animal) throw new Error('الحيوان غير موجود');
  if (animal.status !== 'alive') throw new Error('لا يمكن تحويل حيوان غير حي لمخزون التجارة');

  const code = await generateNextBulkPurchaseCode();
  const newPurchaseId = await createBulkPurchase({
    code,
    date,
    lines: [{ partyId: null, type: animal.type, gender: animal.gender, breed: animal.breed, count: 1, unitPrice: Number(valuation || 0) }],
    notes: `تحويل من القطيع (${animal.code})${notes ? ' — ' + notes : ''}`,
    source: 'transfer',
  });
  await updateAnimal(animalId, { status: 'movedToTrade' });

  return dbAdd('Transfers', { kind: 'herdToTrade', date, animalId, bulkRecordId: newPurchaseId, valuation: valuation || null, notes: notes || '' });
}

// تجارة → قطيع: يسحب رأسًا واحدًا عبر عملية بيع جماعي مستقلة (بند واحد بعدد 1)، وينشئ له بطاقة Animals فردية جديدة
async function transferTradeToAnimal({ type, gender, breed, date, valuation, notes }) {
  const purchases = await getAllBulkPurchases();
  const code = await generateNextBulkSaleCode();
  const rawLine = { partyId: null, type, gender, breed, count: 1, unitPrice: Number(valuation || 0) };
  const [lineWithCost] = computeSaleLinesCosts([rawLine], purchases, date);
  const newSaleId = await createBulkSale({
    code,
    date,
    lines: [lineWithCost],
    notes: `تحويل لمخزون القطيع${notes ? ' — ' + notes : ''}`,
    source: 'transfer',
  });

  const animalCode = await generateNextAnimalCode(type);
  const animalId = await createAnimal({
    code: animalCode, type, gender, breed,
    birthDate: null,
    healthStatus: 'healthy',
    source: 'purchased',
    purchasePrice: valuation || null,
    notes: `أُدخل للقطيع من مخزون التجارة (عملية بيع ${code})${notes ? ' — ' + notes : ''}`,
  });

  await dbAdd('Transfers', { kind: 'tradeToHerd', date, animalId, bulkRecordId: newSaleId, valuation: valuation || null, notes: notes || '' });
  return animalId;
}
