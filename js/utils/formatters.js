// js/utils/formatters.js

function formatCurrency(amount) {
  const num = Number(amount) || 0;
  return `${num.toLocaleString('ar-EG')} ر.س`;
}

function formatNumber(num) {
  return Number(num || 0).toLocaleString('ar-EG');
}

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

function formatDateArabic(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  return `${formatNumber(d.getDate())} ${ARABIC_MONTHS[d.getMonth()]} ${formatNumber(d.getFullYear())}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// تاريخ + وقت بالعربي (مثال: "27 أغسطس 2026 - 03:45 م") — لسجلات تعتمد على التوقيت الدقيق لا اليوم فقط
// (سجل التدقيق حاليًا، انظر audit-log-page.js)، بعكس formatDateArabic أعلاه المخصص لحقول التاريخ اليومية العادية
function formatDateTimeArabic(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '-';
  let hours = d.getHours();
  const minutes = d.getMinutes();
  const period = hours >= 12 ? 'م' : 'ص';
  hours = hours % 12 || 12;
  const timeLabel = `${formatNumber(hours)}:${String(minutes).padStart(2, '0')} ${period}`;
  return `${formatDateArabic(isoStr)} - ${timeLabel}`;
}

// أفاتار دائري: صورة الموظف إن وُجدت (Employees.photoBase64)، وإلا الحرف الأول من اسمه على خلفية ثابتة —
// مشتركة بين employee-list-page.js ومحفظة عهد الموظف (employee-wallet-page.js)
function employeeAvatarHtml(emp, size = 40) {
  const initial = (emp?.fullName || '؟').trim().charAt(0);
  if (emp?.photoBase64) {
    return `<img src="${emp.photoBase64}" alt="${emp.fullName || ''}" style="width:${size}px; height:${size}px; border-radius:50%; object-fit:cover; flex-shrink:0;" />`;
  }
  return `<div style="width:${size}px; height:${size}px; border-radius:50%; background:var(--color-primary-green); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; flex-shrink:0; font-size:${Math.round(size * 0.45)}px;">${initial}</div>`;
}

const VAT_RATE = 0.15;

// المبلغ المُدخل دائمًا شامل الضريبة؛ في حالة وجود فاتورة ضريبية نستخرج المبلغ قبل الضريبة وقيمتها منه
function calculateTaxBreakdown(totalAmountIncludingTax) {
  const total = Number(totalAmountIncludingTax) || 0;
  const amountBeforeTax = Math.round((total / (1 + VAT_RATE)) * 100) / 100;
  const taxAmount = Math.round((total - amountBeforeTax) * 100) / 100;
  return { amountBeforeTax, taxAmount };
}

// يحسب عمر الحيوان من تاريخ الميلاد/الاقتناء حتى تاريخ نهاية (اليوم، أو تاريخ البيع/النفوق إن وُجد)
function calculateAgeLabel(birthDate, endDate) {
  if (!birthDate) return '-';
  const start = new Date(birthDate);
  const end = endDate ? new Date(endDate) : new Date();
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return '-';

  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  if (end.getDate() < start.getDate()) months -= 1;
  if (months < 0) { years -= 1; months += 12; }

  if (years <= 0 && months <= 0) return 'أقل من شهر';
  const parts = [];
  if (years > 0) parts.push(`${formatNumber(years)} سنة`);
  if (months > 0) parts.push(`${formatNumber(months)} شهر`);
  return parts.join(' و ');
}

// نفس منطق calculateAgeLabel لكن يُعيد رقم أشهر كامل واحد بدل نص — لاستخدامه في مقارنات/تنبيهات
// (مثل تنبيهات بلوغ سن معيّن في alerts-service.js). يُعيد null إن تعذّر الحساب
function calculateAgeInMonths(birthDate, endDate) {
  if (!birthDate) return null;
  const start = new Date(birthDate);
  const end = endDate ? new Date(endDate) : new Date();
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return null;

  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  return Math.max(0, months);
}
