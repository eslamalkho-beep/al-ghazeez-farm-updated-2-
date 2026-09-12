// js/pages/asset-disposal-page.js
// يتطلب ?assetId= (يُفتَح دومًا من زر "استبعاد" في asset-card.html) — مقصور على مدير النظام
// (نفس فحص resolveRoleKey(role) === 'systemAdmin' المطبَّق فعليًا داخل disposeFixedAsset نفسها)

let _assetId = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('assets');
  renderSidebar('assets-list');
  renderHeader('استبعاد الأصل');

  const params = new URLSearchParams(window.location.search);
  _assetId = Number(params.get('assetId'));
  if (!_assetId) {
    showToast('اختر أصلًا أولاً من سجل الأصول', 'error');
    window.location.href = 'asset-list.html';
    return;
  }

  const asset = await getFixedAssetById(_assetId);
  if (!asset) {
    showToast('الأصل غير موجود', 'error');
    window.location.href = 'asset-list.html';
    return;
  }
  if (asset.assetStatus === 'sold' || asset.assetStatus === 'disposed') {
    showToast('هذا الأصل مباع أو مستبعد بالفعل', 'error');
    window.location.href = `asset-card.html?id=${_assetId}`;
    return;
  }

  document.getElementById('back-link').href = `asset-card.html?id=${_assetId}`;
  document.getElementById('cancel-link').href = `asset-card.html?id=${_assetId}`;
  document.getElementById('asset-label').textContent = `${asset.name} (${asset.assetCode})`;

  const bookValue = computeAssetBookValue(asset);
  document.getElementById('asset-kpis').innerHTML = kpiGrid([
    { value: formatCurrency(computeAssetCostBasis(asset)), label: 'إجمالي التكلفة', tone: 'blue' },
    { value: formatCurrency(asset.accumulatedDepreciation || 0), label: 'مجمع الإهلاك', tone: 'red' },
    { value: formatCurrency(bookValue), label: 'الخسارة المتوقّعة عند الاستبعاد', tone: 'red' },
  ]);

  const currentUser = getCurrentUser();
  const isAdmin = currentUser && resolveRoleKey(currentUser.role) === 'systemAdmin';
  if (!isAdmin) {
    document.getElementById('not-admin-notice').style.display = '';
    document.getElementById('disposal-card').style.display = 'none';
    return;
  }

  document.getElementById('date').value = todayIso();
  document.getElementById('disposal-form').addEventListener('submit', _handleSubmit);
});

async function _handleSubmit(e) {
  e.preventDefault();
  const isValid = validateForm([
    { fieldId: 'date', validatorFn: isValidDate, message: 'التاريخ مطلوب' },
    { fieldId: 'reason', validatorFn: isRequired, message: 'سبب الاستبعاد مطلوب' },
  ]);
  if (!isValid) return;

  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'جاري التنفيذ...';

  try {
    const result = await disposeFixedAsset(_assetId, {
      date: document.getElementById('date').value,
      reason: document.getElementById('reason').value.trim(),
    });
    showToast(`تم استبعاد الأصل بنجاح (خسارة ${formatCurrency(result.lossAmount)})`, 'success');
    setTimeout(() => { window.location.href = `asset-card.html?id=${_assetId}`; }, 500);
  } catch (err) {
    showToast(err.message || 'حدث خطأ أثناء الاستبعاد', 'error');
    saveBtn.disabled = false;
    saveBtn.textContent = 'تنفيذ الاستبعاد';
  }
}
