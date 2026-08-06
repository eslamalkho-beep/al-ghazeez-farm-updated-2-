// js/pages/births-page.js

let _motherOptions = [];
let _offspringState = []; // [{ gender: 'male'|'female', weight: number|null }]
let _allBirthsCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('herd');
  renderSidebar('herd');
  renderHeader('سجل الولادات');

  const allAnimals = await getAllAnimals();
  _motherOptions = allAnimals.filter(a => a.gender === 'female' && a.status === 'alive');

  const motherSelect = document.getElementById('motherId');
  motherSelect.innerHTML = _motherOptions.length
    ? _motherOptions.map(m => `<option value="${m.id}">${m.code} — ${ANIMAL_TYPE_LABELS[m.type] || m.type} (${m.breed})</option>`).join('')
    : `<option value="">لا توجد إناث مسجّلة</option>`;

  document.getElementById('birthDate').value = todayIso();

  _rebuildOffspringRows(1);

  document.getElementById('offspringCount').addEventListener('input', (e) => {
    let count = Number(e.target.value);
    if (isNaN(count) || count < 1) count = 1;
    if (count > 10) count = 10;
    e.target.value = count;
    _rebuildOffspringRows(count);
  });

  document.getElementById('birth-form').addEventListener('submit', _handleSubmit);

  document.getElementById('export-excel-btn').addEventListener('click', () => {
    exportRowsToExcel('سجل_الولادات', _birthsExportColumns, _birthsExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    exportRowsToPdf('سجل الولادات', _birthsExportColumns, _birthsExportRows);
  });

  await _refreshBirthsTable(allAnimals);
});

const _birthsExportColumns = [
  { key: 'dateLabel', label: 'تاريخ الولادة' },
  { key: 'motherCode', label: 'كود الأم' },
  { key: 'offspringCount', label: 'عدد المواليد' },
  { key: 'genderBreakdown', label: 'توزيع الجنس' },
  { key: 'codes', label: 'أكواد المواليد' },
  { key: 'notes', label: 'ملاحظات' },
];
let _birthsExportRows = [];

// يعيد بناء صفوف تحديد الجنس والوزن لكل مولود، مع الحفاظ على القيم المُدخلة سابقًا قدر الإمكان
function _rebuildOffspringRows(count) {
  const previous = _offspringState;
  _offspringState = Array.from({ length: count }, (_, i) => previous[i] || { gender: 'female', weight: '' });

  const container = document.getElementById('offspring-list');
  container.innerHTML = _offspringState.map((item, idx) => `
    <div class="offspring-row">
      <div class="offspring-label">المولود ${idx + 1}</div>
      <div class="offspring-gender-toggle">
        <button type="button" class="offspring-gender-btn ${item.gender === 'male' ? 'selected--male' : ''}" data-idx="${idx}" data-gender="male">ذكر</button>
        <button type="button" class="offspring-gender-btn ${item.gender === 'female' ? 'selected--female' : ''}" data-idx="${idx}" data-gender="female">أنثى</button>
      </div>
      <input type="number" class="form-control offspring-weight" data-idx="${idx}" placeholder="الوزن عند الولادة (كجم)" min="0" step="0.1" value="${item.weight}" />
    </div>
  `).join('');

  container.querySelectorAll('.offspring-gender-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      _offspringState[idx].gender = btn.dataset.gender;
      _rebuildOffspringRows(_offspringState.length);
    });
  });

  container.querySelectorAll('.offspring-weight').forEach(input => {
    input.addEventListener('input', () => {
      const idx = Number(input.dataset.idx);
      _offspringState[idx].weight = input.value;
    });
  });
}

async function _handleSubmit(e) {
  e.preventDefault();

  const motherId = document.getElementById('motherId').value;
  const birthDate = document.getElementById('birthDate').value;

  const isValid = validateForm([
    { fieldId: 'motherId', validatorFn: isRequired, message: 'يرجى اختيار الأم' },
    { fieldId: 'birthDate', validatorFn: isValidDate, message: 'التاريخ مطلوب' },
  ]);
  if (!isValid) return;

  const mother = _motherOptions.find(m => m.id === Number(motherId));
  const offspringDetails = _offspringState.map(o => ({
    gender: o.gender,
    weight: o.weight ? Number(o.weight) : null,
    animalId: null,
    animalCode: null,
  }));

  const saveBtn = document.getElementById('save-birth-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'جاري الحفظ...';

  try {
    if (document.getElementById('autoRegister').checked && mother) {
      for (const offspring of offspringDetails) {
        const code = await generateNextAnimalCode();
        const newAnimalId = await createAnimal({
          code,
          type: mother.type,
          breed: mother.breed,
          gender: offspring.gender,
          birthDate,
          weight: offspring.weight,
          healthStatus: 'healthy',
          source: 'born',
          motherId: mother.id,
        });
        offspring.animalId = newAnimalId;
        offspring.animalCode = code;
      }
    }

    await createBirthRecord({
      motherId: Number(motherId),
      birthDate,
      offspringCount: offspringDetails.length,
      offspringDetails,
      veterinarianNotes: document.getElementById('vetNotes').value.trim(),
    });

    showToast('تم تسجيل الولادة بنجاح', 'success');
    document.getElementById('birth-form').reset();
    document.getElementById('birthDate').value = todayIso();
    document.getElementById('offspringCount').value = 1;
    _rebuildOffspringRows(1);

    const allAnimals = await getAllAnimals();
    _motherOptions = allAnimals.filter(a => a.gender === 'female' && a.status === 'alive');
    await _refreshBirthsTable(allAnimals);
  } catch (err) {
    showToast('حدث خطأ أثناء حفظ سجل الولادة', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'حفظ الولادة';
  }
}

async function _refreshBirthsTable(allAnimals) {
  _allBirthsCache = await getAllBirths();

  const rows = _allBirthsCache.map(b => {
    const mother = allAnimals.find(a => a.id === b.motherId);
    const maleCount = (b.offspringDetails || []).filter(o => o.gender === 'male').length;
    const femaleCount = (b.offspringDetails || []).filter(o => o.gender === 'female').length;
    const codes = (b.offspringDetails || []).map(o => o.animalCode).filter(Boolean).join('، ') || '-';
    return {
      ...b,
      dateLabel: formatDateArabic(b.birthDate),
      motherCode: mother ? mother.code : '-',
      offspringCount: b.offspringCount,
      genderBreakdown: `${formatNumber(maleCount)} ذكر / ${formatNumber(femaleCount)} أنثى`,
      codes,
      notes: b.veterinarianNotes || '-',
    };
  });

  _birthsExportRows = rows;

  renderDataTable('births-table', [
    { key: 'dateLabel', label: 'تاريخ الولادة', sortable: true },
    { key: 'motherCode', label: 'كود الأم', sortable: false },
    { key: 'offspringCount', label: 'عدد المواليد', sortable: false },
    { key: 'genderBreakdown', label: 'توزيع الجنس', sortable: false },
    { key: 'codes', label: 'أكواد المواليد', sortable: false },
    { key: 'notes', label: 'ملاحظات', sortable: false },
  ], rows, {
    onRowClick: (row) => _openBirthEditModal(row.id),
    emptyMessage: 'لا توجد ولادات مسجّلة بعد',
  });
}

let _editOffspringState = [];

function _renderEditOffspringRows() {
  const container = document.getElementById('edit-offspring-list');
  if (!container) return;

  container.innerHTML = _editOffspringState.map((item, idx) => `
    <div class="offspring-row">
      <div class="offspring-label">المولود ${idx + 1}${item.animalCode ? ` (${item.animalCode})` : ''}</div>
      <div class="offspring-gender-toggle">
        <button type="button" class="offspring-gender-btn ${item.gender === 'male' ? 'selected--male' : ''}" data-idx="${idx}" data-gender="male">ذكر</button>
        <button type="button" class="offspring-gender-btn ${item.gender === 'female' ? 'selected--female' : ''}" data-idx="${idx}" data-gender="female">أنثى</button>
      </div>
      <input type="number" class="form-control edit-offspring-weight" data-idx="${idx}" placeholder="الوزن عند الولادة (كجم)" min="0" step="0.1" value="${item.weight ?? ''}" />
    </div>
  `).join('');

  container.querySelectorAll('.offspring-gender-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      _editOffspringState[idx].gender = btn.dataset.gender;
      _renderEditOffspringRows();
    });
  });

  container.querySelectorAll('.edit-offspring-weight').forEach(input => {
    input.addEventListener('input', () => {
      const idx = Number(input.dataset.idx);
      _editOffspringState[idx].weight = input.value;
    });
  });
}

async function _openBirthEditModal(id) {
  const record = _allBirthsCache.find(b => b.id === id);
  if (!record) return;

  const allAnimals = await getAllAnimals();
  const selectableMothers = allAnimals.filter(a => (a.gender === 'female' && a.status === 'alive') || a.id === record.motherId);
  _editOffspringState = (record.offspringDetails || []).map(o => ({ ...o }));

  const html = `
    <form id="birth-edit-form" class="form-grid">
      <div class="form-group">
        <label>الأم <span class="required">*</span></label>
        <select id="e-motherId" class="form-control">
          ${selectableMothers.map(a => `<option value="${a.id}" ${a.id === record.motherId ? 'selected' : ''}>${a.code} — ${ANIMAL_TYPE_LABELS[a.type] || a.type} (${a.breed})</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>تاريخ الولادة <span class="required">*</span></label>
        <input type="date" id="e-birthDate" class="form-control" value="${record.birthDate || ''}" />
      </div>
      <div class="form-group form-group--full">
        <label>تفاصيل كل مولود (الجنس والوزن)</label>
        <div id="edit-offspring-list"></div>
      </div>
      <div class="form-group form-group--full">
        <label>ملاحظات المولد / البيطري</label>
        <textarea id="e-vetNotes" class="form-control" rows="2">${record.veterinarianNotes || ''}</textarea>
      </div>
      <div class="form-group form-group--full" style="border-top:1px solid var(--color-border); padding-top: var(--spacing-3);">
        <button type="button" class="btn btn--danger btn--sm" id="delete-birth-btn">حذف سجل الولادة</button>
      </div>
    </form>
  `;

  openModal(html, {
    title: 'تعديل سجل الولادة',
    confirmLabel: 'حفظ',
    onConfirm: async () => {
      const motherId = Number(document.getElementById('e-motherId').value);
      const birthDate = document.getElementById('e-birthDate').value;
      const veterinarianNotes = document.getElementById('e-vetNotes').value.trim();

      if (!isRequired(String(motherId)) || !isValidDate(birthDate)) {
        showToast('يرجى اختيار الأم والتاريخ بشكل صحيح', 'error');
        return;
      }

      const offspringDetails = _editOffspringState.map(o => ({
        gender: o.gender,
        weight: o.weight ? Number(o.weight) : null,
        animalId: o.animalId || null,
        animalCode: o.animalCode || null,
      }));

      await updateBirthRecord(record.id, { motherId, birthDate, offspringDetails, veterinarianNotes });

      const selectedMother = allAnimals.find(a => a.id === motherId);
      const motherTypeFields = selectedMother ? { type: selectedMother.type, breed: selectedMother.breed } : {};
      for (const o of offspringDetails) {
        if (o.animalId) {
          await updateAnimal(o.animalId, { gender: o.gender, weight: o.weight, birthDate, motherId, ...motherTypeFields });
        }
      }

      showToast('تم حفظ التعديلات', 'success');
      closeModal();
      const refreshedAnimals = await getAllAnimals();
      _motherOptions = refreshedAnimals.filter(a => a.gender === 'female' && a.status === 'alive');
      await _refreshBirthsTable(refreshedAnimals);
    },
  });

  _renderEditOffspringRows();

  document.getElementById('delete-birth-btn').addEventListener('click', () => {
    const hasLinkedAnimals = _editOffspringState.some(o => o.animalId);
    const warning = hasLinkedAnimals
      ? 'هل أنت متأكد من حذف سجل الولادة؟ ملاحظة: الحيوانات المسجّلة تلقائيًا من هذه الولادة ستبقى في سجل القطيع كما هي، ويمكن حذفها يدويًا من هناك إن أردت.'
      : 'هل أنت متأكد من حذف سجل الولادة؟';
    confirmDelete(warning, async () => {
      await deleteBirthRecord(record.id);
      showToast('تم حذف سجل الولادة', 'success');
      await _refreshBirthsTable(await getAllAnimals());
    });
  });
}
