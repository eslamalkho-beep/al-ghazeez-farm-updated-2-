// js/pages/fattening-page.js

let _allBatchesCache = [];
let _allAnimalsCache = [];
let _allExpensesCache = [];
let _allWeightsCache = [];
let _allHealthCache = [];
let _allRevenuesCache = [];
let _allLocationsCache = [];
let _allInventoryMovementsCache = [];
let _allDeathsCache = [];
let _fatteningExportRows = [];
let _fatteningFilterAnimalId = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('herd');
  renderSidebar('herd-fattening');
  renderHeader('سجل التسمين');

  const params = new URLSearchParams(window.location.search);
  const animalIdParam = params.get('animalId');
  _fatteningFilterAnimalId = animalIdParam ? Number(animalIdParam) : null;

  document.getElementById('startDate').value = todayIso();
  document.getElementById('batch-form').addEventListener('submit', _handleCreateBatch);

  document.getElementById('export-excel-btn').addEventListener('click', () => {
    exportRowsToExcel('سجل_التسمين', _fatteningExportColumns, _fatteningExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    exportRowsToPdf('سجل التسمين', _fatteningExportColumns, _fatteningExportRows);
  });

  await _refreshAll();
});

const _fatteningExportColumns = [
  { key: 'batchNumber', label: 'كود الدفعة' },
  { key: 'startDateLabel', label: 'تاريخ البدء' },
  { key: 'locationLabel', label: 'الحظيرة' },
  { key: 'statusLabel', label: 'الحالة' },
  { key: 'animalsCountLabel', label: 'عدد الحيوانات' },
  { key: 'allocationMethodLabel', label: 'طريقة توزيع التكلفة' },
  { key: 'totalLinkedCostLabel', label: 'تكلفة العلف والأدوية المسجّلة' },
  { key: 'avgCostPerKgLabel', label: 'متوسط تكلفة الكيلو' },
];

function _locationLabel(locationId) {
  if (!locationId) return '-';
  const loc = _allLocationsCache.find(l => l.id === Number(locationId));
  return loc ? loc.name : '-';
}

async function _refreshAll() {
  [_allBatchesCache, _allAnimalsCache, _allExpensesCache, _allWeightsCache, _allHealthCache, _allRevenuesCache, _allLocationsCache, _allInventoryMovementsCache, _allDeathsCache] = await Promise.all([
    getAllFatteningBatches(),
    getAllAnimals(),
    getAllExpenses(),
    getAllWeightRecords(),
    getAllHealthRecords(),
    getAllRevenues(),
    getAllLocations(),
    getAllInventoryMovements(),
    getAllDeaths(),
  ]);

  const locationSelect = document.getElementById('locationId');
  const currentLocationValue = locationSelect.value;
  locationSelect.innerHTML = `<option value="">بدون تحديد</option>` +
    _allLocationsCache.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
  locationSelect.value = currentLocationValue;

  if (_fatteningFilterAnimalId) {
    const animal = _allAnimalsCache.find(a => a.id === _fatteningFilterAnimalId);
    if (animal) {
      document.getElementById('page-title').textContent = `سجل التسمين — ${animal.code}`;
      document.getElementById('table-title').textContent = `دفعات التسمين — ${animal.code}`;
      document.getElementById('clear-animal-filter-link').style.display = 'inline-flex';
    }
  }

  _renderBatchesTable();
}

function _renderBatchesTable() {
  let batches = _allBatchesCache;
  if (_fatteningFilterAnimalId) {
    batches = batches.filter(b => (b.animals || []).some(a => a.animalId === _fatteningFilterAnimalId));
  }

  const rows = batches
    .slice()
    .sort((a, b) => new Date(b.startDate) - new Date(a.startDate))
    .map(batch => {
      const results = computeFatteningBatchResults(batch, {
        expenses: _allExpensesCache,
        weightRecords: _allWeightsCache,
        animals: _allAnimalsCache,
        revenues: _allRevenuesCache,
        healthRecords: _allHealthCache,
        inventoryMovements: _allInventoryMovementsCache,
        deathRecords: _allDeathsCache,
      });
      const activeCount = (batch.animals || []).filter(a => !a.exitDate).length;
      const totalCount = (batch.animals || []).length;
      return {
        ...batch,
        startDateLabel: formatDateArabic(batch.startDate),
        locationLabel: _locationLabel(batch.locationId),
        statusLabel: batch.status === 'closed' ? 'مغلقة' : 'نشطة',
        animalsCountLabel: `${activeCount} نشط / ${totalCount} إجمالي`,
        allocationMethodLabel: FATTENING_ALLOCATION_METHOD_LABELS[results.allocationMethod],
        totalLinkedCostLabel: formatCurrency(results.totalLinkedCost),
        avgCostPerKgLabel: results.avgCostPerKg != null ? `${formatCurrency(results.avgCostPerKg)}/كجم` : '-',
      };
    });

  _fatteningExportRows = rows;

  renderDataTable('batches-table', [
    { key: 'batchNumber', label: 'كود الدفعة', sortable: true },
    { key: 'startDateLabel', label: 'تاريخ البدء', sortable: true },
    { key: 'locationLabel', label: 'الحظيرة', sortable: true },
    { key: 'statusLabel', label: 'الحالة', sortable: false },
    { key: 'animalsCountLabel', label: 'عدد الحيوانات', sortable: false },
    { key: 'allocationMethodLabel', label: 'طريقة توزيع التكلفة', sortable: false },
    { key: 'totalLinkedCostLabel', label: 'تكلفة العلف والأدوية المسجّلة', sortable: false },
    { key: 'avgCostPerKgLabel', label: 'متوسط تكلفة الكيلو', sortable: false },
  ], rows, {
    onRowClick: (row) => _openBatchDetail(row.id),
    emptyMessage: 'لا توجد دفعات تسمين بعد',
  });
}

async function _handleCreateBatch(e) {
  e.preventDefault();
  const startDate = document.getElementById('startDate').value;
  if (!isValidDate(startDate)) {
    showToast('يرجى إدخال تاريخ بدء صحيح', 'error');
    return;
  }
  const saveBtn = document.getElementById('save-batch-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'جاري الحفظ...';
  try {
    await createFatteningBatch({
      startDate,
      notes: document.getElementById('notes').value.trim(),
      locationId: document.getElementById('locationId').value || null,
      allocationMethod: document.getElementById('allocationMethod').value,
    });
    showToast('تم بدء الدفعة بنجاح', 'success');
    document.getElementById('batch-form').reset();
    document.getElementById('startDate').value = todayIso();
    await _refreshAll();
  } catch (err) {
    showToast('حدث خطأ أثناء بدء الدفعة', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'بدء الدفعة';
  }
}

function _openBatchDetail(batchId) {
  const batch = _allBatchesCache.find(b => b.id === batchId);
  if (!batch) return;

  const results = computeFatteningBatchResults(batch, {
    expenses: _allExpensesCache,
    weightRecords: _allWeightsCache,
    animals: _allAnimalsCache,
    revenues: _allRevenuesCache,
    healthRecords: _allHealthCache,
    inventoryMovements: _allInventoryMovementsCache,
    deathRecords: _allDeathsCache,
  });

  const activeAnimalIds = new Set((batch.animals || []).filter(a => !a.exitDate).map(a => a.animalId));
  const availableAnimals = _allAnimalsCache.filter(a => a.status === 'alive' && !activeAnimalIds.has(a.id));
  const activeEntries = (batch.animals || []).filter(a => !a.exitDate);

  const rowsHtml = results.animalsResults.length
    ? results.animalsResults.map(r => `
        <tr>
          <td>${r.animal ? r.animal.code : '—'}</td>
          <td>${formatDateArabic(r.entryDate)}</td>
          <td>${r.exitDate ? formatDateArabic(r.exitDate) : 'نشط'}</td>
          <td>${r.days}</td>
          <td>${r.entryWeight != null ? formatNumber(r.entryWeight) : '-'}</td>
          <td>${r.exitWeight != null ? formatNumber(r.exitWeight) : '-'}</td>
          <td>${r.weightGain != null ? formatNumber(r.weightGain) : '-'}</td>
          <td>${formatCurrency(r.allocatedCost)}</td>
          <td>${r.individualCost > 0 ? formatCurrency(r.individualCost) : '-'}</td>
          <td>${r.costPerKgGain != null ? formatCurrency(r.costPerKgGain) : '-'}</td>
          <td>${r.saleRevenue > 0 ? formatCurrency(r.saleRevenue) : '-'}</td>
          <td>${r.netProfit != null ? formatCurrency(r.netProfit) : '-'}</td>
        </tr>
      `).join('')
    : `<tr><td colspan="12" style="text-align:center; color: var(--color-text-secondary);">لا توجد حيوانات في هذه الدفعة بعد</td></tr>`;

  const html = `
    <div style="margin-bottom: var(--spacing-3);">
      <p><strong>تاريخ البدء:</strong> ${formatDateArabic(batch.startDate)}
        ${batch.endDate ? ` — <strong>تاريخ الإغلاق:</strong> ${formatDateArabic(batch.endDate)}` : ''}
        — <strong>الحالة:</strong> ${batch.status === 'closed' ? 'مغلقة' : 'نشطة'}</p>
      <p><strong>الحظيرة:</strong> ${_locationLabel(batch.locationId)}
        — <strong>طريقة توزيع التكلفة الجماعية:</strong> ${FATTENING_ALLOCATION_METHOD_LABELS[results.allocationMethod]}
        <button type="button" class="btn btn--outline btn--sm" id="edit-batch-details-btn" style="margin-inline-start:8px;">✎ تعديل</button></p>
      ${batch.notes ? `<p><strong>ملاحظات:</strong> ${batch.notes}</p>` : ''}
      <p><strong>إجمالي تكلفة العلف والأدوية المسجّلة:</strong> ${formatCurrency(results.totalLinkedCost)}
        — <strong>متوسط تكلفة الكيلو:</strong> ${results.avgCostPerKg != null ? formatCurrency(results.avgCostPerKg) + '/كجم' : '-'}</p>
    </div>

    <div style="overflow-x:auto;">
      <table class="data-table">
        <thead>
          <tr>
            <th>الحيوان</th><th>تاريخ الدخول</th><th>تاريخ الخروج</th><th>الأيام</th>
            <th>وزن الدخول</th><th>وزن الخروج</th><th>الزيادة (كجم)</th>
            <th>تكلفة العلف/الأدوية الموزَّعة</th><th>تكلفة فردية مباشرة (صحية + مصروفات)</th><th>تكلفة الكيلو</th><th>سعر البيع</th><th>الربح</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>

    ${batch.status === 'active' ? `
    <div style="border-top:1px solid var(--color-border); margin-top: var(--spacing-3); padding-top: var(--spacing-3);">
      <h4 style="margin-bottom: var(--spacing-2);">إضافة حيوان للدفعة</h4>
      <form id="add-animal-form" class="form-grid">
        <div class="form-group">
          <label>الحيوان</label>
          <select id="fa-animalId" class="form-control">
            ${availableAnimals.length
              ? availableAnimals.map(a => `<option value="${a.id}">${a.code} — ${ANIMAL_TYPE_LABELS[a.type] || a.type} (${ANIMAL_GENDER_LABELS[a.gender] || a.gender})</option>`).join('')
              : `<option value="">لا توجد حيوانات متاحة</option>`}
          </select>
        </div>
        <div class="form-group">
          <label>تاريخ الدخول</label>
          <input type="date" id="fa-entryDate" class="form-control" value="${batch.startDate}" />
        </div>
        <div class="form-group">
          <label>وزن الدخول (اختياري)</label>
          <input type="number" id="fa-entryWeight" class="form-control" min="0" step="0.1" />
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn--success btn--sm" id="add-animal-btn">إضافة</button>
        </div>
      </form>
    </div>

    ${activeEntries.length ? `
    <div style="border-top:1px solid var(--color-border); margin-top: var(--spacing-3); padding-top: var(--spacing-3);">
      <h4 style="margin-bottom: var(--spacing-2);">إخراج حيوان من الدفعة</h4>
      <form id="remove-animal-form" class="form-grid">
        <div class="form-group">
          <label>الحيوان</label>
          <select id="ra-animalId" class="form-control">
            ${activeEntries.map(e => {
              const a = _allAnimalsCache.find(x => x.id === e.animalId);
              return `<option value="${e.animalId}">${a ? a.code : e.animalId}</option>`;
            }).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>تاريخ الخروج</label>
          <input type="date" id="ra-exitDate" class="form-control" value="${todayIso()}" />
        </div>
        <div class="form-group">
          <label>وزن الخروج (اختياري)</label>
          <input type="number" id="ra-exitWeight" class="form-control" min="0" step="0.1" />
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn--outline btn--sm" id="remove-animal-btn">إخراج</button>
        </div>
      </form>
    </div>
    ` : ''}

    <div style="border-top:1px solid var(--color-border); margin-top: var(--spacing-3); padding-top: var(--spacing-3); display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
      <label for="close-endDate" style="margin-inline-end:4px;">تاريخ الإغلاق:</label>
      <input type="date" id="close-endDate" class="form-control" style="width:auto; display:inline-block;" value="${todayIso()}" />
      <button type="button" class="btn btn--danger btn--sm" id="close-batch-btn">إغلاق الدفعة</button>
    </div>
    ` : `
    <div style="border-top:1px solid var(--color-border); margin-top: var(--spacing-3); padding-top: var(--spacing-3);">
      <button type="button" class="btn btn--outline btn--sm" id="reopen-batch-btn">إعادة فتح الدفعة</button>
    </div>
    `}
  `;

  openModal(html, { title: `دفعة تسمين ${batch.batchNumber}`, hideFooter: true });

  document.getElementById('edit-batch-details-btn')?.addEventListener('click', () => _openEditBatchDetails(batch));

  if (batch.status === 'active') {
    document.getElementById('add-animal-btn')?.addEventListener('click', async () => {
      const animalId = document.getElementById('fa-animalId').value;
      const entryDate = document.getElementById('fa-entryDate').value;
      const entryWeight = document.getElementById('fa-entryWeight').value;
      if (!animalId) { showToast('اختر حيوانًا أولاً', 'error'); return; }
      if (!isValidDate(entryDate)) { showToast('أدخل تاريخ دخول صحيح', 'error'); return; }
      try {
        await addAnimalToBatch(batch.id, { animalId, entryDate, entryWeight: entryWeight ? Number(entryWeight) : null });
        showToast('تمت إضافة الحيوان للدفعة', 'success');
        await _refreshAll();
        closeModal();
        _openBatchDetail(batch.id);
      } catch (err) {
        showToast(err.message || 'حدث خطأ', 'error');
      }
    });

    document.getElementById('remove-animal-btn')?.addEventListener('click', async () => {
      const animalId = document.getElementById('ra-animalId').value;
      const exitDate = document.getElementById('ra-exitDate').value;
      const exitWeight = document.getElementById('ra-exitWeight').value;
      if (!isValidDate(exitDate)) { showToast('أدخل تاريخ خروج صحيح', 'error'); return; }
      try {
        await removeAnimalFromBatch(batch.id, animalId, { exitDate, exitWeight: exitWeight ? Number(exitWeight) : null });
        showToast('تم إخراج الحيوان من الدفعة', 'success');
        await _refreshAll();
        closeModal();
        _openBatchDetail(batch.id);
      } catch (err) {
        showToast(err.message || 'حدث خطأ', 'error');
      }
    });

    document.getElementById('close-batch-btn')?.addEventListener('click', () => {
      const endDate = document.getElementById('close-endDate').value;
      if (!isValidDate(endDate)) { showToast('أدخل تاريخ إغلاق صحيح', 'error'); return; }
      if (!window.confirm('هل أنت متأكد من إغلاق الدفعة؟ سيتم إخراج أي حيوان متبقٍ بهذا التاريخ تلقائيًا.')) return;
      closeFatteningBatch(batch.id, endDate).then(async () => {
        showToast('تم إغلاق الدفعة', 'success');
        await _refreshAll();
        closeModal();
      }).catch(() => showToast('حدث خطأ أثناء الإغلاق', 'error'));
    });
  } else {
    document.getElementById('reopen-batch-btn')?.addEventListener('click', () => {
      reopenFatteningBatch(batch.id).then(async () => {
        showToast('تمت إعادة فتح الدفعة', 'success');
        await _refreshAll();
        closeModal();
      }).catch(() => showToast('حدث خطأ', 'error'));
    });
  }
}

// تعديل الحظيرة/ملاحظات/طريقة توزيع التكلفة لدفعة موجودة (بلا مساس بقائمة الحيوانات أو الحالة)
function _openEditBatchDetails(batch) {
  const html = `
    <form id="edit-batch-form" class="form-grid">
      <div class="form-group">
        <label>الحظيرة (اختياري)</label>
        <select id="eb-locationId" class="form-control">
          <option value="">بدون تحديد</option>
          ${_allLocationsCache.map(l => `<option value="${l.id}" ${batch.locationId === l.id ? 'selected' : ''}>${l.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>طريقة توزيع التكلفة الجماعية</label>
        <select id="eb-allocationMethod" class="form-control">
          <option value="days" ${(!batch.allocationMethod || batch.allocationMethod === 'days') ? 'selected' : ''}>حسب أيام الإقامة (افتراضي)</option>
          <option value="equal" ${batch.allocationMethod === 'equal' ? 'selected' : ''}>بالتساوي على الرؤوس</option>
          <option value="weight" ${batch.allocationMethod === 'weight' ? 'selected' : ''}>حسب الوزن</option>
        </select>
      </div>
      <div class="form-group form-group--full">
        <label>ملاحظات</label>
        <input type="text" id="eb-notes" class="form-control" value="${batch.notes || ''}" />
      </div>
    </form>
  `;
  openModal(html, {
    title: `تعديل بيانات الدفعة ${batch.batchNumber}`,
    confirmLabel: 'حفظ',
    onConfirm: async () => {
      await updateFatteningBatchDetails(batch.id, {
        locationId: document.getElementById('eb-locationId').value || null,
        allocationMethod: document.getElementById('eb-allocationMethod').value,
        notes: document.getElementById('eb-notes').value.trim(),
      });
      showToast('تم حفظ التعديلات', 'success');
      await _refreshAll();
      closeModal();
      _openBatchDetail(batch.id);
    },
  });
}
