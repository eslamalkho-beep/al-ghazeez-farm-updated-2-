// js/services/notification-service.js

async function getAllNotifications() {
  const all = await dbGetAll('Notifications');
  return all.filter(n => !n.isDeleted).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function getUnreadCount() {
  const all = await getAllNotifications();
  return all.filter(n => !n.isRead).length;
}

async function markNotificationAsRead(id) {
  return dbUpdate('Notifications', id, { isRead: true });
}

async function deleteNotification(id) {
  return dbSoftDelete('Notifications', id);
}

async function createNotification({ type, title, message, relatedEntityId = null }) {
  return dbAdd('Notifications', { type, title, message, relatedEntityId, isRead: false });
}

// تُستدعى من header.js في كل صفحة لتحديث شارة العداد
async function updateNotificationBadge() {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  try {
    const count = await getUnreadCount();
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  } catch (e) {
    // قاعدة البيانات قد لا تكون جاهزة بعد في بعض الصفحات — تجاهل بصمت
  }
}
