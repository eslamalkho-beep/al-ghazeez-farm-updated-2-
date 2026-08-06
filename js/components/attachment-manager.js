// js/components/attachment-manager.js
// نافذة منبثقة عامة لعرض/رفع/حذف مرفقات الفواتير (صور/PDF) لأي سجل مصروف/إيراد/مشترى
// يتطلب تحميل modal.js وtoast.js وattachment-service.js قبل هذا الملف

const ATTACHMENT_MAX_SIZE = 10 * 1024 * 1024; // 10 ميجابايت

async function openAttachmentsModal(recordType, recordId, recordLabel) {
  openModal('<div id="attachments-modal-body">جارِ التحميل...</div>', {
    title: `مرفقات الفاتورة${recordLabel ? ' — ' + recordLabel : ''}`,
    hideFooter: true,
  });
  await _drawAttachmentsModal(recordType, recordId);
}

async function _drawAttachmentsModal(recordType, recordId) {
  const container = document.getElementById('attachments-modal-body');
  if (!container) return;

  const items = await getAttachmentsForRecord(recordType, recordId);

  const listHtml = items.length ? items.map(item => `
    <div class="attachment-item" style="display:flex; align-items:center; gap:10px; padding:10px; border:1px solid var(--color-border); border-radius: var(--radius-sm); margin-bottom:8px;">
      <div style="font-size:22px;">${(item.fileType || '').startsWith('image/') ? '🖼️' : '📄'}</div>
      <div style="flex:1; min-width:0;">
        <div style="font-weight:700; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.fileName}</div>
        <div style="font-size:12px; color:var(--color-text-secondary);">${_formatFileSize(item.fileSize)}</div>
      </div>
      <button type="button" class="btn btn--outline" onclick="_viewAttachment(${item.id})">عرض</button>
      <button type="button" class="btn btn--outline" onclick="_downloadAttachment(${item.id})">تنزيل</button>
      <button type="button" class="btn btn--outline" style="color: var(--color-primary-red); border-color: var(--color-primary-red);" onclick="_deleteAttachment(${item.id}, '${recordType}', ${recordId})">حذف</button>
    </div>
  `).join('') : '<div class="data-table-empty">لا توجد مرفقات بعد</div>';

  container.innerHTML = `
    <div id="attachments-list">${listHtml}</div>
    <div style="margin-top: var(--spacing-3); border-top: 1px solid var(--color-border); padding-top: var(--spacing-3);">
      <label style="font-size:13px; font-weight:700; display:block; margin-bottom:8px;">إرفاق فاتورة جديدة (صورة أو PDF، حتى 10 ميجابايت)</label>
      <input type="file" id="attachment-file-input" accept="image/*,.pdf" class="form-control" />
    </div>
  `;

  document.getElementById('attachment-file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > ATTACHMENT_MAX_SIZE) {
      showToast('حجم الملف كبير جدًا (الحد الأقصى 10 ميجابايت)', 'error');
      e.target.value = '';
      return;
    }
    await addAttachment(recordType, recordId, file);
    showToast('تم إرفاق الفاتورة', 'success');
    await _drawAttachmentsModal(recordType, recordId);
  });
}

async function _viewAttachment(id) {
  const item = await dbGet('Attachments', id);
  if (!item) return;
  const url = URL.createObjectURL(item.blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function _downloadAttachment(id) {
  const item = await dbGet('Attachments', id);
  if (!item) return;
  const url = URL.createObjectURL(item.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = item.fileName || 'invoice';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// يستخدم confirm الأصلي للمتصفح بدل openModal لتفادي تعارض نافذتين منبثقتين متداخلتين
// (المكوّن الحالي لا يدعم تكديس النوافذ — فتح نافذة تأكيد جديدة سيستبدل نافذة المرفقات نفسها)
async function _deleteAttachment(id, recordType, recordId) {
  if (!window.confirm('هل تريد حذف هذا المرفق؟')) return;
  await deleteAttachment(id);
  showToast('تم حذف المرفق', 'success');
  await _drawAttachmentsModal(recordType, recordId);
}

function _formatFileSize(bytes) {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
