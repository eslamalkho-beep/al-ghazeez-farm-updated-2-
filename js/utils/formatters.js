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
