// js/pages/assets-hub-page.js
// مدخل وحدة "إدارة الأصول الثابتة" — ملخّص سريع + شبكة عمليات (المرحلة 1: تسجيل/سجل/إهلاك،
// عناصر المرحلة 2 تظهر معطّلة بوسم "قريبًا" حتى تكون خريطة الوحدة الكاملة مرئية من الآن)

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('assets');
  renderSidebar('assets');
  renderHeader('إدارة الأصول الثابتة');

  _renderMenu();
  await _renderKpis();
});

function _renderMenu() {
  const items = [
    { label: '➕ إضافة أصل', desc: 'تسجيل أصل ثابت جديد (شراء/اقتناء) — يُنشئ القيد المحاسبي تلقائيًا', href: 'asset-form.html', tone: 'green' },
    { label: '📋 سجل الأصول', desc: 'كل الأصول المسجّلة بتكلفتها ومجمع إهلاكها وقيمتها الدفترية', href: 'asset-list.html', tone: 'blue' },
    { label: '📉 تشغيل إهلاك الفترة', desc: 'ترحيل إهلاك شهر كامل دفعة واحدة (القسط الثابت)', href: 'asset-depreciation-run.html', tone: 'blue' },
    { label: '🔍 جرد الأصول', desc: 'جلسة جرد دورية لكل الأصول النشطة، مع رصد النقل/الفقد/التلف', href: 'asset-count.html', tone: 'blue' },
    { label: '📊 التقارير', desc: 'سجل الأصول، حسب النوع/الموقع، مجمع الإهلاك، القيمة الدفترية، الإهلاك الشهري، المباعة والمستبعدة، الجرد', href: '../reports/asset-reports.html', tone: 'blue' },
    { label: '🔄 نقل / 🛠️ تحسينات / 💰 بيع / 🗑️ استبعاد', desc: 'من داخل بطاقة كل أصل (سجل الأصول ← اختر أصلاً)', href: 'asset-list.html', tone: 'green' },
  ];
  document.getElementById('assets-hub-menu').innerHTML = kpiGrid(
    items.map(i => ({ value: i.label, label: i.desc, tone: i.tone, href: i.href })),
    3
  );
}

async function _renderKpis() {
  const assets = await getAllFixedAssets();
  const activeAssets = assets.filter(a => a.assetStatus !== 'sold' && a.assetStatus !== 'disposed');
  const totalCost = activeAssets.reduce((s, a) => s + computeAssetCostBasis(a), 0);
  const totalDepreciation = activeAssets.reduce((s, a) => s + Number(a.accumulatedDepreciation || 0), 0);
  const totalBookValue = activeAssets.reduce((s, a) => s + computeAssetBookValue(a), 0);

  document.getElementById('assets-hub-kpis').innerHTML = kpiGrid([
    { value: formatNumber(activeAssets.length), label: 'عدد الأصول', tone: 'blue', icon: '🏢' },
    { value: formatCurrency(totalCost), label: 'إجمالي التكلفة', tone: 'blue', icon: '💰' },
    { value: formatCurrency(totalDepreciation), label: 'إجمالي مجمع الإهلاك', tone: 'red', icon: '📉' },
    { value: formatCurrency(totalBookValue), label: 'صافي القيمة الدفترية', tone: 'green', icon: '📗' },
  ]);
}
