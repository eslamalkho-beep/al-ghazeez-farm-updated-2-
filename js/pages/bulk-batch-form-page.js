// js/pages/bulk-batch-form-page.js
// إنشاء/تعديل دفعة شراء وبيع جماعي — بنود شراء (يوم واحد للدفعة) + بنود بيع/مصاريف (كل بند بتاريخه الخاص)
// البيع حرّ تمامًا: لا يُشترط تطابق بنود البيع مع تركيبات الشراء ولا مع العدد المتبقي

let _editingBatchId = null;
let _purchaseLinesState = []; // { partyId, type, gender, breed, count, unitPrice }
let _saleLinesState = [];     // { partyId, date, type, gender, breed, count, unitPrice }
let _expenseLinesState = [];  // { date, description, amount }
let _suppliersCache = [];
let _clientsCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('bulk');
  renderSidebar('bulk');
  renderHeader('الشراء والبيع الجماعي');

  _suppliersCache = await getAllParties('supplier');
  _clientsCache = await getAllParties('client');

  const params = new URLSearchParams(window.location.search);
  const idParam = params.get('id');

  if (idParam) {
    _editingBatchId = Number(idParam);
    await _loadBatchIntoForm(_editingBatchId);
    document.getElementById('form-title').textContent = 'تعديل الدفعة';
    document.getElementById('delete-btn').style.display = 'inline-flex';
  } else {
    document.getElementById('code').value = await generateNextBulkBatchCode();
    document.getElementById('purchaseDate').value = todayIso();
  }

  _renderPurchaseLines();
  _renderSaleLines();
  _renderExpenseLines();

  document.getElementById('add-purchase-line-btn').addEventListener('click', () => {
    _purchaseLinesState.push({ partyId: '', type: 'sheep', gender: 'female', breed: '', count: '', unitPrice: '' });
    _renderPurchaseLines();
  });
  document.getElementById('add-sale-line-btn').addEventListener('click', () => {
    _saleLinesState.push({ partyId: '', date: todayIso(), type: 'sheep', gender: 'female', breed: '', count: '', unitPrice: '' });
    _renderSaleLines();
  });
  document.getElementById('add-expense-line-btn').addEventListener('click', () => {
    _expenseLinesState.push({ date: todayIso(), description: '', amount: '' });
    _renderExpenseLines();
  });

  document.getElementById('save-btn').addEventListener('click', _handleSave);
  document.getElementById('delete-btn').addEventListener('click', _handleDelete);
});

async function _loadBatchIntoForm(id) {
  const batch = await getBulkBatchById(id);
  if (!batch) {
    showToast('لم يتم العثور على الدفعة', 'error');
    window.location.href = 'bulk-batches.html';
    return;
  }
  document.getElementById('code').value = batch.code || '';
  document.getElementById('purchaseDate').value = batch.purchaseDate || '';
  document.getElementById('notes').value = batch.notes || '';

  _purchaseLinesState = (batch.purchaseLines || []).map(l => ({ ...l }));
  _saleLinesState = (batch.saleLines || []).map(l => ({ ...l }));
  _expenseLinesState = (batch.expenseLines || []).map(l => ({ ...l }));
}

function _currentDraftBatch() {
  return { purchaseLines: _purchaseLinesState, saleLines: _saleLinesState, expenseLines: _expenseLinesState };
}

function _updateSummary() {
  const totals = computeBulkBatchTotals(_currentDraftBatch());
  document.getElementById('summary-purchase-cost').textContent = formatCurrency(totals.totalPurchaseCost);
  document.getElementById('summary-sale-revenue').textContent = formatCurrency(totals.totalSaleRevenue);
  document.getElementById('summary-expenses').textContent = formatCurrency(totals.totalExpenses);
  const netEl = document.getElementById('summary-net-revenue');
  netEl.textContent = formatCurrency(totals.netRevenue);
  netEl.style.color = totals.netRevenue >= 0 ? 'var(--color-primary-green-dark)' : 'var(--color-primary-red)';
  const remainingEl = document.getElementById('summary-remaining');
  remainingEl.textContent = formatNumber(totals.remainingCount);
  remainingEl.style.color = totals.remainingCount < 0 ? 'var(--color-primary-red)' : '';
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

function _renderSaleLines() {
  const container = document.getElementById('sale-lines-list');
  container.innerHTML = _saleLinesState.map((line, idx) => {
    const total = Number(line.count || 0) * Number(line.unitPrice || 0);
    return `
    <div class="batch-line-row batch-line-row--sale">
      <div class="batch-line-field">
        <label>العميل</label>
        <select class="form-control sl-party" data-idx="${idx}">
          <option value="">-- غير محدد --</option>
          ${_clientsCache.map(c => `<option value="${c.id}" ${String(line.partyId) === String(c.id) ? 'selected' : ''}>${c.name}</option>`).join('')}
        </select>
      </div>
      <div class="batch-line-field">
        <label>تاريخ البيع</label>
        <input type="date" class="form-control sl-date" data-idx="${idx}" value="${line.date || ''}" />
      </div>
      <div class="batch-line-field">
        <label>النوع</label>
        <select class="form-control sl-type" data-idx="${idx}">
          <option value="sheep" ${line.type === 'sheep' ? 'selected' : ''}>غنم</option>
          <option value="goat" ${line.type === 'goat' ? 'selected' : ''}>ماعز</option>
        </select>
      </div>
      <div class="batch-line-field">
        <label>الجنس</label>
        <select class="form-control sl-gender" data-idx="${idx}">
          <option value="female" ${line.gender === 'female' ? 'selected' : ''}>أنثى</option>
          <option value="male" ${line.gender === 'male' ? 'selected' : ''}>ذكر</option>
        </select>
      </div>
      <div class="batch-line-field">
        <label>السلالة</label>
        <input type="text" class="form-control sl-breed" data-idx="${idx}" value="${line.breed || ''}" />
      </div>
      <div class="batch-line-field">
        <label>العدد</label>
        <input type="number" class="form-control sl-count" data-idx="${idx}" min="1" step="1" value="${line.count ?? ''}" />
      </div>
      <div class="batch-line-field">
        <label>سعر الوحدة</label>
        <input type="number" class="form-control sl-price" data-idx="${idx}" min="0" step="0.01" value="${line.unitPrice ?? ''}" />
      </div>
      <div class="batch-line-total">${formatCurrency(total)}</div>
      <button type="button" class="batch-line-remove-btn sl-remove" data-idx="${idx}" title="حذف البند">×</button>
    </div>`;
  }).join('') || '<div class="empty-state">لا توجد بنود بيع بعد</div>';

  container.querySelectorAll('.sl-party').forEach(el => el.addEventListener('change', (e) => { _saleLinesState[Number(e.target.dataset.idx)].partyId = e.target.value; }));
  container.querySelectorAll('.sl-date').forEach(el => el.addEventListener('input', (e) => { _saleLinesState[Number(e.target.dataset.idx)].date = e.target.value; }));
  container.querySelectorAll('.sl-type').forEach(el => el.addEventListener('change', (e) => { _saleLinesState[Number(e.target.dataset.idx)].type = e.target.value; _renderSaleLines(); }));
  container.querySelectorAll('.sl-gender').forEach(el => el.addEventListener('change', (e) => { _saleLinesState[Number(e.target.dataset.idx)].gender = e.target.value; _renderSaleLines(); }));
  container.querySelectorAll('.sl-breed').forEach(el => el.addEventListener('input', (e) => { _saleLinesState[Number(e.target.dataset.idx)].breed = e.target.value; }));
  container.querySelectorAll('.sl-count').forEach(el => el.addEventListener('input', (e) => { _saleLinesState[Number(e.target.dataset.idx)].count = e.target.value; _renderSaleLines(); }));
  container.querySelectorAll('.sl-price').forEach(el => el.addEventListener('input', (e) => { _saleLinesState[Number(e.target.dataset.idx)].unitPrice = e.target.value; _renderSaleLines(); }));
  container.querySelectorAll('.sl-remove').forEach(el => el.addEventListener('click', (e) => { _saleLinesState.splice(Number(e.target.dataset.idx), 1); _renderSaleLines(); }));

  _updateSummary();
}

function _renderExpenseLines() {
  const container = document.getElementById('expense-lines-list');
  container.innerHTML = _expenseLinesState.map((line, idx) => `
    <div class="batch-line-row batch-line-row--expense">
      <div class="batch-line-field">
        <label>التاريخ</label>
        <input type="date" class="form-control el-date" data-idx="${idx}" value="${line.date || ''}" />
      </div>
      <div class="batch-line-field">
        <label>الوصف</label>
        <input type="text" class="form-control el-description" data-idx="${idx}" value="${line.description || ''}" placeholder="مثال: نقل، علف، أدوية..." />
      </div>
      <div class="batch-line-field">
        <label>المبلغ</label>
        <input type="number" class="form-control el-amount" data-idx="${idx}" min="0" step="0.01" value="${line.amount ?? ''}" />
      </div>
      <button type="button" class="batch-line-remove-btn el-remove" data-idx="${idx}" title="حذف البند">×</button>
    </div>`).join('') || '<div class="empty-state">لا توجد مصاريف مسجّلة على هذه الدفعة بعد</div>';

  container.querySelectorAll('.el-date').forEach(el => el.addEventListener('input', (e) => { _expenseLinesState[Number(e.target.dataset.idx)].date = e.target.value; }));
  container.querySelectorAll('.el-description').forEach(el => el.addEventListener('input', (e) => { _expenseLinesState[Number(e.target.dataset.idx)].description = e.target.value; }));
  container.querySelectorAll('.el-amount').forEach(el => el.addEventListener('input', (e) => { _expenseLinesState[Number(e.target.dataset.idx)].amount = e.target.value; _updateSummary(); }));
  container.querySelectorAll('.el-remove').forEach(el => el.addEventListener('click', (e) => { _expenseLinesState.splice(Number(e.target.dataset.idx), 1); _renderExpenseLines(); }));

  _updateSummary();
}

function _validateBeforeSave(purchaseDate) {
  if (!isValidDate(purchaseDate)) {
    showToast('يرجى إدخال تاريخ شراء صحيح', 'error');
    return false;
  }
  if (!_editingBatchId && _purchaseLinesState.length === 0) {
    showToast('أضف بند شراء واحدًا على الأقل', 'error');
    return false;
  }
  for (const line of _purchaseLinesState) {
    if (!isRequired(line.breed) || !(Number(line.count) > 0) || !isPositiveNumber(line.unitPrice)) {
      showToast('تأكد من تعبئة كل بنود الشراء بشكل صحيح (السلالة، العدد، السعر)', 'error');
      return false;
    }
  }
  for (const line of _saleLinesState) {
    if (!isValidDate(line.date) || !isRequired(line.breed) || !(Number(line.count) > 0) || !isPositiveNumber(line.unitPrice)) {
      showToast('تأكد من تعبئة كل بنود البيع بشكل صحيح (التاريخ، السلالة، العدد، السعر)', 'error');
      return false;
    }
  }
  for (const line of _expenseLinesState) {
    if (!isValidDate(line.date) || !isRequired(line.description) || !(Number(line.amount) > 0)) {
      showToast('تأكد من تعبئة كل بنود المصاريف بشكل صحيح (التاريخ، الوصف، المبلغ)', 'error');
      return false;
    }
  }
  return true;
}

async function _handleSave() {
  const purchaseDate = document.getElementById('purchaseDate').value;
  if (!_validateBeforeSave(purchaseDate)) return;

  const data = {
    code: document.getElementById('code').value,
    purchaseDate,
    notes: document.getElementById('notes').value.trim(),
    purchaseLines: _purchaseLinesState.map(l => ({ partyId: l.partyId ? Number(l.partyId) : null, type: l.type, gender: l.gender, breed: l.breed.trim(), count: Number(l.count), unitPrice: Number(l.unitPrice) })),
    saleLines: _saleLinesState.map(l => ({ partyId: l.partyId ? Number(l.partyId) : null, date: l.date, type: l.type, gender: l.gender, breed: l.breed.trim(), count: Number(l.count), unitPrice: Number(l.unitPrice) })),
    expenseLines: _expenseLinesState.map(l => ({ date: l.date, description: l.description.trim(), amount: Number(l.amount) })),
  };

  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'جاري الحفظ...';

  try {
    if (_editingBatchId) {
      await updateBulkBatch(_editingBatchId, data);
    } else {
      await createBulkBatch(data);
    }
    showToast('تم الحفظ بنجاح', 'success');
    setTimeout(() => { window.location.href = 'bulk-batches.html'; }, 400);
  } catch (err) {
    showToast('حدث خطأ أثناء الحفظ', 'error');
    saveBtn.disabled = false;
    saveBtn.textContent = 'حفظ';
  }
}

function _handleDelete() {
  confirmDelete('هل أنت متأكد من حذف هذه الدفعة بالكامل (بنود الشراء والبيع والمصاريف)؟ لا يمكن التراجع عن هذا الإجراء.', async () => {
    await deleteBulkBatch(_editingBatchId);
    showToast('تم حذف الدفعة', 'success');
    setTimeout(() => { window.location.href = 'bulk-batches.html'; }, 400);
  });
}
