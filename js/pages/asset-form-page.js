// js/pages/asset-form-page.js

let _editingAssetId = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('assets');
  renderSidebar('assets-list');
  renderHeader('تسجيل أصل ثابت جديد');

  const _paramsForPermCheck = new URLSearchParams(window.location.search);
  const _requiredAction = _paramsForPermCheck.get('id') ? 'edit' : 'add';
  if (!hasActionPermission('assets', _requiredAction)) {
    showToast(_paramsForPermCheck.get('id') ? 'ليس لديك صلاحية تعديل الأصول الثابتة' : 'ليس لديك صلاحية إضافة أصل ثابت', 'error');
    window.location.href = 'asset-list.html';
    return;
  }

  const [suppliers, partners, locations, employees] = await Promise.all([
    getAllParties('supplier'), getAllParties('partner'), getAllLocations(), dbGetAll('Employees'),
  ]);

  const partySelect = document.getElementById('partyId');
  partySelect.innerHTML += `<optgroup label="موردون">${suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}</optgroup>`
    + `<optgroup label="شركاء">${partners.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</optgroup>`;
  partySelect.addEventListener('change', _toggleVendorManualField);

  const locationSelect = document.getElementById('locationId');
  locationSelect.innerHTML += locations.map(l => `<option value="${l.id}">${l.name}</option>`).join('');

  const employeeSelect = document.getElementById('responsibleEmployeeId');
  employeeSelect.innerHTML += employees.filter(e => e.status !== 'deleted')
    .map(e => `<option value="${e.id}">${e.fullName}</option>`).join('');

  const params = new URLSearchParams(window.location.search);
  const idParam = params.get('id');

  if (idParam) {
    _editingAssetId = Number(idParam);
    await _loadAssetIntoForm(_editingAssetId);
    document.getElementById('form-title').textContent = 'تعديل أصل ثابت';
    if (hasActionPermission('assets', 'delete')) {
      document.getElementById('delete-btn').style.display = 'inline-flex';
    }
  } else {
    document.getElementById('purchaseDate').value = todayIso();
    document.getElementById('usageStartDate').value = todayIso();
  }

  document.getElementById('assetType').addEventListener('change', _toggleLandFields);
  ['purchaseCost', 'acquisitionAdditionalCosts', 'usefulLifeYears', 'residualValue'].forEach(id => {
    document.getElementById(id).addEventListener('input', _updateComputedLabels);
  });
  _toggleLandFields();
  _toggleVendorManualField();
  _updateComputedLabels();

  document.getElementById('asset-form').addEventListener('submit', _handleSubmit);
  document.getElementById('delete-btn').addEventListener('click', _handleDelete);
});

// الأرض لا تُهلك محاسبيًا — تُخفى حقول العمر الإنتاجي/القيمة المتبقية/القسط الشهري عند اختيارها
function _toggleLandFields() {
  const isLand = document.getElementById('assetType').value === 'land';
  document.querySelectorAll('.depreciation-field').forEach(el => { el.style.display = isLand ? 'none' : ''; });
  document.getElementById('land-note').style.display = isLand ? '' : 'none';
  _updateComputedLabels();
}

function _toggleVendorManualField() {
  const hasParty = !!document.getElementById('partyId').value;
  const manualInput = document.getElementById('vendor');
  manualInput.disabled = hasParty;
  if (hasParty) manualInput.value = '';
}

function _updateComputedLabels() {
  const purchaseCost = Number(document.getElementById('purchaseCost').value || 0);
  const additionalCosts = Number(document.getElementById('acquisitionAdditionalCosts').value || 0);
  const totalCost = purchaseCost + additionalCosts;
  document.getElementById('total-cost-label').textContent = formatCurrency(totalCost);

  const isLand = document.getElementById('assetType').value === 'land';
  if (!isLand) {
    const fakeAsset = {
      assetType: document.getElementById('assetType').value,
      purchaseCost, acquisitionAdditionalCosts: additionalCosts,
      usefulLifeYears: Number(document.getElementById('usefulLifeYears').value || 0),
      residualValue: Number(document.getElementById('residualValue').value || 0),
    };
    document.getElementById('monthly-depreciation-label').textContent = formatCurrency(computeMonthlyDepreciation(fakeAsset));
  }
}

async function _loadAssetIntoForm(id) {
  const asset = await getFixedAssetById(id);
  if (!asset) {
    showToast('لم يتم العثور على الأصل', 'error');
    window.location.href = 'asset-list.html';
    return;
  }
  document.getElementById('name').value = asset.name || '';
  document.getElementById('assetType').value = asset.assetType || 'other';
  document.getElementById('category').value = asset.category || '';
  document.getElementById('purchaseDate').value = asset.purchaseDate || '';
  document.getElementById('usageStartDate').value = asset.usageStartDate || '';
  document.getElementById('invoiceNumber').value = asset.invoiceNumber || '';
  document.getElementById('partyId').value = asset.partyId || '';
  const partyStillExists = document.getElementById('partyId').value === String(asset.partyId || '');
  document.getElementById('vendor').value = (asset.partyId && partyStillExists) ? '' : (asset.vendor || '');
  document.getElementById('locationId').value = asset.locationId || '';
  document.getElementById('responsibleEmployeeId').value = asset.responsibleEmployeeId || '';
  document.getElementById('serialNumber').value = asset.serialNumber || '';
  document.getElementById('costCenter').value = asset.costCenter || '';
  document.getElementById('purchaseCost').value = asset.purchaseCost ?? '';
  document.getElementById('acquisitionAdditionalCosts').value = asset.acquisitionAdditionalCosts ?? 0;
  document.getElementById('paymentMethod').value = asset.paymentMethod || 'cash';
  document.getElementById('usefulLifeYears').value = asset.usefulLifeYears ?? '';
  document.getElementById('residualValue').value = asset.residualValue ?? 0;
  document.getElementById('notes').value = asset.notes || '';
}

async function _handleSubmit(e) {
  e.preventDefault();

  const isValid = validateForm([
    { fieldId: 'name', validatorFn: isRequired, message: 'اسم الأصل مطلوب' },
    { fieldId: 'purchaseDate', validatorFn: isValidDate, message: 'التاريخ مطلوب' },
    { fieldId: 'usageStartDate', validatorFn: isValidDate, message: 'التاريخ مطلوب' },
    { fieldId: 'purchaseCost', validatorFn: isPositiveNumber, message: 'أدخل تكلفة صحيحة' },
  ]);
  if (!isValid) return;

  const paymentMethodValue = document.getElementById('paymentMethod').value;
  const partyIdValue = document.getElementById('partyId').value;
  if (paymentMethodValue === 'credit' && !partyIdValue) {
    showToast('الشراء الآجل يتطلب اختيار مورّد مسجّل (ليُحسب له كذمة دائنة)', 'error');
    return;
  }
  if (paymentMethodValue === 'partnerContribution') {
    if (!partyIdValue) {
      showToast('مساهمة الأصل تتطلب اختيار شريك مسجّل', 'error');
      return;
    }
    const selectedParty = await getPartyById(Number(partyIdValue));
    if (!selectedParty || selectedParty.type !== 'partner') {
      showToast('اختر شريكًا مسجّلاً (لا موردًا) لمساهمة الأصل', 'error');
      return;
    }
  }

  const partyId = partyIdValue ? Number(partyIdValue) : null;
  const selectedPartyName = partyId ? document.getElementById('partyId').selectedOptions[0].textContent : '';
  const vendor = partyId ? selectedPartyName : document.getElementById('vendor').value.trim();

  const locationIdValue = document.getElementById('locationId').value;
  const responsibleValue = document.getElementById('responsibleEmployeeId').value;

  const data = {
    name: document.getElementById('name').value.trim(),
    assetType: document.getElementById('assetType').value,
    category: document.getElementById('category').value.trim(),
    purchaseDate: document.getElementById('purchaseDate').value,
    usageStartDate: document.getElementById('usageStartDate').value,
    invoiceNumber: document.getElementById('invoiceNumber').value.trim(),
    partyId, vendor,
    locationId: locationIdValue ? Number(locationIdValue) : null,
    responsibleEmployeeId: responsibleValue ? Number(responsibleValue) : null,
    serialNumber: document.getElementById('serialNumber').value.trim(),
    costCenter: document.getElementById('costCenter').value.trim(),
    purchaseCost: Number(document.getElementById('purchaseCost').value),
    acquisitionAdditionalCosts: Number(document.getElementById('acquisitionAdditionalCosts').value || 0),
    paymentMethod: document.getElementById('paymentMethod').value,
    usefulLifeYears: Number(document.getElementById('usefulLifeYears').value || 0) || null,
    residualValue: Number(document.getElementById('residualValue').value || 0),
    notes: document.getElementById('notes').value.trim(),
  };

  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'جاري الحفظ...';

  try {
    if (_editingAssetId) {
      await updateFixedAsset(_editingAssetId, data);
    } else {
      await createFixedAsset(data);
    }
    showToast('تم الحفظ بنجاح', 'success');
    setTimeout(() => { window.location.href = 'asset-list.html'; }, 400);
  } catch (err) {
    showToast(err.message || 'حدث خطأ أثناء الحفظ', 'error');
    saveBtn.disabled = false;
    saveBtn.textContent = 'حفظ';
  }
}

function _handleDelete() {
  confirmDelete('هل أنت متأكد من حذف هذا الأصل؟ سيُحذف أيضًا قيد الاقتناء المحاسبي المرتبط به إن وُجد.', async () => {
    await deleteFixedAsset(_editingAssetId);
    showToast('تم الحذف بنجاح', 'success');
    setTimeout(() => { window.location.href = 'asset-list.html'; }, 400);
  });
}
