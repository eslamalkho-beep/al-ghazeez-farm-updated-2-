// js/pages/bulk-purchase-form-page.js
// إنشاء/تعديل عملية شراء جملة مستقلة — بند واحد أو أكثر (نوع/جنس/سلالة/عدد/سعر) بتاريخ واحد للعملية كلها.
// عند الحفظ تُرحَّل محاسبيًا: مدين "مخزون الشراء والبيع الجماعي" (1035) / دائن "الصندوق" (1000)

let _editingPurchaseId = null;
let _purchaseLinesState = []; // { partyId, type, gender, breed, count, unitPrice }
let _suppliersCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('bulk');
  renderSidebar('bulk-purchases');
  renderHeader('مشتريات الجملة');

  const params = new URLSearchParams(window.location.search);
  const idParam = params.get('id');
  const _requiredAction = idParam ? 'edit' : 'add';
  if (!hasActionPermission('bulk', _requiredAction)) {
    showToast(idParam ? 'ليس لديك صلاحية تعديل مشتريات الجملة' : 'ليس لديك صلاحية إضافة عملية شراء جملة', 'error');
    window.location.href = 'bulk-purchases.html';
    return;
  }

  _suppliersCache = await getAllParties('supplier');

  if (idParam) {
    _editingPurchaseId = Number(idParam);
    await _loadPurchaseIntoForm(_editingPurchaseId);
    document.getElementById('form-title').textContent = 'تعديل عملية الشراء';
    if (hasActionPermission('bulk', 'delete')) {
      document.getElementById('delete-btn').style.display = 'inline-flex';
    }
  } else {
    document.getElementById('code').value = await generateNextBulkPurchaseCode();
    document.getElementById('date').value = todayIso();
  }

  _renderPurchaseLines();

  document.getElementById('add-purchase-line-btn').addEventListener('click', () => {
    _purchaseLinesState.push({ partyId: '', type: 'sheep', gender: 'female', breed: '', count: '', unitPrice: '' });
    _renderPurchaseLines();
  });

  document.getElementById('save-btn').addEventListener('click', _handleSave);
  document.getElementById('delete-btn').addEventListener('click', _handleDelete);
});

async function _loadPurchaseIntoForm(id) {
  const purchase = await getBulkPurchaseById(id);
  if (!purchase) {
    showToast('لم يتم العثور على عملية الشراء', 'error');
    window.location.href = 'bulk-purchases.html';
    return;
  }
  document.getElementById('code').value = purchase.code || '';
  document.getElementById('date').value = purchase.date || '';
  document.getElementById('notes').value = purchase.notes || '';
  _purchaseLinesState = (purchase.lines || []).map(l => ({ ...l }));
}

function _updateSummary() {
  const count = _purchaseLinesState.reduce((s, l) => s + Number(l.count || 0), 0);
  const cost = _purchaseLinesState.reduce((s, l) => s + Number(l.count || 0) * Number(l.unitPrice || 0), 0);
  document.getElementById('summary-count').textContent = formatNumber(count);
  document.getElementById('summary-cost').textContent = formatCurrency(cost);
}

function _renderPurchaseLines() {
  const container = document.getElementById('purchase-lines-list');
  container.innerHTML = _purchaseLinesState.map((line, idx) => {
    const total = Number(line.count || 0) * Number(line.unitPrice || 0);
    return `
    <div class="batch-line-row batch-line-row--purchase">
      <div class="batch-line-field">
        <label>المورّد</label>
        <select class="form-control pl-party" data-idx="${idx}">
          <option value="">-- غير محدد --</option>
          ${_suppliersCache.map(s => `<option value="${s.id}" ${String(line.partyId) === String(s.id) ? 'selected' : ''}>${s.name}</option>`).join('')}
        </select>
      </div>
      <div class="batch-line-field">
        <label>النوع</label>
        <select class="form-control pl-type" data-idx="${idx}">
          <option value="sheep" ${line.type === 'sheep' ? 'selected' : ''}>غنم</option>
          <option value="goat" ${line.type === 'goat' ? 'selected' : ''}>ماعز</option>
        </select>
      </div>
      <div class="batch-line-field">
        <label>الجنس</label>
        <select class="form-control pl-gender" data-idx="${idx}">
          <option value="female" ${line.gender === 'female' ? 'selected' : ''}>أنثى</option>
          <option value="male" ${line.gender === 'male' ? 'selected' : ''}>ذكر</option>
        </select>
      </div>
      <div class="batch-line-field">
        <label>السلالة</label>
        <input type="text" class="form-control pl-breed" data-idx="${idx}" value="${line.breed || ''}" />
      </div>
      <div class="batch-line-field">
        <label>العدد</label>
        <input type="number" class="form-control pl-count" data-idx="${idx}" min="1" step="1" value="${line.count ?? ''}" />
      </div>
      <div class="batch-line-field">
        <label>سعر الوحدة</label>
        <input type="number" class="form-control pl-price" data-idx="${idx}" min="0" step="0.01" value="${line.unitPrice ?? ''}" />
      </div>
      <div class="batch-line-total">${formatCurrency(total)}</div>
      <button type="button" class="batch-line-remove-btn pl-remove" data-idx="${idx}" title="حذف البند">×</button>
    </div>`;
  }).join('') || '<div class="empty-state">لا توجد بنود شراء بعد</div>';

  container.querySelectorAll('.pl-party').forEach(el => el.addEventListener('change', (e) => { _purchaseLinesState[Number(e.target.dataset.idx)].partyId = e.target.value; }));
  container.querySelectorAll('.pl-type').forEach(el => el.addEventListener('change', (e) => { _purchaseLinesState[Number(e.target.dataset.idx)].type = e.target.value; _renderPurchaseLines(); }));
  container.querySelectorAll('.pl-gender').forEach(el => el.addEventListener('change', (e) => { _purchaseLinesState[Number(e.target.dataset.idx)].gender = e.target.value; _renderPurchaseLines(); }));
  container.querySelectorAll('.pl-breed').forEach(el => el.addEventListener('input', (e) => { _purchaseLinesState[Number(e.target.dataset.idx)].breed = e.target.value; }));
  container.querySelectorAll('.pl-count').forEach(el => el.addEventListener('input', (e) => { _purchaseLinesState[Number(e.target.dataset.idx)].count = e.target.value; _renderPurchaseLines(); }));
  container.querySelectorAll('.pl-price').forEach(el => el.addEventListener('input', (e) => { _purchaseLinesState[Number(e.target.dataset.idx)].unitPrice = e.target.value; _renderPurchaseLines(); }));
  container.querySelectorAll('.pl-remove').forEach(el => el.addEventListener('click', (e) => { _purchaseLinesState.splice(Number(e.target.dataset.idx), 1); _renderPurchaseLines(); }));

  _updateSummary();
}

function _validateBeforeSave(date) {
  if (!isValidDate(date)) {
    showToast('يرجى إدخال تاريخ شراء صحيح', 'error');
    return false;
  }
  if (_purchaseLinesState.length === 0) {
    showToast('أضف بند شراء واحدًا على الأقل', 'error');
    return false;
  }
  for (const line of _purchaseLinesState) {
    if (!isRequired(line.breed) || !(Number(line.count) > 0) || !isPositiveNumber(line.unitPrice)) {
      showToast('تأكد من تعبئة كل بنود الشراء بشكل صحيح (السلالة، العدد، السعر)', 'error');
      return false;
    }
  }
  return true;
}

async function _handleSave() {
  const date = document.getElementById('date').value;
  if (!_validateBeforeSave(date)) return;

  const data = {
    code: document.getElementById('code').value,
    date,
    notes: document.getElementById('notes').value.trim(),
    lines: _purchaseLinesState.map(l => ({ partyId: l.partyId ? Number(l.partyId) : null, type: l.type, gender: l.gender, breed: l.breed.trim(), count: Number(l.count), unitPrice: Number(l.unitPrice) })),
    source: 'manual',
  };

  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'جاري الحفظ...';

  try {
    let savedId = _editingPurchaseId;
    if (_editingPurchaseId) {
      await updateBulkPurchase(_editingPurchaseId, data);
    } else {
      savedId = await createBulkPurchase(data);
    }

    await syncBulkPurchaseJournalEntry(savedId);

    showToast('تم الحفظ بنجاح', 'success');
    setTimeout(() => { window.location.href = 'bulk-purchases.html'; }, 400);
  } catch (err) {
    showToast('حدث خطأ أثناء الحفظ', 'error');
    saveBtn.disabled = false;
    saveBtn.textContent = 'حفظ';
  }
}

function _handleDelete() {
  confirmDelete('هل أنت متأكد من حذف عملية الشراء هذه بالكامل؟ سيُحذف أيضًا القيد المحاسبي المرتبط بها إن وُجد. لا يمكن التراجع عن هذا الإجراء.', async () => {
    await reverseBulkPurchaseJournalEntry(_editingPurchaseId);
    await deleteBulkPurchase(_editingPurchaseId);
    showToast('تم حذف عملية الشراء', 'success');
    setTimeout(() => { window.location.href = 'bulk-purchases.html'; }, 400);
  });
}
