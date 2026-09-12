// js/pages/animal-purchase-page.js
// بوابة "شراء حيوان" — لا بيانات تُدار هنا، فقط اختيار نوع الشراء (أصل/تجارة) ثم توجيه للنموذج المناسب
// (herd-form.html?source=purchased أو bulk-purchase-form.html). انظر ملاحظة transfer-service.js للتحويل بين الاثنين.

document.addEventListener('DOMContentLoaded', () => {
  requireAuth('herd');
  renderSidebar('herd-purchase');
  renderHeader('شراء حيوان جديد');
});
