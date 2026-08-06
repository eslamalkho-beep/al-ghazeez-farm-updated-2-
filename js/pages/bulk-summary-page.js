// js/pages/bulk-summary-page.js
// ملخّص أرصدة الجملة — عرض فقط، بلا CRUD
// المتبقي = فرق تراكمي بسيط (إجمالي الشراء - إجمالي البيع) لكل تركيبة نوع/جنس/سلالة، مجمّع من بنود كل الدفعات

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('bulk');
  renderSidebar('bulk');
  renderHeader('ملخص الأرصدة الجماعية');

  const batches = await getAllBulkBatches();
  _drawBulkSummary(batches);
});

function _bulkGroupKey(record) {
  return `${record.type}|${record.gender}|${(record.breed || '').trim().toLowerCase()}`;
}

function _computeBulkSummary(batches) {
  const groups = {};

  batches.forEach(batch => {
    (batch.purchaseLines || []).forEach(p => {
      const key = _bulkGroupKey(p);
      if (!groups[key]) groups[key] = { type: p.type, gender: p.gender, breed: p.breed, purchasedCount: 0, soldCount: 0 };
      groups[key].purchasedCount += Number(p.count || 0);
    });
    (batch.saleLines || []).forEach(s => {
      const key = _bulkGroupKey(s);
      if (!groups[key]) groups[key] = { type: s.type, gender: s.gender, breed: s.breed, purchasedCount: 0, soldCount: 0 };
      groups[key].soldCount += Number(s.count || 0);
    });
  });

  return Object.values(groups).map(g => ({
    ...g,
    remainingCount: g.purchasedCount - g.soldCount,
  }));
}

function _drawBulkSummary(batches) {
  const groups = _computeBulkSummary(batches);

  const rows = groups.map(g => {
    const isNegative = g.remainingCount < 0;
    return {
      ...g,
      typeLabel: ANIMAL_TYPE_LABELS[g.type] || '-',
      genderLabel: ANIMAL_GENDER_LABELS[g.gender] || '-',
      breed: g.breed || '-',
      purchasedCountLabel: formatNumber(g.purchasedCount),
      soldCountLabel: formatNumber(g.soldCount),
      remainingCountLabel: isNegative
        ? `<strong style="color: var(--color-primary-red);">${formatNumber(g.remainingCount)}</strong>`
        : formatNumber(g.remainingCount),
    };
  });

  const totalPurchased = groups.reduce((s, g) => s + g.purchasedCount, 0);
  const totalSold = groups.reduce((s, g) => s + g.soldCount, 0);
  const totalRemaining = totalPurchased - totalSold;

  renderDataTable('bulk-summary-table', [
    { key: 'typeLabel', label: 'النوع', sortable: true },
    { key: 'genderLabel', label: 'الجنس', sortable: true },
    { key: 'breed', label: 'السلالة', sortable: true },
    { key: 'purchasedCountLabel', label: 'عدد الشراء', sortable: false },
    { key: 'soldCountLabel', label: 'عدد البيع', sortable: false },
    { key: 'remainingCountLabel', label: 'المتبقي الحالي', sortable: false },
  ], rows, {
    emptyMessage: 'لا توجد بيانات جماعية بعد لعرض الملخص',
    footerRow: {
      typeLabel: 'الإجمالي', genderLabel: '', breed: '',
      purchasedCountLabel: formatNumber(totalPurchased),
      soldCountLabel: formatNumber(totalSold),
      remainingCountLabel: formatNumber(totalRemaining),
    },
  });
}
