// js/pages/herd-form-page.js

let _editingAnimalId = null;
let _currentAnimal = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('herd');
  renderSidebar('herd');
  renderHeader('تكويد حيوان جديد');

  const params = new URLSearchParams(window.location.search);
  const idParam = params.get('id');

  const _requiredAction = idParam ? 'edit' : 'add';
  if (!hasActionPermission('herd', _requiredAction)) {
    showToast(idParam ? 'ليس لديك صلاحية تعديل بيانات القطيع' : 'ليس لديك صلاحية إضافة حيوان', 'error');
    window.location.href = 'herd-list.html';
    return;
  }
  if (!hasActionPermission('herd', 'print')) {
    document.getElementById('print-card-btn').style.display = 'none';
  }

  const [locations, allAnimals] = await Promise.all([getAllLocations(), getAllAnimals()]);

  const locationSelect = document.getElementById('locationId');
  locationSelect.innerHTML = `<option value="">-- غير محدد --</option>` +
    locations.map(l => `<option value="${l.id}">${l.name}</option>`).join('');

  // الأم/الأب: أي حيوان حي بالجنس المناسب باستثناء الحيوان نفسه (لا يمكن أن يكون والد نفسه)
  const excludeId = idParam ? Number(idParam) : null;
  const potentialMothers = allAnimals.filter(a => a.gender === 'female' && a.id !== excludeId);
  const potentialFathers = allAnimals.filter(a => a.gender === 'male' && a.id !== excludeId);

  document.getElementById('motherId').innerHTML = `<option value="">-- غير معروفة --</option>` +
    potentialMothers.map(a => `<option value="${a.id}">${a.code} (${a.breed})</option>`).join('');
  document.getElementById('fatherId').innerHTML = `<option value="">-- غير معروف --</option>` +
    potentialFathers.map(a => `<option value="${a.id}">${a.code} (${a.breed})</option>`).join('');

  if (idParam) {
    _editingAnimalId = Number(idParam);
    await _loadAnimalIntoForm(_editingAnimalId);
    document.getElementById('form-title').textContent = 'تعديل بيانات الحيوان';
    if (hasActionPermission('herd', 'delete')) {
      document.getElementById('delete-btn').style.display = 'inline-flex';
    }
  } else {
    document.getElementById('code').value = await generateNextAnimalCode(document.getElementById('type').value);
    // عند تغيير النوع في وضع الإنشاء: يُعاد توليد الكود تلقائيًا بالبادئة الجديدة (SH- للأغنام / GO- للماعز)
    // ما لم يكن المستخدم قد عدّل الكود يدويًا — التعديل اليدوي يُحترم ولا يُعاد توليده
    document.getElementById('type').addEventListener('change', async (e) => {
      if (_editingAnimalId) return;
      const codeInput = document.getElementById('code');
      const isAutoCode = /^(SH|GO|GZ)-\d{4}$/i.test((codeInput.value || '').trim());
      if (!codeInput.value.trim() || isAutoCode) {
        codeInput.value = await generateNextAnimalCode(e.target.value);
      }
    });
    // قادم من بوابة "شراء حيوان" (herd/animal-purchase.html) باختيار "شراء أصل" — تهيئة الحقول المناسبة لشراء
    // مسبقًا (المصدر + تاريخ الاقتناء بتاريخ اليوم افتراضيًا، قابل للتعديل) بدل تركها للمستخدم يضبطها يدويًا
    if (params.get('source') === 'purchased') {
      document.getElementById('source').value = 'purchased';
      document.getElementById('birthDate').value = todayIso();
      document.getElementById('form-title').textContent = 'شراء حيوان (تكويد أصل جديد)';
    }
  }

  document.getElementById('animal-form').addEventListener('submit', _handleSubmit);
  document.getElementById('delete-btn').addEventListener('click', _handleDelete);
  document.getElementById('print-card-btn').addEventListener('click', () => {
    if (_currentAnimal) printAnimalCardWithQr(_currentAnimal);
  });
});

async function _loadAnimalIntoForm(id) {
  const animal = await getAnimalById(id);
  if (!animal) {
    showToast('لم يتم العثور على الحيوان', 'error');
    window.location.href = 'herd-list.html';
    return;
  }
  _currentAnimal = animal;

  document.getElementById('code').value = animal.code || '';
  document.getElementById('type').value = animal.type || 'sheep';
  document.getElementById('breed').value = animal.breed || '';
  document.getElementById('gender').value = animal.gender || 'female';
  document.getElementById('birthDate').value = animal.birthDate || '';
  document.getElementById('color').value = animal.color || '';
  document.getElementById('weight').value = animal.weight ?? '';
  document.getElementById('healthStatus').value = animal.healthStatus || 'healthy';
  document.getElementById('source').value = animal.source || 'born';
  document.getElementById('purchasePrice').value = animal.purchasePrice ?? '';
  document.getElementById('locationId').value = animal.locationId || '';
  document.getElementById('motherId').value = animal.motherId || '';
  document.getElementById('fatherId').value = animal.fatherId || '';
  document.getElementById('notes').value = animal.notes || '';

  if (animal.status === 'dead' || animal.status === 'sold') {
    document.getElementById('healthStatus').disabled = true;
    document.getElementById('healthStatus-locked-hint').style.display = 'block';
  }

  const healthLink = document.getElementById('health-history-link');
  healthLink.href = `health.html?animalId=${animal.id}`;
  healthLink.style.display = 'inline-flex';

  const weightLink = document.getElementById('weight-history-link');
  weightLink.href = `weights.html?animalId=${animal.id}`;
  weightLink.style.display = 'inline-flex';

  const fatteningLink = document.getElementById('fattening-history-link');
  fatteningLink.href = `fattening.html?animalId=${animal.id}`;
  fatteningLink.style.display = 'inline-flex';

  const vaccinationLink = document.getElementById('vaccination-history-link');
  vaccinationLink.href = `vaccinations.html?animalId=${animal.id}`;
  vaccinationLink.style.display = 'inline-flex';

  // سجل التلقيح/الحمل لا معنى له إلا للإناث
  if (animal.gender === 'female') {
    const matingLink = document.getElementById('mating-history-link');
    matingLink.href = `mating.html?animalId=${animal.id}`;
    matingLink.style.display = 'inline-flex';

    const pregnancyLink = document.getElementById('pregnancy-history-link');
    pregnancyLink.href = `pregnancy.html?animalId=${animal.id}`;
    pregnancyLink.style.display = 'inline-flex';
  }

  document.getElementById('print-card-btn').style.display = 'inline-flex';

  if (animal.status === 'alive') {
    const deathLink = document.getElementById('register-death-link');
    deathLink.href = `deaths.html?animalId=${animal.id}`;
    deathLink.style.display = 'inline-flex';
  }
}

async function _handleSubmit(e) {
  e.preventDefault();

  const code = document.getElementById('code').value.trim();
  const weight = document.getElementById('weight').value;

  const codeTaken = await isAnimalCodeTaken(code, _editingAnimalId);

  const isValid = validateForm([
    { fieldId: 'code', validatorFn: () => isRequired(code) && !codeTaken, message: codeTaken ? 'هذا الكود مستخدم بالفعل' : 'الكود مطلوب' },
    { fieldId: 'breed', validatorFn: isRequired, message: 'هذا الحقل مطلوب' },
    { fieldId: 'weight', validatorFn: (v) => v === '' || isPositiveNumber(v), message: 'أدخل قيمة صحيحة' },
  ]);
  if (!isValid) return;

  const data = {
    code,
    type: document.getElementById('type').value,
    breed: document.getElementById('breed').value.trim(),
    gender: document.getElementById('gender').value,
    birthDate: document.getElementById('birthDate').value || null,
    color: document.getElementById('color').value.trim(),
    weight: weight ? Number(weight) : null,
    healthStatus: document.getElementById('healthStatus').value,
    source: document.getElementById('source').value,
    purchasePrice: document.getElementById('purchasePrice').value ? Number(document.getElementById('purchasePrice').value) : null,
    locationId: document.getElementById('locationId').value ? Number(document.getElementById('locationId').value) : null,
    motherId: document.getElementById('motherId').value ? Number(document.getElementById('motherId').value) : null,
    fatherId: document.getElementById('fatherId').value ? Number(document.getElementById('fatherId').value) : null,
    notes: document.getElementById('notes').value.trim(),
  };

  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'جاري الحفظ...';

  try {
    let savedAnimalId = _editingAnimalId;
    if (_editingAnimalId) {
      await updateAnimal(_editingAnimalId, data);
    } else {
      savedAnimalId = await createAnimal(data);
    }

    showToast('تم الحفظ بنجاح', 'success');
    setTimeout(() => { window.location.href = 'herd-list.html'; }, 400);
  } catch (err) {
    showToast('حدث خطأ أثناء الحفظ', 'error');
    saveBtn.disabled = false;
    saveBtn.textContent = 'حفظ';
  }
}

function _handleDelete() {
  confirmDelete('هل أنت متأكد من حذف هذا الحيوان من السجل؟ لا يمكن التراجع عن هذا الإجراء.', async () => {
    await deleteAnimal(_editingAnimalId);
    showToast('تم حذف الحيوان', 'success');
    setTimeout(() => { window.location.href = 'herd-list.html'; }, 400);
  });
}
