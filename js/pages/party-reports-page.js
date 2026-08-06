// js/pages/party-reports-page.js
// تقارير العملاء والموردين: (1) سجل تفصيلي لعميل/مورّد واحد، (2) ترتيب أعلى العملاء/الموردين خلال فترة
// تُجمَّع المعاملات من مصدرين: Revenues/Purchases (تكويد فردي) + بنود بيع/شراء داخل BulkBatches (تكويد جماعي)

let _allRevenuesForReport = [];
let _allPurchasesForReport = [];
let _allBulkBatchesForReport = [];
let _allClientsForReport = [];
let _allSuppliersForReport = [];
let _reportMode = 'single';
let _currentExportColumns = null;
let _currentExportRows = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('reports');
  renderSidebar('reports');
  renderHeader('تقارير العملاء والموردين');

  _allRevenuesForReport = await getAllRevenues();
  _allPurchasesForReport = await getAllPurchases();
  _allBulkBatchesForReport = await getAllBulkBatches();
  _allClientsForReport = await getAllParties('client');
  _allSuppliersForReport = await getAllParties('supplier');

  document.getElementById('mode-single-btn').addEventListener('click', () => _switchMode('single'));
  document.getElementById('mode-top-btn').addEventListener('click', () => _switchMode('top'));

  document.getElementById('single-type').addEventListener('change', () => { _populateSinglePartySelect(); _renderSingleReport(); });
  document.getElementById('single-party').addEventListener('change', _renderSingleReport);
  document.getElementById('single-from').addEventListener('change', _renderSingleReport);
  document.getElementById('single-to').addEventListener('change', _renderSingleReport);

  document.getElementById('top-type').addEventListener('change', _renderTopReport);
  document.getElementById('top-from').addEventListener('change', _renderTopReport);
  document.getElementById('top-to').addEventListener('change', _renderTopReport);
  document.getElementById('top-n').addEventListener('input', _renderTopReport);

  document.getElementById('export-excel-btn').addEventListener('click', () => {
    const title = _reportMode === 'single' ? 'سجل عميل أو مورّد' : 'أعلى العملاء والموردين';
    if (_currentExportColumns) exportRowsToExcel(title, _currentExportColumns, _currentExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    const title = _reportMode === 'single' ? 'سجل عميل أو مورّد' : 'أعلى العملاء والموردين';
    if (_currentExportColumns) exportRowsToPdf(title, _currentExportColumns, _currentExportRows);
  });

  _populateSinglePartySelect();
  _renderSingleReport();
});

function _switchMode(mode) {
  _reportMode = mode;
  document.getElementById('mode-single-btn').classList.toggle('active', mode === 'single');
  document.getElementById('mode-top-btn').classList.toggle('active', mode === 'top');
  document.getElementById('single-filters').style.display = mode === 'single' ? '' : 'none';
  document.getElementById('top-filters').style.display = mode === 'top' ? '' : 'none';
  if (mode === 'single') _renderSingleReport(); else _renderTopReport();
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
  _allBulkBatchesForReport.forEach(b => {
    (b.saleLines || []).forEach(line => {
      if (line.partyId === partyId) {
        fromBulkSales.push({
          date: line.date,
          itemLabel: `${ANIMAL_TYPE_LABELS[line.type] || line.type} - ${line.breed} (${formatNumber(line.count)})`,
          amount: Number(line.count || 0) * Number(line.unitPrice || 0),
          sourceLabel: `بيع جماعي (${b.code})`,
        });
      }
    });
  });

  return [...fromRevenues, ...fromBulkSales].sort((a, b) => (a.date < b.date ? 1 : -1));
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
  _allBulkBatchesForReport.forEach(b => {
    (b.purchaseLines || []).forEach(line => {
      if (line.partyId === partyId) {
        fromBulkPurchases.push({
          date: b.purchaseDate,
          itemLabel: `${ANIMAL_TYPE_LABELS[line.type] || line.type} - ${line.breed} (${formatNumber(line.count)})`,
          amount: Number(line.count || 0) * Number(line.unitPrice || 0),
          sourceLabel: `شراء جماعي (${b.code})`,
        });
      }
    });
  });

  return [...fromPurchases, ...fromBulkPurchases].sort((a, b) => (a.date < b.date ? 1 : -1));
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
