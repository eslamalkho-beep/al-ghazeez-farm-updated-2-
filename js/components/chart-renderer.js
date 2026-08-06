// js/components/chart-renderer.js
// غلاف موحّد فوق مكتبة Chart.js

const _chartInstances = {};

function _destroyExisting(canvasId) {
  if (_chartInstances[canvasId]) {
    _chartInstances[canvasId].destroy();
    delete _chartInstances[canvasId];
  }
}

function renderLineChart(canvasId, labels, datasets) {
  _destroyExisting(canvasId);
  const ctx = document.getElementById(canvasId).getContext('2d');
  _chartInstances[canvasId] = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: datasets.map(ds => ({ ...ds, tension: 0.35, fill: false })) },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', rtl: true } },
      scales: { y: { beginAtZero: true } },
    },
  });
}

function renderBarChart(canvasId, labels, datasets) {
  _destroyExisting(canvasId);
  const ctx = document.getElementById(canvasId).getContext('2d');
  _chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', rtl: true } },
      scales: { y: { beginAtZero: true } },
    },
  });
}

function renderPieChart(canvasId, labels, dataValues, colors) {
  _destroyExisting(canvasId);
  const ctx = document.getElementById(canvasId).getContext('2d');
  _chartInstances[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: dataValues,
        backgroundColor: colors || ['#1E5FBF', '#1E9E5A', '#D6362E', '#E8A93B', '#6B7280'],
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', rtl: true } },
    },
  });
}
