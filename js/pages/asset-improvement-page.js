// js/pages/asset-improvement-page.js
// يتطلب ?assetId= (يُفتَح دومًا من زر "تحسينات" في asset-card.html)

let _assetId = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('assets');
  renderSidebar('assets-list');
  renderHeader('تحسينات على الأصل');

  const params = new URLSearchParams(window.location.search);
  _assetId = Number(params.get('assetId'));
  if (!_assetId) {
    showToast('اختر أصلًا أولاً من سجل الأصول', 'error');
    window.location.href = 'asset-list.html';
    return;
  }

  const [asset, suppliers] = await Promise.all([getFixedAssetById(_assetId), getAllParties('supplier')]);
  if (!asset) {
    showToast('الأصل غير موجود', 'error');
    window.location.href = 'asset-list.html';
    return;
  }

  document.getElementById('back-link').href = `asset-card.html?id=${_assetId}`;
  document.getElementById('cancel-link').href = `asset-card.html?id=${_assetId}`;
  document.getElementById('asset-label').textContent = `${asset.name} (${asset.assetCode})`;
  document.getElementById('asset-current-info').textContent =
    `التكلفة الحالية: ${formatCurrency(computeAssetCostBasis(asset))}`;

  const partySelect = document.getElementById('partyId');
  partySelect.innerHTML += suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

  document.getElementById('date').value = todayIso();
  document.getElementById('improvement-form').addEventListener('submit', _handleSubmit);
});

async function _handleSubmit(e) {
  e.preventDefault();
  const isValid = validateForm([
    { fieldId: 'date', validatorFn: isValidDate, message: 'التاريخ مطلوب' },
    { fieldId: 'amount', validatorFn: isPositiveNumber, message: 'أدخل مبلغًا صحيحًا' },
  ]);
  if (!isValid) return;

  const isCredit = document.getElementById('paymentMethod').value === 'credit';
  if (isCredit && !document.getElementById('partyId').value) {
    showToast('التحسين الآجل يتطلب اختيار مورّد مسجّل', 'error');
    return;
  }

  const partyIdValue = document.getElementById('partyId').value;
  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'جاري الحفظ...';

  try {
    await createFixedAssetImprovement(_assetId, {
      date: document.getElementById('date').value,
      amount: Number(document.getElementById('amount').value),
      paymentMethod: document.getElementById('paymentMethod').value,
      partyId: partyIdValue ? Number(partyIdValue) : null,
      description: document.getElementById('description').value.trim(),
    });
    showToast('تم حفظ التحسين بنجاح', 'success');
    setTimeout(() => { window.location.href = `asset-card.html?id=${_assetId}`; }, 400);
  } catch (err) {
    showToast(err.message || 'حدث خطأ أثناء الحفظ', 'error');
    saveBtn.disabled = false;
    saveBtn.textContent = 'حفظ التحسين';
  }
}
