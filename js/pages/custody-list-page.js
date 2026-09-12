// js/pages/custody-list-page.js
// سجل العهد (البند 4 من وحدة إدارة العهد) — إصدار عهدة جديدة يتم من custody-issue.html، هذه الصفحة
// للعرض/التسوية/الإلغاء/المرفقات فقط. CUSTODY_TYPE_LABELS/CUSTODY_STATUS_LABELS معرّفة في custody-service.js

let _allCustodyCache = [];
let _employeesForCustody = [];

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('custody');
  renderSidebar('custody-list');
  renderHeader('سجل العهد');

  if (!hasActionPermission('custody', 'export')) {
    document.getElementById('export-custody-excel-btn').style.display = 'none';
  }
  if (!hasActionPermission('custody', 'export') || !hasActionPermission('custody', 'print')) {
    document.getElementById('export-custody-pdf-btn').style.display = 'none';
  }

  _employeesForCustody = (await dbGetAll('Employees')).filter(e => e.status !== 'deleted');
  await _refreshCustody();

  document.getElementById('export-custody-excel-btn').addEventListener('click', () => {
    exportRowsToExcel('سجل_العهد', _custodyExportColumns, _custodyExportRows);
  });
  document.getElementById('export-custody-pdf-btn').addEventListener('click', () => {
    exportRowsToPdf('سجل العهد', _custodyExportColumns, _custodyExportRows);
  });
});

const _custodyExportColumns = [
  { key: 'custodyNumber', label: 'رقم العهدة' },
  { key: 'dateLabel', label: 'التاريخ' },
  { key: 'employeeName', label: 'الموظف' },
  { key: 'typeLabel', label: 'نوع العهدة' },
  { key: 'purpose', label: 'البيان' },
  { key: 'amountLabel', label: 'المبلغ/القيمة' },
  { key: 'settledLabel', label: 'المسدد' },
  { key: 'remainingLabel', label: 'المتبقي' },
  { key: 'statusLabel', label: 'الحالة' },
  { key: 'createdByUserName', label: 'أنشأها' },
];
let _custodyExportRows = [];

const _custodyLedgerExportColumns = [
  { key: 'employeeCode', label: 'كود الموظف' },
  { key: 'employeeName', label: 'اسم الموظف' },
  { key: 'debitLabel', label: 'مدين (إجمالي العهد)' },
  { key: 'creditLabel', label: 'دائن (إجمالي التصفيات)' },
  { key: 'balanceLabel', label: 'الرصيد' },
];
let _custodyLedgerExportRows = [];

async function _refreshCustody() {
  _allCustodyCache = await getAllCustodyItems();
  _drawCustody();
  _drawCustodyLedgerSummary();
  _drawCustodyLedger();
}

function _employeeName(id) {
  const emp = _employeesForCustody.find(e => e.id === Number(id));
  return emp ? emp.fullName : 'موظف محذوف';
}

function _custodyLedgerRows() {
  const byEmployee = {};
  _allCustodyCache.forEach(item => {
    const key = Number(item.employeeId);
    if (!byEmployee[key]) byEmployee[key] = { debit: 0, credit: 0 };
    byEmployee[key].debit += Number(item.amount || 0);
    byEmployee[key].credit += Number(item.settledAmount || 0);
  });

  return Object.keys(byEmployee).map(employeeId => {
    const emp = _employeesForCustody.find(e => e.id === Number(employeeId));
    const debit = byEmployee[employeeId].debit;
    const credit = byEmployee[employeeId].credit;
    const balance = debit - credit;
    return {
      employeeId: Number(employeeId),
      employeeCode: emp ? emp.employeeCode : '-',
      employeeName: emp ? emp.fullName : 'موظف محذوف',
      debit, credit, balance,
      debitLabel: formatCurrency(debit),
      creditLabel: formatCurrency(credit),
      balanceLabel: `<strong style="color:${balance > 0.0001 ? '#8a5a10' : 'var(--color-primary-green-dark)'};">${formatCurrency(balance)}</strong>`,
      actionsHtml: `<a class="btn btn--outline" style="padding:4px 10px; font-size:12px;" href="employee-statement.html?employeeId=${employeeId}">كشف حساب</a>`,
    };
  });
}

function _drawCustodyLedgerSummary() {
  const container = document.getElementById('custody-ledger-summary');
  if (!container) return;
  const rows = _custodyLedgerRows();
  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const totalBalance = totalDebit - totalCredit;

  container.innerHTML = `
    <div class="kpi-card kpi-card--blue"><div><div class="kpi-card__value">${formatCurrency(totalDebit)}</div><div class="kpi-card__label">إجمالي العهد الممنوحة (مدين)</div></div></div>
    <div class="kpi-card kpi-card--green"><div><div class="kpi-card__value">${formatCurrency(totalCredit)}</div><div class="kpi-card__label">إجمالي التصفيات (دائن)</div></div></div>
    <div class="kpi-card kpi-card--red"><div><div class="kpi-card__value">${formatCurrency(totalBalance)}</div><div class="kpi-card__label">إجمالي الرصيد المتبقي</div></div></div>
  `;
}

function _drawCustodyLedger() {
  const rows = _custodyLedgerRows();
  _custodyLedgerExportRows = rows;
  renderDataTable('custody-ledger-table', [
    { key: 'employeeCode', label: 'كود الموظف', sortable: true },
    { key: 'employeeName', label: 'اسم الموظف', sortable: true },
    { key: 'debitLabel', label: 'مدين (إجمالي العهد)', sortable: false },
    { key: 'creditLabel', label: 'دائن (إجمالي التصفيات)', sortable: false },
    { key: 'balanceLabel', label: 'الرصيد', sortable: false },
    { key: 'actionsHtml', label: 'إجراءات', sortable: false },
  ], rows, { emptyMessage: 'لا توجد عهد مسجّلة بعد' });
}

function _statusBadgeHtml(item) {
  const status = getEffectiveCustodyStatus(item);
  const badgeClass = status === 'settled' ? 'badge--green'
    : status === 'partially_settled' ? 'badge--warning'
    : status === 'overdue' ? 'badge--red'
    : status === 'cancelled' ? 'badge--gray'
    : 'badge--blue';
  return `<span class="badge ${badgeClass}">${CUSTODY_STATUS_LABELS[status] || status}</span>`;
}

function _drawCustody() {
  const rows = _allCustodyCache.map(c => ({
    ...c,
    employeeName: _employeeName(c.employeeId),
    dateLabel: formatDateArabic(c.date || c.createdAt),
    typeLabel: CUSTODY_TYPE_LABELS[c.custodyType] || 'نقدية',
    purpose: c.purpose || c.description || '-',
    amountLabel: formatCurrency(c.amount),
    settledLabel: formatCurrency(c.settledAmount || 0),
    remainingLabel: formatCurrency(remainingCustodyAmount(c)),
    statusLabel: CUSTODY_STATUS_LABELS[getEffectiveCustodyStatus(c)] || '-',
    statusBadge: _statusBadgeHtml(c),
    createdByUserName: c.createdByUserName || '-',
    attachBtn: `<button type="button" class="btn btn--outline" style="padding:4px 10px; font-size:12px;" onclick="event.stopPropagation(); openAttachmentsModal('custody', ${c.id}, '${c.custodyNumber || c.reference || ''}')">📎 مرفقات</button>`,
  }));

  _custodyExportRows = rows;

  renderDataTable('custody-table', [
    { key: 'custodyNumber', label: 'رقم العهدة', sortable: true },
    { key: 'dateLabel', label: 'التاريخ', sortable: false },
    { key: 'employeeName', label: 'الموظف', sortable: true },
    { key: 'typeLabel', label: 'النوع', sortable: true },
    { key: 'purpose', label: 'البيان', sortable: false },
    { key: 'amountLabel', label: 'المبلغ/القيمة', sortable: false },
    { key: 'settledLabel', label: 'المسدد', sortable: false },
    { key: 'remainingLabel', label: 'المتبقي', sortable: false },
    { key: 'statusBadge', label: 'الحالة', sortable: false },
    { key: 'createdByUserName', label: 'أنشأها', sortable: false },
    { key: 'attachBtn', label: 'مرفقات', sortable: false },
  ], rows, {
    onRowClick: (row) => _openCustodyDetailsModal(row),
    emptyMessage: 'لا توجد عهد مسجّلة بعد',
  });
}

function _openCustodyDetailsModal(item) {
  const cash = isCashCustody(item);
  const status = getEffectiveCustodyStatus(item);
  // تصفية/تسوية عمليتا "تعديل" على العهدة (تُغيّران settledAmount/الحالة)، وإلغاء العهدة أقرب لـ"حذف" — نفس
  // مبدأ ربط عمليات التسوية بصلاحيات edit/delete المتّبع في باقي الوحدات
  const canCancel = hasActionPermission('custody', 'delete') && Number(item.settledAmount || 0) < 0.0001 && Number(item.settledQuantity || 0) < 0.0001 && status !== 'cancelled' && status !== 'settled';
  const canSettle = hasActionPermission('custody', 'edit') && status !== 'settled' && status !== 'cancelled';

  const html = `
    <div style="font-size:14px; line-height:2;">
      <div><strong>رقم العهدة:</strong> ${item.custodyNumber || item.reference || ('#' + item.id)}</div>
      <div><strong>التاريخ:</strong> ${formatDateArabic(item.date || item.createdAt)}</div>
      <div><strong>الموظف:</strong> ${_employeeName(item.employeeId)}</div>
      <div><strong>نوع العهدة:</strong> ${CUSTODY_TYPE_LABELS[item.custodyType] || 'نقدية'}</div>
      ${!cash ? `<div><strong>الصنف:</strong> ${item.serialNumber ? `رقم تسلسلي: ${item.serialNumber}` : ''} — الكمية: ${formatNumber(item.quantity)}</div>` : ''}
      <div><strong>الغرض:</strong> ${item.purpose || item.description || '-'}</div>
      <div><strong>القيمة الإجمالية:</strong> ${formatCurrency(item.amount)}</div>
      <div><strong>المسدد:</strong> ${formatCurrency(item.settledAmount || 0)}</div>
      <div><strong>المتبقي:</strong> ${formatCurrency(remainingCustodyAmount(item))}</div>
      <div><strong>الحالة:</strong> ${CUSTODY_STATUS_LABELS[status]}</div>
      ${item.expectedReturnDate ? `<div><strong>تاريخ الإرجاع المتوقع:</strong> ${formatDateArabic(item.expectedReturnDate)}</div>` : ''}
      <div><strong>أنشأها:</strong> ${item.createdByUserName || '-'}</div>
      ${item.notes ? `<div><strong>ملاحظات:</strong> ${item.notes}</div>` : ''}
    </div>
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top: var(--spacing-3); border-top:1px solid var(--color-border); padding-top: var(--spacing-3);">
      ${canSettle ? `<a class="btn btn--success" href="custody-liquidate.html?custodyId=${item.id}">تصفية</a>` : ''}
      ${canSettle ? `<a class="btn btn--outline" href="custody-settle.html?custodyId=${item.id}">تسوية</a>` : ''}
      <button type="button" class="btn btn--outline" onclick="openAttachmentsModal('custody', ${item.id}, '${item.custodyNumber || item.reference || ''}')">📎 مرفقات</button>
      ${canCancel ? `<button type="button" class="btn btn--danger btn--sm" id="cancel-custody-btn">إلغاء العهدة</button>` : ''}
    </div>
  `;

  openModal(html, { title: 'تفاصيل العهدة', hideFooter: true });

  if (canCancel) {
    document.getElementById('cancel-custody-btn').addEventListener('click', () => {
      confirmDelete('هل أنت متأكد من إلغاء هذه العهدة؟ سيتم عكس أي قيد محاسبي أو حركة مخزون مرتبطة بها.', async () => {
        try {
          await cancelCustodyItem(item.id);
          showToast('تم إلغاء العهدة', 'success');
          closeModal();
          await _refreshCustody();
        } catch (err) {
          showToast(err.message || 'تعذّر إلغاء العهدة', 'error');
        }
      });
    });
  }
}
