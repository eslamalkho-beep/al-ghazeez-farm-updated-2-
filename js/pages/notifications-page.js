// js/pages/notifications-page.js

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('notifications');
  renderSidebar('notifications');
  renderHeader('مركز الإشعارات');

  await _drawNotifications();

  document.getElementById('mark-all-read-btn').addEventListener('click', async () => {
    const all = await getAllNotifications();
    await Promise.all(all.filter(n => !n.isRead).map(n => markNotificationAsRead(n.id)));
    showToast('تم تحديد جميع الإشعارات كمقروءة', 'success');
    await _drawNotifications();
    updateNotificationBadge();
  });
});

const NOTIF_TYPE_ICONS = { health: '💊', custody: '📦', finance: 'ℹ️', death: '⚠️', summary: '📈', inventory: '📉' };

async function _drawNotifications() {
  const list = await getAllNotifications();
  const container = document.getElementById('notif-list');

  if (!list.length) {
    container.innerHTML = '<div class="empty-state">لا توجد إشعارات حاليًا</div>';
    return;
  }

  container.innerHTML = list.map(n => `
    <div class="notif-item ${n.isRead ? '' : 'unread'}">
      <div class="notif-icon">${NOTIF_TYPE_ICONS[n.type] || 'ℹ️'}</div>
      <div style="flex:1;">
        <div class="notif-title">${n.title}</div>
        <div class="notif-message">${n.message}</div>
        <div class="notif-time">${formatDateArabic(n.createdAt)}</div>
      </div>
      <div class="notif-actions">
        ${!n.isRead ? `<button class="btn btn--outline btn--sm" data-mark="${n.id}">تحديد كمقروء</button>` : ''}
        <button class="btn btn--danger btn--sm" data-delete="${n.id}">حذف</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('[data-mark]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await markNotificationAsRead(Number(btn.dataset.mark));
      await _drawNotifications();
      updateNotificationBadge();
    });
  });

  container.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => {
      confirmDelete('هل تريد حذف هذا الإشعار؟', async () => {
        await deleteNotification(Number(btn.dataset.delete));
        showToast('تم حذف الإشعار', 'success');
        await _drawNotifications();
        updateNotificationBadge();
      });
    });
  });
}
