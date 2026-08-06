// js/pages/purchase-form-page.js

let _editingPurchaseId = null;
let _originalPurchaseStatus = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('purchases');
  renderSidebar('purchases');
  renderHeader('تكويد مشترى جديد');

  const purchaseCategories = await getCategoryNames('purchase');
  document.getElementById('category').innerHTML = purchaseCategories.map(c => `<option value="${c}">${c}</option>`).join('');

  const suppliers = await getAllParties('supplier');
  const partySelect = document.getElementById('partyId');
  partySelect.innerHTML = `<option value="">-- اختر موردًا مسجّلاً --</option>` +
    suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  partySelect.addEventListener('change', _toggleVendorManualField);

  const params = new URLSearchParams(window.location.search);
  const idParam = params.get('id');

  if (idParam) {
    _editingPurchaseId = Number(idParam);
    await _loadPurchaseIntoForm(_editingPurchaseId);
    document.getElementById('form-title').textContent = 'تعديل مشترى';
    document.getElementById('delete-btn').style.display = 'inline-flex';
  } else {
    document.getElementById('date').value = todayIso();
  }

  document.getElementById('amount').addEventListener('input', _updateTaxBreakdown);
  document.getElementById('hasTaxInvoice').addEventListener('change', _updateTaxBreakdown);
  _updateTaxBreakdown();
  _toggleVendorManualField();

  document.getElementById('purchase-form').addEventListener('submit', _handleSubmit);
  document.getElementById('delete-btn').addEventListener('click', _handleDelete);
});

// لو المستخدم اختار موردًا مسجّلاً، نعطّل الحقل اليدوي (المورّد المسجّل هو المصدر)
function _toggleVendorManualField() {
  const hasParty = !!document.getElementById('partyId').value;
  const manualInput = document.getElementById('vendor');
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

async function _loadPurchaseIntoForm(id) {
  const purchase = await dbGet('Purchases', id);
  if (!purchase) {
    showToast('لم يتم العثور على المشترى', 'error');
    window.location.href = 'purchase-list.html';
    return;
  }
  const categorySelect = document.getElementById('category');
  categorySelect.value = purchase.category || '';
  if (purchase.category && categorySelect.value !== purchase.category) {
    const opt = document.createElement('option');
    opt.value = purchase.category;
    opt.textContent = `${purchase.category} (بند محذوف)`;
    categorySelect.prepend(opt);
    categorySelect.value = purchase.category;
  }
  document.getElementById('amount').value = purchase.amount ?? '';
  document.getElementById('date').value = purchase.date || '';
  document.getElementById('hasTaxInvoice').value = purchase.hasTaxInvoice ? 'yes' : 'no';
  document.getElementById('paymentMethod').value = purchase.paymentMethod || 'cash';
  const partySelect = document.getElementById('partyId');
  partySelect.value = purchase.partyId || '';
  const partyStillExists = partySelect.value === String(purchase.partyId || '');
  document.getElementById('vendor').value = (purchase.partyId && partyStillExists) ? '' : (purchase.vendor || '');
  document.getElementById('status').value = purchase.status || 'approved';
  document.getElementById('notes').value = purchase.notes || '';
  _originalPurchaseStatus = purchase.status || 'approved';
}

async function _handleSubmit(e) {
  e.preventDefault();

  const isValid = validateForm([
    { fieldId: 'amount', validatorFn: isPositiveNumber, message: 'أدخل مبلغًا صحيحًا' },
    { fieldId: 'date', validatorFn: isValidDate, message: 'التاريخ مطلوب' },
  ]);
  if (!isValid) return;

  const hasTaxInvoice = document.getElementById('hasTaxInvoice').value === 'yes';
  const amount = Number(document.getElementById('amount').value);
  const { amountBeforeTax, taxAmount } = hasTaxInvoice
    ? calculateTaxBreakdown(amount)
    : { amountBeforeTax: null, taxAmount: null };

  const partyIdValue = document.getElementById('partyId').value;
  const partyId = partyIdValue ? Number(partyIdValue) : null;
  const selectedPartyName = partyId ? document.getElementById('partyId').selectedOptions[0].textContent : '';
  const vendor = partyId ? selectedPartyName : document.getElementById('vendor').value.trim();

  const data = {
    category: document.getElementById('category').value,
    amount,
    date: document.getElementById('date').value,
    hasTaxInvoice,
    amountBeforeTax,
    taxAmount,
    paymentMethod: document.getElementById('paymentMethod').value,
    partyId,
    vendor,
    status: document.getElementById('status').value,
    notes: document.getElementById('notes').value.trim(),
  };

  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'جاري الحفظ...';

  try {
    const isNewPurchase = !_editingPurchaseId;
    let savedPurchaseId = _editingPurchaseId;
    if (_editingPurchaseId) {
      await updatePurchase(_editingPurchaseId, data);
    } else {
      savedPurchaseId = await createPurchase(data);
    }

    await syncPurchaseJournalEntry(savedPurchaseId);

    const becamePending = data.status === 'pending' && (isNewPurchase || _originalPurchaseStatus !== 'pending');
    if (becamePending) {
      await createNotification({
        type: 'finance',
        title: 'مشترى بانتظار الاعتماد',
        message: `مشترى "${data.category}" بمبلغ ${formatCurrency(data.amount)} بانتظار الاعتماد`,
        relatedEntityId: savedPurchaseId,
      });
    }

    showToast('تم الحفظ بنجاح', 'success');
    setTimeout(() => { window.location.href = 'purchase-list.html'; }, 400);
  } catch (err) {
    showToast('حدث خطأ أثناء الحفظ', 'error');
    saveBtn.disabled = false;
    saveBtn.textContent = 'حفظ';
  }
}

function _handleDelete() {
  confirmDelete('هل أنت متأكد من حذف هذا المشترى؟ سيُحذف أيضًا القيد المحاسبي المرتبط به إن وُجد.', async () => {
    await reversePurchaseJournalEntry(_editingPurchaseId);
    await deletePurchase(_editingPurchaseId);
    showToast('تم الحذف بنجاح', 'success');
    setTimeout(() => { window.location.href = 'purchase-list.html'; }, 400);
  });
}
