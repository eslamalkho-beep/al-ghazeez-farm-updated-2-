// js/pages/herd-form-page.js

let _editingAnimalId = null;
let _originalHealthStatus = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('herd');
  renderSidebar('herd');
  renderHeader('تكويد حيوان جديد');

  const params = new URLSearchParams(window.location.search);
  const idParam = params.get('id');

  if (idParam) {
    _editingAnimalId = Number(idParam);
    await _loadAnimalIntoForm(_editingAnimalId);
    document.getElementById('form-title').textContent = 'تعديل بيانات الحيوان';
    document.getElementById('delete-btn').style.display = 'inline-flex';
  } else {
    document.getElementById('code').value = await generateNextAnimalCode();
  }

  document.getElementById('animal-form').addEventListener('submit', _handleSubmit);
  document.getElementById('delete-btn').addEventListener('click', _handleDelete);
});

async function _loadAnimalIntoForm(id) {
  const animal = await getAnimalById(id);
  if (!animal) {
    showToast('لم يتم العثور على الحيوان', 'error');
    window.location.href = 'herd-list.html';
    return;
  }
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
  document.getElementById('notes').value = animal.notes || '';

  if (animal.status === 'dead' || animal.status === 'sold') {
    document.getElementById('healthStatus').disabled = true;
    document.getElementById('healthStatus-locked-hint').style.display = 'block';
  }

  _originalHealthStatus = animal.healthStatus || 'healthy';

  const healthLink = document.getElementById('health-history-link');
  healthLink.href = `health.html?animalId=${animal.id}`;
  healthLink.style.display = 'inline-flex';

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
    notes: document.getElementById('notes').value.trim(),
  };

  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'جاري الحفظ...';

  try {
    const isNewAnimal = !_editingAnimalId;
    let savedAnimalId = _editingAnimalId;
    if (_editingAnimalId) {
      await updateAnimal(_editingAnimalId, data);
    } else {
      savedAnimalId = await createAnimal(data);
    }

    const becameSick = (data.healthStatus === 'sick' || data.healthStatus === 'underTreatment')
      && (isNewAnimal || _originalHealthStatus !== data.healthStatus);
    if (becameSick) {
      await createNotification({
        type: 'health',
        title: `الحيوان ${data.code} يحتاج متابعة صحية`,
        message: `تم تحديث الحالة الصحية للحيوان ${data.code} إلى ${ANIMAL_HEALTH_LABELS[data.healthStatus]}`,
        relatedEntityId: savedAnimalId,
      });
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
