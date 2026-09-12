// js/pages/animal-count-page.js
// الجرد الحيواني: جدول بكل حيوانات القطيع الحية — لكل حيوان قيمة تقديرية وحالة (موجود/مفقود)، مع فلترة
// مركّبة (نوع/سلالة/فترة أعمار/بحث) وتطبيق جماعي للسعر أو الحالة على مجموعة الفلترة الحالية، وحفظ كل
// الحيوانات (لا يضيع غير المعروض عند الفلترة). الجلسات المحفوظة قابلة للتعديل (قيم/حالات) من محضر الجلسة.

let _aliveAnimalsForCount = [];
let _linesState = new Map(); // animalId -> { estimatedValue, resultStatus } — يحتفظ بقيم كل الحيوانات لا المعروض فقط

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('herd');
  renderSidebar('herd-animal-count');
  renderHeader('الجرد الحيواني');

  const allAnimals = await getAllAnimals();
  _aliveAnimalsForCount = allAnimals
    .filter(a => a.status === 'alive')
    .sort((a, b) => (a.code || '').localeCompare(b.code || ''));

  _populateBreedFilter();

  document.getElementById('date').value = todayIso();
  document.getElementById('date').addEventListener('change', _renderCountLines); // العمر يعتمد على تاريخ الجرد
  document.getElementById('filter-type').addEventListener('change', _renderCountLines);
  document.getElementById('filter-breed').addEventListener('change', _renderCountLines);
  document.getElementById('filter-age-from').addEventListener('input', _renderCountLines);
  document.getElementById('filter-age-to').addEventListener('input', _renderCountLines);
  document.getElementById('filter-animals').addEventListener('input', _renderCountLines);
  document.getElementById('apply-uniform-btn').addEventListener('click', _applyUniformValue);
  document.getElementById('apply-status-btn').addEventListener('click', _applyUniformStatus);
  document.getElementById('count-form').addEventListener('submit', _handleSubmit);

  _renderCountLines();
  _refreshHistory();
});

function _populateBreedFilter() {
  const breeds = [...new Set(_aliveAnimalsForCount.map(a => (a.breed || '').trim()).filter(Boolean))].sort();
  const select = document.getElementById('filter-breed');
  select.innerHTML = '<option value="">الكل</option>' +
    breeds.map(b => `<option value="${b}">${b}</option>`).join('');
}

// عمر الحيوان بالأشهر حتى تاريخ معيّن (تاريخ الجرد أو اليوم) — null لو بلا تاريخ ميلاد/اقتناء
function _ageInMonths(birthDate, atDate) {
  if (!birthDate) return null;
  const start = new Date(birthDate);
  const end = atDate ? new Date(atDate) : new Date();
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return null;
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
}

function _getFilteredAnimals() {
  const type = document.getElementById('filter-type').value;
  const breed = document.getElementById('filter-breed').value;
  const ageFrom = Number(document.getElementById('filter-age-from').value || NaN);
  const ageTo = Number(document.getElementById('filter-age-to').value || NaN);
  const text = (document.getElementById('filter-animals').value || '').trim().toLowerCase();
  const countDate = document.getElementById('date').value || todayIso();

  return _aliveAnimalsForCount.filter(a => {
    if (type && a.type !== type) return false;
    if (breed && (a.breed || '') !== breed) return false;
    const months = _ageInMonths(a.birthDate, countDate);
    if (months !== null) {
      if (!isNaN(ageFrom) && months < ageFrom) return false;
      if (!isNaN(ageTo) && months > ageTo) return false;
    } else if (!isNaN(ageFrom) || !isNaN(ageTo)) {
      return false; // بلا تاريخ ميلاد = خارج أي فترة عمرية
    }
    if (text) {
      const haystack = [a.code, a.breed, ANIMAL_TYPE_LABELS[a.type], ANIMAL_GENDER_LABELS[a.gender]]
        .filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(text)) return false;
    }
    return true;
  });
}

function _lineStateOf(animalId) {
  if (!_linesState.has(animalId)) _linesState.set(animalId, { estimatedValue: 0, resultStatus: 'present' });
  return _linesState.get(animalId);
}

function _renderCountLines() {
  const container = document.getElementById('count-lines-table');
  const animals = _getFilteredAnimals();

  if (!_aliveAnimalsForCount.length) {
    container.innerHTML = `<div class="empty-state" style="padding: var(--spacing-4); text-align:center;">لا توجد حيوانات حية في القطيع حاليًا</div>`;
    _updateSummary(animals);
    return;
  }

  if (!animals.length) {
    container.innerHTML = `<div class="empty-state" style="padding: var(--spacing-4); text-align:center;">لا توجد حيوانات تطابق الفلترة الحالية</div>`;
    _updateSummary(animals);
    return;
  }

  const rowsHtml = animals.map(a => {
    const state = _lineStateOf(a.id);
    return `
    <div class="count-line-row" data-animal-id="${a.id}" style="display:grid; grid-template-columns: 130px 1fr 130px 110px; gap: var(--spacing-2); align-items:center; padding: var(--spacing-2) 0; border-bottom: 1px solid var(--color-border);">
      <div style="font-size:13px;">
        <strong>${a.code}</strong>
        <div style="font-size:11px; color: var(--color-text-secondary);">${calculateAgeLabel(a.birthDate, document.getElementById('date').value || undefined)}</div>
      </div>
      <div style="font-size:13px;">
        ${ANIMAL_TYPE_LABELS[a.type] || a.type} — ${ANIMAL_GENDER_LABELS[a.gender] || a.gender}${a.breed ? ` (${a.breed})` : ''}
      </div>
      <input type="number" class="form-control count-value" min="0" step="0.01" placeholder="0" data-animal-id="${a.id}" value="${state.estimatedValue || ''}" style="max-width:120px;" />
      <select class="form-control count-status" data-animal-id="${a.id}" style="max-width:110px;">
        <option value="present" ${state.resultStatus !== 'missing' ? 'selected' : ''}>موجود</option>
        <option value="missing" ${state.resultStatus === 'missing' ? 'selected' : ''}>مفقود</option>
      </select>
    </div>`;
  }).join('');

  container.innerHTML = `
    <div style="display:grid; grid-template-columns: 130px 1fr 130px 110px; gap: var(--spacing-2); font-size:12px; font-weight:600; color: var(--color-text-secondary); padding: var(--spacing-2) 0; border-bottom: 2px solid var(--color-border);">
      <div>الكود / العمر</div>
      <div>النوع — الجنس (السلالة)</div>
      <div>القيمة التقديرية (ريال)</div>
      <div>الحالة</div>
    </div>
    ${rowsHtml}
  `;

  container.querySelectorAll('.count-value').forEach(input => input.addEventListener('input', (e) => {
    _lineStateOf(Number(e.target.dataset.animalId)).estimatedValue = Number(e.target.value || 0);
    _updateSummary(_getFilteredAnimals());
  }));
  container.querySelectorAll('.count-status').forEach(select => select.addEventListener('change', (e) => {
    _lineStateOf(Number(e.target.dataset.animalId)).resultStatus = e.target.value;
    _updateSummary(_getFilteredAnimals());
  }));

  _updateSummary(animals);
}

function _applyUniformValue() {
  const value = Number(document.getElementById('uniform-value').value || 0);
  const animals = _getFilteredAnimals();
  if (!animals.length) { showToast('لا توجد صفوف في الفلترة الحالية', 'warning'); return; }
  animals.forEach(a => { _lineStateOf(a.id).estimatedValue = value; });
  showToast(`تم تطبيق السعر ${formatCurrency(value)} على ${formatNumber(animals.length)} حيوانًا في الفلترة`, 'success');
  _renderCountLines();
}

function _applyUniformStatus() {
  const status = document.getElementById('uniform-status').value;
  if (!status) { showToast('اختر حالة أولًا', 'warning'); return; }
  const animals = _getFilteredAnimals();
  if (!animals.length) { showToast('لا توجد صفوف في الفلترة الحالية', 'warning'); return; }
  animals.forEach(a => { _lineStateOf(a.id).resultStatus = status; });
  showToast(`تم تطبيق الحالة "${status === 'present' ? 'موجود' : 'مفقود'}" على ${formatNumber(animals.length)} حيوانًا في الفلترة`, 'success');
  _renderCountLines();
}

function _updateSummary(animals) {
  const filteredPresent = animals.filter(a => _lineStateOf(a.id).resultStatus !== 'missing').length;
  const filteredMissing = animals.length - filteredPresent;
  const filteredValue = animals
    .filter(a => _lineStateOf(a.id).resultStatus !== 'missing')
    .reduce((s, a) => s + Number(_lineStateOf(a.id).estimatedValue || 0), 0);

  const allPresent = _aliveAnimalsForCount.filter(a => _lineStateOf(a.id).resultStatus !== 'missing').length;
  const allMissing = _aliveAnimalsForCount.length - allPresent;
  const allValue = _aliveAnimalsForCount
    .filter(a => _lineStateOf(a.id).resultStatus !== 'missing')
    .reduce((s, a) => s + Number(_lineStateOf(a.id).estimatedValue || 0), 0);

  document.getElementById('bulk-hint').textContent = `في الفلترة: ${formatNumber(animals.length)} حيوان`;
  document.getElementById('count-summary').innerHTML = `
    الفلترة الحالية: <strong>${formatNumber(animals.length)}</strong> (موجود ${formatNumber(filteredPresent)} / مفقود ${formatNumber(filteredMissing)} / القيمة ${formatCurrency(filteredValue)}) —
    القطيع كاملًا: <strong>${formatNumber(_aliveAnimalsForCount.length)}</strong> (موجود ${formatNumber(allPresent)} / مفقود ${formatNumber(allMissing)} / القيمة ${formatCurrency(allValue)})`;
}

async function _handleSubmit(e) {
  e.preventDefault();

  const date = document.getElementById('date').value;
  if (!isValidDate(date)) {
    showToast('يرجى اختيار تاريخ صحيح للجرد', 'error');
    return;
  }

  // يُحفظ القطيع كاملًا من حالة _linesState (لا يضيع أي حيوان غير معروض بسبب الفلترة)
  const lines = _aliveAnimalsForCount.map(a => {
    const state = _lineStateOf(a.id);
    return {
      animalId: a.id,
      animalCode: a.code,
      type: a.type,
      gender: a.gender,
      breed: a.breed || '',
      estimatedValue: Number(state.estimatedValue || 0),
      resultStatus: state.resultStatus,
    };
  });

  const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  await createAnimalCount({
    date,
    notes: document.getElementById('session-notes').value.trim(),
    lines,
    createdByUserId: currentUser?.id || null,
    createdByUserName: currentUser?.fullName || '',
  });

  showToast('تم حفظ جلسة الجرد الحيواني', 'success');
  document.getElementById('session-notes').value = '';
  document.getElementById('uniform-value').value = '';
  document.getElementById('uniform-status').value = '';
  document.getElementById('filter-animals').value = '';
  _linesState = new Map();
  _renderCountLines();
  _refreshHistory();
}

function _refreshHistory() {
  getAllAnimalCounts().then(counts => {
    const rows = counts.map(c => {
      const totals = computeAnimalCountTotals(c);
      return {
        ...c,
        dateLabel: formatDateArabic(c.date),
        totalCountLabel: formatNumber(totals.totalCount),
        presentCountLabel: formatNumber(totals.presentCount),
        missingCountLabel: totals.missingCount ? `<span style="color: var(--color-primary-red); font-weight:600;">${formatNumber(totals.missingCount)}</span>` : '-',
        totalValueLabel: formatCurrency(totals.totalEstimatedValue),
        createdByLabel: c.createdByUserName || '-',
      };
    });

    renderDataTable('count-history-table', [
      { key: 'dateLabel', label: 'تاريخ الجرد', sortable: true },
      { key: 'totalCountLabel', label: 'عدد الحيوانات', sortable: false },
      { key: 'presentCountLabel', label: 'موجود', sortable: false },
      { key: 'missingCountLabel', label: 'مفقود', sortable: false },
      { key: 'totalValueLabel', label: 'إجمالي القيمة التقديرية', sortable: false },
      { key: 'createdByLabel', label: 'بواسطة', sortable: false },
    ], rows, {
      onRowClick: (row) => _openCountDetails(row),
      emptyMessage: 'لا توجد جلسات جرد حيواني بعد',
      searchable: false,
      pageSize: 10,
    });
  });
}

function _countColumns() {
  return [
    { key: 'code', label: 'الكود', sortable: true },
    { key: 'typeLabel', label: 'النوع — الجنس', sortable: false },
    { key: 'breed', label: 'السلالة', sortable: false },
    { key: 'statusLabel', label: 'الحالة', sortable: false },
    { key: 'valueLabel', label: 'القيمة التقديرية', sortable: false },
  ];
}

function _countRowsFromLines(lines) {
  return (lines || [])
    .sort((a, b) => (a.animalCode || '').localeCompare(b.animalCode || ''))
    .map(l => ({
      code: l.animalCode || '-',
      typeLabel: `${ANIMAL_TYPE_LABELS[l.type] || l.type} — ${ANIMAL_GENDER_LABELS[l.gender] || l.gender}`,
      breed: l.breed || '-',
      statusLabel: l.resultStatus === 'missing' ? '<span class="badge badge--red">مفقود</span>' : '<span class="badge badge--green">موجود</span>',
      valueLabel: l.resultStatus !== 'missing' ? formatCurrency(Number(l.estimatedValue || 0)) : '-',
    }));
}

function _openCountDetails(count) {
  // نسخة عمل من سطور الجلسة — تغيير حالة أي حيوان فرديًا من المحضر يحفظ فورًا عليها
  let currentLines = (count.lines || [])
    .slice()
    .sort((a, b) => (a.animalCode || '').localeCompare(b.animalCode || ''));

  const columns = _countColumns();
  const tableRows = _countRowsFromLines(currentLines);

  const html = `
    <div id="details-totals" style="display:flex; gap: var(--spacing-3); flex-wrap:wrap; margin-bottom: var(--spacing-3);">
      ${_detailsTotalsHtml(currentLines, count.date)}
    </div>
    ${count.notes ? `<div style="margin-bottom: var(--spacing-3); font-size:13px;"><strong>ملاحظات:</strong> ${count.notes}</div>` : ''}
    <div style="font-size:12px; color: var(--color-text-secondary); margin-bottom: var(--spacing-2);">يمكن تغيير "الحالة" لكل حيوان على حدة من عمود الحالة مباشرة — يُحفظ فورًا عند التغيير</div>
    <div id="count-details-table"></div>
    <div class="form-actions" style="margin-top: var(--spacing-3); display:flex; gap: var(--spacing-2); flex-wrap:wrap;">
      <button type="button" class="btn btn--outline" id="edit-count-btn">تعديل القيم والحالات</button>
      <button type="button" class="btn btn--outline" id="print-count-btn">طباعة المحضر</button>
      <button type="button" class="btn btn--outline" id="export-count-btn">تصدير Excel</button>
      <button type="button" class="btn btn--danger btn--sm" id="delete-count-btn" style="margin-inline-start:auto;">حذف الجلسة</button>
    </div>
  `;

  openModal(html, {
    title: `محضر الجرد الحيواني ${formatDateArabic(count.date)}`,
    hideFooter: true,
  });

  // عرض: عمود الحالة بديله قائمة منسدلة لكل سطر (بدل الشارة الثابتة) — التفويض على الحاوية يبقى
  // عاملًا حتى لو أعاد renderDataTable الرسم
  const tableContainer = document.getElementById('count-details-table');
  renderDataTable('count-details-table', _detailsColumns(), _detailsRows(currentLines), {
    searchable: false,
    pageSize: currentLines.length || 1,
    emptyMessage: 'لا توجد سطور في هذه الجلسة',
  });

  tableContainer.addEventListener('change', async (e) => {
    if (!e.target.classList.contains('details-status')) return;
    const idx = Number(e.target.dataset.idx);
    if (!currentLines[idx]) return;
    currentLines[idx].resultStatus = e.target.value;
    await updateAnimalCount(count.id, { lines: currentLines });
    showToast(`تم تحديث حالة ${currentLines[idx].animalCode || 'الحيوان'}`, 'success');
    document.getElementById('details-totals').innerHTML = _detailsTotalsHtml(currentLines, count.date);
    _refreshHistory();
  });

  document.getElementById('edit-count-btn').addEventListener('click', () => _openCountEditor(count, currentLines));
  document.getElementById('print-count-btn').addEventListener('click', () => {
    exportRowsToPdf(`محضر الجرد الحيواني ${formatDateArabic(count.date)}`, _countColumns(), _countRowsFromLines(currentLines), {
      infoLines: _detailsInfoLines(count, currentLines),
    });
  });
  document.getElementById('export-count-btn').addEventListener('click', () => {
    exportRowsToExcel('محضر_الجرد_الحيواني', _countColumns(), _countRowsFromLines(currentLines), {
      reportTitle: `محضر الجرد الحيواني ${formatDateArabic(count.date)}`,
      infoLines: _detailsInfoLines(count, currentLines),
    });
  });
  document.getElementById('delete-count-btn').addEventListener('click', async () => {
    closeModal();
    confirmDelete(`هل أنت متأكد من حذف جلسة الجرد الحيواني بتاريخ ${formatDateArabic(count.date)}؟`, async () => {
      await deleteAnimalCount(count.id);
      showToast('تم حذف الجلسة', 'success');
      _refreshHistory();
    });
  });
}

function _detailsTotalsHtml(lines, date) {
  const totals = computeAnimalCountTotals({ lines });
  return `
    <div style="flex:1; min-width:140px;"><strong>تاريخ الجرد:</strong> ${formatDateArabic(date)}</div>
    <div style="flex:1; min-width:140px;"><strong>موجود:</strong> ${formatNumber(totals.presentCount)}</div>
    <div style="flex:1; min-width:140px;"><strong>مفقود:</strong> ${formatNumber(totals.missingCount)}</div>
    <div style="flex:1; min-width:140px;"><strong>إجمالي القيمة التقديرية:</strong> ${formatCurrency(totals.totalEstimatedValue)}</div>`;
}

function _detailsInfoLines(count, lines) {
  const totals = computeAnimalCountTotals({ lines });
  return [
    `تاريخ الجرد: ${formatDateArabic(count.date)}`,
    `موجود: ${totals.presentCount} — مفقود: ${totals.missingCount} — إجمالي القيمة التقديرية: ${formatCurrency(totals.totalEstimatedValue)}`,
    count.notes ? `ملاحظات: ${count.notes}` : '',
  ].filter(Boolean);
}

// أعمدة عرض المحضر: عمود الحالة قائمة منسدلة مباشرة لكل سطر (قابلة للتغيير الفردي والحفظ الفوري)
function _detailsColumns() {
  return [
    { key: 'code', label: 'الكود', sortable: false },
    { key: 'typeLabel', label: 'النوع — الجنس', sortable: false },
    { key: 'breed', label: 'السلالة', sortable: false },
    { key: 'statusCell', label: 'الحالة', sortable: false },
    { key: 'valueLabel', label: 'القيمة التقديرية', sortable: false },
  ];
}

function _detailsRows(lines) {
  return lines.map((l, idx) => ({
    code: l.animalCode || '-',
    typeLabel: `${ANIMAL_TYPE_LABELS[l.type] || l.type} — ${ANIMAL_GENDER_LABELS[l.gender] || l.gender}`,
    breed: l.breed || '-',
    statusCell: `<select class="form-control details-status" data-idx="${idx}" style="max-width:110px;">
      <option value="present" ${l.resultStatus !== 'missing' ? 'selected' : ''}>موجود</option>
      <option value="missing" ${l.resultStatus === 'missing' ? 'selected' : ''}>مفقود</option>
    </select>`,
    valueLabel: l.resultStatus !== 'missing' ? formatCurrency(Number(l.estimatedValue || 0)) : '-',
  }));
}

// تعديل جلسة محفوظة: تغيير القيم والحالات لكل السطور ثم الحفظ دفعة واحدة — تُفتح من زر "تعديل القيم
// والحالات" في المحضر، وتبدأ من أحدث حالة للسطور (بما فيها أي تغييرات فردية حُفظت مباشرة من المحضر)
function _openCountEditor(count, currentLines) {
  const sortedLines = (currentLines || count.lines || []).sort((a, b) => (a.animalCode || '').localeCompare(b.animalCode || ''));

  const rowsHtml = sortedLines.map((l, idx) => `
    <div style="display:grid; grid-template-columns: 130px 1fr 120px 110px; gap: var(--spacing-2); align-items:center; padding: var(--spacing-2) 0; border-bottom: 1px solid var(--color-border);">
      <div style="font-size:13px;"><strong>${l.animalCode || '-'}</strong></div>
      <div style="font-size:13px;">${ANIMAL_TYPE_LABELS[l.type] || l.type} — ${ANIMAL_GENDER_LABELS[l.gender] || l.gender}${l.breed ? ` (${l.breed})` : ''}</div>
      <input type="number" class="form-control edit-value" min="0" step="0.01" value="${Number(l.estimatedValue || 0)}" data-idx="${idx}" style="max-width:110px;" />
      <select class="form-control edit-status" data-idx="${idx}" style="max-width:100px;">
        <option value="present" ${l.resultStatus !== 'missing' ? 'selected' : ''}>موجود</option>
        <option value="missing" ${l.resultStatus === 'missing' ? 'selected' : ''}>مفقود</option>
      </select>
    </div>`).join('');

  const html = `
    <div style="font-size:13px; color: var(--color-text-secondary); margin-bottom: var(--spacing-3);">
      تعديل قيم وحالات جلسة ${formatDateArabic(count.date)} — التعديل يغيّر المحضر فقط بلا أي أثر محاسبي
    </div>
    <div style="max-height: 50vh; overflow-y:auto; border:1px solid var(--color-border); border-radius:8px; padding: 0 var(--spacing-3);">
      <div style="display:grid; grid-template-columns: 130px 1fr 120px 110px; gap: var(--spacing-2); font-size:12px; font-weight:600; color: var(--color-text-secondary); padding: var(--spacing-2) 0; border-bottom: 2px solid var(--color-border); position: sticky; top:0; background:#fff;">
        <div>الكود</div><div>النوع — الجنس (السلالة)</div><div>القيمة</div><div>الحالة</div>
      </div>
      ${rowsHtml || '<div class="empty-state" style="padding: var(--spacing-3);">لا توجد سطور</div>'}
    </div>
  `;

  openModal(html, {
    title: `تعديل جلسة الجرد الحيواني ${formatDateArabic(count.date)}`,
    confirmLabel: 'حفظ التعديل',
    onConfirm: async () => {
      const updatedLines = sortedLines.map((l, idx) => ({
        ...l,
        estimatedValue: Number(document.querySelector(`.edit-value[data-idx="${idx}"]`)?.value || 0),
        resultStatus: document.querySelector(`.edit-status[data-idx="${idx}"]`)?.value || l.resultStatus,
      }));

      await updateAnimalCount(count.id, { lines: updatedLines });
      showToast('تم حفظ تعديلات الجلسة', 'success');
      closeModal();
      _refreshHistory();
    },
  });
}
