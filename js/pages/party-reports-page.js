// js/pages/party-reports-page.js
// تقارير العملاء والموردين: (1) سجل تفصيلي لعميل/مورّد واحد، (2) ترتيب أعلى العملاء/الموردين خلال فترة
// تُجمَّع المعاملات من مصدرين: Revenues/Purchases (تكويد فردي) + بنود بيع/شراء عمليات الجملة المستقلة
// (BulkSaleBatches/BulkPurchaseBatches، تكويد جماعي)

let _allRevenuesForReport = [];
let _allPurchasesForReport = [];
let _allBulkPurchasesForReport = [];
let _allBulkSalesForReport = [];
let _allClientsForReport = [];
let _allSuppliersForReport = [];
let _allPartyTransactionsForReport = [];
let _reportMode = 'single';
let _currentExportColumns = null;
let _currentExportRows = null;

const _REPORT_MODE_TITLES = {
  single: 'سجل عميل أو مورّد', top: 'أعلى العملاء والموردين',
  registry: 'سجل الأرصدة', aging: 'أعمار الديون',
};

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('reports');
  renderSidebar('reports-party');
  renderHeader('تقارير العملاء والموردين');

  _allRevenuesForReport = await getAllRevenues();
  _allPurchasesForReport = await getAllPurchases();
  _allBulkPurchasesForReport = await getAllBulkPurchases();
  _allBulkSalesForReport = await getAllBulkSales();
  _allClientsForReport = await getAllParties('client');
  _allSuppliersForReport = await getAllParties('supplier');
  _allPartyTransactionsForReport = await getAllPartyTransactions();

  document.getElementById('mode-single-btn').addEventListener('click', () => _switchMode('single'));
  document.getElementById('mode-top-btn').addEventListener('click', () => _switchMode('top'));
  document.getElementById('mode-registry-btn').addEventListener('click', () => _switchMode('registry'));
  document.getElementById('mode-aging-btn').addEventListener('click', () => _switchMode('aging'));

  document.getElementById('single-type').addEventListener('change', () => { _populateSinglePartySelect(); _renderSingleReport(); });
  document.getElementById('single-party').addEventListener('change', _renderSingleReport);
  document.getElementById('single-from').addEventListener('change', _renderSingleReport);
  document.getElementById('single-to').addEventListener('change', _renderSingleReport);

  document.getElementById('top-type').addEventListener('change', _renderTopReport);
  document.getElementById('top-from').addEventListener('change', _renderTopReport);
  document.getElementById('top-to').addEventListener('change', _renderTopReport);
  document.getElementById('top-n').addEventListener('input', _renderTopReport);

  document.getElementById('registry-type').addEventListener('change', () => { _populateRegistryFilterSelect(); _renderRegistryReport(); });
  document.getElementById('registry-filter').addEventListener('change', _renderRegistryReport);

  document.getElementById('aging-type').addEventListener('change', _renderAgingReport);
  document.getElementById('aging-asof').addEventListener('change', _renderAgingReport);
  document.getElementById('aging-asof').value = todayIso();

  document.getElementById('export-excel-btn').addEventListener('click', () => {
    if (_currentExportColumns) exportRowsToExcel(_REPORT_MODE_TITLES[_reportMode], _currentExportColumns, _currentExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    if (_currentExportColumns) exportRowsToPdf(_REPORT_MODE_TITLES[_reportMode], _currentExportColumns, _currentExportRows);
  });

  _populateSinglePartySelect();
  _populateRegistryFilterSelect();
  _renderSingleReport();
});

function _switchMode(mode) {
  _reportMode = mode;
  document.getElementById('mode-single-btn').classList.toggle('active', mode === 'single');
  document.getElementById('mode-top-btn').classList.toggle('active', mode === 'top');
  document.getElementById('mode-registry-btn').classList.toggle('active', mode === 'registry');
  document.getElementById('mode-aging-btn').classList.toggle('active', mode === 'aging');
  document.getElementById('single-filters').style.display = mode === 'single' ? '' : 'none';
  document.getElementById('top-filters').style.display = mode === 'top' ? '' : 'none';
  document.getElementById('registry-filters').style.display = mode === 'registry' ? '' : 'none';
  document.getElementById('aging-filters').style.display = mode === 'aging' ? '' : 'none';

  if (mode === 'single') _renderSingleReport();
  else if (mode === 'top') _renderTopReport();
  else if (mode === 'registry') _renderRegistryReport();
  else _renderAgingReport();
}

function _populateRegistryFilterSelect() {
  const type = document.getElementById('registry-type').value;
  const select = document.getElementById('registry-filter');
  select.innerHTML = type === 'client'
    ? `<option value="all">الكل</option><option value="debtors">مدينون فقط</option><option value="overdue">متأخرون فقط</option>`
    : `<option value="all">الكل</option><option value="creditors">دائنون فقط</option><option value="overdue">مستحق سدادهم فقط</option>`;
}

function _populateSinglePartySelect() {
  const type = document.getElementById('single-type').value;
  const list = type === 'client' ? _allClientsForReport : _allSuppliersForReport;
  const select = document.getElementById('single-party');
  select.innerHTML = list.length
    ? list.map(p => `<option value="${p.id}">${p.name}</option>`).join('')
    : `<option value="">لا يوجد ${type === 'client' ? 'عملاء' : 'موردون'} مكوَّدون بعد</option>`;
}

// كل معاملات "بيع" لعميل معيّن: إيرادات مباشرة + بنود بيع داخل دفعات الجملة
function _clientTransactions(partyId) {
  const fromRevenues = _allRevenuesForReport
    .filter(r => r.partyId === partyId)
    .map(r => ({
      date: r.date,
      itemLabel: r.category,
      amount: Number(r.amount || 0),
      sourceLabel: 'بيع فردي',
    }));

  const fromBulkSales = [];
  _allBulkSalesForReport.forEach(sale => {
    (sale.lines || []).forEach(line => {
      if (line.partyId === partyId) {
        fromBulkSales.push({
          date: sale.date,
          itemLabel: `${ANIMAL_TYPE_LABELS[line.type] || line.type} - ${line.breed} (${formatNumber(line.count)})`,
          amount: Number(line.count || 0) * Number(line.unitPrice || 0),
          sourceLabel: `بيع جماعي (${sale.code})`,
        });
      }
    });
  });

  return [...fromRevenues, ...fromBulkSales].sort((a, b) => (a.date < b.date ? -1 : 1));
}

// كل معاملات "شراء" من مورّد معيّن: مشتريات فردية + بنود شراء داخل دفعات الجملة
function _supplierTransactions(partyId) {
  const fromPurchases = _allPurchasesForReport
    .filter(p => p.partyId === partyId)
    .map(p => ({
      date: p.date,
      itemLabel: p.category,
      amount: Number(p.amount || 0),
      sourceLabel: 'شراء فردي',
    }));

  const fromBulkPurchases = [];
  _allBulkPurchasesForReport.forEach(purchase => {
    (purchase.lines || []).forEach(line => {
      if (line.partyId === partyId) {
        fromBulkPurchases.push({
          date: purchase.date,
          itemLabel: `${ANIMAL_TYPE_LABELS[line.type] || line.type} - ${line.breed} (${formatNumber(line.count)})`,
          amount: Number(line.count || 0) * Number(line.unitPrice || 0),
          sourceLabel: `شراء جماعي (${purchase.code})`,
        });
      }
    });
  });

  return [...fromPurchases, ...fromBulkPurchases].sort((a, b) => (a.date < b.date ? -1 : 1));
}

function _renderSingleReport() {
  const type = document.getElementById('single-type').value;
  const partyIdValue = document.getElementById('single-party').value;
  const from = document.getElementById('single-from').value;
  const to = document.getElementById('single-to').value;
  const container = document.getElementById('report-content');

  if (!partyIdValue) {
    container.innerHTML = `<div class="empty-state">لا يوجد ${type === 'client' ? 'عملاء' : 'موردون'} مكوَّدون بعد. اذهب لصفحة "العملاء والموردون" لإضافة واحد.</div>`;
    _currentExportColumns = null;
    _currentExportRows = null;
    return;
  }

  const partyId = Number(partyIdValue);
  const party = (type === 'client' ? _allClientsForReport : _allSuppliersForReport).find(p => p.id === partyId);
  const allTx = type === 'client' ? _clientTransactions(partyId) : _supplierTransactions(partyId);
  const filtered = allTx.filter(tx => (!from || tx.date >= from) && (!to || tx.date <= to));

  const total = filtered.reduce((s, tx) => s + tx.amount, 0);
  const count = filtered.length;
  const avg = count ? total / count : 0;

  const rows = filtered.map(tx => ({
    dateLabel: formatDateArabic(tx.date),
    itemLabel: tx.itemLabel,
    amountLabel: formatCurrency(tx.amount),
    sourceLabel: tx.sourceLabel,
    date: tx.date,
    amount: tx.amount,
  }));

  container.innerHTML = `
    <div class="card" style="margin-bottom: var(--spacing-3);">
      <div class="card__header"><h3>${party ? party.name : ''} ${party?.category ? `— ${party.category}` : ''}</h3></div>
      <div style="padding: 0 var(--spacing-3) var(--spacing-3); font-size:13px; color: var(--color-text-secondary); display:flex; gap: var(--spacing-4); flex-wrap:wrap;">
        ${party?.phone ? `<span>📞 ${party.phone}</span>` : ''}
        ${party?.address ? `<span>📍 ${party.address}</span>` : ''}
        ${party?.locationUrl ? `<a href="${party.locationUrl}" target="_blank" rel="noopener">🔗 رابط الموقع</a>` : ''}
      </div>
    </div>
    ${kpiGrid([
      { value: formatCurrency(total), label: type === 'client' ? 'إجمالي المبيعات له' : 'إجمالي المشتريات منه', tone: type === 'client' ? 'green' : 'red', icon: '💰' },
      { value: formatNumber(count), label: 'عدد الطلبات/المعاملات', tone: 'blue', icon: '🧾' },
      { value: formatCurrency(avg), label: 'متوسط قيمة المعاملة', tone: 'blue', icon: '📊' },
    ])}
    <div id="single-party-table"></div>
  `;

  const columns = [
    { key: 'dateLabel', label: 'التاريخ', sortable: true },
    { key: 'itemLabel', label: 'النوع/الصنف', sortable: true },
    { key: 'amountLabel', label: 'المبلغ', sortable: false },
    { key: 'sourceLabel', label: 'المصدر', sortable: false },
  ];

  const footerRow = rows.length ? {
    dateLabel: 'الإجمالي',
    itemLabel: '',
    amountLabel: formatCurrency(total),
    sourceLabel: `${formatNumber(count)} معاملة`,
  } : null;

  _currentExportColumns = columns;
  _currentExportRows = footerRow ? [...rows, footerRow] : rows;

  renderDataTable('single-party-table', columns, rows, {
    emptyMessage: `لا توجد معاملات مسجّلة لـ "${party ? party.name : ''}" خلال هذه الفترة`,
    footerRow,
  });
}

function _renderTopReport() {
  const type = document.getElementById('top-type').value;
  const from = document.getElementById('top-from').value;
  const to = document.getElementById('top-to').value;
  const topN = Math.max(1, Number(document.getElementById('top-n').value) || 10);
  const container = document.getElementById('report-content');

  const parties = type === 'client' ? _allClientsForReport : _allSuppliersForReport;

  const summary = parties.map(party => {
    const allTx = type === 'client' ? _clientTransactions(party.id) : _supplierTransactions(party.id);
    const filtered = allTx.filter(tx => (!from || tx.date >= from) && (!to || tx.date <= to));
    const total = filtered.reduce((s, tx) => s + tx.amount, 0);
    return { party, total, count: filtered.length };
  })
    .filter(s => s.count > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, topN);

  const grandTotal = summary.reduce((s, r) => s + r.total, 0);

  const rows = summary.map((s, idx) => ({
    rankLabel: formatNumber(idx + 1),
    name: s.party.name,
    categoryLabel: s.party.category || '-',
    countLabel: formatNumber(s.count),
    totalLabel: formatCurrency(s.total),
    partyId: s.party.id,
    partyType: type,
  }));

  container.innerHTML = `
    ${kpiGrid([
      { value: formatCurrency(grandTotal), label: type === 'client' ? `إجمالي مبيعات أعلى ${topN} عملاء` : `إجمالي مشتريات أعلى ${topN} موردين`, tone: type === 'client' ? 'green' : 'red', icon: '💰' },
      { value: formatNumber(summary.length), label: `عدد ${type === 'client' ? 'العملاء' : 'الموردين'} الظاهرين`, tone: 'blue', icon: '👥' },
    ])}
    <div class="card" style="margin-bottom: var(--spacing-3);">
      <div class="card__header"><h3>${type === 'client' ? 'أعلى العملاء شراءً' : 'أعلى الموردين بيعًا'} خلال الفترة المحددة</h3></div>
      <div class="chart-box"><canvas id="top-parties-chart"></canvas></div>
    </div>
    <div id="top-parties-table"></div>
  `;

  renderBarChart('top-parties-chart', summary.map(s => s.party.name), [{
    label: 'الإجمالي (ر.س)',
    data: summary.map(s => s.total),
    backgroundColor: type === 'client' ? '#1E9E5A' : '#D6362E',
  }]);

  const columns = [
    { key: 'rankLabel', label: '#', sortable: false },
    { key: 'name', label: 'الاسم', sortable: true },
    { key: 'categoryLabel', label: 'التصنيف', sortable: true },
    { key: 'countLabel', label: 'عدد الطلبات', sortable: false },
    { key: 'totalLabel', label: 'الإجمالي', sortable: false },
  ];

  _currentExportColumns = columns;
  _currentExportRows = rows;

  renderDataTable('top-parties-table', columns, rows, {
    searchable: false,
    onRowClick: (row) => _drillIntoParty(row.partyId, row.partyType),
    emptyMessage: `لا توجد معاملات مسجّلة لأي ${type === 'client' ? 'عميل' : 'مورّد'} خلال هذه الفترة`,
  });
}

// الانتقال من ترتيب "أعلى العملاء/الموردين" إلى السجل التفصيلي لطرف واحد بنفس الفترة المحددة
function _drillIntoParty(partyId, type) {
  document.getElementById('single-type').value = type;
  _populateSinglePartySelect();
  document.getElementById('single-party').value = String(partyId);
  document.getElementById('single-from').value = document.getElementById('top-from').value;
  document.getElementById('single-to').value = document.getElementById('top-to').value;
  _switchMode('single');
}

// سجل الأرصدة (بنود 7/8 من الطلب): جدول لكل عملاء/موردين — الكود/الاسم/الجوال/عدد الفواتير/الإجمالي/
// المسدد أو المدفوع/المتبقي/الحالة — بفلتر سريع (الكل/مدينون أو دائنون/متأخرون أو مستحق سدادهم)
function _renderRegistryReport() {
  const type = document.getElementById('registry-type').value;
  const filter = document.getElementById('registry-filter').value;
  const container = document.getElementById('report-content');
  const parties = type === 'client' ? _allClientsForReport : _allSuppliersForReport;

  let summary = parties.map(party => {
    const s = getPartyRegistrySummary(party, _allRevenuesForReport, _allPurchasesForReport, _allPartyTransactionsForReport);
    const overdue = isPartyOverdue(party, _allRevenuesForReport, _allPurchasesForReport);
    return { party, ...s, overdue };
  });

  if (filter === 'debtors') summary = summary.filter(s => s.balance > 0.01);
  else if (filter === 'creditors') summary = summary.filter(s => s.balance < -0.01);
  else if (filter === 'overdue') summary = summary.filter(s => s.overdue);

  const totalOutstanding = summary.reduce((s, r) => s + Math.abs(r.balance), 0);

  const rows = summary.map(s => ({
    codeLabel: s.party.partyCode || '-',
    name: s.party.name,
    phoneLabel: s.party.phone || '-',
    invoiceCountLabel: formatNumber(s.invoiceCount),
    totalLabel: formatCurrency(s.totalAmount),
    settledLabel: formatCurrency(s.settledAmount),
    remainingLabel: `${formatCurrency(Math.abs(s.balance))} ${s.balance >= 0 ? 'مدين' : 'دائن'}${s.overdue ? ' ⏰' : ''}`,
    statusBadge: `<span class="badge ${(s.party.accountStatus || 'active') === 'active' ? 'badge--green' : 'badge--warning'}">${PARTY_ACCOUNT_STATUS_LABELS[s.party.accountStatus || 'active']}</span>`,
    partyId: s.party.id,
    partyType: type,
  }));

  container.innerHTML = `
    ${kpiGrid([
      { value: formatNumber(summary.length), label: `عدد ${type === 'client' ? 'العملاء' : 'الموردين'} الظاهرين`, tone: 'blue', icon: '👥' },
      { value: formatCurrency(totalOutstanding), label: 'إجمالي الأرصدة المفتوحة', tone: type === 'client' ? 'red' : 'green', icon: '💰' },
      { value: formatNumber(summary.filter(s => s.overdue).length), label: type === 'client' ? 'عملاء متأخرون' : 'موردون مستحق سدادهم', tone: 'red', icon: '⏰' },
    ])}
    <div id="registry-table"></div>
  `;

  const columns = [
    { key: 'codeLabel', label: 'الكود', sortable: true },
    { key: 'name', label: 'الاسم', sortable: true },
    { key: 'phoneLabel', label: 'الجوال', sortable: false },
    { key: 'invoiceCountLabel', label: 'عدد الفواتير', sortable: false },
    { key: 'totalLabel', label: type === 'client' ? 'إجمالي المبيعات' : 'إجمالي المشتريات', sortable: false },
    { key: 'settledLabel', label: type === 'client' ? 'المسدد (محصَّل)' : 'المسدد (مدفوع)', sortable: false },
    { key: 'remainingLabel', label: 'المتبقي', sortable: false },
    { key: 'statusBadge', label: 'الحالة', sortable: false },
  ];

  _currentExportColumns = columns;
  _currentExportRows = rows;

  renderDataTable('registry-table', columns, rows, {
    onRowClick: (row) => { window.location.href = `../parties/party-card.html?partyId=${row.partyId}&type=${row.partyType}`; },
    emptyMessage: `لا يوجد ${type === 'client' ? 'عملاء' : 'موردون'} يطابقون هذا الفلتر`,
  });
}

const _AGING_BUCKET_COLUMNS = [
  { key: 'current', label: 'لم يحن الاستحقاق' },
  { key: 'd30', label: '1-30 يوم' },
  { key: 'd60', label: '31-60 يوم' },
  { key: 'd90', label: '61-90 يوم' },
  { key: 'over90', label: 'أكثر من 90 يومًا' },
];

// أعمار الديون (تخصيص FIFO حقيقي عبر computeDebtAging في party-service.js) — تُبنى فقط من الفواتير الآجلة
// (نقدي/تحويل لا ينشئ دَينًا أصلاً، انظر توثيق Parties/PartyTransactions في CLAUDE.md)
function _renderAgingReport() {
  const type = document.getElementById('aging-type').value;
  const asOf = document.getElementById('aging-asof').value || todayIso();
  const container = document.getElementById('report-content');
  const parties = type === 'client' ? _allClientsForReport : _allSuppliersForReport;

  const summary = parties
    .map(party => ({ party, aging: computeDebtAging(party, _allRevenuesForReport, _allPurchasesForReport, _allPartyTransactionsForReport, asOf) }))
    .filter(s => s.aging.total > 0.01)
    .sort((a, b) => b.aging.total - a.aging.total);

  const totals = _AGING_BUCKET_COLUMNS.reduce((acc, c) => {
    acc[c.key] = summary.reduce((s, r) => s + r.aging[c.key], 0);
    return acc;
  }, {});
  const grandTotal = summary.reduce((s, r) => s + r.aging.total, 0);

  const rows = summary.map(s => ({
    name: s.party.name,
    codeLabel: s.party.partyCode || '-',
    current: formatCurrency(s.aging.current),
    d30: formatCurrency(s.aging.d30),
    d60: formatCurrency(s.aging.d60),
    d90: formatCurrency(s.aging.d90),
    over90: formatCurrency(s.aging.over90),
    totalLabel: formatCurrency(s.aging.total),
  }));

  container.innerHTML = `
    ${kpiGrid([
      { value: formatCurrency(grandTotal), label: type === 'client' ? 'إجمالي الديون المستحقة على العملاء' : 'إجمالي المستحق للموردين', tone: type === 'client' ? 'red' : 'green', icon: '💰' },
      { value: formatCurrency(totals.over90), label: 'أكثر من 90 يومًا (الأخطر)', tone: 'red', icon: '⏰' },
      { value: formatNumber(summary.length), label: `عدد ${type === 'client' ? 'العملاء' : 'الموردين'} المدينين`, tone: 'blue', icon: '👥' },
    ])}
    <div id="aging-table"></div>
  `;

  const columns = [
    { key: 'codeLabel', label: 'الكود', sortable: true },
    { key: 'name', label: 'الاسم', sortable: true },
    ..._AGING_BUCKET_COLUMNS.map(c => ({ key: c.key, label: c.label, sortable: false })),
    { key: 'totalLabel', label: 'الإجمالي', sortable: false },
  ];

  const footerRow = rows.length ? {
    codeLabel: 'الإجمالي', name: '',
    current: formatCurrency(totals.current), d30: formatCurrency(totals.d30), d60: formatCurrency(totals.d60),
    d90: formatCurrency(totals.d90), over90: formatCurrency(totals.over90),
    totalLabel: formatCurrency(grandTotal),
  } : null;

  _currentExportColumns = columns;
  _currentExportRows = footerRow ? [...rows, footerRow] : rows;

  renderDataTable('aging-table', columns, rows, {
    emptyMessage: `لا توجد ديون آجلة مستحقة على أي ${type === 'client' ? 'عميل' : 'مورّد'} كما في هذا التاريخ`,
    footerRow,
  });
}
