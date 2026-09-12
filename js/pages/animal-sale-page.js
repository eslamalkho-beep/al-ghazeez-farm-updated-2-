// js/pages/animal-sale-page.js
// بوابة "بيع حيوان" — نظير herd/animal-purchase.html لكن للبيع: لا بيانات تُدار هنا، فقط اختيار نوع البيع
// (أصل من القطيع/تجارة من دفعة قائمة) ثم توجيه للنموذج المناسب.

document.addEventListener('DOMContentLoaded', () => {
  requireAuth('herd');
  renderSidebar('herd-sale');
  renderHeader('بيع حيوان');
});
