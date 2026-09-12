// js/pages/bulk-summary-page.js
// ملخّص أرصدة الجملة — عرض فقط، بلا CRUD. لكل تركيبة نوع/جنس/سلالة: إجمالي الشراء وتكلفته، متوسط تكلفة
// متحرك، إجمالي البيع وإيراده وتكلفة بضاعته المباعة، الرصيد الحالي (المتبقي)، وإجمالي الربح — كل شيء محسوب
// حيًا عبر computeBulkGroupBalances (bulk-batch-service.js)، وليس مخزَّنًا

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('bulk');
  renderSidebar('bulk-summary');
  renderHeader('ملخص الأرصدة الجماعية');

  const [purchases, sales] = await Promise.all([getAllBulkPurchases(), getAllBulkSales()]);
  _drawBulkSummary(purchases, sales);
});

function _drawBulkSummary(purchases, sales) {
  const groups = computeBulkGroupBalances(purchases, sales);

  const rows = groups.map(g => {
    const isNegative = g.remainingCount < 0;
    return {
      ...g,
      typeLabel: ANIMAL_TYPE_LABELS[g.type] || '-',
      genderLabel: ANIMAL_GENDER_LABELS[g.gender] || '-',
      breed: g.breed || '-',
      purchasedCountLabel: formatNumber(g.purchasedCount),
      purchasedCostLabel: formatCurrency(g.purchasedCost),
      avgCostLabel: formatCurrency(g.avgCost),
      soldCountLabel: formatNumber(g.soldCount),
      soldRevenueLabel: formatCurrency(g.soldRevenue),
      cogsLabel: formatCurrency(g.cogs),
      remainingCountLabel: isNegative
        ? `<strong style="color: var(--color-primary-red);">${formatNumber(g.remainingCount)}</strong>`
        : formatNumber(g.remainingCount),
      grossProfitLabel: `<strong style="color: ${g.grossProfit >= 0 ? 'var(--color-primary-green-dark)' : 'var(--color-primary-red)'};">${formatCurrency(g.grossProfit)}</strong>`,
    };
  });

  const totals = groups.reduce((acc, g) => ({
    purchasedCount: acc.purchasedCount + g.purchasedCount,
    purchasedCost: acc.purchasedCost + g.purchasedCost,
    soldCount: acc.soldCount + g.soldCount,
    soldRevenue: acc.soldRevenue + g.soldRevenue,
    cogs: acc.cogs + g.cogs,
    remainingCount: acc.remainingCount + g.remainingCount,
    grossProfit: acc.grossProfit + g.grossProfit,
  }), { purchasedCount: 0, purchasedCost: 0, soldCount: 0, soldRevenue: 0, cogs: 0, remainingCount: 0, grossProfit: 0 });

  renderDataTable('bulk-summary-table', [
    { key: 'typeLabel', label: 'النوع', sortable: true },
    { key: 'genderLabel', label: 'الجنس', sortable: true },
    { key: 'breed', label: 'السلالة', sortable: true },
    { key: 'purchasedCountLabel', label: 'عدد الشراء', sortable: false },
    { key: 'purchasedCostLabel', label: 'تكلفة الشراء', sortable: false },
    { key: 'avgCostLabel', label: 'متوسط التكلفة', sortable: false },
    { key: 'soldCountLabel', label: 'عدد البيع', sortable: false },
    { key: 'soldRevenueLabel', label: 'إيراد البيع', sortable: false },
    { key: 'cogsLabel', label: 'تكلفة البضاعة المباعة', sortable: false },
    { key: 'remainingCountLabel', label: 'الرصيد الحالي', sortable: false },
    { key: 'grossProfitLabel', label: 'إجمالي الربح', sortable: false },
  ], rows, {
    emptyMessage: 'لا توجد بيانات جماعية بعد لعرض الملخص',
    footerRow: {
      typeLabel: 'الإجمالي', genderLabel: '', breed: '',
      purchasedCountLabel: formatNumber(totals.purchasedCount),
      purchasedCostLabel: formatCurrency(totals.purchasedCost),
      avgCostLabel: '',
      soldCountLabel: formatNumber(totals.soldCount),
      soldRevenueLabel: formatCurrency(totals.soldRevenue),
      cogsLabel: formatCurrency(totals.cogs),
      remainingCountLabel: formatNumber(totals.remainingCount),
      grossProfitLabel: formatCurrency(totals.grossProfit),
    },
  });
}
