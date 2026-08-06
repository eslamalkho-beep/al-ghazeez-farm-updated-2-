// js/components/toast.js

function ensureToastContainer() {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

const TOAST_ICONS = {
  success: '✔',
  error: '✕',
  warning: '!',
  info: 'ℹ',
};

// type: "success" | "error" | "warning" | "info"
function showToast(message, type = 'info') {
  const container = ensureToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `
    <span class="toast__icon">${TOAST_ICONS[type] || TOAST_ICONS.info}</span>
    <span class="toast__message">${message}</span>
  `;
  container.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('toast--show'));

  setTimeout(() => {
    toast.classList.remove('toast--show');
    setTimeout(() => toast.remove(), 250);
  }, 3000);
}
