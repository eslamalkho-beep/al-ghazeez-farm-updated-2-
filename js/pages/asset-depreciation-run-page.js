// js/pages/asset-depreciation-run-page.js
// صفحة "تشغيل إهلاك الفترة" اليدوية — بديل عن ترحيل تلقائي غير ممكن في تطبيق client-side بلا خادم/cron

let _previewRows = [];
let _previewPeriod = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('assets');
  renderSidebar('assets-depreciation');
  renderHeader('تشغيل إهلاك الفترة');

  const now = new Date();
  document.getElementById('period-input').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  document.getElementById('preview-btn').addEventListener('click', _handlePreview);
  document.getElementById('run-btn').addEventListener('click', _handleRun);

  await _renderHistory();
});

async function _handlePreview() {
  const period = document.getElementById('period-input').value;
  if (!period) {
    showToast('اختر شهرًا أولاً', 'error');
    return;
  }
  _previewPeriod = period;
  _previewRows = await previewDepreciationForPeriod(period);

  const card = document.getElementById('preview-card');
  const runBtn = document.getElementById('run-btn');
  card.style.display = '';

  if (!_previewRows.length) {
    document.getElementById('preview-table').innerHTML = '<p style="padding:12px; color: var(--color-text-secondary);">لا توجد أصول مستحقة إهلاكًا لهذا الشهر (إما لا يوجد أصول قابلة للإهلاك، أو سبق ترحيل هذا الشهر لكل الأصول)</p>';
    runBtn.style.display = 'none';
    return;
  }

  const total = _previewRows.reduce((s, r) => s + r.amount, 0);
  const rows = _previewRows.map(r => ({
    assetCode: r.asset.assetCode,
    name: r.asset.name,
    typeLabel: FIXED_ASSET_TYPE_LABELS[r.asset.assetType] || r.asset.assetType,
    amountLabel: formatCurrency(r.amount),
  }));

  renderDataTable('preview-table', [
    { key: 'assetCode', label: 'الكود' },
    { key: 'name', label: 'اسم الأصل' },
    { key: 'typeLabel', label: 'النوع' },
    { key: 'amountLabel', label: 'مبلغ الإهلاك' },
  ], rows, {
    searchable: false, pageSize: 50,
    footerRow: { assetCode: '', name: '', typeLabel: 'الإجمالي', amountLabel: formatCurrency(total) },
  });

  runBtn.style.display = '';
}

async function _handleRun() {
  if (!_previewRows.length || !_previewPeriod) return;
  const runBtn = document.getElementById('run-btn');
  runBtn.disabled = true;
  runBtn.textContent = 'جاري الترحيل...';

  try {
    const result = await runDepreciationForPeriod(_previewPeriod, null);
    showToast(`تم ترحيل إهلاك ${formatNumber(result.count)} أصلًا بإجمالي ${formatCurrency(result.totalAmount)}`, 'success');
    document.getElementById('preview-card').style.display = 'none';
    _previewRows = [];
    await _renderHistory();
  } catch (err) {
    showToast(err.message || 'حدث خطأ أثناء الترحيل', 'error');
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = 'ترحيل الإهلاك';
  }
}

async function _renderHistory() {
  const periods = await getDepreciationPeriodsSummary();
  if (!periods.length) {
    document.getElementById('history-table').innerHTML = '<p style="padding:12px; color: var(--color-text-secondary);">لا يوجد ترحيل إهلاك سابق</p>';
    return;
  }

  const rows = periods.map(p => ({
    period: p.period,
    countLabel: formatNumber(p.count),
    totalLabel: formatCurrency(p.totalAmount),
    actionsHtml: `<button type="button" class="btn btn--outline" style="padding:4px 10px; font-size:12px;" onclick="_handleReverse('${p.period}')">تراجع</button>`,
  }));

  renderDataTable('history-table', [
    { key: 'period', label: 'الشهر' },
    { key: 'countLabel', label: 'عدد الأصول' },
    { key: 'totalLabel', label: 'إجمالي الإهلاك' },
    { key: 'actionsHtml', label: '' },
  ], rows, { searchable: false, pageSize: 20 });
}

function _handleReverse(period) {
  confirmDelete(`هل أنت متأكد من التراجع عن ترحيل إهلاك شهر ${period}؟ سيُحذف القيد المحاسبي المرتبط ويُنقص من مجمع إهلاك كل أصل متأثر.`, async () => {
    try {
      await reverseDepreciationPeriod(period);
      showToast('تم التراجع بنجاح', 'success');
      await _renderHistory();
    } catch (err) {
      showToast(err.message || 'حدث خطأ أثناء التراجع', 'error');
    }
  });
}
