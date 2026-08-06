// js/pages/transfer-page.js

let _tAnimals = [];
let _tBatches = [];

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('bulk');
  renderSidebar('bulk');
  renderHeader('تحويل قطيع ↔ تجارة');

  [_tAnimals, _tBatches] = await Promise.all([getAllAnimals(), getAllBulkBatches()]);

  const aliveAnimals = _tAnimals.filter(a => a.status === 'alive');
  document.getElementById('tt-animalId').innerHTML = aliveAnimals.length
    ? aliveAnimals.map(a => `<option value="${a.id}">${a.code} — ${ANIMAL_TYPE_LABELS[a.type] || a.type} (${a.breed})</option>`).join('')
    : `<option value="">لا توجد حيوانات حية متاحة</option>`;

  const batchOptions = _tBatches.length
    ? _tBatches.map(b => `<option value="${b.id}">${b.code}</option>`).join('')
    : `<option value="">لا توجد دفعات — أنشئ دفعة أولاً</option>`;
  document.getElementById('tt-batchId').innerHTML = batchOptions;
  document.getElementById('th-batchId').innerHTML = batchOptions;

  document.getElementById('tt-date').value = todayIso();
  document.getElementById('th-date').value = todayIso();

  document.getElementById('to-trade-form').addEventListener('submit', _handleToTrade);
  document.getElementById('to-herd-form').addEventListener('submit', _handleToHerd);

  await _refreshTransferLog();
});

async function _handleToTrade(e) {
  e.preventDefault();

  const animalId = document.getElementById('tt-animalId').value;
  const batchId = document.getElementById('tt-batchId').value;
  const date = document.getElementById('tt-date').value;

  const isValid = validateForm([
    { fieldId: 'tt-animalId', validatorFn: isRequired, message: 'يرجى اختيار حيوان' },
    { fieldId: 'tt-batchId', validatorFn: isRequired, message: 'يرجى اختيار دفعة' },
    { fieldId: 'tt-date', validatorFn: isValidDate, message: 'التاريخ مطلوب' },
  ]);
  if (!isValid) return;

  const btn = document.getElementById('to-trade-btn');
  btn.disabled = true;
  btn.textContent = 'جاري التنفيذ...';

  try {
    await transferAnimalToTrade({
      animalId: Number(animalId),
      batchId: Number(batchId),
      date,
      valuation: document.getElementById('tt-valuation').value ? Number(document.getElementById('tt-valuation').value) : null,
      notes: document.getElementById('tt-notes').value.trim(),
    });
    showToast('تم تحويل الحيوان لمخزون التجارة بنجاح', 'success');
    setTimeout(() => window.location.reload(), 500);
  } catch (err) {
    showToast(err.message || 'حدث خطأ أثناء التحويل', 'error');
    btn.disabled = false;
    btn.textContent = 'تنفيذ التحويل';
  }
}

async function _handleToHerd(e) {
  e.preventDefault();

  const batchId = document.getElementById('th-batchId').value;
  const breed = document.getElementById('th-breed').value.trim();
  const date = document.getElementById('th-date').value;

  const isValid = validateForm([
    { fieldId: 'th-batchId', validatorFn: isRequired, message: 'يرجى اختيار دفعة' },
    { fieldId: 'th-breed', validatorFn: isRequired, message: 'السلالة مطلوبة' },
    { fieldId: 'th-date', validatorFn: isValidDate, message: 'التاريخ مطلوب' },
  ]);
  if (!isValid) return;

  const btn = document.getElementById('to-herd-btn');
  btn.disabled = true;
  btn.textContent = 'جاري التنفيذ...';

  try {
    await transferTradeToAnimal({
      batchId: Number(batchId),
      type: document.getElementById('th-type').value,
      gender: document.getElementById('th-gender').value,
      breed,
      date,
      valuation: document.getElementById('th-valuation').value ? Number(document.getElementById('th-valuation').value) : null,
      notes: document.getElementById('th-notes').value.trim(),
    });
    showToast('تم إدخال الحيوان للقطيع بنجاح', 'success');
    setTimeout(() => window.location.reload(), 500);
  } catch (err) {
    showToast(err.message || 'حدث خطأ أثناء التحويل', 'error');
    btn.disabled = false;
    btn.textContent = 'تنفيذ التحويل';
  }
}

async function _refreshTransferLog() {
  const transfers = await getAllTransfers();
  const rows = transfers
    .slice()
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .map(t => {
      const animal = _tAnimals.find(a => a.id === t.animalId);
      const batch = _tBatches.find(b => b.id === t.batchId);
      return {
        dateLabel: formatDateArabic(t.date),
        kindLabel: t.kind === 'herdToTrade' ? 'قطيع → تجارة' : 'تجارة → قطيع',
        animalCode: animal ? animal.code : '-',
        batchCode: batch ? batch.code : '-',
        valuationLabel: t.valuation ? formatCurrency(t.valuation) : '-',
        notes: t.notes || '-',
      };
    });

  renderDataTable('transfer-log-table', [
    { key: 'dateLabel', label: 'التاريخ', sortable: true },
    { key: 'kindLabel', label: 'الاتجاه', sortable: false },
    { key: 'animalCode', label: 'الحيوان', sortable: false },
    { key: 'batchCode', label: 'الدفعة', sortable: false },
    { key: 'valuationLabel', label: 'القيمة التقديرية', sortable: false },
    { key: 'notes', label: 'ملاحظات', sortable: false },
  ], rows, {
    emptyMessage: 'لا توجد تحويلات مسجَّلة بعد',
  });
}
