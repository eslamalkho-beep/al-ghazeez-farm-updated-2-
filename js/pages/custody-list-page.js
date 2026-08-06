// js/pages/custody-list-page.js
// العهدة هنا عهدة نقدية (سلفة) للموظف: مرجع + مبلغ + وصف، مع إمكانية تسويتها بالكامل أو جزئيًا وإرجاء المتبقي

const CUSTODY_STATUS_LABELS = {
  open: 'غير مسوّاة',
  partially_settled: 'مسوّاة جزئيًا',
  settled: 'مسوّاة بالكامل',
};

let _allCustodyCache = [];
let _employeesForCustody = [];

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('custody');
  renderSidebar('custody');
  renderHeader('سجل العهد');

  _employeesForCustody = (await dbGetAll('Employees')).filter(e => e.status !== 'deleted');
  await _refreshCustody();
  await _checkStaleCustodyNotifications();

  document.getElementById('add-custody-btn').addEventListener('click', () => _openCustodyModal(null));

  document.getElementById('export-custody-excel-btn').addEventListener('click', () => {
    exportRowsToExcel('سجل_العهد', _custodyExportColumns, _custodyExportRows);
  });
  document.getElementById('export-custody-pdf-btn').addEventListener('click', () => {
    exportRowsToPdf('سجل العهد', _custodyExportColumns, _custodyExportRows);
  });
  document.getElementById('export-ledger-excel-btn').addEventListener('click', () => {
    exportRowsToExcel('كشف_حساب_العهد', _custodyLedgerExportColumns, _custodyLedgerExportRows);
  });
  document.getElementById('export-ledger-pdf-btn').addEventListener('click', () => {
    exportRowsToPdf('كشف حساب العهد حسب الموظف', _custodyLedgerExportColumns, _custodyLedgerExportRows);
  });
});

const _custodyExportColumns = [
  { key: 'reference', label: 'المرجع' },
  { key: 'dateLabel', label: 'التاريخ' },
  { key: 'employeeName', label: 'الموظف' },
  { key: 'amountLabel', label: 'المبلغ' },
  { key: 'settledLabel', label: 'المسدد' },
  { key: 'remainingLabel', label: 'المتبقي' },
  { key: 'statusBadge', label: 'الحالة' },
  { key: 'description', label: 'الوصف' },
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

// ينبّه على العهد المفتوحة منذ أكثر من 30 يومًا — يتفادى التكرار بعدم إعادة التنبيه لنفس العهدة
// إلا بعد مرور 30 يومًا أخرى على آخر تنبيه بشأنها
async function _checkStaleCustodyNotifications() {
  const STALE_MS = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const staleItems = _allCustodyCache.filter(c =>
    (c.status === 'open' || c.status === 'partially_settled') &&
    c.createdAt && (now - new Date(c.createdAt).getTime()) > STALE_MS
  );
  if (!staleItems.length) return;

  const existingNotifs = await getAllNotifications();
  const recentlyNotifiedIds = new Set(
    existingNotifs
      .filter(n => n.type === 'custody' && n.createdAt && (now - new Date(n.createdAt).getTime()) < STALE_MS)
      .map(n => n.relatedEntityId)
  );

  for (const item of staleItems) {
    if (recentlyNotifiedIds.has(item.id)) continue;
    const employeeName = _employeeName(item.employeeId);
    await createNotification({
      type: 'custody',
      title: 'عهدة مفتوحة منذ فترة طويلة',
      message: `عهدة "${item.reference}" للموظف ${employeeName} لا تزال غير مسوّاة بالكامل منذ أكثر من 30 يومًا`,
      relatedEntityId: item.id,
    });
  }
}

async function _refreshCustody() {
  const all = await dbGetAll('CustodyItems');
  _allCustodyCache = all.filter(c => c.status !== 'deleted');
  _drawCustody();
  _drawCustodyLedgerSummary();
  _drawCustodyLedger();
}

function _employeeName(id) {
  const emp = _employeesForCustody.find(e => e.id === Number(id));
  return emp ? emp.fullName : '-';
}

function _remainingAmount(item) {
  return Number(item.amount || 0) - Number(item.settledAmount || 0);
}

// يجمّع كل سجلات العهد حسب الموظف: مدين (إجمالي العهد الممنوحة) / دائن (إجمالي التصفيات) / الرصيد
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
      actionsHtml: balance > 0.0001
        ? `<button type="button" class="btn btn--outline" style="padding:4px 10px; font-size:12px;" onclick="_openBulkSettleModal(${Number(employeeId)})">تسوية شاملة</button>`
        : '-',
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

function _drawCustody() {
  const rows = _allCustodyCache.map(c => {
    const remaining = _remainingAmount(c);
    const badgeClass = c.status === 'settled' ? 'badge--green' : c.status === 'partially_settled' ? 'badge--warning' : 'badge--blue';
    return {
      ...c,
      employeeName: _employeeName(c.employeeId),
      dateLabel: formatDateArabic(c.date || c.createdAt),
      amountLabel: formatCurrency(c.amount),
      settledLabel: formatCurrency(c.settledAmount || 0),
      remainingLabel: formatCurrency(remaining),
      statusBadge: `<span class="badge ${badgeClass}">${CUSTODY_STATUS_LABELS[c.status] || CUSTODY_STATUS_LABELS.open}</span>`,
    };
  });

  _custodyExportRows = rows;

  renderDataTable('custody-table', [
    { key: 'reference', label: 'المرجع', sortable: true },
    { key: 'dateLabel', label: 'التاريخ', sortable: false },
    { key: 'employeeName', label: 'الموظف', sortable: true },
    { key: 'amountLabel', label: 'المبلغ', sortable: false },
    { key: 'settledLabel', label: 'المسدد', sortable: false },
    { key: 'remainingLabel', label: 'المتبقي', sortable: false },
    { key: 'statusBadge', label: 'الحالة', sortable: false },
    { key: 'description', label: 'الوصف', sortable: false },
  ], rows, {
    onRowClick: (row) => _openCustodyModal(row),
    emptyMessage: 'لا توجد عهد مسجّلة بعد',
  });
}

function _openCustodyModal(item) {
  const isEdit = !!item;
  if (!_employeesForCustody.length) {
    showToast('أضف موظفًا أولًا قبل تسجيل عهدة', 'warning');
    return;
  }

  const remaining = isEdit ? _remainingAmount(item) : 0;
  const isFullySettled = isEdit && item.status === 'settled';

  const html = `
    <form id="custody-modal-form" class="form-grid">
      <div class="form-group">
        <label>اسم الموظف <span class="required">*</span></label>
        <select id="m-employeeId" class="form-control" ${isFullySettled ? 'disabled' : ''}>
          ${_employeesForCustody.map(e => `<option value="${e.id}" ${item?.employeeId === e.id ? 'selected' : ''}>${e.fullName}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>المرجع <span class="required">*</span></label>
        <input type="text" id="m-reference" class="form-control" value="${item?.reference || ''}" placeholder="مثال: REF-2026-001" ${isFullySettled ? 'disabled' : ''} />
      </div>
      <div class="form-group">
        <label>تاريخ العهدة <span class="required">*</span></label>
        <input type="date" id="m-date" class="form-control" value="${item?.date || todayIso()}" ${isFullySettled ? 'disabled' : ''} />
      </div>
      <div class="form-group">
        <label>المبلغ <span class="required">*</span></label>
        <input type="number" id="m-amount" class="form-control" value="${item?.amount ?? ''}" min="0" step="0.01" ${isFullySettled ? 'disabled' : ''} />
      </div>
      <div class="form-group">
        <label>الوصف</label>
        <input type="text" id="m-description" class="form-control" value="${item?.description || ''}" ${isFullySettled ? 'disabled' : ''} />
      </div>

      ${isEdit ? `
      <div class="form-group form-group--full" style="border-top:1px solid var(--color-border); padding-top: var(--spacing-3);">
        <label style="margin-bottom:6px;">حالة التسوية</label>
        <div style="display:flex; gap: var(--spacing-3); font-size:13px; margin-bottom: ${isFullySettled ? '0' : '10px'};">
          <span>المسدد سابقًا: <strong>${formatCurrency(item.settledAmount || 0)}</strong></span>
          <span>المتبقي: <strong style="color: var(--color-primary-red);">${formatCurrency(remaining)}</strong></span>
        </div>
        ${!isFullySettled ? `
        <div style="display:flex; gap:8px; align-items:flex-end;">
          <div style="flex:1;">
            <label for="m-settleAmount" style="font-size:12px;">مبلغ التسوية الآن</label>
            <input type="number" id="m-settleAmount" class="form-control" min="0" max="${remaining}" step="0.01" placeholder="0" />
          </div>
          <button type="button" class="btn btn--success" id="settle-btn">تسوية</button>
        </div>
        <p style="font-size:11.5px; color: var(--color-text-secondary); margin-top:6px;">
          يمكنك تسوية كامل المبلغ أو جزء منه فقط — الباقي يبقى مسجّلاً كعهدة قائمة يمكن تسويته لاحقًا.
        </p>` : `<p style="font-size:12.5px; color: var(--color-primary-green-dark);">✔ تمت تسوية هذه العهدة بالكامل</p>`}
      </div>` : ''}

      ${isEdit ? `
      <div class="form-group form-group--full" style="border-top:1px solid var(--color-border); padding-top: var(--spacing-3);">
        <button type="button" class="btn btn--danger btn--sm" id="delete-custody-btn">حذف هذه العهدة</button>
      </div>` : ''}
    </form>
  `;

  openModal(html, {
    title: isEdit ? 'تفاصيل العهدة' : 'تكويد عهدة جديدة',
    confirmLabel: isFullySettled ? 'إغلاق' : 'حفظ',
    hideFooter: isFullySettled,
    onConfirm: async () => {
      if (isFullySettled) { closeModal(); return; }

      const employeeId = Number(document.getElementById('m-employeeId').value);
      const reference = document.getElementById('m-reference').value.trim();
      const date = document.getElementById('m-date').value;
      const amount = Number(document.getElementById('m-amount').value || 0);
      const description = document.getElementById('m-description').value.trim();

      if (!isRequired(reference) || !isRequired(date) || !isPositiveNumber(amount) || amount <= 0) {
        showToast('يرجى إدخال المرجع والتاريخ والمبلغ بشكل صحيح', 'error');
        return;
      }

      const data = { employeeId, reference, date, amount, description };

      if (isEdit) {
        await dbUpdate('CustodyItems', item.id, data);
      } else {
        await dbAdd('CustodyItems', { ...data, settledAmount: 0, status: 'open' });
      }
      showToast('تم الحفظ بنجاح', 'success');
      closeModal();
      await _refreshCustody();
    },
  });

  if (isEdit && !isFullySettled) {
    document.getElementById('settle-btn').addEventListener('click', async () => {
      const input = document.getElementById('m-settleAmount');
      const settleNow = Number(input.value || 0);

      if (!settleNow || settleNow <= 0) {
        showToast('أدخل مبلغ تسوية أكبر من صفر', 'error');
        return;
      }
      if (settleNow > remaining + 0.0001) {
        showToast('مبلغ التسوية أكبر من المتبقي', 'error');
        return;
      }

      const newSettledAmount = Number(item.settledAmount || 0) + settleNow;
      const newRemaining = Number(item.amount) - newSettledAmount;
      const newStatus = newRemaining <= 0.0001 ? 'settled' : 'partially_settled';

      await dbUpdate('CustodyItems', item.id, { settledAmount: newSettledAmount, status: newStatus });

      showToast(
        newStatus === 'settled' ? 'تمت تسوية العهدة بالكامل' : `تمت تسوية ${formatCurrency(settleNow)}، والمتبقي ${formatCurrency(newRemaining)} تم إرجاؤه`,
        'success'
      );
      closeModal();
      await _refreshCustody();
    });
  }

  if (isEdit) {
    document.getElementById('delete-custody-btn').addEventListener('click', () => {
      confirmDelete('هل أنت متأكد من حذف هذه العهدة؟ لا يمكن التراجع عن هذا الإجراء.', async () => {
        await dbSoftDelete('CustodyItems', item.id);
        showToast('تم حذف العهدة', 'success');
        await _refreshCustody();
      });
    });
  }
}

// تسوية شاملة: تسوي دفعة واحدة أكثر من عهدة قائمة لنفس الموظف (مفيدة للمبالغ الصغيرة المتبقية من عدة عهد معًا)
function _openBulkSettleModal(employeeId) {
  const items = _allCustodyCache.filter(c => Number(c.employeeId) === Number(employeeId) && c.status !== 'settled');
  if (!items.length) {
    showToast('لا توجد عهد قائمة لهذا الموظف لتسويتها', 'warning');
    return;
  }

  const emp = _employeesForCustody.find(e => e.id === Number(employeeId));
  const totalRemaining = items.reduce((s, item) => s + _remainingAmount(item), 0);

  const rowsHtml = items.map(item => {
    const remaining = _remainingAmount(item);
    return `
      <tr data-item-id="${item.id}" data-remaining="${remaining}">
        <td><input type="checkbox" class="bulk-settle-check" checked /></td>
        <td>${item.reference}</td>
        <td>${formatCurrency(item.amount)}</td>
        <td>${formatCurrency(remaining)}</td>
        <td><input type="number" class="form-control bulk-settle-amount" min="0" max="${remaining}" step="0.01" value="${remaining}" style="max-width:110px;" /></td>
      </tr>
    `;
  }).join('');

  const html = `
    <p style="font-size:13px; color: var(--color-text-secondary); margin-bottom:10px;">
      تسوية أكثر من عهدة دفعة واحدة للموظف <strong>${emp ? emp.fullName : ''}</strong>. الافتراضي تسوية كامل المتبقي لكل عهدة محدَّدة — يمكنك تعديل المبلغ أو إلغاء تحديد أي عهدة قبل التنفيذ.
    </p>
    <div style="overflow-x:auto;">
      <table class="data-table">
        <thead>
          <tr><th></th><th>المرجع</th><th>المبلغ</th><th>المتبقي</th><th>مبلغ التسوية الآن</th></tr>
        </thead>
        <tbody id="bulk-settle-rows">${rowsHtml}</tbody>
      </table>
    </div>
    <p style="margin-top:10px; font-size:14px;">إجمالي التسوية المحددة: <strong id="bulk-settle-total">${formatCurrency(totalRemaining)}</strong></p>
  `;

  openModal(html, {
    title: 'تسوية شاملة للعهد',
    confirmLabel: 'تنفيذ التسوية',
    onConfirm: async () => {
      const rows = document.querySelectorAll('#bulk-settle-rows tr');
      const updates = [];
      let hasError = false;

      rows.forEach(tr => {
        if (!tr.querySelector('.bulk-settle-check').checked) return;
        const remaining = Number(tr.dataset.remaining);
        const settleNow = Number(tr.querySelector('.bulk-settle-amount').value || 0);
        if (settleNow <= 0) return;
        if (settleNow > remaining + 0.0001) { hasError = true; return; }
        updates.push({ itemId: Number(tr.dataset.itemId), settleNow });
      });

      if (hasError) {
        showToast('يوجد مبلغ تسوية أكبر من المتبقي في إحدى العهد المحددة', 'error');
        return;
      }
      if (!updates.length) {
        showToast('حدد عهدة واحدة على الأقل بمبلغ تسوية أكبر من صفر', 'error');
        return;
      }

      for (const u of updates) {
        const item = _allCustodyCache.find(c => c.id === u.itemId);
        const newSettledAmount = Number(item.settledAmount || 0) + u.settleNow;
        const newRemaining = Number(item.amount) - newSettledAmount;
        const newStatus = newRemaining <= 0.0001 ? 'settled' : 'partially_settled';
        await dbUpdate('CustodyItems', u.itemId, { settledAmount: newSettledAmount, status: newStatus });
      }

      const grandTotal = updates.reduce((s, u) => s + u.settleNow, 0);
      showToast(`تمت تسوية ${updates.length} عهدة بإجمالي ${formatCurrency(grandTotal)}`, 'success');
      closeModal();
      await _refreshCustody();
    },
  });

  document.querySelectorAll('#bulk-settle-rows .bulk-settle-check, #bulk-settle-rows .bulk-settle-amount').forEach(el => {
    el.addEventListener('input', _recalcBulkSettleTotal);
    el.addEventListener('change', _recalcBulkSettleTotal);
  });
}

function _recalcBulkSettleTotal() {
  let total = 0;
  document.querySelectorAll('#bulk-settle-rows tr').forEach(tr => {
    if (!tr.querySelector('.bulk-settle-check').checked) return;
    total += Number(tr.querySelector('.bulk-settle-amount').value || 0);
  });
  const totalEl = document.getElementById('bulk-settle-total');
  if (totalEl) totalEl.textContent = formatCurrency(total);
}
