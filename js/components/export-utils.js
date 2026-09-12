// js/components/export-utils.js
// تصدير جداول البيانات إلى Excel (عبر مكتبة xlsx-js-style، البديل المجاني مفتوح المصدر لـ SheetJS الذي يدعم أيضًا كتابة
// تنسيق الخلايا cell.s — يُحمَّل من CDN بنفس اسم المتغير العام XLSX الذي كانت تستخدمه xlsx.full.min.js سابقًا، فلا تغيير مطلوب
// في هذا الملف عند الاستدعاء) أو PDF (عبر معاينة طباعة المتصفح)
// columns: [{ key, label }] — نفس شكل أعمدة renderDataTable، rows: نفس الصفوف المعروضة فعليًا في الجدول

// نسخة مصغّرة (Base64) من شعار مزرعة الغزيز، لظهورها في ترويسة كل صفحة PDF بدون الاعتماد على مسار ملف خارجي
const _EXPORT_LOGO_BASE64 = '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';

// اسم المزرعة وشعارها المخصّصان من settings-page.js (نفس مفتاح localStorage 'alGhazeezFarmSettings') —
// يُطبَّقان على ترويسة كل تصدير Excel/PDF بدل النص/الصورة الثابتين أعلاه؛ logoBase64 غائب = استخدام
// _EXPORT_LOGO_BASE64 كشعار افتراضي (نفس القراءة المكرَّرة الموجودة أيضًا في sidebar.js/login-page.js،
// انظر تعليق _sidebarGetFarmBranding في sidebar.js لتفسير سبب عدم مشاركتها عبر ملف service واحد)
function _exportGetFarmBranding() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem('alGhazeezFarmSettings') || '{}');
  } catch (e) {
    saved = {};
  }
  return {
    name: (saved.farmName && String(saved.farmName).trim()) || 'مزرعة الغزيز',
    logoDataUri: saved.logoBase64 || `data:image/jpeg;base64,${_EXPORT_LOGO_BASE64}`,
  };
}

const _EXPORT_ROWS_PER_PAGE = 18;

function _exportStripHtml(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (!str.includes('<')) return str;
  const div = document.createElement('div');
  div.innerHTML = str;
  return div.textContent || div.innerText || '';
}

// يضيف عمود تسلسل ("م") في بداية كل تصدير (Excel/PDF) برقم متتابع لكامل الصفوف المصدَّرة، دون التأثير على columns/rows الأصلية لدى الصفحة المستدعية
function _exportPrependSequence(columns, rows) {
  const seqColumn = { key: '__exportSeq', label: 'م' };
  const seqRows = rows.map((row, idx) => ({ ...row, __exportSeq: idx + 1 }));
  return { columns: [seqColumn, ...columns], rows: seqRows };
}

// meta (اختياري): { infoLines?: string[], reportTitle?: string }
// infoLines: أسطر إضافية تُعرض أسفل عنوان التقرير في ترويسة كل ورقة (مثل اسم العميل/المورّد أو الفترة المشمولة) — نفس الأسطر تظهر في PDF أيضًا (انظر exportSectionsToPdf)
// reportTitle: عنوان العرض داخل الورقة إن اختلف عن filename (الذي يحوي شرطات سفلية بدل المسافات لصلاحيته كاسم ملف)؛ الافتراضي إن غاب: filename بعد استبدال "_" بمسافة
function exportRowsToExcel(filename, columns, rows, meta) {
  exportSectionsToExcel(filename, [{ title: 'البيانات', columns, rows }], meta);
}

// نسخة متعددة الأقسام: كل قسم {title, columns, rows} يُصدَّر كورقة (sheet) منفصلة في نفس ملف الإكسل —
// تُستخدم في الصفحات التي تعرض أكثر من جدول وتريد تصديرها معًا بضغطة واحدة (مثل تقارير المخزون: الرصيد + سجل الحركات)
// ⚠️ يعتمد على مكتبة xlsx-js-style (بديل مجاني مفتوح المصدر لـ SheetJS، بنفس اجهة XLSX العامة + دعم إضافي لكتابة تنسيق الخلايا
// عبر cell.s — ميزة غير متوفرة في مكتبة SheetJS المجانية القياسية xlsx.full.min.js التي كانت مُحمَّلة سابقًا) — كل صفحة تستخدم
// هذا الملف يجب أن تُحمِّل xlsx-js-style من CDN بدل xlsx.full.min.js. تجميد الصف الأول (freeze header) غير متاح: ميزة SheetJS Pro
// المدفوعة حصريًا، لا بديل مجاني لها في أي مكتبة.
function exportSectionsToExcel(filename, sections, meta) {
  const infoLines = (meta && meta.infoLines) || [];
  const reportDateLabel = (typeof formatDateArabic === 'function' && typeof todayIso === 'function')
    ? formatDateArabic(todayIso())
    : new Date().toLocaleDateString('ar-EG');
  const reportTitle = (meta && meta.reportTitle) || filename.replace(/_/g, ' ');
  const farmBranding = _exportGetFarmBranding();

  const workbook = XLSX.utils.book_new();
  workbook.Workbook = { Views: [{ RTL: true }] };

  sections.forEach(section => {
    const { columns: allColumns, rows: allRows } = _exportPrependSequence(section.columns, section.rows);
    const colCount = allColumns.length;

    // كتلة ترويسة نصية أعلى كل ورقة (اسم المزرعة/عنوان التقرير/تاريخه/أسطر إضافية) — تُطابق ترويسة PDF بنفس المحتوى
    const headerBlock = [
      [farmBranding.name],
      [reportTitle],
      [`تاريخ التقرير: ${reportDateLabel}`],
      ...infoLines.map(line => [line]),
    ];
    if (section.title) headerBlock.push([section.title]);
    const columnHeaderRowIdx = headerBlock.length;

    const sheetData = [
      ...headerBlock,
      allColumns.map(c => c.label),
      ...allRows.map(row => allColumns.map(c => _exportStripHtml(row[c.key]))),
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
    worksheet['!cols'] = allColumns.map((c, idx) => ({ wch: idx === 0 ? 6 : 22 }));

    // دمج كل سطر من كتلة الترويسة عبر عرض الجدول كاملاً حتى لا يظهر منحصرًا في العمود الأول فقط
    worksheet['!merges'] = headerBlock.map((_line, rowIdx) => ({
      s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: Math.max(colCount - 1, 0) },
    }));

    // تنسيق كتلة الترويسة: اسم المزرعة وعنوان التقرير بخط أكبر وBold، بقية الأسطر (التاريخ/أسطر إضافية/عنوان القسم) عادية
    headerBlock.forEach((_line, rowIdx) => {
      const cell = worksheet[XLSX.utils.encode_cell({ r: rowIdx, c: 0 })];
      if (!cell) return;
      cell.s = { font: { bold: rowIdx <= 1, sz: rowIdx === 0 ? 14 : 12 }, alignment: { horizontal: 'center' } };
    });

    // تنسيق صف عناوين الأعمدة: خلفية خضراء + خط أبيض Bold (نفس هوية ترويسة PDF)
    for (let c = 0; c < colCount; c++) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: columnHeaderRowIdx, c })];
      if (!cell) continue;
      cell.s = {
        font: { bold: true, color: { rgb: 'FFFFFFFF' } },
        fill: { patternType: 'solid', fgColor: { rgb: 'FF2F6B3A' } },
        alignment: { horizontal: 'center' },
      };
    }

    // أسماء أوراق Excel محدودة بـ 31 حرفًا ولا تقبل الرموز \ / ? * [ ] :
    const sheetName = (section.title || 'البيانات').slice(0, 31).replace(/[\\/?*[\]:]/g, ' ');
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  });

  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

function _exportChunkRows(rows, size) {
  const chunks = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks.length ? chunks : [[]];
}

function _exportBuildReportHeader(title, reportDateLabel, infoLines) {
  const infoHtml = (infoLines && infoLines.length)
    ? infoLines.map(line => `<div class="report-header__info">${line}</div>`).join('')
    : '';
  const farmBranding = _exportGetFarmBranding();
  return `
    <div class="report-header">
      <img src="${farmBranding.logoDataUri}" alt="شعار ${farmBranding.name}" class="report-header__logo" />
      <div class="report-header__text">
        <div class="report-header__farm">${farmBranding.name}</div>
        <div class="report-header__title">${title}</div>
      </div>
      <div class="report-header__meta">
        <span class="report-header__date-badge">تاريخ التقرير: ${reportDateLabel}</span>
        ${infoHtml}
      </div>
    </div>
  `;
}

// meta (اختياري): { infoLines?: string[] } — أسطر إضافية (مثل اسم العميل/المورّد أو الفترة المشمولة بالتقرير) تُعرض أسفل تاريخ التقرير في الترويسة
function exportRowsToPdf(title, columns, rows, meta) {
  return exportSectionsToPdf(title, [{ title: null, columns, rows }], meta);
}

// ملف PDF فعلي يُنزَّل مباشرة بضغطة واحدة (بلا معاينة طباعة/حوار "حفظ كـ PDF" يدوي من المستخدم): كل ".report-page"
// (نفس بنية HTML/CSS المستخدمة سابقًا لمعاينة الطباعة) تُرسم مؤقتًا خارج الشاشة **داخل نفس مستند الصفحة الحالية**
// (لا نافذة/تبويب منفصل) عبر html2canvas (فيرث تلقائيًا خط Cairo المُحمَّل أصلاً لكل صفحات التطبيق من body، بلا
// أي انتظار/تحميل إضافي)، ثم تُلصَق كل لقطة كصفحة كاملة في مستند jsPDF واحد يُنزَّل عبر pdf.save(). هذا "تصوير"
// للـ HTML المُنسَّق فعليًا كما يظهر بالضبط (بما فيه العربي RTL) وليس نصًا حقيقيًا مُضمَّنًا بخط jsPDF — تفاديًا
// تمامًا لمشاكل تشكيل/اتجاه الخط العربي في مكتبات PDF النصية (نفس سبب تفادي jsPDF كمكتبة نص أصلاً)، على حساب
// حجم ملف أكبر قليلاً (صور JPEG) بدل نص متجهي — مقايضة مقصودة. يتطلب تحميل html2canvas وjsPDF من CDN قبل هذا
// الملف (`<script>` في كل صفحة تحمّل export-utils.js).
const _EXPORT_PDF_PAGE_CSS = `
  * { box-sizing: border-box; }
  .ghz-pdf-export-root { direction: rtl; color: #1F2937; background: #fff; font-family: 'Cairo', sans-serif; }
  .ghz-pdf-export-root .report-page {
    position: relative;
    width: 210mm;
    min-height: 297mm;
    padding: 12mm 14mm 14mm;
    display: flex;
    flex-direction: column;
    background: #fff;
  }
  .ghz-pdf-export-root .report-page::before {
    content: '';
    position: absolute;
    top: 0; right: 0; left: 0;
    height: 5mm;
    background: linear-gradient(90deg, #1E9E5A, #167A45);
  }
  .ghz-pdf-export-root .report-header {
    display: flex;
    align-items: center;
    gap: 14px;
    padding-bottom: 12px;
    margin-bottom: 16px;
    border-bottom: 3px solid #1E9E5A;
  }
  .ghz-pdf-export-root .report-header__logo {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
    border: 2px solid #1E9E5A;
  }
  .ghz-pdf-export-root .report-header__text { flex: 1; min-width: 0; }
  .ghz-pdf-export-root .report-header__farm { font-size: 19px; font-weight: 800; color: #167A45; }
  .ghz-pdf-export-root .report-header__title { font-size: 15px; font-weight: 700; color: #1F2937; margin-top: 4px; }
  .ghz-pdf-export-root .report-header__meta {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
  }
  .ghz-pdf-export-root .report-header__date-badge {
    display: inline-block;
    background: #EAF7EF;
    color: #167A45;
    font-size: 11px;
    font-weight: 700;
    padding: 4px 10px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .ghz-pdf-export-root .report-header__info { font-size: 11.5px; font-weight: 600; color: #6B7280; text-align: left; }
  .ghz-pdf-export-root .report-section-title {
    font-size: 13.5px;
    font-weight: 800;
    color: #167A45;
    background: #EAF7EF;
    border-right: 4px solid #1E9E5A;
    padding: 7px 12px;
    border-radius: 6px;
    margin-bottom: 10px;
  }
  .ghz-pdf-export-root .report-table-wrap {
    border: 1px solid #E5E7EB;
    border-radius: 8px;
    overflow: hidden;
  }
  .ghz-pdf-export-root table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  .ghz-pdf-export-root th {
    background: #1E9E5A;
    color: #fff;
    font-weight: 700;
    padding: 9px 8px;
    text-align: center;
    border-bottom: 1px solid #167A45;
  }
  .ghz-pdf-export-root td {
    padding: 7px 8px;
    text-align: right;
    border-bottom: 1px solid #EEF1F4;
    color: #1F2937;
  }
  .ghz-pdf-export-root th:first-child, .ghz-pdf-export-root td:first-child { text-align: center; width: 34px; }
  .ghz-pdf-export-root tbody tr:last-child td { border-bottom: none; }
  .ghz-pdf-export-root tbody tr:nth-child(even) { background: #F7F9FB; }
  .ghz-pdf-export-root .report-footer {
    margin-top: auto;
    padding-top: 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 10.5px;
    color: #6B7280;
    border-top: 1px solid #E5E7EB;
  }
  .ghz-pdf-export-root .report-footer__brand { font-weight: 700; color: #167A45; }
`;

// اسم ملف صالح لكل أنظمة التشغيل: يزيل الرموز الممنوعة في أسماء الملفات (title عربي بمسافات، لم يُصمَّم أصلاً
// كـ filename slug بعكس exportRowsToExcel التي تأخذ filename جاهزًا بشرطات سفلية — يبقى كما هو هنا لأن كل نقاط
// الاستدعاء الحالية (~40 موضعًا) تمرر عنوانًا نصيًا فقط)
function _exportSanitizeFilename(name) {
  return String(name || 'تقرير').replace(/[\\/:*?"<>|]/g, '-').trim() || 'تقرير';
}

function _exportInjectStyleOnce(doc, id, cssText) {
  if (doc.getElementById(id)) return;
  const styleEl = doc.createElement('style');
  styleEl.id = id;
  styleEl.textContent = cssText;
  doc.head.appendChild(styleEl);
}

// يرسم كل صفحة (عنصر واحد `.report-page`) خارج الشاشة داخل مستند التطبيق الحالي (لا نافذة/iframe منفصل — يرث
// بذلك خط Cairo وكل التنسيق العام فورًا بلا أي انتظار تحميل)، يلتقطها عبر html2canvas، ثم يضيفها صفحة مستقلة
// في مستند jsPDF بنفس أبعادها الفعلية المقاسة (getBoundingClientRect بوحدة px) — لا حجم A4 ثابت افتراضيًا، حتى
// لا يُقصّ أي محتوى تجاوز صفحة واحدة بأي فارق طفيف
async function _renderPagesToPdf(pageHtmlList) {
  if (typeof html2canvas !== 'function' || typeof window.jspdf === 'undefined') {
    throw new Error('تعذّر تحميل مكتبات إنشاء PDF (html2canvas/jsPDF) — تحقق من الاتصال بالإنترنت وأعد المحاولة');
  }

  const root = document.createElement('div');
  root.className = 'ghz-pdf-export-root';
  root.style.cssText = 'position:fixed; top:0; left:-100000px; z-index:-1;';
  document.body.appendChild(root);
  _exportInjectStyleOnce(document, 'ghz-pdf-export-style', _EXPORT_PDF_PAGE_CSS);

  const { jsPDF } = window.jspdf;
  let pdf = null;

  try {
    for (let i = 0; i < pageHtmlList.length; i++) {
      root.innerHTML = pageHtmlList[i];
      const pageEl = root.querySelector('.report-page');

      const canvas = await html2canvas(pageEl, { scale: 1.5, backgroundColor: '#ffffff', useCORS: true });
      const imgData = canvas.toDataURL('image/jpeg', 0.9);
      const pageWidth = Math.round(pageEl.getBoundingClientRect().width);
      const pageHeight = Math.round(pageEl.getBoundingClientRect().height);

      if (!pdf) {
        pdf = new jsPDF({ unit: 'px', format: [pageWidth, pageHeight] });
      } else {
        pdf.addPage([pageWidth, pageHeight]);
      }
      pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight);
    }
  } finally {
    document.body.removeChild(root);
  }

  return pdf;
}

// نسخة متعددة الأقسام: كل قسم {title, columns, rows} يُطبع بعنوان فرعي خاص به قبل جدوله —
// title الفارغ/null (الحالة الوحيدة لـ exportRowsToPdf أعلاه) يحافظ على نفس مخرجات الدالة الأصلية بالضبط (بلا عنوان فرعي/بلا تغيير في نص تذييل الصفحة)
async function exportSectionsToPdf(title, sections, meta) {
  const infoLines = (meta && meta.infoLines) || [];
  const reportDateLabel = (typeof formatDateArabic === 'function' && typeof todayIso === 'function')
    ? formatDateArabic(todayIso())
    : new Date().toLocaleDateString('ar-EG');

  const headerHtml = _exportBuildReportHeader(title, reportDateLabel, infoLines);
  const farmName = _exportGetFarmBranding().name;

  const pageHtmlList = [];
  sections.forEach(section => {
    const { columns: allColumns, rows: allRows } = _exportPrependSequence(section.columns, section.rows);
    const tableHead = allColumns.map(c => `<th>${c.label}</th>`).join('');
    const chunks = _exportChunkRows(allRows, _EXPORT_ROWS_PER_PAGE);

    chunks.forEach((chunkRows, idx) => {
      const tableBody = chunkRows.map(row => `<tr>${allColumns.map(c => `<td>${_exportStripHtml(row[c.key])}</td>`).join('')}</tr>`).join('');
      const pageLabel = section.title ? `${section.title} — صفحة ${idx + 1} من ${chunks.length}` : `صفحة ${idx + 1} من ${chunks.length}`;
      pageHtmlList.push(`
        <section class="report-page">
          ${headerHtml}
          ${section.title ? `<div class="report-section-title">${section.title}</div>` : ''}
          <div class="report-table-wrap">
            <table><thead><tr>${tableHead}</tr></thead><tbody>${tableBody}</tbody></table>
          </div>
          <div class="report-footer">
            <span class="report-footer__brand">${farmName}</span>
            <span>${pageLabel}</span>
          </div>
        </section>
      `);
    });
  });

  if (typeof showToast === 'function') showToast('جارٍ تجهيز ملف PDF...', 'info');

  try {
    const pdf = await _renderPagesToPdf(pageHtmlList);
    pdf.save(`${_exportSanitizeFilename(title)}.pdf`);
  } catch (err) {
    console.error(err);
    const message = (err && err.message) || 'تعذّر إنشاء ملف PDF';
    if (typeof showToast === 'function') showToast(message, 'error');
    else alert(message);
  }
}
