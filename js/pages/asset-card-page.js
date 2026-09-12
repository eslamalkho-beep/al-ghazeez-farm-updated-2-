// js/pages/asset-card-page.js
// بطاقة أصل ثابت واحد: بيانات + KPIs (التكلفة/مجمع الإهلاك/القيمة الدفترية/إجمالي تكلفة الصيانة) + سجل
// زمني من FixedAssetTransactions + مرفقات + شبكة عمليات (نقل/تحسين/صيانة/بيع/استبعاد)، كل عملية بصفحتها
// الخاصة تتطلب ?assetId= وتُخفى بالكامل لأصل مباع/مستبعد.

let _currentAssetId = null;
let _currentAsset = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('assets');
  renderSidebar('assets-list');
  renderHeader('بطاقة الأصل الثابت');

  const params = new URLSearchParams(window.location.search);
  _currentAssetId = Number(params.get('id'));
  if (!_currentAssetId) {
    window.location.href = 'asset-list.html';
    return;
  }

  await _renderCard();

  if (!hasActionPermission('assets', 'edit')) {
    document.getElementById('edit-link').style.display = 'none';
  }
  if (!hasActionPermission('assets', 'delete')) {
    document.getElementById('delete-btn').style.display = 'none';
  }
  document.getElementById('edit-link').addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = `asset-form.html?id=${_currentAssetId}`;
  });
  document.getElementById('delete-btn').addEventListener('click', _handleDelete);
  document.getElementById('attachments-btn').addEventListener('click', () => {
    openAttachmentsModal('fixedAsset', _currentAssetId, _currentAsset?.assetCode || '');
  });
});

async function _renderCard() {
  const [asset, transactions, locations, employees] = await Promise.all([
    getFixedAssetById(_currentAssetId),
    getAllFixedAssetTransactions(_currentAssetId),
    getAllLocations(),
    dbGetAll('Employees'),
  ]);

  if (!asset) {
    document.getElementById('card-box').innerHTML = '<p>الأصل غير موجود</p>';
    return;
  }
  _currentAsset = asset;

  const locationName = locations.find(l => l.id === asset.locationId)?.name || '-';
  const employeeName = employees.find(e => e.id === asset.responsibleEmployeeId)?.fullName || '-';

  document.getElementById('asset-name').textContent = `${asset.name} (${asset.assetCode})`;
  document.getElementById('asset-meta').textContent =
    `${FIXED_ASSET_TYPE_LABELS[asset.assetType] || asset.assetType} — ${FIXED_ASSET_STATUS_LABELS[asset.assetStatus] || asset.assetStatus}`;

  // إجمالي تكلفة الصيانة: حيّ من مجموع معاملات 'maintenance' — بمعزل تام عن التكلفة الدفترية (لا يُضاف
  // إليها، انظر ملاحظة 'maintenance' مقابل 'improvement' في fixed-asset-service.js)
  const totalMaintenanceCost = transactions.filter(t => t.type === 'maintenance').reduce((s, t) => s + Number(t.amount || 0), 0);

  document.getElementById('asset-kpis').innerHTML = kpiGrid([
    { value: formatCurrency(computeAssetCostBasis(asset)), label: 'إجمالي التكلفة', tone: 'blue' },
    { value: formatCurrency(asset.accumulatedDepreciation || 0), label: 'مجمع الإهلاك', tone: 'red' },
    { value: formatCurrency(computeAssetBookValue(asset)), label: 'القيمة الدفترية', tone: 'green' },
    { value: formatCurrency(computeMonthlyDepreciation(asset)), label: 'القسط الشهري', tone: 'blue' },
    { value: formatCurrency(totalMaintenanceCost), label: 'إجمالي تكلفة الصيانة', tone: 'red' },
  ]);

  const detailRows = [
    ['التصنيف الفرعي', asset.category || '-'],
    ['تاريخ الشراء', formatDateArabic(asset.purchaseDate)],
    ['تاريخ بدء الاستخدام', formatDateArabic(asset.usageStartDate)],
    ['المورّد', asset.vendor || '-'],
    ['رقم الفاتورة', asset.invoiceNumber || '-'],
    ['الموقع/الحظيرة', locationName],
    ['المسؤول عن الأصل', employeeName],
    ['رقم اللوحة/السيريال', asset.serialNumber || '-'],
    ['مركز التكلفة', asset.costCenter || '-'],
    ['طريقة الدفع', ({ cash: 'نقدي', transfer: 'تحويل بنكي', cheque: 'شيك', credit: 'آجل', partnerContribution: 'مساهمة من شريك' })[asset.paymentMethod] || '-'],
    ['العمر الإنتاجي', asset.assetType === 'land' ? 'لا يُهلك (أرض)' : (asset.usefulLifeYears ? `${formatNumber(asset.usefulLifeYears)} سنة` : '-')],
    ['القيمة المتبقية', asset.assetType === 'land' ? '-' : formatCurrency(asset.residualValue || 0)],
    ['ملاحظات', asset.notes || '-'],
  ];
  document.getElementById('asset-details').innerHTML = `
    <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px 20px; padding: var(--spacing-3);">
      ${detailRows.map(([label, value]) => `
        <div>
          <div style="font-size:11.5px; color: var(--color-text-secondary);">${label}</div>
          <div style="font-size:13.5px; font-weight:600;">${value}</div>
        </div>
      `).join('')}
    </div>
  `;

  _renderOperationsMenu(asset);
  _renderSaleDisposalInfo(asset, transactions);
  _renderTimeline(transactions);
}

// عمليات المرحلة الثانية — تُخفى بالكامل لأصل مباع/مستبعد (لا معنى لنقله/بيعه/استبعاده مجددًا)
function _renderOperationsMenu(asset) {
  const card = document.getElementById('asset-operations-card');
  // العمليات الخمس كلها تُعدّل الأصل (نقل/تحسين/صيانة/بيع/استبعاد) — تتطلب صلاحية "تعديل" على الأقل؛ الاستبعاد نفسه
  // مقيَّد أيضًا بمدير النظام حصرًا من داخل asset-disposal.html (انظر CLAUDE.md)، لا تكرار لذلك الفحص هنا
  if (asset.assetStatus === 'sold' || asset.assetStatus === 'disposed' || !hasActionPermission('assets', 'edit')) {
    card.style.display = 'none';
    return;
  }
  card.style.display = '';
  const items = [
    { label: '🔄 نقل الأصل', href: `asset-transfer.html?assetId=${asset.id}`, tone: 'blue' },
    { label: '🛠️ تحسينات', href: `asset-improvement.html?assetId=${asset.id}`, tone: 'blue' },
    { label: '🔧 صيانة', href: `asset-maintenance.html?assetId=${asset.id}`, tone: 'blue' },
    { label: '💰 بيع الأصل', href: `asset-sale.html?assetId=${asset.id}`, tone: 'green' },
    { label: '🗑️ استبعاد', href: `asset-disposal.html?assetId=${asset.id}`, tone: 'red' },
  ];
  document.getElementById('asset-operations-grid').innerHTML = kpiGrid(items, 4);
}

// لأصل مباع/مستبعد: يعرض تفاصيل آخر معاملة بيع/استبعاد من السجل الزمني بدل مساحة فارغة
function _renderSaleDisposalInfo(asset, transactions) {
  if (asset.assetStatus !== 'sold' && asset.assetStatus !== 'disposed') return;
  const txn = [...transactions].reverse().find(t => t.type === (asset.assetStatus === 'sold' ? 'sale' : 'disposal'));
  const card = document.getElementById('sale-disposal-info-card');
  card.style.display = '';
  const title = asset.assetStatus === 'sold' ? '💰 هذا الأصل مباع' : '🗑️ هذا الأصل مستبعد';
  const detail = txn
    ? `بتاريخ ${formatDateArabic(txn.date)}${asset.assetStatus === 'sold' ? ' — سعر البيع: ' + formatCurrency(txn.amount) : ' — الخسارة: ' + formatCurrency(txn.amount)}${txn.notes ? ' — ' + txn.notes : ''}`
    : '';
  document.getElementById('sale-disposal-info').innerHTML = `<strong>${title}</strong><div style="font-size:12.5px; margin-top:4px;">${detail}</div>`;
}

// أيقونة + عنوان كل نوع حركة في السجل الزمني — ⚠️ كانت هذه الدالة قبل هذا التعديل تفترض "إهلاك دوري" لكل
// الأنواع بلا تمييز (خطأ عرض قديم لم يُلاحَظ إلا الآن)؛ كل نوع له تمثيله الصحيح هنا
const FIXED_ASSET_TXN_TYPE_META = {
  depreciation: { icon: '📉', title: (t) => `إهلاك دوري - شهر ${t.period || '-'}` },
  improvement: { icon: '🛠️', title: () => 'تحسين على الأصل' },
  maintenance: { icon: '🔧', title: () => 'صيانة الأصل' },
  transfer: { icon: '🔄', title: () => 'نقل الأصل' },
  sale: { icon: '💰', title: () => 'بيع الأصل' },
  disposal: { icon: '🗑️', title: () => 'استبعاد الأصل' },
  countAdjustment: { icon: '📋', title: () => 'تعديل جرد' },
};

function _renderTimeline(transactions) {
  const container = document.getElementById('asset-timeline');
  if (!transactions.length) {
    container.innerHTML = '<p style="padding:12px; color: var(--color-text-secondary);">لا توجد حركات مرحّلة بعد</p>';
    return;
  }
  const sorted = [...transactions].sort((a, b) => (a.date === b.date ? 0 : (a.date < b.date ? 1 : -1))); // تنازليًا
  container.innerHTML = sorted.map(t => {
    const meta = FIXED_ASSET_TXN_TYPE_META[t.type] || { icon: '📄', title: () => t.type };
    return `
    <div style="display:flex; gap:12px; padding:10px 4px; border-bottom:1px solid var(--color-border);">
      <div style="font-size:20px;">${meta.icon}</div>
      <div style="flex:1;">
        <div style="font-weight:700; font-size:13.5px;">${meta.title(t)}</div>
        <div style="font-size:12.5px; color: var(--color-text-secondary);">${formatCurrency(t.amount)}${t.notes ? ' — ' + t.notes : ''}</div>
      </div>
      <div style="font-size:12px; color: var(--color-text-secondary); white-space:nowrap;">${formatDateArabic(t.date)}</div>
    </div>
  `;
  }).join('');
}

function _handleDelete() {
  confirmDelete('هل أنت متأكد من حذف هذا الأصل؟ سيُحذف أيضًا قيد الاقتناء المحاسبي المرتبط به إن وُجد.', async () => {
    await deleteFixedAsset(_currentAssetId);
    showToast('تم الحذف بنجاح', 'success');
    setTimeout(() => { window.location.href = 'asset-list.html'; }, 400);
  });
}
