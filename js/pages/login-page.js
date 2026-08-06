// js/pages/login-page.js

document.addEventListener('DOMContentLoaded', async () => {
  // إن كان المستخدم مسجّلاً دخوله بالفعل، وجّهه مباشرة للوحة التحكم
  const existingUser = getCurrentUser();
  if (existingUser) {
    window.location.href = 'dashboard.html';
    return;
  }

  await seedDatabaseIfEmpty();

  const form = document.getElementById('login-form');
  const errorBox = document.getElementById('login-error-box');
  const submitBtn = document.getElementById('login-submit-btn');
  const togglePassword = document.getElementById('toggle-password');
  const passwordInput = document.getElementById('password');
  const forgotLink = document.getElementById('forgot-password-link');

  togglePassword.addEventListener('click', () => {
    const isHidden = passwordInput.type === 'password';
    passwordInput.type = isHidden ? 'text' : 'password';
    togglePassword.textContent = isHidden ? 'إخفاء' : 'إظهار';
  });

  forgotLink.addEventListener('click', (e) => {
    e.preventDefault();
    openModal(
      '<p>لإعادة تعيين كلمة المرور، يرجى التواصل مع مدير النظام مباشرة.</p>',
      { title: 'نسيت كلمة المرور؟', hideFooter: true }
    );
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.style.display = 'none';

    const isValid = validateForm([
      { fieldId: 'username', validatorFn: isRequired, message: 'هذا الحقل مطلوب' },
      { fieldId: 'password', validatorFn: isRequired, message: 'هذا الحقل مطلوب' },
    ]);
    if (!isValid) return;

    const username = document.getElementById('username').value.trim();
    const password = passwordInput.value;

    submitBtn.disabled = true;
    submitBtn.textContent = 'جاري تسجيل الدخول...';

    try {
      const result = await login(username, password);
      if (result.success) {
        showToast('تم تسجيل الدخول بنجاح', 'success');
        setTimeout(() => { window.location.href = 'dashboard.html'; }, 400);
      } else {
        errorBox.textContent = result.message;
        errorBox.style.display = 'block';
      }
    } catch (err) {
      errorBox.textContent = 'حدث خطأ غير متوقع، حاول مرة أخرى';
      errorBox.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'تسجيل الدخول';
    }
  });
});
