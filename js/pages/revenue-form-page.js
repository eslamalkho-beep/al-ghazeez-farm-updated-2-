// js/pages/revenue-form-page.js

let _editingRevenueId = null;
let _saleAnimals = [];

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('revenues');
  renderSidebar('revenues');
  renderHeader('تكويد إيراد جديد');

  const revenueCategories = await getCategoryNames('revenue');
  document.getElementById('category').innerHTML = revenueCategories.map(c => `<option value="${c}">${c}</option>`).join('');
  document.getElementById('category').addEventListener('change', _toggleAnimalField);

  const clients = await getAllParties('client');
  const partySelect = document.getElementById('partyId');
  partySelect.innerHTML = `<option value="">-- اختر عميلاً مسجّلاً --</option>` +
    clients.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  partySelect.addEventListener('change', _toggleClientManualField);

  const params = new URLSearchParams(window.location.search);
  const idParam = params.get('id');

  if (idParam) {
    _editingRevenueId = Number(idParam);
    await _loadRevenueIntoForm(_editingRevenueId);
    document.getElementById('form-title').textContent = 'تعديل إيراد';
    document.getElementById('delete-btn').style.display = 'inline-flex';
  } else {
    document.getElementById('date').value = todayIso();
    await _populateAnimalSelect();
  }

  _toggleAnimalField();
  _toggleClientManualField();

  document.getElementById('amount').addEventListener('input', _updateTaxBreakdown);
  document.getElementById('hasTaxInvoice').addEventListener('change', _updateTaxBreakdown);
  _updateTaxBreakdown();

  document.getElementById('revenue-form').addEventListener('submit', _handleSubmit);
  document.getElementById('delete-btn').addEventListener('click', _handleDelete);
});

// لو المستخدم اختار عميلاً مسجّلاً، نعطّل الحقل اليدوي (العميل المسجّل هو المصدر)
function _toggleClientManualField() {
  const hasParty = !!document.getElementById('partyId').value;
  const manualInput = document.getElementById('client');
  manualInput.disabled = hasParty;
  if (hasParty) manualInput.value = '';
}

function _updateTaxBreakdown() {
  const group = document.getElementById('tax-breakdown-group');
  if (document.getElementById('hasTaxInvoice').value !== 'yes') {
    group.style.display = 'none';
    return;
  }
  const { amountBeforeTax, taxAmount } = calculateTaxBreakdown(document.getElementById('amount').value);
  document.getElementById('tax-before-label').textContent = formatCurrency(amountBeforeTax);
  document.getElementById('tax-value-label').textContent = formatCurrency(taxAmount);
  group.style.display = '';
}

async function _populateAnimalSelect(selectedAnimalId = null) {
  const allAnimals = await getAllAnimals();
  _saleAnimals = allAnimals.filter(a => a.status === 'alive' || a.id === selectedAnimalId);

  const select = document.getElementById('animalId');
  select.innerHTML = _saleAnimals.length
    ? _saleAnimals.map(a => `<option value="${a.id}">${a.code} — ${ANIMAL_TYPE_LABELS[a.type] || a.type} (${a.breed})</option>`).join('')
    : `<option value="">لا توجد حيوانات متاحة للبيع</option>`;

  if (selectedAnimalId) select.value = String(selectedAnimalId);
}

function _toggleAnimalField() {
  const isSale = document.getElementById('category').value === 'بيع حيوان';
  document.getElementById('animal-field-group').style.display = isSale ? '' : 'none';
}

async function _loadRevenueIntoForm(id) {
  const revenue = await dbGet('Revenues', id);
  if (!revenue) {
    showToast('لم يتم العثور على الإيراد', 'error');
    window.location.href = 'revenue-list.html';
    return;
  }
  const categorySelect = document.getElementById('category');
  categorySelect.value = revenue.category || '';
  if (revenue.category && categorySelect.value !== revenue.category) {
    const opt = document.createElement('option');
    opt.value = revenue.category;
    opt.textContent = `${revenue.category} (بند محذوف)`;
    categorySelect.prepend(opt);
    categorySelect.value = revenue.category;
  }
  document.getElementById('amount').value = revenue.amount ?? '';
  document.getElementById('date').value = revenue.date || '';
  document.getElementById('hasTaxInvoice').value = revenue.hasTaxInvoice ? 'yes' : 'no';
  document.getElementById('receiveMethod').value = revenue.receiveMethod || 'cash';
  const partySelect = document.getElementById('partyId');
  partySelect.value = revenue.partyId || '';
  const partyStillExists = partySelect.value === String(revenue.partyId || '');
  document.getElementById('client').value = (revenue.partyId && partyStillExists) ? '' : (revenue.client || '');
  document.getElementById('notes').value = revenue.notes || '';
  await _populateAnimalSelect(revenue.animalId || null);
}

async function _handleSubmit(e) {
  e.preventDefault();

  const isSale = document.getElementById('category').value === 'بيع حيوان';

  const validations = [
    { fieldId: 'amount', validatorFn: isPositiveNumber, message: 'أدخل مبلغًا صحيحًا' },
    { fieldId: 'date', validatorFn: isValidDate, message: 'التاريخ مطلوب' },
  ];
  if (isSale) {
    validations.push({ fieldId: 'animalId', validatorFn: isRequired, message: 'يرجى اختيار الحيوان' });
  }

  const isValid = validateForm(validations);
  if (!isValid) return;

  const animalIdValue = document.getElementById('animalId').value;
  const newAnimalId = isSale && animalIdValue ? Number(animalIdValue) : null;

  const hasTaxInvoice = document.getElementById('hasTaxInvoice').value === 'yes';
  const amount = Number(document.getElementById('amount').value);
  const { amountBeforeTax, taxAmount } = hasTaxInvoice
    ? calculateTaxBreakdown(amount)
    : { amountBeforeTax: null, taxAmount: null };

  const partyIdValue = document.getElementById('partyId').value;
  const partyId = partyIdValue ? Number(partyIdValue) : null;
  const selectedPartyName = partyId ? document.getElementById('partyId').selectedOptions[0].textContent : '';
  const client = partyId ? selectedPartyName : document.getElementById('client').value.trim();

  const data = {
    category: document.getElementById('category').value,
    amount,
    date: document.getElementById('date').value,
    hasTaxInvoice,
    amountBeforeTax,
    taxAmount,
    receiveMethod: document.getElementById('receiveMethod').value,
    partyId,
    client,
    notes: document.getElementById('notes').value.trim(),
    animalId: newAnimalId,
  };

  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'جاري الحفظ...';

  try {
    let previousAnimalId = null;
    if (_editingRevenueId) {
      const existing = await dbGet('Revenues', _editingRevenueId);
      previousAnimalId = existing ? existing.animalId : null;
      await updateRevenue(_editingRevenueId, data);
    } else {
      await createRevenue(data);
    }

    if (previousAnimalId && previousAnimalId !== newAnimalId) {
      await updateAnimal(previousAnimalId, { status: 'alive' });
    }
    if (newAnimalId) {
      await updateAnimal(newAnimalId, { status: 'sold' });
    }

    showToast('تم الحفظ بنجاح', 'success');
    setTimeout(() => { window.location.href = 'revenue-list.html'; }, 400);
  } catch (err) {
    showToast('حدث خطأ أثناء الحفظ', 'error');
    saveBtn.disabled = false;
    saveBtn.textContent = 'حفظ';
  }
}

function _handleDelete() {
  confirmDelete('هل أنت متأكد من حذف هذا الإيراد؟', async () => {
    const existing = await dbGet('Revenues', _editingRevenueId);
    await deleteRevenue(_editingRevenueId);
    if (existing && existing.animalId) {
      await updateAnimal(existing.animalId, { status: 'alive' });
    }
    showToast('تم الحذف بنجاح', 'success');
    setTimeout(() => { window.location.href = 'revenue-list.html'; }, 400);
  });
}
