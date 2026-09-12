// js/pages/stock-count-form-page.js
// جرد دوري: لكل سطر (صنف) نعرض أول المدة/مشتريات الفترة/متوسط السعر تلقائيًا، والمستخدم يُدخل فقط
// الكمية أو القيمة المتبقية — المستهلك يُحسب حيًا. الاعتماد يُرحّل حركة مخزون + قيد يومية عبر stock-count-service.js

let _editingCountId = null;
let _linesState = []; // { itemId, periodFrom, openingQty, purchasesQty, unitCostUsed, closingMode, closingQty, closingValue, consumedQty, consumedValue, movementId }
let _itemsCache = [];
let _movementsCache = [];
let _stockCountsCache = [];
let _isApproved = false;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('inventory');
  renderSidebar('inventory-stock-counts');
  renderHeader('جرد مخزون');

  [_itemsCache, _movementsCache, _stockCountsCache] = await Promise.all([
    getAllInventoryItems(),
    getAllInventoryMovements(),
    getAllStockCounts(),
  ]);

  const params = new URLSearchParams(window.location.search);
  const idParam = params.get('id');

  if (idParam) {
    _editingCountId = Number(idParam);
    await _loadCountIntoForm(_editingCountId);
    document.getElementById('form-title').textContent = 'تعديل جرد';
  } else {
    document.getElementById('date').value = todayIso();
    _linesState = [_newEmptyLine()];
  }

  _renderLines();
  _updateStatusUI();

  document.getElementById('date').addEventListener('change', () => {
    _linesState.forEach(line => { _recomputeLinePreview(line); _recomputeClosingDerived(line); });
    _renderLines();
  });

  document.getElementById('add-line-btn').addEventListener('click', () => {
    _linesState.push(_newEmptyLine());
    _renderLines();
  });

  document.getElementById('save-draft-btn').addEventListener('click', _handleSaveDraft);
  document.getElementById('approve-btn').addEventListener('click', _handleApprove);
  document.getElementById('unapprove-btn').addEventListener('click', _handleUnapprove);
  document.getElementById('delete-btn').addEventListener('click', _handleDelete);
});

function _newEmptyLine() {
  return { itemId: '', periodFrom: null, openingQty: 0, purchasesQty: 0, otherOutQty: 0, unitCostUsed: 0, closingMode: 'qty', closingQty: '', closingValue: '', consumedQty: 0, consumedValue: 0, movementId: null };
}

async function _loadCountIntoForm(id) {
  const count = await getStockCountById(id);
  if (!count) {
    showToast('لم يتم العثور على الجرد', 'error');
    window.location.href = 'stock-counts.html';
    return;
  }
  document.getElementById('date').value = count.date || '';
  document.getElementById('notes').value = count.notes || '';
  _isApproved = count.status === 'approved';
  _linesState = (count.lines || []).map(l => ({
    ...l,
    closingMode: l.closingMode || 'qty',
    closingValue: l.closingValue ?? '',
  }));
  if (!_linesState.length) _linesState = [_newEmptyLine()];
}

function _recomputeLinePreview(line) {
  if (!line.itemId) { line.periodFrom = null; line.openingQty = 0; line.purchasesQty = 0; line.otherOutQty = 0; line.unitCostUsed = 0; return; }
  const item = _itemsCache.find(i => i.id === Number(line.itemId));
  if (!item) return;
  const date = document.getElementById('date').value;
  const periodFrom = getLastApprovedStockCountDateForItem(Number(line.itemId), _stockCountsCache, _editingCountId);
  const preview = computeStockCountLinePreview(item, periodFrom, date, _movementsCache);
  line.periodFrom = periodFrom;
  line.openingQty = preview.openingQty;
  line.purchasesQty = preview.purchasesQty;
  line.otherOutQty = preview.otherOutQty;
  line.unitCostUsed = preview.unitCostUsed;
}

function _recomputeClosingDerived(line) {
  let closingQty;
  if (line.closingMode === 'value') {
    const val = Number(line.closingValue || 0);
    closingQty = line.unitCostUsed > 0 ? val / line.unitCostUsed : 0;
  } else {
    closingQty = Number(line.closingQty || 0);
  }
  line.consumedQty = Math.round((line.openingQty + line.purchasesQty - (line.otherOutQty || 0) - closingQty) * 100) / 100;
  line.consumedValue = Math.round(line.consumedQty * line.unitCostUsed * 100) / 100;
}

function _renderLines() {
  const container = document.getElementById('lines-list');
  const disabledAttr = _isApproved ? 'disabled' : '';

  container.innerHTML = _linesState.map((line, idx) => {
    const item = _itemsCache.find(i => i.id === Number(line.itemId));
    const unit = item ? (item.unit || '') : '';
    const periodFromLabel = line.periodFrom ? formatDateArabic(line.periodFrom) : 'من البداية';
    const closingValueField = line.closingMode === 'value' ? line.closingValue : line.closingQty;

    return `
    <div class="sc-line">
      ${_isApproved ? '' : `<button type="button" class="sc-line__remove sc-remove" data-idx="${idx}" title="حذف السطر">×</button>`}
      <div class="sc-line__row">
        <div class="sc-line__field">
          <label>الصنف</label>
          <select class="form-control sc-item" data-idx="${idx}" ${disabledAttr}>
            <option value="">-- اختر صنفًا --</option>
            ${_itemsCache.map(i => `<option value="${i.id}" ${String(line.itemId) === String(i.id) ? 'selected' : ''}>${i.name} (${INVENTORY_CATEGORY_LABELS[i.category] || i.category})</option>`).join('')}
          </select>
        </div>
        <div class="sc-line__field">
          <label>طريقة الإدخال</label>
          <select class="form-control sc-mode" data-idx="${idx}" ${disabledAttr}>
            <option value="qty" ${line.closingMode === 'qty' ? 'selected' : ''}>كمية متبقية</option>
            <option value="value" ${line.closingMode === 'value' ? 'selected' : ''}>قيمة متبقية (ر.س)</option>
          </select>
        </div>
        <div class="sc-line__field">
          <label>${line.closingMode === 'value' ? 'القيمة المتبقية (ر.س)' : 'الكمية المتبقية'}</label>
          <input type="number" class="form-control sc-closing" data-idx="${idx}" min="0" step="0.01" value="${closingValueField ?? ''}" ${disabledAttr} />
        </div>
      </div>
      <div class="sc-line__preview">
        ${line.itemId
          ? `أول المدة (${periodFromLabel}): <strong>${formatNumber(line.openingQty)} ${unit}</strong> — مشتريات الفترة: <strong>${formatNumber(line.purchasesQty)} ${unit}</strong>${line.otherOutQty ? ` — حركات صادر أخرى خلال الفترة: <strong>${formatNumber(line.otherOutQty)} ${unit}</strong>` : ''} — متوسط سعر الشراء: <strong>${formatCurrency(line.unitCostUsed)}</strong>`
          : 'اختر صنفًا لعرض أول المدة والمشتريات تلقائيًا'}
      </div>
      <div class="sc-line__result" style="color:${line.consumedQty < 0 ? 'var(--color-primary-red)' : 'var(--color-primary-green-dark)'};">
        المستهلك: ${formatNumber(line.consumedQty)} ${unit} = ${formatCurrency(line.consumedValue)}
        ${line.consumedQty < 0 ? ' ⚠️ قيمة سالبة — تحقّق من الكمية المُدخلة' : ''}
      </div>
    </div>`;
  }).join('') || '<div class="empty-state">لا توجد أصناف في هذا الجرد بعد</div>';

  if (_isApproved) return;

  container.querySelectorAll('.sc-item').forEach(el => el.addEventListener('change', (e) => {
    const line = _linesState[Number(e.target.dataset.idx)];
    line.itemId = e.target.value;
    _recomputeLinePreview(line);
    _recomputeClosingDerived(line);
    _renderLines();
  }));
  container.querySelectorAll('.sc-mode').forEach(el => el.addEventListener('change', (e) => {
    const line = _linesState[Number(e.target.dataset.idx)];
    line.closingMode = e.target.value;
    _recomputeClosingDerived(line);
    _renderLines();
  }));
  container.querySelectorAll('.sc-closing').forEach(el => el.addEventListener('input', (e) => {
    const line = _linesState[Number(e.target.dataset.idx)];
    if (line.closingMode === 'value') line.closingValue = e.target.value;
    else line.closingQty = e.target.value;
    _recomputeClosingDerived(line);
    _renderLines();
  }));
  container.querySelectorAll('.sc-remove').forEach(el => el.addEventListener('click', (e) => {
    _linesState.splice(Number(e.target.dataset.idx), 1);
    _renderLines();
  }));
}

function _updateStatusUI() {
  const banner = document.getElementById('status-banner');
  banner.innerHTML = _isApproved
    ? '<div class="sc-status-banner sc-status-banner--approved">هذا الجرد معتمد ومُرحَّل محاسبيًا — الحقول للقراءة فقط. لتعديله اضغط "إلغاء الاعتماد" أولاً.</div>'
    : '';

  document.getElementById('date').disabled = _isApproved;
  document.getElementById('notes').disabled = _isApproved;
  document.getElementById('add-line-btn').style.display = _isApproved ? 'none' : '';
  document.getElementById('save-draft-btn').style.display = _isApproved ? 'none' : '';
  document.getElementById('approve-btn').style.display = _isApproved ? 'none' : '';
  document.getElementById('unapprove-btn').style.display = _isApproved ? 'inline-flex' : 'none';
  document.getElementById('delete-btn').style.display = _editingCountId ? 'inline-flex' : 'none';
}

function _validateLines(requireNonNegative) {
  if (!_linesState.length) {
    showToast('أضف صنفًا واحدًا على الأقل', 'error');
    return false;
  }
  for (const line of _linesState) {
    if (!line.itemId) {
      showToast('تأكد من اختيار صنف لكل سطر', 'error');
      return false;
    }
    if (requireNonNegative && line.consumedQty < 0) {
      const item = _itemsCache.find(i => i.id === Number(line.itemId));
      showToast(`المستهلك سالب لصنف "${item ? item.name : ''}" — تحقّق من الكمية/القيمة المتبقية قبل الاعتماد`, 'error');
      return false;
    }
  }
  return true;
}

function _buildDataFromState() {
  return {
    date: document.getElementById('date').value,
    notes: document.getElementById('notes').value.trim(),
    lines: _linesState.map(l => ({
      itemId: Number(l.itemId),
      periodFrom: l.periodFrom,
      openingQty: l.openingQty,
      purchasesQty: l.purchasesQty,
      otherOutQty: l.otherOutQty || 0,
      closingQty: l.closingMode === 'value' ? (l.unitCostUsed > 0 ? Number(l.closingValue || 0) / l.unitCostUsed : 0) : Number(l.closingQty || 0),
      closingMode: l.closingMode,
      closingValue: l.closingMode === 'value' ? Number(l.closingValue || 0) : null,
      unitCostUsed: l.unitCostUsed,
      consumedQty: l.consumedQty,
      consumedValue: l.consumedValue,
      movementId: l.movementId || null,
    })),
  };
}

async function _handleSaveDraft() {
  if (!isValidDate(document.getElementById('date').value)) {
    showToast('التاريخ مطلوب', 'error');
    return;
  }
  if (!_validateLines(false)) return;

  const data = _buildDataFromState();
  const btn = document.getElementById('save-draft-btn');
  btn.disabled = true;

  try {
    if (_editingCountId) {
      await updateStockCount(_editingCountId, data);
      showToast('تم حفظ المسودة', 'success');
      document.getElementById('delete-btn').style.display = 'inline-flex';
    } else {
      data.status = 'draft';
      _editingCountId = await createStockCount(data);
      showToast('تم حفظ المسودة', 'success');
      setTimeout(() => { window.location.href = `stock-count-form.html?id=${_editingCountId}`; }, 400);
      return;
    }
  } catch (err) {
    showToast('حدث خطأ أثناء الحفظ', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function _handleApprove() {
  if (!isValidDate(document.getElementById('date').value)) {
    showToast('التاريخ مطلوب', 'error');
    return;
  }
  if (!_validateLines(true)) return;

  const data = _buildDataFromState();
  const btn = document.getElementById('approve-btn');
  btn.disabled = true;
  btn.textContent = 'جاري الاعتماد...';

  try {
    if (_editingCountId) {
      await updateStockCount(_editingCountId, data);
    } else {
      data.status = 'draft';
      _editingCountId = await createStockCount(data);
    }
    await approveStockCount(_editingCountId);
    showToast('تم اعتماد الجرد وترحيل القيد المحاسبي', 'success');
    setTimeout(() => { window.location.href = `stock-count-form.html?id=${_editingCountId}`; }, 400);
  } catch (err) {
    showToast('حدث خطأ أثناء الاعتماد', 'error');
    btn.disabled = false;
    btn.textContent = 'اعتماد الجرد';
  }
}

function _handleUnapprove() {
  openModal('<p>سيُحذف حركة المخزون والقيد اليومية الناتجان عن هذا الجرد، ويعود لحالة "مسودة" قابلة للتعديل. هل تريد المتابعة؟</p>', {
    title: 'تأكيد إلغاء الاعتماد',
    confirmLabel: 'إلغاء الاعتماد',
    onConfirm: async () => {
      try {
        await unapproveStockCount(_editingCountId);
        showToast('تم إلغاء الاعتماد', 'success');
        closeModal();
        setTimeout(() => { window.location.href = `stock-count-form.html?id=${_editingCountId}`; }, 400);
      } catch (err) {
        showToast('حدث خطأ أثناء إلغاء الاعتماد', 'error');
      }
    },
  });
}

function _handleDelete() {
  confirmDelete('هل أنت متأكد من حذف هذا الجرد؟ إن كان معتمدًا سيُعكس أثره (حركة المخزون والقيد اليومية) أولاً.', async () => {
    await deleteStockCount(_editingCountId);
    showToast('تم الحذف بنجاح', 'success');
    setTimeout(() => { window.location.href = 'stock-counts.html'; }, 400);
  });
}
