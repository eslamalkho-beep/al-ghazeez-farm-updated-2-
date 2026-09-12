// js/pages/audit-log-page.js
// عرض فقط لسجل التدقيق (AuditLog) — يُكتَب تلقائيًا من _logAudit() في js/db/db.js عند كل عملية إضافة/تعديل/
// حذف على أي مخزن. مقصورة على مدير النظام (resolveRoleKey(role) === 'systemAdmin') لأن السجل يكشف تفاصيل
// حساسة (رواتب، صلاحيات، ...) عبر كل وحدات النظام

let _allAuditLogs = [];

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('settings');
  renderSidebar('audit-log');
  renderHeader('سجل التدقيق');

  const currentUser = getCurrentUser();
  const isAdmin = currentUser && resolveRoleKey(currentUser.role) === 'systemAdmin';
  if (!isAdmin) {
    document.getElementById('not-admin-notice').style.display = '';
    document.getElementById('audit-content').style.display = 'none';
    return;
  }

  _allAuditLogs = await getAllAuditLogs();
  const { stores, users } = getDistinctAuditFacets(_allAuditLogs);

  document.getElementById('filter-store').innerHTML += stores.map(([code, label]) => `<option value="${code}">${label}</option>`).join('');
  document.getElementById('filter-user').innerHTML += users.map(([code, label]) => `<option value="${code}">${label}</option>`).join('');

  ['filter-store', 'filter-action', 'filter-user', 'filter-from', 'filter-to'].forEach(id => {
    document.getElementById(id).addEventListener('change', _render);
  });
  document.getElementById('clear-filters-btn').addEventListener('click', () => {
    document.getElementById('filter-store').value = '';
    document.getElementById('filter-action').value = '';
    document.getElementById('filter-user').value = '';
    document.getElementById('filter-from').value = '';
    document.getElementById('filter-to').value = '';
    _render();
  });

  _render();
});

function _formatAuditValue(v) {
  if (v === undefined) return '(غير موجود)';
  if (v === null || v === '') return '-';
  if (typeof v === 'boolean') return v ? 'نعم' : 'لا';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function _summarizeChanges(entry) {
  if (entry.action === 'create') return 'إنشاء سجل جديد';
  if (entry.action === 'hardDelete') return 'حذف نهائي للسجل';
  const list = entry.changes || [];
  if (!list.length) return '-';
  return list.slice(0, 2).map(c => `${c.field}: ${_formatAuditValue(c.oldValue)} ← ${_formatAuditValue(c.newValue)}`).join(' | ')
    + (list.length > 2 ? ` (+${list.length - 2})` : '');
}

function _openDetailsModal(entry) {
  let rowsHtml;
  if (entry.action === 'create' || entry.action === 'hardDelete') {
    const snapshot = entry.snapshot || {};
    rowsHtml = Object.keys(snapshot)
      .filter(k => !['id', 'createdAt', 'updatedAt'].includes(k))
      .map(k => `<tr><td>${k}</td><td colspan="2">${_formatAuditValue(snapshot[k])}</td></tr>`).join('');
  } else {
    rowsHtml = (entry.changes || []).map(c => `<tr><td>${c.field}</td><td>${_formatAuditValue(c.oldValue)}</td><td>${_formatAuditValue(c.newValue)}</td></tr>`).join('');
  }

  const isSnapshot = entry.action === 'create' || entry.action === 'hardDelete';
  const html = `
    <p style="font-size:13px; color: var(--color-text-secondary); margin-bottom: var(--spacing-2);">
      ${getAuditStoreLabel(entry.storeName)} #${entry.recordId} — ${AUDIT_ACTION_LABELS[entry.action] || entry.action} — ${formatDateTimeArabic(entry.at)} — ${entry.userName || 'نظام'}
    </p>
    <div style="overflow-x:auto;">
      <table class="data-table">
        <thead><tr><th>الحقل</th><th>${isSnapshot ? 'القيمة' : 'قبل'}</th>${isSnapshot ? '' : '<th>بعد</th>'}</tr></thead>
        <tbody>${rowsHtml || '<tr><td colspan="3">لا تفاصيل</td></tr>'}</tbody>
      </table>
    </div>
  `;

  openModal(html, { title: 'تفاصيل الحركة', hideFooter: true });
}

function _render() {
  const storeFilter = document.getElementById('filter-store').value;
  const actionFilter = document.getElementById('filter-action').value;
  const userFilter = document.getElementById('filter-user').value;
  const from = document.getElementById('filter-from').value;
  const to = document.getElementById('filter-to').value;

  const rows = _allAuditLogs.filter(l => {
    if (storeFilter && l.storeName !== storeFilter) return false;
    if (actionFilter && l.action !== actionFilter) return false;
    if (userFilter) {
      const uKey = l.userId ? String(l.userId) : `name:${l.userName}`;
      if (uKey !== userFilter) return false;
    }
    const dateOnly = (l.at || '').slice(0, 10);
    if (from && dateOnly < from) return false;
    if (to && dateOnly > to) return false;
    return true;
  }).map(l => ({
    ...l,
    atLabel: formatDateTimeArabic(l.at),
    storeLabel: getAuditStoreLabel(l.storeName),
    actionLabel: `<span class="badge ${l.action === 'create' ? 'badge--green' : l.action === 'update' ? 'badge--blue' : 'badge--warning'}">${AUDIT_ACTION_LABELS[l.action] || l.action}</span>`,
    userLabel: l.userName || 'نظام',
    summary: _summarizeChanges(l),
    detailsBtn: `<button type="button" class="btn btn--outline btn--sm" onclick="_showAuditDetails(${l.id})">عرض</button>`,
  }));

  renderDataTable('audit-table', [
    { key: 'atLabel', label: 'التاريخ والوقت', sortable: true },
    { key: 'userLabel', label: 'المستخدم', sortable: true },
    { key: 'storeLabel', label: 'نوع السجل', sortable: true },
    { key: 'recordId', label: 'رقم السجل', sortable: true },
    { key: 'actionLabel', label: 'الإجراء', sortable: false },
    { key: 'summary', label: 'ملخّص التغييرات', sortable: false },
    { key: 'detailsBtn', label: 'التفاصيل', sortable: false },
  ], rows, {
    emptyMessage: 'لا توجد حركات مطابقة',
  });
}

function _showAuditDetails(id) {
  const entry = _allAuditLogs.find(l => l.id === id);
  if (entry) _openDetailsModal(entry);
}
