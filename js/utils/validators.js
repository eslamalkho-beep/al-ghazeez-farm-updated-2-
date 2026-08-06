// js/utils/validators.js

function isRequired(value) {
  return value !== null && value !== undefined && String(value).trim().length > 0;
}

function isValidDate(value) {
  if (!isRequired(value)) return false;
  const d = new Date(value);
  return !isNaN(d.getTime());
}

function isPositiveNumber(value) {
  const num = Number(value);
  return !isNaN(num) && num >= 0;
}

function isValidPhone(value) {
  return /^[0-9+\s-]{7,15}$/.test(String(value || '').trim());
}

// دالة مساعدة عامة: تطبّق قواعد التحقق على نموذج وتعرض الأخطاء بجانب كل حقل
// rules: [{ fieldId, validatorFn, message }]
function validateForm(rules) {
  let isValid = true;
  rules.forEach(rule => {
    const field = document.getElementById(rule.fieldId);
    if (!field) return;
    const group = field.closest('.form-group');
    const errorEl = group ? group.querySelector('.form-error') : null;
    const passed = rule.validatorFn(field.value);
    if (!passed) {
      isValid = false;
      if (group) group.classList.add('has-error');
      if (errorEl) errorEl.textContent = rule.message;
    } else {
      if (group) group.classList.remove('has-error');
    }
  });
  return isValid;
}
