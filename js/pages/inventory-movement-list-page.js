// js/pages/inventory-movement-list-page.js

const INVENTORY_REASON_TYPES = ['purchase', 'consumption', 'damage', 'adjustment', 'other'];

let _allInventoryItemsForMovements = [];
let _allInventoryMovementsCacheForList = [];
let _currentExportColumns = null;
let _currentExportRows = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('inventory');
  renderSidebar('inventory');
  renderHeader('حركات المخزون');

  await _refreshInventoryMovements();

  document.getElementById('add-movement-btn').addEventListener('click', () => _openMovementModal(null));
  document.getElementById('export-excel-btn').addEventListener('click', () => {
    exportRowsToExcel('حركات المخزون', _currentExportColumns, _currentExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    exportRowsToPdf('حركات المخزون', _currentExportColumns, _currentExportRows);
  });
});

async function _refreshInventoryMovements() {
  [_allInventoryItemsForMovements, _allInventoryMovementsCacheForList] = await Promise.all([
    getAllInventoryItems(),
    getAllInventoryMovements(),
  ]);
  _drawInventoryMovements();
}

function _itemLabel(itemId) {
  const item = _allInventoryItemsForMovements.find(i => i.id === itemId);
  return item ? item.name : 'صنف محذوف';
}

function _drawInventoryMovements() {
  const sorted = [..._allInventoryMovementsCacheForList].sort((a, b) => (a.date < b.date ? 1 : -1));
  const rows = sorted.map(m => ({
    ...m,
    itemLabel: _itemLabel(m.itemId),
    dateLabel: formatDateArabic(m.date),
    directionBadge: m.direction === 'in'
      ? '<span class="badge badge--green">وارد</span>'
      : '<span class="badge badge--red">صادر</span>',
    quantityLabel: formatNumber(m.quantity),
    reasonLabel: INVENTORY_REASON_LABELS[m.reasonType] || m.reasonType || '-',
    unitCostLabel: isRequired(m.unitCost) ? formatCurrency(m.unitCost) : '-',
  }));

  const columns = [
    { key: 'dateLabel', label: 'التاريخ', sortable: true },
    { key: 'itemLabel', label: 'الصنف', sortable: true },
    { key: 'directionBadge', label: 'الاتجاه', sortable: false },
    { key: 'quantityLabel', label: 'الكمية', sortable: false },
    { key: 'unitCostLabel', label: 'تكلفة الوحدة', sortable: false },
    { key: 'reasonLabel', label: 'السبب', sortable: true },
    { key: 'notes', label: 'ملاحظات', sortable: false },
  ];

  _currentExportColumns = columns;
  _currentExportRows = rows;

  renderDataTable('inventory-movement-table', columns, rows, {
    onRowClick: (row) => _openMovementModal(row),
    emptyMessage: 'لا توجد حركات مخزون مسجّلة بعد',
  });
}

function _openMovementModal(movement) {
  const isEdit = !!movement;

  if (!_allInventoryItemsForMovements.length) {
    showToast('يجب تكويد صنف واحد على الأقل أولاً من صفحة "الأصناف"', 'warning');
    return;
  }

  const html = `
    <form id="movement-modal-form" class="form-grid">
      <div class="form-group form-group--full">
        <label>الصنف <span class="required">*</span></label>
        <select id="m-itemId" class="form-control">
          ${_allInventoryItemsForMovements.map(i => `<option value="${i.id}" ${movement?.itemId === i.id ? 'selected' : ''}>${i.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>الاتجاه <span class="required">*</span></label>
        <select id="m-direction" class="form-control">
          <option value="in" ${movement?.direction === 'in' ? 'selected' : ''}>وارد (إضافة للمخزون)</option>
          <option value="out" ${movement?.direction === 'out' ? 'selected' : ''}>صادر (سحب من المخزون)</option>
        </select>
      </div>
      <div class="form-group">
        <label>الكمية <span class="required">*</span></label>
        <input type="number" id="m-quantity" class="form-control" value="${movement?.quantity ?? ''}" />
        <div class="form-error"></div>
      </div>
      <div class="form-group">
        <label>التاريخ <span class="required">*</span></label>
        <input type="date" id="m-date" class="form-control" value="${movement?.date || todayIso()}" />
      </div>
      <div class="form-group">
        <label>السبب</label>
        <select id="m-reasonType" class="form-control">
          ${INVENTORY_REASON_TYPES.map(r => `<option value="${r}" ${movement?.reasonType === r ? 'selected' : ''}>${INVENTORY_REASON_LABELS[r]}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>تكلفة الوحدة (اختياري، إعلامي فقط)</label>
        <input type="number" id="m-unitCost" class="form-control" value="${movement?.unitCost ?? ''}" />
      </div>
      <div class="form-group form-group--full">
        <label>ملاحظات</label>
        <textarea id="m-notes" class="form-control">${movement?.notes || ''}</textarea>
      </div>

      ${isEdit ? `
      <div class="form-group form-group--full" style="border-top:1px solid var(--color-border); padding-top: var(--spacing-3);">
        <button type="button" class="btn btn--danger btn--sm" id="delete-movement-btn">حذف هذه الحركة</button>
      </div>` : ''}
    </form>
  `;

  openModal(html, {
    title: isEdit ? 'تعديل حركة مخزون' : 'تسجيل حركة مخزون جديدة',
    confirmLabel: 'حفظ',
    onConfirm: async () => {
      const isValid = validateForm([
        { fieldId: 'm-quantity', validatorFn: isPositiveNumber, message: 'الكمية يجب أن تكون رقمًا موجبًا' },
        { fieldId: 'm-date', validatorFn: isValidDate, message: 'التاريخ مطلوب' },
      ]);
      if (!isValid) return;

      const unitCostRaw = document.getElementById('m-unitCost').value;
      const data = {
        itemId: Number(document.getElementById('m-itemId').value),
        direction: document.getElementById('m-direction').value,
        quantity: Number(document.getElementById('m-quantity').value),
        date: document.getElementById('m-date').value,
        reasonType: document.getElementById('m-reasonType').value,
        unitCost: unitCostRaw === '' ? null : Number(unitCostRaw),
        notes: document.getElementById('m-notes').value.trim(),
      };

      if (isEdit) {
        await updateInventoryMovement(movement.id, data);
      } else {
        await createInventoryMovement(data);
      }
      showToast('تم الحفظ بنجاح', 'success');
      closeModal();
      await _refreshInventoryMovements();
    },
  });

  if (isEdit) {
    document.getElementById('delete-movement-btn').addEventListener('click', () => {
      confirmDelete('هل أنت متأكد من حذف هذه الحركة؟', async () => {
        await deleteInventoryMovement(movement.id);
        showToast('تم حذف الحركة', 'success');
        await _refreshInventoryMovements();
      });
    });
  }
}
