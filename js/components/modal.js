// js/components/modal.js

function ensureModalRoot() {
  let root = document.getElementById('modal-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'modal-root';
    document.body.appendChild(root);
  }
  return root;
}

// options: { title, onConfirm, onCancel, confirmLabel, cancelLabel, hideFooter }
function openModal(contentHtml, options = {}) {
  const root = ensureModalRoot();
  const {
    title = '',
    onConfirm = null,
    onCancel = null,
    confirmLabel = 'تأكيد',
    cancelLabel = 'إلغاء',
    hideFooter = false,
  } = options;

  root.innerHTML = `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal-box" role="dialog" aria-modal="true">
        <div class="modal-box__header">
          <h3>${title}</h3>
          <button class="modal-box__close" id="modal-close-btn" aria-label="إغلاق">&times;</button>
        </div>
        <div class="modal-box__body">${contentHtml}</div>
        ${hideFooter ? '' : `
        <div class="modal-box__footer">
          <button class="btn btn--outline" id="modal-cancel-btn">${cancelLabel}</button>
          <button class="btn btn--primary" id="modal-confirm-btn">${confirmLabel}</button>
        </div>`}
      </div>
    </div>
  `;

  const overlay = document.getElementById('modal-overlay');
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);

  const confirmBtn = document.getElementById('modal-confirm-btn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      if (!onConfirm) return;
      // onConfirm قد تكون async (أغلب الاستخدامات فعليًا) — بلا هذا catch أي رفض غير متوقّع (خطأ IndexedDB،
      // مثلاً) كان يمر بصمت تمامًا: لا Toast، لا إغلاق، لا شيء يظهر للمستخدم سوى أن الزر "لا يعمل"
      try {
        const result = onConfirm();
        if (result && typeof result.catch === 'function') {
          result.catch(err => {
            console.error('خطأ غير متوقّع أثناء تنفيذ عملية النافذة المنبثقة', err);
            if (typeof showToast === 'function') showToast('حدث خطأ غير متوقّع، حاول مرة أخرى', 'error');
          });
        }
      } catch (err) {
        console.error('خطأ غير متوقّع أثناء تنفيذ عملية النافذة المنبثقة', err);
        if (typeof showToast === 'function') showToast('حدث خطأ غير متوقّع، حاول مرة أخرى', 'error');
      }
    });
  }
  // ⚠️ زر الحفظ/التأكيد خارج أي <form> داخل المحتوى (البنية أعلاه مقصودة: نفس المحتوى قد يُستخدم بلا نموذج
  // إطلاقًا). فمعيار HTML لا يُطلق حدث submit ضمنيًا عند Enter إلا لو كان بالنموذج حقل نصي واحد فقط أو زر
  // submit داخله — أي نموذج بأكثر من حقل (حالة كل نماذج هذا التطبيق تقريبًا) لا يُطلق submit إطلاقًا عند
  // Enter، فلا يكفي الاستماع لحدث submit. نعترض بدل ذلك ضغط Enter مباشرة على أي حقل إدخال/اختيار داخل النموذج
  // (باستثناء textarea، حيث Enter يعني سطرًا جديدًا لا إرسالًا) ونحوّله لنفس ضغط زر التأكيد
  root.querySelectorAll('.modal-box__body form').forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (confirmBtn) confirmBtn.click();
    });
    form.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const tag = e.target.tagName;
      if (tag === 'TEXTAREA' || tag === 'BUTTON') return;
      e.preventDefault();
      if (confirmBtn) confirmBtn.click();
    });
  });
  const cancelBtn = document.getElementById('modal-cancel-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      if (onCancel) onCancel();
      closeModal();
    });
  }

  requestAnimationFrame(() => overlay.classList.add('modal-overlay--show'));
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  if (!overlay) return;
  overlay.classList.remove('modal-overlay--show');
  setTimeout(() => {
    const root = document.getElementById('modal-root');
    if (root) root.innerHTML = '';
  }, 200);
}

// اختصار جاهز لتأكيد الحذف — يُستخدم في كل صفحات السجلات
function confirmDelete(message, onConfirmed) {
  openModal(`<p>${message}</p>`, {
    title: 'تأكيد الحذف',
    confirmLabel: 'حذف',
    cancelLabel: 'إلغاء',
    onConfirm: () => {
      onConfirmed();
      closeModal();
    },
  });
}
