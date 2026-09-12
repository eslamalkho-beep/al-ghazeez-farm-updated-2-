// js/pages/asset-sale-page.js
// يتطلب ?assetId= (يُفتَح دومًا من زر "بيع الأصل" في asset-card.html)

let _assetId = null;
let _currentAssetForSale = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('assets');
  renderSidebar('assets-list');
  renderHeader('بيع الأصل');

  const params = new URLSearchParams(window.location.search);
  _assetId = Number(params.get('assetId'));
  if (!_assetId) {
    showToast('اختر أصلًا أولاً من سجل الأصول', 'error');
    window.location.href = 'asset-list.html';
    return;
  }

  const [asset, clients] = await Promise.all([getFixedAssetById(_assetId), getAllParties('client')]);
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
  _currentAssetForSale = asset;

  document.getElementById('back-link').href = `asset-card.html?id=${_assetId}`;
  document.getElementById('cancel-link').href = `asset-card.html?id=${_assetId}`;
  document.getElementById('asset-label').textContent = `${asset.name} (${asset.assetCode})`;

  const costBasis = computeAssetCostBasis(asset);
  const bookValue = computeAssetBookValue(asset);
  document.getElementById('asset-kpis').innerHTML = kpiGrid([
    { value: formatCurrency(costBasis), label: 'إجمالي التكلفة', tone: 'blue' },
    { value: formatCurrency(asset.accumulatedDepreciation || 0), label: 'مجمع الإهلاك', tone: 'red' },
    { value: formatCurrency(bookValue), label: 'القيمة الدفترية الحالية', tone: 'green' },
  ]);

  const partySelect = document.getElementById('partyId');
  partySelect.innerHTML += clients.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  partySelect.addEventListener('change', _toggleBuyerManualField);

  document.getElementById('date').value = todayIso();
  document.getElementById('salePrice').addEventListener('input', _updateGainLossLabel);
  _toggleBuyerManualField();
  _updateGainLossLabel();

  document.getElementById('sale-form').addEventListener('submit', _handleSubmit);
});

function _toggleBuyerManualField() {
  const hasParty = !!document.getElementById('partyId').value;
  const manualInput = document.getElementById('buyerName');
  manualInput.disabled = hasParty;
  if (hasParty) manualInput.value = '';
}

function _updateGainLossLabel() {
  const salePrice = Number(document.getElementById('salePrice').value || 0);
  const bookValue = computeAssetBookValue(_currentAssetForSale);
  const gainLoss = salePrice - bookValue;
  const label = document.getElementById('gain-loss-label');
  if (Math.abs(gainLoss) < 0.01) {
    label.textContent = 'لا يوجد ربح أو خسارة (سعر البيع = القيمة الدفترية)';
  } else if (gainLoss > 0) {
    label.textContent = `ربح: ${formatCurrency(gainLoss)}`;
  } else {
    label.textContent = `خسارة: ${formatCurrency(-gainLoss)}`;
  }
}

async function _handleSubmit(e) {
  e.preventDefault();
  const isValid = validateForm([
    { fieldId: 'date', validatorFn: isValidDate, message: 'التاريخ مطلوب' },
    { fieldId: 'salePrice', validatorFn: isPositiveNumber, message: 'أدخل سعرًا صحيحًا' },
  ]);
  if (!isValid) return;

  const isCredit = document.getElementById('paymentMethod').value === 'credit';
  if (isCredit && !document.getElementById('partyId').value) {
    showToast('البيع الآجل يتطلب اختيار عميل مسجّل', 'error');
    return;
  }

  const partyIdValue = document.getElementById('partyId').value;
  const partyId = partyIdValue ? Number(partyIdValue) : null;
  const selectedPartyName = partyId ? document.getElementById('partyId').selectedOptions[0].textContent : '';
  const buyerName = partyId ? selectedPartyName : document.getElementById('buyerName').value.trim();

  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'جاري التنفيذ...';

  try {
    const result = await sellFixedAsset(_assetId, {
      date: document.getElementById('date').value,
      salePrice: Number(document.getElementById('salePrice').value),
      paymentMethod: document.getElementById('paymentMethod').value,
      partyId, buyerName,
      notes: document.getElementById('notes').value.trim(),
    });
    const gainLossLabel = Math.abs(result.gainLoss) < 0.01 ? '' : (result.gainLoss > 0 ? ` (ربح ${formatCurrency(result.gainLoss)})` : ` (خسارة ${formatCurrency(-result.gainLoss)})`);
    showToast(`تم تنفيذ البيع بنجاح${gainLossLabel}`, 'success');
    setTimeout(() => { window.location.href = `asset-card.html?id=${_assetId}`; }, 500);
  } catch (err) {
    showToast(err.message || 'حدث خطأ أثناء تنفيذ البيع', 'error');
    saveBtn.disabled = false;
    saveBtn.textContent = 'تنفيذ البيع';
  }
}
