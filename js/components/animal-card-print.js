// js/components/animal-card-print.js
// بطاقة حيوان قابلة للطباعة برمز QR — نفس فكرة exportRowsToPdf (نافذة جديدة + window.print()، بلا مكتبة PDF
// حقيقية) لكن لبطاقة واحدة بدل جدول. يتطلب تحميل مكتبة qrcodejs من CDN **قبل** هذا الملف، فقط في الصفحات
// التي تحتاجه (حاليًا herd-form.html فقط) — لا تحميل عام لكل الصفحات

function printAnimalCardWithQr(animal) {
  if (typeof QRCode === 'undefined') {
    showToast('تعذّر تحميل مكوّن رمز QR — تحقق من الاتصال بالإنترنت', 'error');
    return;
  }

  // نُولّد الـ QR في عنصر مخفي بالصفحة الحالية (لا داخل النافذة الجديدة) لتفادي الحاجة لإعادة تحميل مكتبة
  // qrcodejs هناك، ثم نستخرج الصورة الناتجة (data URL) وندمجها كـ <img> عادية داخل مستند النافذة الجديدة
  const hiddenHost = document.createElement('div');
  hiddenHost.style.cssText = 'position:fixed; left:-9999px; top:-9999px;';
  document.body.appendChild(hiddenHost);

  new QRCode(hiddenHost, {
    text: animal.code || String(animal.id),
    width: 180,
    height: 180,
    correctLevel: QRCode.CorrectLevel.M,
  });
  const qrImg = hiddenHost.querySelector('img');
  const qrDataUrl = qrImg ? qrImg.src : '';
  document.body.removeChild(hiddenHost);

  const typeLabel = (typeof ANIMAL_TYPE_LABELS !== 'undefined' && ANIMAL_TYPE_LABELS[animal.type]) || animal.type || '-';
  const genderLabel = (typeof ANIMAL_GENDER_LABELS !== 'undefined' && ANIMAL_GENDER_LABELS[animal.gender]) || animal.gender || '-';
  const ageLabel = (typeof calculateAgeLabel === 'function') ? calculateAgeLabel(animal.birthDate) : '-';

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    showToast('يرجى السماح بالنوافذ المنبثقة لطباعة البطاقة', 'error');
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8" />
      <title>بطاقة الحيوان — ${animal.code || ''}</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; padding: 24px; color: #1F2937; }
        .card { max-width: 380px; margin: 0 auto; border: 2px solid #1F2937; border-radius: 12px; padding: 20px; text-align: center; }
        .card h1 { font-size: 22px; margin: 0 0 4px; }
        .card .sub { color: #6B7280; font-size: 13px; margin-bottom: 16px; }
        .card img { width: 160px; height: 160px; margin: 0 auto 16px; display: block; }
        table { width: 100%; border-collapse: collapse; font-size: 13.5px; text-align: right; }
        table td { padding: 6px 4px; border-bottom: 1px solid #E5E7EB; }
        table td:first-child { color: #6B7280; width: 40%; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>${animal.code || ''}</h1>
        <div class="sub">مزرعة الغزيز</div>
        ${qrDataUrl ? `<img src="${qrDataUrl}" alt="QR" />` : ''}
        <table>
          <tr><td>النوع</td><td>${typeLabel}</td></tr>
          <tr><td>السلالة</td><td>${animal.breed || '-'}</td></tr>
          <tr><td>الجنس</td><td>${genderLabel}</td></tr>
          <tr><td>العمر</td><td>${ageLabel}</td></tr>
        </table>
      </div>
      <script>window.onload = () => setTimeout(() => window.print(), 200);<\/script>
    </body>
    </html>
  `);
  printWindow.document.close();
}
