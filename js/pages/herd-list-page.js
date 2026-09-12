// js/pages/herd-list-page.js

let _allAnimalsCache = [];
let _deathDateByAnimalId = {};
let _saleDateByAnimalId = {};
let _tradeTransferDateByAnimalId = {};
let _locationNameById = {};
let _locationIdByName = {};

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('herd');
  renderSidebar('herd');
  renderHeader('سجل القطيع');

  if (!hasActionPermission('herd', 'add')) {
    document.getElementById('add-animal-btn').style.display = 'none';
    document.getElementById('import-animals-btn').style.display = 'none';
  }
  if (!hasActionPermission('herd', 'export')) {
    document.getElementById('export-excel-btn').style.display = 'none';
  }
  if (!hasActionPermission('herd', 'export') || !hasActionPermission('herd', 'print')) {
    document.getElementById('export-pdf-btn').style.display = 'none';
  }

  const [animals, deaths, revenues, locations, transfers] = await Promise.all([
    getAllAnimals(), getAllDeaths(), getAllRevenues(), getAllLocations(), getAllTransfers(),
  ]);
  _allAnimalsCache = animals;

  _deathDateByAnimalId = {};
  deaths.forEach(d => { if (d.animalId) _deathDateByAnimalId[d.animalId] = d.deathDate; });

  _saleDateByAnimalId = {};
  // animalId لا يُضبط إلا على إيرادات بيع حيوان فردي (revenue-form-page.js) — لا حاجة لمطابقة نص/حساب البند هنا
  revenues
    .filter(r => r.animalId)
    .forEach(r => { _saleDateByAnimalId[r.animalId] = r.date; });

  _tradeTransferDateByAnimalId = {};
  transfers
    .filter(t => t.kind === 'herdToTrade' && t.animalId)
    .forEach(t => { _tradeTransferDateByAnimalId[t.animalId] = t.date; });

  _locationNameById = {};
  _locationIdByName = {};
  locations.forEach(l => {
    _locationNameById[l.id] = l.name;
    _locationIdByName[_importNormalizeText(l.name)] = l.id;
  });

  const breeds = [...new Set(_allAnimalsCache.map(a => a.breed).filter(Boolean))].sort();
  document.getElementById('filter-breed').innerHTML += breeds.map(b => `<option value="${b}">${b}</option>`).join('');

  const params = new URLSearchParams(window.location.search);
  if (params.get('type')) document.getElementById('filter-type').value = params.get('type');
  if (params.get('status')) document.getElementById('filter-status').value = params.get('status');
  if (params.get('breed')) document.getElementById('filter-breed').value = params.get('breed');
  if (params.get('gender')) document.getElementById('filter-gender').value = params.get('gender');

  drawHerdTable();

  document.getElementById('filter-type').addEventListener('change', drawHerdTable);
  document.getElementById('filter-status').addEventListener('change', drawHerdTable);
  document.getElementById('filter-breed').addEventListener('change', drawHerdTable);
  document.getElementById('filter-gender').addEventListener('change', drawHerdTable);

  document.getElementById('export-excel-btn').addEventListener('click', () => {
    exportRowsToExcel('سجل_القطيع', _herdExportColumns, _herdExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    exportRowsToPdf('سجل القطيع', _herdExportColumns, _herdExportRows);
  });
  document.getElementById('import-animals-btn').addEventListener('click', _openHerdImportModal);
});

const _herdExportColumns = [
  { key: 'code', label: 'الكود' },
  { key: 'typeLabel', label: 'النوع' },
  { key: 'breed', label: 'السلالة' },
  { key: 'genderLabel', label: 'الجنس' },
  { key: 'weightLabel', label: 'الوزن' },
  { key: 'birthDateLabel', label: 'تاريخ الميلاد/الاقتناء' },
  { key: 'ageLabel', label: 'العمر الحالي' },
  { key: 'locationLabel', label: 'الحظيرة/الموقع' },
  { key: 'statusBadge', label: 'الحالة' },
];
let _herdExportRows = [];

function drawHerdTable() {
  const typeFilter = document.getElementById('filter-type').value;
  const statusFilter = document.getElementById('filter-status').value;
  const breedFilter = document.getElementById('filter-breed').value;
  const genderFilter = document.getElementById('filter-gender').value;

  let rows = _allAnimalsCache.filter(a =>
    (!typeFilter || a.type === typeFilter) &&
    (!breedFilter || a.breed === breedFilter) &&
    (!genderFilter || a.gender === genderFilter) &&
    (!statusFilter || (statusFilter === 'alive' ? a.status === 'alive' : _displayStatus(a) === statusFilter))
  );

  rows = rows.map(a => {
    const ageEndDate = a.status === 'dead' ? _deathDateByAnimalId[a.id]
      : a.status === 'sold' ? _saleDateByAnimalId[a.id]
      : a.status === 'movedToTrade' ? _tradeTransferDateByAnimalId[a.id]
      : null;
    return {
      ...a,
      typeLabel: ANIMAL_TYPE_LABELS[a.type] || a.type,
      genderLabel: ANIMAL_GENDER_LABELS[a.gender] || a.gender,
      statusBadge: _statusBadge(_displayStatus(a)),
      weightLabel: `${formatNumber(a.weight || 0)} كجم`,
      birthDateLabel: formatDateArabic(a.birthDate),
      ageLabel: calculateAgeLabel(a.birthDate, ageEndDate),
      locationLabel: _locationNameById[a.locationId] || '-',
    };
  });

  _herdExportRows = rows;

  renderDataTable('herd-table', [
    { key: 'code', label: 'الكود', sortable: true },
    { key: 'typeLabel', label: 'النوع', sortable: true },
    { key: 'breed', label: 'السلالة', sortable: true },
    { key: 'genderLabel', label: 'الجنس', sortable: true },
    { key: 'weightLabel', label: 'الوزن', sortable: false },
    { key: 'birthDateLabel', label: 'تاريخ الميلاد/الاقتناء', sortable: true },
    { key: 'ageLabel', label: 'العمر الحالي', sortable: false },
    { key: 'locationLabel', label: 'الحظيرة/الموقع', sortable: true },
    { key: 'statusBadge', label: 'الحالة', sortable: false },
  ], rows, {
    onRowClick: (row) => { window.location.href = `herd-form.html?id=${row.id}`; },
    emptyMessage: 'لا توجد حيوانات مطابقة لهذا الفلتر',
  });
}

// حيوان نافق/مباع/مُحوَّل للتجارة يُعرض بحالة دورة حياته فقط، وليس بحالته الصحية الأخيرة قبل ذلك
function _displayStatus(a) {
  if (a.status === 'dead' || a.status === 'sold' || a.status === 'movedToTrade') return a.status;
  return a.healthStatus;
}

function _statusBadge(status) {
  const map = {
    healthy: 'badge--green', sick: 'badge--red', underTreatment: 'badge--warning', quarantine: 'badge--gray',
    dead: 'badge--red', sold: 'badge--blue', movedToTrade: 'badge--gray',
  };
  const label = ANIMAL_HEALTH_LABELS[status] || ANIMAL_STATUS_LABELS[status] || status;
  return `<span class="badge ${map[status] || 'badge--gray'}">${label}</span>`;
}

// ==================== استيراد القطيع من ملف Excel/CSV ====================
// عمود واحد لكل حقل، بنفس ترتيب _HERD_IMPORT_COLUMNS — القراءة تعتمد على ترتيب الأعمدة لا على نص عنوان
// العمود الحرفي (أكثر تسامحًا لو عدّل المستخدم صياغة العنوان بالخطأ أثناء تعبئة القالب)
const _HERD_IMPORT_COLUMNS = [
  { key: 'code', header: 'الكود (اختياري - يُنشأ تلقائيًا إن تُرك فارغًا)' },
  { key: 'type', header: 'النوع (غنم / ماعز)' },
  { key: 'breed', header: 'السلالة' },
  { key: 'gender', header: 'الجنس (ذكر / أنثى)' },
  { key: 'birthDate', header: 'تاريخ الميلاد أو الاقتناء (YYYY-MM-DD)' },
  { key: 'color', header: 'اللون' },
  { key: 'weight', header: 'الوزن (كجم)' },
  { key: 'healthStatus', header: 'الحالة الصحية (سليم/مريض/تحت العلاج/حجر صحي)' },
  { key: 'source', header: 'المصدر (ولادة/شراء)' },
  { key: 'purchasePrice', header: 'سعر الشراء' },
  { key: 'locationName', header: 'الحظيرة/الموقع (اختياري)' },
  { key: 'notes', header: 'ملاحظات' },
];

const _IMPORT_TYPE_MAP = { 'غنم': 'sheep', 'sheep': 'sheep', 'ماعز': 'goat', 'goat': 'goat' };
const _IMPORT_GENDER_MAP = { 'ذكر': 'male', 'male': 'male', 'أنثى': 'female', 'انثى': 'female', 'female': 'female' };
const _IMPORT_HEALTH_MAP = {
  'سليم': 'healthy', 'healthy': 'healthy',
  'مريض': 'sick', 'sick': 'sick',
  'تحت العلاج': 'underTreatment', 'undertreatment': 'underTreatment',
  'حجر صحي': 'quarantine', 'quarantine': 'quarantine',
};
const _IMPORT_SOURCE_MAP = { 'ولادة': 'born', 'born': 'born', 'شراء': 'purchased', 'purchased': 'purchased' };

let _herdImportValidatedRows = null;

function _importNormalizeText(value) {
  return (value === null || value === undefined) ? '' : String(value).trim();
}

function _importMapEnum(mapObj, rawValue, defaultValue) {
  const text = _importNormalizeText(rawValue);
  if (!text) return { value: defaultValue, invalid: false };
  const mapped = mapObj[text.toLowerCase()];
  return mapped ? { value: mapped, invalid: false } : { value: null, invalid: true };
}

function _importParseNumber(rawValue) {
  const text = _importNormalizeText(rawValue);
  if (!text) return { value: null, invalid: false };
  const num = Number(text);
  return isNaN(num) ? { value: null, invalid: true } : { value: num, invalid: false };
}

// يقبل خلية تاريخ Excel حقيقية (كائن Date، بفضل cellDates:true عند القراءة) أو نصًا بصيغة YYYY-MM-DD/DD-MM-YYYY/DD/MM/YYYY
function _importParseDate(rawValue) {
  if (!rawValue && rawValue !== 0) return { value: null, invalid: false };
  if (rawValue instanceof Date && !isNaN(rawValue.getTime())) {
    const y = rawValue.getFullYear();
    const m = String(rawValue.getMonth() + 1).padStart(2, '0');
    const d = String(rawValue.getDate()).padStart(2, '0');
    return { value: `${y}-${m}-${d}`, invalid: false };
  }
  const text = _importNormalizeText(rawValue);
  if (!text) return { value: null, invalid: false };
  let match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (match) {
    const [, y, m, d] = match;
    return { value: `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`, invalid: false };
  }
  match = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (match) {
    const [, d, m, y] = match;
    return { value: `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`, invalid: false };
  }
  return { value: null, invalid: true };
}

function _csvEscape(value) {
  const str = String(value === null || value === undefined ? '' : value);
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function _downloadHerdImportTemplate() {
  const headers = _HERD_IMPORT_COLUMNS.map(c => c.header);
  const example = ['', 'غنم', 'نجدي', 'أنثى', '2025-01-15', 'أبيض', '35', 'سليم', 'ولادة', '', '', 'سطر مثال - يمكن حذفه قبل الاستيراد'];
  const csvContent = '﻿' + [headers, example].map(row => row.map(_csvEscape).join(',')).join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'قالب_استيراد_القطيع.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function _openHerdImportModal() {
  _herdImportValidatedRows = null;
  const html = `
    <p style="margin-bottom: var(--spacing-3); color: var(--color-text-secondary);">
      نزّل القالب واملأه بنفس ترتيب الأعمدة، ثم ارفعه هنا (csv أو xlsx).
    </p>
    <button type="button" class="btn btn--outline" id="download-import-template-btn">تنزيل قالب CSV</button>
    <div class="form-group" style="margin-top: var(--spacing-3);">
      <label>ملف البيانات (xlsx / csv)</label>
      <input type="file" id="import-file-input" accept=".csv,.xlsx,.xls" class="form-control" />
    </div>
    <div id="import-preview-area"></div>
    <div class="modal-box__footer" style="padding: var(--spacing-3) 0 0; margin-top: var(--spacing-3); border-top: 1px solid var(--color-border);">
      <button type="button" class="btn btn--outline" id="import-close-btn">إغلاق</button>
      <button type="button" class="btn btn--success" id="import-action-btn" disabled>معاينة واستيراد</button>
    </div>
  `;
  openModal(html, { title: 'استيراد القطيع من ملف', hideFooter: true });

  document.getElementById('download-import-template-btn').addEventListener('click', _downloadHerdImportTemplate);
  document.getElementById('import-close-btn').addEventListener('click', closeModal);

  const fileInput = document.getElementById('import-file-input');
  const actionBtn = document.getElementById('import-action-btn');

  fileInput.addEventListener('change', () => {
    _herdImportValidatedRows = null;
    document.getElementById('import-preview-area').innerHTML = '';
    actionBtn.textContent = 'معاينة واستيراد';
    actionBtn.disabled = !fileInput.files[0];
  });

  actionBtn.addEventListener('click', async () => {
    if (!_herdImportValidatedRows) {
      await _previewHerdImportFile(fileInput.files[0], actionBtn);
    } else {
      await _confirmHerdImport(actionBtn);
    }
  });
}

async function _previewHerdImportFile(file, actionBtn) {
  if (!file) return;
  actionBtn.disabled = true;
  actionBtn.textContent = 'جارِ التحليل...';
  try {
    const rawRows = await _readHerdImportFile(file);
    const existingCodes = new Set(_allAnimalsCache.map(a => (a.code || '').trim().toLowerCase()).filter(Boolean));
    const validated = _validateHerdImportRows(rawRows, existingCodes);
    _herdImportValidatedRows = validated;
    _renderHerdImportPreview(validated);

    const validCount = validated.filter(r => r.errors.length === 0).length;
    actionBtn.textContent = `تأكيد الاستيراد (${validCount})`;
    actionBtn.disabled = validCount === 0;
  } catch (err) {
    console.error(err);
    showToast('تعذّرت قراءة الملف — تأكد أنه بصيغة csv أو xlsx صحيحة', 'error');
    actionBtn.textContent = 'معاينة واستيراد';
    actionBtn.disabled = false;
  }
}

function _readHerdImportFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: 'array', cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true, blankrows: false });
        // الصف الأول عناوين الأعمدة — يُتخطى دومًا بصرف النظر عن نصه الحرفي
        resolve(aoa.slice(1));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function _validateHerdImportRows(rawRows, existingCodes) {
  const seenCodesInFile = new Set();

  return rawRows
    .filter(row => row.some(cell => _importNormalizeText(cell) !== ''))
    .map((row, idx) => {
      const get = (key) => {
        const colIdx = _HERD_IMPORT_COLUMNS.findIndex(c => c.key === key);
        return row[colIdx];
      };

      const errors = [];
      const codeText = _importNormalizeText(get('code'));
      if (codeText) {
        const codeKey = codeText.toLowerCase();
        if (existingCodes.has(codeKey)) errors.push('هذا الكود مستخدم بالفعل');
        else if (seenCodesInFile.has(codeKey)) errors.push('كود مكرر داخل نفس الملف');
        seenCodesInFile.add(codeKey);
      }

      const type = _importMapEnum(_IMPORT_TYPE_MAP, get('type'), null);
      if (type.invalid || !type.value) errors.push('النوع غير صحيح (اكتب غنم أو ماعز)');

      const breed = _importNormalizeText(get('breed'));
      if (!breed) errors.push('السلالة مطلوبة');

      const gender = _importMapEnum(_IMPORT_GENDER_MAP, get('gender'), null);
      if (gender.invalid || !gender.value) errors.push('الجنس غير صحيح (اكتب ذكر أو أنثى)');

      const birthDate = _importParseDate(get('birthDate'));
      if (birthDate.invalid) errors.push('تاريخ غير صحيح (استخدم YYYY-MM-DD)');

      const weight = _importParseNumber(get('weight'));
      if (weight.invalid) errors.push('الوزن غير صحيح');

      const healthStatus = _importMapEnum(_IMPORT_HEALTH_MAP, get('healthStatus'), 'healthy');
      if (healthStatus.invalid) errors.push('الحالة الصحية غير صحيحة');

      const source = _importMapEnum(_IMPORT_SOURCE_MAP, get('source'), 'born');
      if (source.invalid) errors.push('المصدر غير صحيح (اكتب ولادة أو شراء)');

      const purchasePrice = _importParseNumber(get('purchasePrice'));
      if (purchasePrice.invalid) errors.push('سعر الشراء غير صحيح');

      const locationNameText = _importNormalizeText(get('locationName'));
      const locationId = locationNameText ? (_locationIdByName[_importNormalizeText(locationNameText)] || null) : null;
      const locationNotFound = !!locationNameText && !locationId;

      return {
        rowNum: idx + 2, // +2: تعويض صف العناوين + الترقيم من 1
        code: codeText,
        type: type.value,
        breed,
        gender: gender.value,
        birthDate: birthDate.value,
        color: _importNormalizeText(get('color')),
        weight: weight.value,
        healthStatus: healthStatus.value,
        source: source.value,
        purchasePrice: purchasePrice.value,
        locationId,
        locationNotFound,
        locationNameText,
        notes: _importNormalizeText(get('notes')),
        errors,
      };
    });
}

function _renderHerdImportPreview(validated) {
  const container = document.getElementById('import-preview-area');
  if (!container) return;

  const validCount = validated.filter(r => r.errors.length === 0).length;
  const errorCount = validated.length - validCount;

  if (!validated.length) {
    container.innerHTML = '<p style="margin-top: var(--spacing-3);">لم يتم العثور على أي صفوف بيانات في الملف.</p>';
    return;
  }

  const rowsHtml = validated.map(r => {
    let statusHtml;
    if (r.errors.length) {
      statusHtml = `<span class="badge badge--red">${r.errors.join('، ')}</span>`;
    } else if (r.locationNotFound) {
      statusHtml = `<span class="badge badge--warning">صالح — الموقع "${r.locationNameText}" غير موجود وسيُترك فارغًا</span>`;
    } else {
      statusHtml = `<span class="badge badge--green">صالح</span>`;
    }
    return `
      <tr>
        <td>${r.rowNum}</td>
        <td>${r.code || '(تلقائي)'}</td>
        <td>${ANIMAL_TYPE_LABELS[r.type] || '-'}</td>
        <td>${r.breed || '-'}</td>
        <td>${ANIMAL_GENDER_LABELS[r.gender] || '-'}</td>
        <td>${r.birthDate ? formatDateArabic(r.birthDate) : '-'}</td>
        <td>${statusHtml}</td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <p style="margin: var(--spacing-3) 0 var(--spacing-2); font-weight: 700;">
      عدد الصفوف: ${validated.length} — صالحة للاستيراد: ${validCount}${errorCount ? ` — بها أخطاء (لن تُستورد): ${errorCount}` : ''}
    </p>
    <div class="data-table-wrap" style="max-height: 320px; overflow: auto;">
      <table class="data-table">
        <thead>
          <tr>
            <th>#</th><th>الكود</th><th>النوع</th><th>السلالة</th><th>الجنس</th><th>التاريخ</th><th>الحالة</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;
}

async function _confirmHerdImport(actionBtn) {
  const validRows = (_herdImportValidatedRows || []).filter(r => r.errors.length === 0);
  if (!validRows.length) return;

  actionBtn.disabled = true;
  actionBtn.textContent = 'جارِ الاستيراد...';

  let successCount = 0;
  for (const row of validRows) {
    try {
      const code = row.code || await generateNextAnimalCode(row.type);
      await createAnimal({
        code,
        type: row.type,
        breed: row.breed,
        gender: row.gender,
        birthDate: row.birthDate,
        color: row.color,
        weight: row.weight,
        healthStatus: row.healthStatus,
        source: row.source,
        purchasePrice: row.purchasePrice,
        locationId: row.locationId,
        notes: row.notes,
      });
      successCount++;
    } catch (err) {
      console.error('فشل استيراد صف', row, err);
    }
  }

  showToast(`تم استيراد ${successCount} من ${validRows.length} حيوان بنجاح`, successCount === validRows.length ? 'success' : 'warning');
  closeModal();

  const [animals, locations] = await Promise.all([getAllAnimals(), getAllLocations()]);
  _allAnimalsCache = animals;
  _locationIdByName = {};
  locations.forEach(l => { _locationIdByName[_importNormalizeText(l.name)] = l.id; });
  const breeds = [...new Set(_allAnimalsCache.map(a => a.breed).filter(Boolean))].sort();
  const breedSelect = document.getElementById('filter-breed');
  const currentBreed = breedSelect.value;
  breedSelect.innerHTML = '<option value="">كل السلالات</option>' + breeds.map(b => `<option value="${b}">${b}</option>`).join('');
  breedSelect.value = currentBreed;
  drawHerdTable();
}
