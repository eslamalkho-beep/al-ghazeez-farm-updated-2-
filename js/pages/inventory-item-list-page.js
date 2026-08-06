// js/pages/inventory-item-list-page.js

const INVENTORY_CATEGORIES = ['fodder', 'medicine', 'equipment', 'other'];

let _allInventoryItemsCache = [];
let _allInventoryMovementsCache = [];
let _currentExportColumns = null;
let _currentExportRows = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('inventory');
  renderSidebar('inventory');
  renderHeader('المخزون والمستلزمات');

  await _refreshInventoryItems();

  document.getElementById('add-item-btn').addEventListener('click', () => _openItemModal(null));
  document.getElementById('export-excel-btn').addEventListener('click', () => {
    exportRowsToExcel('أصناف المخزون', _currentExportColumns, _currentExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    exportRowsToPdf('أصناف المخزون', _currentExportColumns, _currentExportRows);
  });
});

async function _refreshInventoryItems() {
  [_allInventoryItemsCache, _allInventoryMovementsCache] = await Promise.all([
    getAllInventoryItems(),
    getAllInventoryMovements(),
  ]);
  _drawInventoryItems();
}

function _drawInventoryItems() {
  const rows = _allInventoryItemsCache.map(item => {
    const { currentQty, isLowStock } = computeItemStockLevel(item, _allInventoryMovementsCache);
    const lastPrice = getLastPurchasePrice(item, _allInventoryMovementsCache);
    return {
      ...item,
      categoryLabel: INVENTORY_CATEGORY_LABELS[item.category] || item.category,
      currentQtyLabel: `${formatNumber(currentQty)} ${item.unit || ''}`,
      reorderThresholdLabel: isRequired(item.reorderThreshold) ? `${formatNumber(item.reorderThreshold)} ${item.unit || ''}` : '-',
      lastPriceLabel: lastPrice !== null ? formatCurrency(lastPrice) : '-',
      statusBadge: isLowStock ? '<span class="badge badge--red">منخفض</span>' : '<span class="badge badge--green">متوفر</span>',
    };
  });

  const columns = [
    { key: 'name', label: 'اسم الصنف', sortable: true },
    { key: 'categoryLabel', label: 'التصنيف', sortable: true },
    { key: 'unit', label: 'الوحدة', sortable: false },
    { key: 'currentQtyLabel', label: 'الرصيد الحالي', sortable: false },
    { key: 'lastPriceLabel', label: 'آخر سعر شراء (للوحدة)', sortable: false },
    { key: 'reorderThresholdLabel', label: 'حد الطلب', sortable: false },
    { key: 'statusBadge', label: 'الحالة', sortable: false },
  ];

  _currentExportColumns = columns;
  _currentExportRows = rows;

  renderDataTable('inventory-item-table', columns, rows, {
    onRowClick: (row) => _openItemModal(row),
    emptyMessage: 'لا توجد أصناف مكوَّدة بعد',
  });
}

function _openItemModal(item) {
  const isEdit = !!item;
  const html = `
    <form id="item-modal-form" class="form-grid">
      <div class="form-group form-group--full">
        <label>اسم الصنف <span class="required">*</span></label>
        <input type="text" id="m-name" class="form-control" value="${item?.name || ''}" />
        <div class="form-error"></div>
      </div>
      <div class="form-group">
        <label>التصنيف</label>
        <select id="m-category" class="form-control">
          ${INVENTORY_CATEGORIES.map(c => `<option value="${c}" ${item?.category === c ? 'selected' : ''}>${INVENTORY_CATEGORY_LABELS[c]}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>الوحدة</label>
        <input type="text" id="m-unit" class="form-control" placeholder="كجم / لتر / قطعة" value="${item?.unit || ''}" />
      </div>
      <div class="form-group">
        <label>حد الطلب (تنبيه عند الوصول إليه أو أقل)</label>
        <input type="number" id="m-reorderThreshold" class="form-control" value="${item?.reorderThreshold ?? ''}" />
      </div>
      <div class="form-group form-group--full">
        <label>ملاحظات</label>
        <textarea id="m-notes" class="form-control">${item?.notes || ''}</textarea>
      </div>

      ${isEdit ? `
      <div class="form-group form-group--full" style="border-top:1px solid var(--color-border); padding-top: var(--spacing-3);">
        <button type="button" class="btn btn--danger btn--sm" id="delete-item-btn">حذف هذا الصنف</button>
      </div>` : ''}
    </form>
  `;

  openModal(html, {
    title: isEdit ? 'تعديل صنف' : 'تكويد صنف جديد',
    confirmLabel: 'حفظ',
    onConfirm: async () => {
      const isValid = validateForm([
        { fieldId: 'm-name', validatorFn: isRequired, message: 'اسم الصنف مطلوب' },
      ]);
      if (!isValid) return;

      const thresholdRaw = document.getElementById('m-reorderThreshold').value;
      const data = {
        name: document.getElementById('m-name').value.trim(),
        category: document.getElementById('m-category').value,
        unit: document.getElementById('m-unit').value.trim(),
        reorderThreshold: thresholdRaw === '' ? null : Number(thresholdRaw),
        notes: document.getElementById('m-notes').value.trim(),
      };

      if (isEdit) {
        await updateInventoryItem(item.id, data);
      } else {
        await createInventoryItem(data);
      }
      showToast('تم الحفظ بنجاح', 'success');
      closeModal();
      await _refreshInventoryItems();
    },
  });

  if (isEdit) {
    document.getElementById('delete-item-btn').addEventListener('click', () => {
      confirmDelete('هل أنت متأكد من حذف هذا الصنف؟ ستبقى حركات المخزون المرتبطة به كسجل تاريخي.', async () => {
        await deleteInventoryItem(item.id);
        showToast('تم حذف الصنف', 'success');
        await _refreshInventoryItems();
      });
    });
  }
}
