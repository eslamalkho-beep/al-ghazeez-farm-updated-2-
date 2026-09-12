// js/pages/bulk-sale-form-page.js
// إنشاء/تعديل عملية بيع جملة مستقلة — بند واحد أو أكثر بتاريخ واحد للعملية كلها. البيع حرّ تمامًا: لا يُشترط
// تطابق بنود البيع مع تركيبات الشراء ولا مع العدد المتبقي. لكل بند معاينة حيّة لمتوسط تكلفة الشراء الحالي
// والكمية المتاحة لنفس التركيبة (نوع/جنس/سلالة) كما في تاريخ العملية — وعند الحفظ تُجمَّد هذه القيمة
// (avgCostAtSale/cogsAmount) داخل البند نفسه، وتُرحَّل محاسبيًا: مدين الصندوق/دائن إيرادات الجملة بالإيراد
// كاملاً + مدين تكلفة البضاعة المباعة/دائن مخزون الجملة بقيمة التكلفة

let _editingSaleId = null;
let _saleLinesState = []; // { partyId, type, gender, breed, count, unitPrice }
let _clientsCache = [];
let _purchasesCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('bulk');
  renderSidebar('bulk-sales');
  renderHeader('مبيعات الجملة');

  const params = new URLSearchParams(window.location.search);
  const idParam = params.get('id');
  const _requiredAction = idParam ? 'edit' : 'add';
  if (!hasActionPermission('bulk', _requiredAction)) {
    showToast(idParam ? 'ليس لديك صلاحية تعديل مبيعات الجملة' : 'ليس لديك صلاحية إضافة عملية بيع جملة', 'error');
    window.location.href = 'bulk-sales.html';
    return;
  }

  [_clientsCache, _purchasesCache] = await Promise.all([getAllParties('client'), getAllBulkPurchases()]);

  if (idParam) {
    _editingSaleId = Number(idParam);
    await _loadSaleIntoForm(_editingSaleId);
    document.getElementById('form-title').textContent = 'تعديل عملية البيع';
    if (hasActionPermission('bulk', 'delete')) {
      document.getElementById('delete-btn').style.display = 'inline-flex';
    }
  } else {
    document.getElementById('code').value = await generateNextBulkSaleCode();
    document.getElementById('date').value = todayIso();
  }

  _renderSaleLines();

  document.getElementById('add-sale-line-btn').addEventListener('click', () => {
    _saleLinesState.push({ partyId: '', type: 'sheep', gender: 'female', breed: '', count: '', unitPrice: '' });
    _renderSaleLines();
  });
  document.getElementById('date').addEventListener('change', _renderSaleLines);

  document.getElementById('save-btn').addEventListener('click', _handleSave);
  document.getElementById('delete-btn').addEventListener('click', _handleDelete);
});

async function _loadSaleIntoForm(id) {
  const sale = await getBulkSaleById(id);
  if (!sale) {
    showToast('لم يتم العثور على عملية البيع', 'error');
    window.location.href = 'bulk-sales.html';
    return;
  }
  document.getElementById('code').value = sale.code || '';
  document.getElementById('date').value = sale.date || '';
  document.getElementById('notes').value = sale.notes || '';
  _saleLinesState = (sale.lines || []).map(l => ({ ...l }));
}

function _currentAsOfDate() {
  return document.getElementById('date').value || todayIso();
}

function _updateSummary() {
  const asOfDate = _currentAsOfDate();
  const linesWithCost = computeSaleLinesCosts(_saleLinesState, _purchasesCache, asOfDate);
  const count = linesWithCost.reduce((s, l) => s + Number(l.count || 0), 0);
  const revenue = linesWithCost.reduce((s, l) => s + Number(l.count || 0) * Number(l.unitPrice || 0), 0);
  const cogs = linesWithCost.reduce((s, l) => s + Number(l.cogsAmount || 0), 0);
  const profit = revenue - cogs;

  document.getElementById('summary-count').textContent = formatNumber(count);
  document.getElementById('summary-revenue').textContent = formatCurrency(revenue);
  document.getElementById('summary-cogs').textContent = formatCurrency(cogs);
  const profitEl = document.getElementById('summary-profit');
  profitEl.textContent = formatCurrency(profit);
  profitEl.style.color = profit >= 0 ? 'var(--color-primary-green-dark)' : 'var(--color-primary-red)';
}

function _renderSaleLines() {
  const container = document.getElementById('sale-lines-list');
  const asOfDate = _currentAsOfDate();

  container.innerHTML = _saleLinesState.map((line, idx) => {
    const total = Number(line.count || 0) * Number(line.unitPrice || 0);
    const { avgCost, availableCount } = getGroupAverageCost(line.type, line.gender, line.breed, _purchasesCache, asOfDate);
    return `
    <div class="batch-line-block">
      <div class="batch-line-row batch-line-row--sale">
        <div class="batch-line-field">
          <label>العميل</label>
          <select class="form-control sl-party" data-idx="${idx}">
            <option value="">-- غير محدد --</option>
            ${_clientsCache.map(c => `<option value="${c.id}" ${String(line.partyId) === String(c.id) ? 'selected' : ''}>${c.name}</option>`).join('')}
          </select>
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
      </div>
      <div class="batch-line-hint">
        متوسط تكلفة الشراء لهذه التركيبة كما في ${formatDateArabic(asOfDate)}: <strong>${formatCurrency(avgCost)}</strong>
        — المتاح حاليًا: <strong>${formatNumber(availableCount)}</strong>
      </div>
    </div>`;
  }).join('') || '<div class="empty-state">لا توجد بنود بيع بعد</div>';

  container.querySelectorAll('.sl-party').forEach(el => el.addEventListener('change', (e) => { _saleLinesState[Number(e.target.dataset.idx)].partyId = e.target.value; }));
  container.querySelectorAll('.sl-type').forEach(el => el.addEventListener('change', (e) => { _saleLinesState[Number(e.target.dataset.idx)].type = e.target.value; _renderSaleLines(); }));
  container.querySelectorAll('.sl-gender').forEach(el => el.addEventListener('change', (e) => { _saleLinesState[Number(e.target.dataset.idx)].gender = e.target.value; _renderSaleLines(); }));
  container.querySelectorAll('.sl-breed').forEach(el => el.addEventListener('input', (e) => { _saleLinesState[Number(e.target.dataset.idx)].breed = e.target.value; _renderSaleLines(); }));
  container.querySelectorAll('.sl-count').forEach(el => el.addEventListener('input', (e) => { _saleLinesState[Number(e.target.dataset.idx)].count = e.target.value; _renderSaleLines(); }));
  container.querySelectorAll('.sl-price').forEach(el => el.addEventListener('input', (e) => { _saleLinesState[Number(e.target.dataset.idx)].unitPrice = e.target.value; _renderSaleLines(); }));
  container.querySelectorAll('.sl-remove').forEach(el => el.addEventListener('click', (e) => { _saleLinesState.splice(Number(e.target.dataset.idx), 1); _renderSaleLines(); }));

  _updateSummary();
}

function _validateBeforeSave(date) {
  if (!isValidDate(date)) {
    showToast('يرجى إدخال تاريخ بيع صحيح', 'error');
    return false;
  }
  if (_saleLinesState.length === 0) {
    showToast('أضف بند بيع واحدًا على الأقل', 'error');
    return false;
  }
  for (const line of _saleLinesState) {
    if (!isRequired(line.breed) || !(Number(line.count) > 0) || !isPositiveNumber(line.unitPrice)) {
      showToast('تأكد من تعبئة كل بنود البيع بشكل صحيح (السلالة، العدد، السعر)', 'error');
      return false;
    }
  }
  return true;
}

async function _handleSave() {
  const date = document.getElementById('date').value;
  if (!_validateBeforeSave(date)) return;

  const rawLines = _saleLinesState.map(l => ({ partyId: l.partyId ? Number(l.partyId) : null, type: l.type, gender: l.gender, breed: l.breed.trim(), count: Number(l.count), unitPrice: Number(l.unitPrice) }));
  const data = {
    code: document.getElementById('code').value,
    date,
    notes: document.getElementById('notes').value.trim(),
    lines: computeSaleLinesCosts(rawLines, _purchasesCache, date),
    source: 'manual',
  };

  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'جاري الحفظ...';

  try {
    let savedId = _editingSaleId;
    if (_editingSaleId) {
      await updateBulkSale(_editingSaleId, data);
    } else {
      savedId = await createBulkSale(data);
    }

    await syncBulkSaleJournalEntry(savedId);

    showToast('تم الحفظ بنجاح', 'success');
    setTimeout(() => { window.location.href = 'bulk-sales.html'; }, 400);
  } catch (err) {
    showToast('حدث خطأ أثناء الحفظ', 'error');
    saveBtn.disabled = false;
    saveBtn.textContent = 'حفظ';
  }
}

function _handleDelete() {
  confirmDelete('هل أنت متأكد من حذف عملية البيع هذه بالكامل؟ سيُحذف أيضًا القيد المحاسبي المرتبط بها إن وُجد. لا يمكن التراجع عن هذا الإجراء.', async () => {
    await reverseBulkSaleJournalEntry(_editingSaleId);
    await deleteBulkSale(_editingSaleId);
    showToast('تم حذف عملية البيع', 'success');
    setTimeout(() => { window.location.href = 'bulk-sales.html'; }, 400);
  });
}
