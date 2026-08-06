// js/services/bulk-batch-service.js
// دفعات الشراء والبيع الجماعي — سجل واحد يحوي بنود شراء (يوم واحد) وبنود بيع/مصاريف (كل بند بتاريخه الخاص)

async function getAllBulkBatches() {
  const all = await dbGetAll('BulkBatches');
  return all.filter(b => b.status !== 'deleted');
}

async function getBulkBatchById(id) {
  return dbGet('BulkBatches', id);
}

async function createBulkBatch(data) {
  return dbAdd('BulkBatches', data);
}

async function updateBulkBatch(id, data) {
  return dbUpdate('BulkBatches', id, data);
}

async function deleteBulkBatch(id) {
  return dbSoftDelete('BulkBatches', id);
}

async function generateNextBulkBatchCode() {
  const all = await getAllBulkBatches();
  const numbers = all
    .map(b => (b.code && b.code.startsWith('DF-')) ? parseInt(b.code.replace('DF-', ''), 10) : 0)
    .filter(n => !isNaN(n));
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `DF-${String(next).padStart(4, '0')}`;
}

// يحسب مجاميع دفعة واحدة من بنودها — لا شيء من هذا مخزَّن، يُحسب دائمًا حيًا
function computeBulkBatchTotals(batch) {
  const purchaseLines = batch.purchaseLines || [];
  const saleLines = batch.saleLines || [];
  const expenseLines = batch.expenseLines || [];

  const totalPurchaseCount = purchaseLines.reduce((s, l) => s + Number(l.count || 0), 0);
  const totalPurchaseCost = purchaseLines.reduce((s, l) => s + Number(l.count || 0) * Number(l.unitPrice || 0), 0);
  const totalSaleCount = saleLines.reduce((s, l) => s + Number(l.count || 0), 0);
  const totalSaleRevenue = saleLines.reduce((s, l) => s + Number(l.count || 0) * Number(l.unitPrice || 0), 0);
  const totalExpenses = expenseLines.reduce((s, l) => s + Number(l.amount || 0), 0);
  const netRevenue = totalSaleRevenue - totalPurchaseCost - totalExpenses;
  const remainingCount = totalPurchaseCount - totalSaleCount;

  return { totalPurchaseCount, totalPurchaseCost, totalSaleCount, totalSaleRevenue, totalExpenses, netRevenue, remainingCount };
}
