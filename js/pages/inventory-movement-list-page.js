// js/pages/inventory-movement-list-page.js

const INVENTORY_REASON_TYPES = ['purchase', 'consumption', 'damage', 'adjustment', 'other'];

let _allInventoryItemsForMovements = [];
let _allInventoryMovementsCacheForList = [];
let _allFatteningBatchesForMovements = [];
let _currentExportColumns = null;
let _currentExportRows = null;
// ربط كل حركة تلقائية (relatedExpenseId/relatedPurchaseId) برقم القيد المحاسبي لمصدرها — نفس نمط عمود
// "رقم القيد" في revenue-list-page.js
let _journalEntryIdByExpenseIdForMovements = new Map();
let _journalEntryIdByPurchaseIdForMovements = new Map();
let _entryNumberByJournalEntryIdForMovements = new Map();

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('inventory');
  renderSidebar('inventory-movements');
  renderHeader('حركات المخزون');

  if (!hasActionPermission('inventory', 'export')) {
    document.getElementById('export-excel-btn').style.display = 'none';
  }
  if (!hasActionPermission('inventory', 'export') || !hasActionPermission('inventory', 'print')) {
    document.getElementById('export-pdf-btn').style.display = 'none';
  }

  await _refreshInventoryMovements();

  document.getElementById('export-excel-btn').addEventListener('click', () => {
    exportRowsToExcel('حركات المخزون', _currentExportColumns, _currentExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    exportRowsToPdf('حركات المخزون', _currentExportColumns, _currentExportRows);
  });
});

async function _refreshInventoryMovements() {
  const [items, movements, batches, expenses, purchases, journalEntries] = await Promise.all([
    getAllInventoryItems(),
    getAllInventoryMovements(),
    getAllFatteningBatches(),
    getAllExpenses(),
    getAllPurchases(),
    getAllJournalEntries(),
  ]);
  _allInventoryItemsForMovements = items;
  _allInventoryMovementsCacheForList = movements;
  _allFatteningBatchesForMovements = batches;
  _journalEntryIdByExpenseIdForMovements = new Map(expenses.filter(e => e.journalEntryId).map(e => [e.id, e.journalEntryId]));
  _journalEntryIdByPurchaseIdForMovements = new Map(purchases.filter(p => p.journalEntryId).map(p => [p.id, p.journalEntryId]));
  _entryNumberByJournalEntryIdForMovements = new Map(journalEntries.map(e => [e.id, e.entryNumber]));
  _drawInventoryMovements();
}

// رقم القيد المحاسبي لمصدر حركة تلقائية (مصروف أو مشترى)، أو null لحركة يدوية/بلا قيد بعد
function _journalEntryNumberForMovement(movement) {
  let journalEntryId = null;
  if (movement.relatedExpenseId) journalEntryId = _journalEntryIdByExpenseIdForMovements.get(movement.relatedExpenseId) || null;
  else if (movement.relatedPurchaseId) journalEntryId = _journalEntryIdByPurchaseIdForMovements.get(movement.relatedPurchaseId) || null;
  if (!journalEntryId) return null;
  const entryNumber = _entryNumberByJournalEntryIdForMovements.get(journalEntryId);
  return entryNumber ? { journalEntryId, entryNumber } : null;
}

function _itemLabel(itemId) {
  const item = _allInventoryItemsForMovements.find(i => i.id === itemId);
  return item ? item.name : 'صنف محذوف';
}

function _batchLabel(batchId) {
  if (!batchId) return '-';
  const batch = _allFatteningBatchesForMovements.find(b => b.id === Number(batchId));
  return batch ? batch.batchNumber : '-';
}

function _drawInventoryMovements() {
  const sorted = [..._allInventoryMovementsCacheForList].sort((a, b) => (a.date < b.date ? 1 : -1));
  const rows = sorted.map(m => {
    const entryRef = _journalEntryNumberForMovement(m);
    return {
      ...m,
      itemLabel: _itemLabel(m.itemId),
      dateLabel: formatDateArabic(m.date),
      directionBadge: m.direction === 'in'
        ? '<span class="badge badge--green">وارد</span>'
        : '<span class="badge badge--red">صادر</span>',
      quantityLabel: formatNumber(m.quantity),
      reasonLabel: INVENTORY_REASON_LABELS[m.reasonType] || m.reasonType || '-',
      unitCostLabel: isRequired(m.unitCost) ? formatCurrency(m.unitCost) : '-',
      batchLabel: _batchLabel(m.linkedFatteningBatchId),
      // stopPropagation يمنع فتح نافذة تعديل الحركة عند النقر على رقم القيد تحديدًا، نفس نمط revenue-list-page.js
      entryNumberLink: entryRef
        ? `<a href="../accounting/journal-entry-form.html?id=${entryRef.journalEntryId}" onclick="event.stopPropagation();">${entryRef.entryNumber}</a>`
        : '-',
    };
  });

  const columns = [
    { key: 'dateLabel', label: 'التاريخ', sortable: true },
    { key: 'itemLabel', label: 'الصنف', sortable: true },
    { key: 'directionBadge', label: 'الاتجاه', sortable: false },
    { key: 'quantityLabel', label: 'الكمية', sortable: false },
    { key: 'unitCostLabel', label: 'تكلفة الوحدة', sortable: false },
    { key: 'reasonLabel', label: 'السبب', sortable: true },
    { key: 'batchLabel', label: 'دفعة تسمين مرتبطة', sortable: false },
    { key: 'entryNumberLink', label: 'رقم القيد', sortable: false },
    { key: 'notes', label: 'ملاحظات', sortable: false },
  ];

  _currentExportColumns = columns;
  _currentExportRows = rows;

  renderDataTable('inventory-movement-table', columns, rows, {
    onRowClick: (row) => {
      // حركة تلقائية من مصروف/مشترى — لا تعديل يدوي هنا، التعديل الفعلي يكون من السجل المصدر نفسه (يزامن
      // الحركة تلقائيًا عبر _syncExpenseInventoryLink/_syncPurchaseInventoryLink)
      if (row.relatedExpenseId) {
        showToast('هذه الحركة مرتبطة تلقائيًا بمصروف — عدّلها من صفحة المصروف نفسه', 'info');
        return;
      }
      if (row.relatedPurchaseId) {
        showToast('هذه الحركة مرتبطة تلقائيًا بمشترى — عدّلها من صفحة المشترى نفسه', 'info');
        return;
      }
      if (!hasActionPermission('inventory', 'edit')) {
        showToast('ليس لديك صلاحية تعديل حركات المخزون', 'error');
        return;
      }
      _openMovementModal(row);
    },
    emptyMessage: 'لا توجد حركات مخزون مسجّلة بعد',
  });
}

// ⚠️ لا يوجد مسار إنشاء حركة جديدة من هذه الصفحة — حركات "وارد"/"صادر" الحقيقية تُنشأ حصرًا تلقائيًا من
// المشتريات (`_syncPurchaseInventoryLink`) والمصروفات (`_syncExpenseInventoryLink`)؛ الحركات الأخرى (تسوية
// جرد/عهدة) تُنشأ تلقائيًا من خدماتها الخاصة (stock-count-service.js/custody-service.js). هذه الدالة
// تُستدعى فقط لتعديل/حذف حركة **غير مرتبطة** بمصروف أو مشترى (تسوية جرد قديمة/عهدة/سجل يدوي قديم من قبل
// هذا التغيير) — onRowClick أعلاه يحجب الاستدعاء تمامًا لأي حركة تحمل relatedExpenseId/relatedPurchaseId
function _openMovementModal(movement) {
  const html = `
    <form id="movement-modal-form" class="form-grid">
      <div class="form-group form-group--full">
        <label>الصنف <span class="required">*</span></label>
        <select id="m-itemId" class="form-control">
          ${_allInventoryItemsForMovements.map(i => `<option value="${i.id}" ${movement.itemId === i.id ? 'selected' : ''}>${i.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>الاتجاه <span class="required">*</span></label>
        <select id="m-direction" class="form-control">
          <option value="in" ${movement.direction === 'in' ? 'selected' : ''}>وارد (إضافة للمخزون)</option>
          <option value="out" ${movement.direction === 'out' ? 'selected' : ''}>صادر (سحب من المخزون)</option>
        </select>
      </div>
      <div class="form-group">
        <label>الكمية <span class="required">*</span></label>
        <input type="number" id="m-quantity" class="form-control" value="${movement.quantity ?? ''}" />
        <div class="form-error"></div>
      </div>
      <div class="form-group">
        <label>التاريخ <span class="required">*</span></label>
        <input type="date" id="m-date" class="form-control" value="${movement.date || todayIso()}" />
      </div>
      <div class="form-group">
        <label>السبب</label>
        <select id="m-reasonType" class="form-control">
          ${INVENTORY_REASON_TYPES.map(r => `<option value="${r}" ${movement.reasonType === r ? 'selected' : ''}>${INVENTORY_REASON_LABELS[r]}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>تكلفة الوحدة (اختياري، إعلامي فقط)</label>
        <input type="number" id="m-unitCost" class="form-control" value="${movement.unitCost ?? ''}" />
      </div>
      <div class="form-group form-group--full">
        <label>ربط بدفعة تسمين (اختياري)</label>
        <select id="m-linkedFatteningBatchId" class="form-control">
          <option value="">بدون ربط</option>
          ${_allFatteningBatchesForMovements
            .slice()
            .sort((a, b) => new Date(b.startDate) - new Date(a.startDate))
            .map(b => `<option value="${b.id}" ${movement.linkedFatteningBatchId === b.id ? 'selected' : ''}>${b.batchNumber} — ${b.status === 'closed' ? 'مغلقة' : 'نشطة'}</option>`).join('')}
        </select>
        <small style="color: var(--color-text-secondary);">لصرف مباشر من مخزون علف/أدوية موجود لدفعة تسمين معينة — تُحسب تكلفته (الكمية × تكلفة الوحدة) ضمن تكلفة الدفعة تلقائيًا. الاتجاه يجب أن يكون "صادر" حتى يُحتسب.</small>
      </div>
      <div class="form-group form-group--full">
        <label>ملاحظات</label>
        <textarea id="m-notes" class="form-control">${movement.notes || ''}</textarea>
      </div>

      ${hasActionPermission('inventory', 'delete') ? `
      <div class="form-group form-group--full" style="border-top:1px solid var(--color-border); padding-top: var(--spacing-3);">
        <button type="button" class="btn btn--danger btn--sm" id="delete-movement-btn">حذف هذه الحركة</button>
      </div>` : ''}
    </form>
  `;

  openModal(html, {
    title: 'تعديل حركة مخزون',
    confirmLabel: 'حفظ',
    onConfirm: async () => {
      const isValid = validateForm([
        { fieldId: 'm-quantity', validatorFn: isPositiveNumber, message: 'الكمية يجب أن تكون رقمًا موجبًا' },
        { fieldId: 'm-date', validatorFn: isValidDate, message: 'التاريخ مطلوب' },
      ]);
      if (!isValid) return;

      const unitCostRaw = document.getElementById('m-unitCost').value;
      const linkedBatchRaw = document.getElementById('m-linkedFatteningBatchId').value;
      const data = {
        itemId: Number(document.getElementById('m-itemId').value),
        direction: document.getElementById('m-direction').value,
        quantity: Number(document.getElementById('m-quantity').value),
        date: document.getElementById('m-date').value,
        reasonType: document.getElementById('m-reasonType').value,
        unitCost: unitCostRaw === '' ? null : Number(unitCostRaw),
        linkedFatteningBatchId: linkedBatchRaw ? Number(linkedBatchRaw) : null,
        notes: document.getElementById('m-notes').value.trim(),
      };

      await updateInventoryMovement(movement.id, data);
      showToast('تم الحفظ بنجاح', 'success');
      closeModal();
      await _refreshInventoryMovements();
    },
  });

  if (hasActionPermission('inventory', 'delete')) {
    document.getElementById('delete-movement-btn').addEventListener('click', () => {
      confirmDelete('هل أنت متأكد من حذف هذه الحركة؟', async () => {
        await deleteInventoryMovement(movement.id);
        showToast('تم حذف الحركة', 'success');
        await _refreshInventoryMovements();
      });
    });
  }
}
