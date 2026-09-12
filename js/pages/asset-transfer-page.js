// js/pages/asset-transfer-page.js
// يتطلب ?assetId= (لا صفحة اختيار مستقلة — يُفتَح دومًا من زر "نقل الأصل" في asset-card.html)

let _assetId = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('assets');
  renderSidebar('assets-list');
  renderHeader('نقل الأصل');

  const params = new URLSearchParams(window.location.search);
  _assetId = Number(params.get('assetId'));
  if (!_assetId) {
    showToast('اختر أصلًا أولاً من سجل الأصول', 'error');
    window.location.href = 'asset-list.html';
    return;
  }

  const [asset, locations, employees] = await Promise.all([
    getFixedAssetById(_assetId), getAllLocations(), dbGetAll('Employees'),
  ]);
  if (!asset) {
    showToast('الأصل غير موجود', 'error');
    window.location.href = 'asset-list.html';
    return;
  }

  document.getElementById('back-link').href = `asset-card.html?id=${_assetId}`;
  document.getElementById('cancel-link').href = `asset-card.html?id=${_assetId}`;
  document.getElementById('asset-label').textContent = `${asset.name} (${asset.assetCode})`;
  const currentLocation = locations.find(l => l.id === asset.locationId)?.name || 'بلا موقع محدد';
  const currentResponsible = employees.find(e => e.id === asset.responsibleEmployeeId)?.fullName || 'بلا مسؤول محدد';
  document.getElementById('asset-current-info').textContent = `الموقع الحالي: ${currentLocation} — المسؤول الحالي: ${currentResponsible}`;

  const locationSelect = document.getElementById('locationId');
  locationSelect.innerHTML += locations.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
  locationSelect.value = asset.locationId || '';

  const employeeSelect = document.getElementById('responsibleEmployeeId');
  employeeSelect.innerHTML += employees.filter(e => e.status !== 'deleted').map(e => `<option value="${e.id}">${e.fullName}</option>`).join('');
  employeeSelect.value = asset.responsibleEmployeeId || '';

  document.getElementById('date').value = todayIso();
  document.getElementById('transfer-form').addEventListener('submit', _handleSubmit);
});

async function _handleSubmit(e) {
  e.preventDefault();
  const isValid = validateForm([{ fieldId: 'date', validatorFn: isValidDate, message: 'التاريخ مطلوب' }]);
  if (!isValid) return;

  const locationValue = document.getElementById('locationId').value;
  const responsibleValue = document.getElementById('responsibleEmployeeId').value;

  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'جاري النقل...';

  try {
    await createFixedAssetTransfer(_assetId, {
      date: document.getElementById('date').value,
      locationId: locationValue ? Number(locationValue) : null,
      responsibleEmployeeId: responsibleValue ? Number(responsibleValue) : null,
      notes: document.getElementById('notes').value.trim(),
    });
    showToast('تم تنفيذ النقل بنجاح', 'success');
    setTimeout(() => { window.location.href = `asset-card.html?id=${_assetId}`; }, 400);
  } catch (err) {
    showToast(err.message || 'حدث خطأ أثناء النقل', 'error');
    saveBtn.disabled = false;
    saveBtn.textContent = 'تنفيذ النقل';
  }
}
