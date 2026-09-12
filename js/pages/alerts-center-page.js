// js/pages/alerts-center-page.js
// النسخة الكاملة (غير المبتورة) من "التنبيهات السريعة" — كل الفئات العشر بلا سقف 6 عناصر، مبنية فوق
// computeAllAlerts() في alerts-service.js (المصدر الوحيد لمنطق الحساب، مشترك مع دشبورد "تنبيهات سريعة")

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('notifications');
  renderSidebar('alerts-center');
  renderHeader('مركز التنبيهات');

  document.getElementById('refresh-btn').addEventListener('click', _refresh);
  document.getElementById('mark-all-read-btn').addEventListener('click', async () => {
    // "الكل" هنا يعني كل التنبيهات المعروضة فعليًا وقت الضغط (غير المقروءة أساسًا، أو كل شيء لو مفعّل
    // toggle "عرض المقروءة أيضًا") — وليس بالضرورة كل تنبيه محسوب في آخر _refresh حتى لو كان مخفيًا
    const idsToMark = _lastAlerts.filter(a => _showRead || !a.isRead).map(a => a.id);
    markAllAlertsAsRead(idsToMark);
    showToast('تم تعليم كل التنبيهات كمقروءة', 'success');
    await _refresh();
    if (typeof refreshAlertsBadge === 'function') refreshAlertsBadge();
  });

  document.getElementById('show-read-toggle').addEventListener('change', (e) => {
    _showRead = e.target.checked;
    _renderSections(_lastAlerts);
  });

  // تعليم/قراءة زر مقروء لكل تنبيه — تفويض حدث واحد على الحاوية بدل ربط كل عنصر عند كل إعادة رسم
  document.getElementById('alerts-sections').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-mark-read]');
    if (!btn) return;
    e.preventDefault();
    markAlertAsRead(btn.dataset.markRead);
    await _refresh();
    if (typeof refreshAlertsBadge === 'function') refreshAlertsBadge();
  });

  await _refresh();
});

let _lastAlerts = [];
let _showRead = false;

async function _refresh() {
  const alerts = await computeAllAlerts();
  _lastAlerts = alerts;
  _renderSummary(alerts);
  _renderSections(alerts);
}

function _renderSummary(alerts) {
  const redCount = alerts.filter(a => a.severity === 'red').length;
  const warningCount = alerts.filter(a => a.severity === 'warning').length;
  const blueCount = alerts.filter(a => a.severity === 'blue').length;
  const unreadCount = alerts.filter(a => !a.isRead).length;

  document.getElementById('alerts-summary-kpis').innerHTML = kpiGrid([
    { value: formatNumber(alerts.length), label: 'إجمالي التنبيهات', tone: 'blue', icon: '🔔' },
    { value: formatNumber(unreadCount), label: 'غير مقروءة', tone: 'red', icon: '🆕' },
    { value: formatNumber(redCount), label: 'حرجة', tone: 'red', icon: '🔴' },
    { value: formatNumber(warningCount), label: 'تحذيرية', tone: 'red', icon: '🟡' },
    { value: formatNumber(blueCount), label: 'معلوماتية', tone: 'blue', icon: '🔵' },
  ]);
}

function _renderSections(alerts) {
  const container = document.getElementById('alerts-sections');

  // افتراضيًا (toggle "عرض المقروءة أيضًا" غير مفعّل) تُخفى التنبيهات المقروءة بالكامل من القائمة — بنفس
  // منطق صناديق الوارد المعتادة (WhatsApp/Gmail...): "مقروء" يعني اختفى من القائمة الافتراضية، لا مجرد
  // تعتيمه مع بقائه ظاهرًا (كان هذا هو السلوك السابق، وسبب التباس "الزر ما بيأثرش على كل التنبيهات")
  const visibleAlerts = _showRead ? alerts : alerts.filter(a => !a.isRead);

  const byCategory = {};
  visibleAlerts.forEach(a => {
    (byCategory[a.category] = byCategory[a.category] || []).push(a);
  });

  const sectionsHtml = ALERT_CATEGORY_ORDER
    .filter(cat => byCategory[cat] && byCategory[cat].length)
    .map(cat => {
      const meta = ALERT_CATEGORY_META[cat];
      const items = byCategory[cat];
      const badgeTone = items.some(i => i.severity === 'red') ? 'badge--red' : items.some(i => i.severity === 'warning') ? 'badge--warning' : 'badge--blue';

      return `
        <div class="card alert-section">
          <div class="card__header">
            <h3>${meta.icon} ${meta.label}</h3>
            <span class="badge ${badgeTone}">${formatNumber(items.length)}</span>
          </div>
          ${items.map(a => `
            <div class="quick-alert-item ${a.isRead ? 'quick-alert-item--read' : ''}">
              <a class="quick-alert-item__body" href="${a.href}">
                <span class="quick-alert-dot quick-alert-dot--${a.severity}"></span>
                <span>
                  <strong>${a.title}</strong> — ${a.message}
                  <span class="quick-alert-item__date">${formatDateArabic(a.date)}</span>
                </span>
              </a>
              ${a.isRead
                ? `<span class="quick-alert-item__mark-read" style="font-size:12px; color: var(--color-text-secondary);">✓ مقروءة</span>`
                : `<button type="button" class="btn btn--outline btn--sm quick-alert-item__mark-read" data-mark-read="${a.id}">✓ مقروء</button>`}
            </div>
          `).join('')}
        </div>
      `;
    }).join('');

  const hasHiddenRead = !_showRead && alerts.length > visibleAlerts.length;
  container.innerHTML = sectionsHtml || `
    <div class="card"><div class="empty-state">${hasHiddenRead ? 'لا توجد تنبيهات غير مقروءة ✅ — فعّل "عرض المقروءة أيضًا" لمراجعة القديمة' : 'لا توجد تنبيهات حاليًا 👍'}</div></div>
  `;
}
