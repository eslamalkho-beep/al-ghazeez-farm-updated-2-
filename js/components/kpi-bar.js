// js/components/kpi-bar.js
// بطاقات KPI موحّدة لكل صفحات التقارير — builder نصي بلا حالة داخلية (لا يحتاج حالة دائمة
// كـ data-table.js لأن كل صفحة تقرير تعيد بناء #report-content بالكامل عند كل تغيير فلتر)

// card: { value, label, tone: 'blue'|'green'|'red', icon?: string, href?: string, onclick?: string }
// إن وُجد href تُرسم كـ <a> حقيقية (قابلة لفتحها بتبويب جديد/Ctrl+Click) بدل <div> عادية
// onclick: لحالة الانتقال لتبويب داخلي بنفس الصفحة بدل رابط cross-page (مثال: تبديل تبويب فرعي)
function kpiCard(card) {
  const tone = card.tone || 'blue';
  const iconHtml = card.icon ? `<div class="kpi-card__icon">${card.icon}</div>` : '';
  const bodyHtml = `${iconHtml}<div><div class="kpi-card__value">${card.value}</div><div class="kpi-card__label">${card.label}</div></div>`;
  const isClickable = !!(card.href || card.onclick);
  const classes = `kpi-card kpi-card--${tone}${isClickable ? ' kpi-card--clickable' : ''}`;

  if (card.href) return `<a class="${classes}" href="${card.href}">${bodyHtml}</a>`;
  if (card.onclick) return `<div class="${classes}" onclick="${card.onclick}" role="button" tabindex="0">${bodyHtml}</div>`;
  return `<div class="${classes}">${bodyHtml}</div>`;
}

// يبني رابط drill-down من صفحة تقرير لصفحة قائمة مفلترة، متجاهلاً أي قيمة فارغة/null
function buildQueryUrl(path, params) {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return qs ? `${path}?${qs}` : path;
}

// columns: عدد الأعمدة الاختياري (افتراضيًا عدد البطاقات حتى 4) — لتفادي بطاقات متباعدة بشكل غير متساوٍ
// عند وجود أقل من 4 بطاقات في الصف، بنفس نمط تخصيص repeat(N,1fr) المستخدم سابقًا في كل صفحات التقارير
function kpiGrid(cards, columns) {
  const cols = columns || Math.min(cards.length, 4) || 1;
  const style = cols !== 4 ? ` style="grid-template-columns: repeat(${cols}, 1fr);"` : '';
  return `<div class="kpi-grid"${style}>${cards.map(kpiCard).join('')}</div>`;
}
