// js/pages/employee-wallet-page.js
// محفظة عهد الموظف (البند 6): صفحة مستقلة لكل موظف — ملخّص + مؤشر لوني + سجل زمني كامل لكل حركاته

let _employeesForWallet = [];
let _allCustodyItemsForWallet = [];
let _allSettlementsForWallet = [];

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('custody');
  renderSidebar('custody-wallet');
  renderHeader('محفظة عهد الموظف');

  const [employees, items, settlements] = await Promise.all([
    dbGetAll('Employees'),
    getAllCustodyItems(),
    getAllCustodySettlements(),
  ]);
  _employeesForWallet = employees.filter(e => e.status !== 'deleted');
  _allCustodyItemsForWallet = items;
  _allSettlementsForWallet = settlements;

  const urlParams = new URLSearchParams(window.location.search);
  const employeeId = urlParams.get('employeeId');

  if (employeeId) {
    _renderWallet(Number(employeeId));
  } else {
    _renderPicker();
  }
});

function _statusIndicator(summary) {
  if (summary.hasOverdue) return '🔴';
  if (summary.hasOpen) return '🟡';
  return '🟢';
}

function _renderPicker() {
  document.getElementById('wallet-box').style.display = 'none';
  const grid = document.getElementById('employee-picker-grid');
  if (!_employeesForWallet.length) {
    grid.innerHTML = '<p style="padding:12px; color: var(--color-text-secondary);">لا يوجد موظفون مكوَّدون بعد</p>';
    return;
  }
  grid.innerHTML = kpiGrid(_employeesForWallet.map(e => {
    const summary = getEmployeeCustodySummary(e.id, _allCustodyItemsForWallet);
    return {
      value: `${e.fullName} ${_statusIndicator(summary)}`,
      label: `${e.jobTitle || ''}${summary.currentBalance > 0.01 ? ' — رصيد ' + formatCurrency(summary.currentBalance) : ''}`,
      tone: summary.hasOverdue ? 'red' : summary.hasOpen ? 'blue' : 'green',
      href: `employee-wallet.html?employeeId=${e.id}`,
    };
  }), 3);
}

function _renderWallet(employeeId) {
  const emp = _employeesForWallet.find(e => e.id === employeeId);
  document.getElementById('picker-box').style.display = 'none';
  if (!emp) {
    document.getElementById('wallet-box').innerHTML = '<p>الموظف غير موجود</p>';
    document.getElementById('wallet-box').style.display = '';
    return;
  }

  const summary = getEmployeeCustodySummary(employeeId, _allCustodyItemsForWallet);

  document.getElementById('wallet-avatar').innerHTML = employeeAvatarHtml(emp, 72);
  document.getElementById('wallet-name').textContent = emp.fullName;
  document.getElementById('wallet-indicator').textContent = _statusIndicator(summary);
  document.getElementById('wallet-meta').textContent = emp.jobTitle || '-';

  document.getElementById('wallet-kpis').innerHTML = kpiGrid([
    { value: formatCurrency(summary.totalIssued), label: 'إجمالي العهد', tone: 'blue' },
    { value: formatCurrency(summary.totalSettled), label: 'إجمالي التسويات', tone: 'green' },
    { value: formatCurrency(summary.currentBalance), label: 'الرصيد الحالي', tone: summary.currentBalance > 0.01 ? 'red' : 'green' },
  ]);

  _renderTimeline(summary.items);
  document.getElementById('wallet-box').style.display = '';
}

function _renderTimeline(items) {
  const events = [];
  items.filter(i => i.status !== 'cancelled').forEach(item => {
    events.push({
      date: item.date || item.createdAt?.slice(0, 10),
      icon: '➕',
      title: `إصدار عهدة ${item.custodyNumber || item.reference || ('#' + item.id)}`,
      detail: `${CUSTODY_TYPE_LABELS[item.custodyType] || 'نقدية'} — ${formatCurrency(item.amount)}${item.purpose ? ' — ' + item.purpose : ''}`,
      attachBtn: `<button type="button" class="btn btn--outline" style="padding:2px 8px; font-size:11px;" onclick="openAttachmentsModal('custody', ${item.id}, '${item.custodyNumber || ''}')">📎</button>`,
    });

    _allSettlementsForWallet.filter(s => Number(s.custodyItemId) === item.id).forEach(s => {
      events.push({
        date: s.date,
        icon: '✔️',
        title: `${CUSTODY_SETTLEMENT_TYPE_LABELS[s.settlementType] || s.settlementType} - عهدة ${item.custodyNumber || item.reference || ('#' + item.id)}`,
        detail: `${s.voucherNumber ? '[' + s.voucherNumber + '] ' : ''}${formatCurrency(s.amount)}${s.notes ? ' — ' + s.notes : ''}`,
        attachBtn: `<button type="button" class="btn btn--outline" style="padding:2px 8px; font-size:11px;" onclick="openAttachmentsModal('custodySettlement', ${s.id}, '')">📎</button>`,
      });
    });
  });

  events.sort((a, b) => (a.date === b.date ? 0 : (a.date < b.date ? 1 : -1))); // تنازليًا

  const container = document.getElementById('wallet-timeline');
  if (!events.length) {
    container.innerHTML = '<p style="padding:12px; color: var(--color-text-secondary);">لا توجد حركات بعد</p>';
    return;
  }

  container.innerHTML = events.map(e => `
    <div style="display:flex; gap:12px; padding:10px 4px; border-bottom:1px solid var(--color-border);">
      <div style="font-size:20px;">${e.icon}</div>
      <div style="flex:1;">
        <div style="font-weight:700; font-size:13.5px;">${e.title}</div>
        <div style="font-size:12.5px; color: var(--color-text-secondary);">${e.detail}</div>
      </div>
      <div style="font-size:12px; color: var(--color-text-secondary); white-space:nowrap;">${formatDateArabic(e.date)}</div>
      <div>${e.attachBtn}</div>
    </div>
  `).join('');
}
