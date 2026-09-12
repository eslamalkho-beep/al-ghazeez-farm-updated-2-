// js/pages/asset-maintenance-page.js
// يتطلب ?assetId= (يُفتَح دومًا من زر "🔧 صيانة" في asset-card.html) — نفس نمط asset-improvement-page.js
// تمامًا، لكنه ينشئ حركة "صيانة" (مصروف عادي بلا رسملة) بدل "تحسين" (يزيد التكلفة الدفترية)

let _assetId = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('assets');
  renderSidebar('assets-list');
  renderHeader('صيانة الأصل');

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
    `القيمة الدفترية الحالية: ${formatCurrency(computeAssetBookValue(asset))} (لن تتأثر بالصيانة)`;

  const partySelect = document.getElementById('partyId');
  partySelect.innerHTML += suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

  document.getElementById('date').value = todayIso();
  document.getElementById('maintenance-form').addEventListener('submit', _handleSubmit);
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
    showToast('الصيانة الآجلة تتطلب اختيار مورّد مسجّل', 'error');
    return;
  }

  const partyIdValue = document.getElementById('partyId').value;
  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'جاري الحفظ...';

  try {
    await createFixedAssetMaintenance(_assetId, {
      date: document.getElementById('date').value,
      amount: Number(document.getElementById('amount').value),
      paymentMethod: document.getElementById('paymentMethod').value,
      partyId: partyIdValue ? Number(partyIdValue) : null,
      description: document.getElementById('description').value.trim(),
    });
    showToast('تم حفظ الصيانة بنجاح', 'success');
    setTimeout(() => { window.location.href = `asset-card.html?id=${_assetId}`; }, 400);
  } catch (err) {
    showToast(err.message || 'حدث خطأ أثناء الحفظ', 'error');
    saveBtn.disabled = false;
    saveBtn.textContent = 'حفظ الصيانة';
  }
}
