// js/components/data-table.js
// جدول بيانات عام: بحث + فرز + ترقيم صفحات

const _dataTableState = {};

// columns: [{ key, label, sortable }]
// options: { pageSize, searchable, onRowClick, emptyMessage, footerRow }
// footerRow: كائن بنفس مفاتيح columns يُعرض كصف إجمالي ثابت أسفل الجدول (لا يتأثر بالبحث/الفرز/الترقيم)
function renderDataTable(containerId, columns, rows, options = {}) {
  const {
    pageSize = 10,
    searchable = true,
    onRowClick = null,
    emptyMessage = 'لا توجد بيانات لعرضها',
    footerRow = null,
  } = options;

  _dataTableState[containerId] = {
    columns, allRows: rows, options: { pageSize, searchable, onRowClick, emptyMessage, footerRow },
    currentPage: 1, sortKey: null, sortDir: 'asc', searchTerm: '',
  };

  _drawDataTable(containerId);
}

function _drawDataTable(containerId) {
  const state = _dataTableState[containerId];
  const container = document.getElementById(containerId);
  if (!container || !state) return;

  const { columns } = state;
  const { pageSize, searchable, onRowClick, emptyMessage, footerRow } = state.options;

  let rows = [...state.allRows];

  if (state.searchTerm) {
    const term = state.searchTerm.toLowerCase();
    rows = rows.filter(row => columns.some(col => String(row[col.key] ?? '').toLowerCase().includes(term)));
  }

  if (state.sortKey) {
    rows.sort((a, b) => {
      const va = a[state.sortKey], vb = b[state.sortKey];
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va > vb) return state.sortDir === 'asc' ? 1 : -1;
      if (va < vb) return state.sortDir === 'asc' ? -1 : 1;
      return 0;
    });
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  if (state.currentPage > totalPages) state.currentPage = totalPages;
  const startIdx = (state.currentPage - 1) * pageSize;
  const pageRows = rows.slice(startIdx, startIdx + pageSize);

  const headHtml = columns.map(col => `
    <th class="${col.sortable ? 'sortable' : ''}" data-key="${col.key}">
      ${col.label} ${state.sortKey === col.key ? (state.sortDir === 'asc' ? '▲' : '▼') : ''}
    </th>
  `).join('');

  const bodyHtml = pageRows.length ? pageRows.map((row, idx) => `
    <tr class="${onRowClick ? 'clickable' : ''}" data-row-index="${startIdx + idx}">
      ${columns.map(col => `<td>${row[col.key] ?? ''}</td>`).join('')}
    </tr>
  `).join('') : '';

  const paginationHtml = Array.from({ length: totalPages }, (_, i) => i + 1).map(p => `
    <button data-page="${p}" class="${p === state.currentPage ? 'active' : ''}">${p}</button>
  `).join('');

  const footHtml = footerRow ? `<tfoot><tr class="data-table-footer-row">${columns.map(col => `<td>${footerRow[col.key] ?? ''}</td>`).join('')}</tr></tfoot>` : '';

  container.innerHTML = `
    <div class="data-table-wrap">
      ${searchable ? `
      <div class="data-table-toolbar">
        <input type="text" class="data-table-search" placeholder="بحث..." value="${state.searchTerm}" />
        <span style="font-size:12px; color: var(--color-text-secondary);">${rows.length} سجل</span>
      </div>` : ''}
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr>${headHtml}</tr></thead>
          <tbody>${bodyHtml}</tbody>
          ${pageRows.length ? footHtml : ''}
        </table>
      </div>
      ${!pageRows.length ? `<div class="data-table-empty">${emptyMessage}</div>` : ''}
      ${totalPages > 1 ? `<div class="data-table-pagination">${paginationHtml}</div>` : ''}
    </div>
  `;

  if (searchable) {
    const searchInput = container.querySelector('.data-table-search');
    searchInput.addEventListener('input', (e) => {
      state.searchTerm = e.target.value;
      state.currentPage = 1;
      _drawDataTable(containerId);
    });
  }

  container.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortKey = key;
        state.sortDir = 'asc';
      }
      _drawDataTable(containerId);
    });
  });

  if (onRowClick) {
    container.querySelectorAll('tbody tr').forEach(tr => {
      tr.addEventListener('click', () => {
        const rowIndex = Number(tr.dataset.rowIndex);
        onRowClick(rows[rowIndex]);
      });
    });
  }

  container.querySelectorAll('.data-table-pagination button').forEach(btn => {
    btn.addEventListener('click', () => {
      state.currentPage = Number(btn.dataset.page);
      _drawDataTable(containerId);
    });
  });
}

// لتحديث بيانات الجدول بعد تعديل/حذف سجل دون إعادة تعريف الأعمدة
function updateDataTableRows(containerId, newRows, newFooterRow) {
  const state = _dataTableState[containerId];
  if (!state) return;
  state.allRows = newRows;
  if (newFooterRow !== undefined) state.options.footerRow = newFooterRow;
  _drawDataTable(containerId);
}
