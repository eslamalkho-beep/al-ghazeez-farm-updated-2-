// js/pages/asset-count-page.js
// جرد دوري للأصول الثابتة (نمط StockCounts، بلا تسوية قيمة) — جلسة واحدة بصف لكل أصل نشط، توثيق فقط
// (باستثناء الأصول المكتشف نقلها فعليًا: تُحدَّث مواقعها تلقائيًا، انظر createFixedAssetCount)

let _assetsForCount = [];
let _locationsForCount = [];

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('assets');
  renderSidebar('assets-count');
  renderHeader('جرد الأصول الثابتة');

  const [assets, locations] = await Promise.all([getAllFixedAssets(), getAllLocations()]);
  _assetsForCount = assets.filter(a => a.assetStatus !== 'sold' && a.assetStatus !== 'disposed');
  _locationsForCount = locations;

  document.getElementById('date').value = todayIso();
  _renderLinesTable();
  document.getElementById('count-form').addEventListener('submit', _handleSubmit);

  await _renderHistory();
});

function _locationName(id) {
  return _locationsForCount.find(l => l.id === id)?.name || '-';
}

function _renderLinesTable() {
  const locationOptions = `<option value="">-- بلا تغيير --</option>` +
    _locationsForCount.map(l => `<option value="${l.id}">${l.name}</option>`).join('');

  const rows = _assetsForCount.map(a => `
    <tr data-asset-id="${a.id}">
      <td>${a.assetCode}</td>
      <td>${a.name}</td>
      <td>${FIXED_ASSET_TYPE_LABELS[a.assetType] || a.assetType}</td>
      <td>${_locationName(a.locationId)}</td>
      <td>
        <select class="form-control count-status-select" style="min-width:130px;">
          <option value="matched">مطابق</option>
          <option value="missing">مفقود</option>
          <option value="damaged">تالف</option>
          <option value="relocated">تم نقله</option>
        </select>
      </td>
      <td><select class="form-control count-location-select" style="min-width:150px; display:none;">${locationOptions}</select></td>
      <td><input type="text" class="form-control count-notes-input" placeholder="ملاحظات" /></td>
    </tr>
  `).join('');

  document.getElementById('count-lines-table').innerHTML = `
    <div style="overflow-x:auto;">
      <table class="data-table" style="width:100%;">
        <thead>
          <tr><th>الكود</th><th>اسم الأصل</th><th>النوع</th><th>الموقع المسجَّل</th><th>نتيجة الجرد</th><th>الموقع الفعلي (إن نُقل)</th><th>ملاحظات</th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="7">لا توجد أصول نشطة للجرد</td></tr>'}</tbody>
      </table>
    </div>
  `;

  document.querySelectorAll('.count-status-select').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const locationSelect = e.target.closest('tr').querySelector('.count-location-select');
      locationSelect.style.display = e.target.value === 'relocated' ? '' : 'none';
    });
  });
}

async function _handleSubmit(e) {
  e.preventDefault();
  if (!document.getElementById('date').value) {
    showToast('التاريخ مطلوب', 'error');
    return;
  }

  const lines = [];
  document.querySelectorAll('#count-lines-table tbody tr[data-asset-id]').forEach(row => {
    const assetId = Number(row.dataset.assetId);
    const resultStatus = row.querySelector('.count-status-select').value;
    const locationValue = row.querySelector('.count-location-select').value;
    const notes = row.querySelector('.count-notes-input').value.trim();
    lines.push({
      assetId, resultStatus,
      locationId: (resultStatus === 'relocated' && locationValue) ? Number(locationValue) : null,
      notes,
    });
  });

  if (!lines.length) {
    showToast('لا توجد أصول للجرد', 'error');
    return;
  }

  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'جاري الحفظ...';

  try {
    await createFixedAssetCount({
      date: document.getElementById('date').value,
      notes: document.getElementById('session-notes').value.trim(),
      lines,
    });
    showToast('تم حفظ جلسة الجرد بنجاح', 'success');
    saveBtn.disabled = false;
    saveBtn.textContent = 'حفظ الجرد';

    // إعادة تحميل الأصول (قد تكون مواقع بعضها تحدّثت تلقائيًا من أسطر "تم نقله") والتاريخ
    const [assets, locations] = await Promise.all([getAllFixedAssets(), getAllLocations()]);
    _assetsForCount = assets.filter(a => a.assetStatus !== 'sold' && a.assetStatus !== 'disposed');
    _locationsForCount = locations;
    _renderLinesTable();
    document.getElementById('session-notes').value = '';
    await _renderHistory();
  } catch (err) {
    showToast(err.message || 'حدث خطأ أثناء الحفظ', 'error');
    saveBtn.disabled = false;
    saveBtn.textContent = 'حفظ الجرد';
  }
}

async function _renderHistory() {
  const counts = await getAllFixedAssetCounts();
  const container = document.getElementById('count-history-table');
  if (!counts.length) {
    container.innerHTML = '<p style="padding:12px; color: var(--color-text-secondary);">لا توجد جلسات جرد سابقة</p>';
    return;
  }

  const rows = counts.map(c => {
    const summary = { matched: 0, missing: 0, damaged: 0, relocated: 0 };
    (c.lines || []).forEach(l => { if (summary[l.resultStatus] !== undefined) summary[l.resultStatus] += 1; });
    return {
      id: c.id,
      dateLabel: formatDateArabic(c.date),
      countLabel: formatNumber((c.lines || []).length),
      summaryLabel: `مطابق ${summary.matched} — مفقود ${summary.missing} — تالف ${summary.damaged} — منقول ${summary.relocated}`,
      byLabel: c.createdByUserName || '-',
      actionsHtml: `<button type="button" class="btn btn--outline" style="padding:4px 10px; font-size:12px;" onclick="_showCountDetail(${c.id})">التفاصيل</button>`,
    };
  });

  renderDataTable('count-history-table', [
    { key: 'dateLabel', label: 'التاريخ' },
    { key: 'countLabel', label: 'عدد الأصول المجرودة' },
    { key: 'summaryLabel', label: 'الملخّص' },
    { key: 'byLabel', label: 'بواسطة' },
    { key: 'actionsHtml', label: '' },
  ], rows, { searchable: false, pageSize: 15 });
}

async function _showCountDetail(countId) {
  const counts = await getAllFixedAssetCounts();
  const count = counts.find(c => c.id === countId);
  if (!count) return;

  const assetsById = Object.fromEntries(_assetsForCount.map(a => [a.id, a]));
  const rowsHtml = (count.lines || []).map(l => {
    const asset = assetsById[l.assetId];
    return `
      <tr>
        <td>${asset ? `${asset.assetCode} - ${asset.name}` : `أصل #${l.assetId}`}</td>
        <td>${FIXED_ASSET_COUNT_RESULT_LABELS[l.resultStatus] || l.resultStatus}</td>
        <td>${l.locationId ? _locationName(l.locationId) : '-'}</td>
        <td>${l.notes || '-'}</td>
      </tr>
    `;
  }).join('');

  openModal(`
    <h3 style="margin-bottom:12px;">تفاصيل جرد ${formatDateArabic(count.date)}</h3>
    <div style="overflow-x:auto; max-height:60vh; overflow-y:auto;">
      <table class="data-table" style="width:100%;">
        <thead><tr><th>الأصل</th><th>النتيجة</th><th>الموقع الفعلي</th><th>ملاحظات</th></tr></thead>
        <tbody>${rowsHtml || '<tr><td colspan="4">لا توجد أسطر</td></tr>'}</tbody>
      </table>
    </div>
    ${count.notes ? `<p style="margin-top:12px; font-size:13px;"><strong>ملاحظات عامة:</strong> ${count.notes}</p>` : ''}
  `, { hideFooter: true });
}
