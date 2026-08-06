// js/pages/cash-transfer-page.js

let _allTransfersCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('accounting');
  renderSidebar('accounting');
  renderHeader('تحويل صندوق ↔ بنك');

  document.getElementById('date').value = todayIso();

  document.getElementById('transfer-form').addEventListener('submit', _handleSubmit);

  await _refreshTransferTable();
});

async function _handleSubmit(e) {
  e.preventDefault();

  const date = document.getElementById('date').value;
  const amount = document.getElementById('amount').value;

  const isValid = validateForm([
    { fieldId: 'date', validatorFn: isValidDate, message: 'التاريخ مطلوب' },
    { fieldId: 'amount', validatorFn: isPositiveNumber, message: 'أدخل مبلغًا صحيحًا' },
  ]);
  if (!isValid) return;

  const saveBtn = document.getElementById('save-transfer-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'جاري التنفيذ...';

  try {
    await createCashBankTransfer({
      date,
      direction: document.getElementById('direction').value,
      amount: Number(amount),
      notes: document.getElementById('notes').value.trim(),
    });
    showToast('تم تنفيذ التحويل بنجاح', 'success');
    document.getElementById('transfer-form').reset();
    document.getElementById('date').value = todayIso();
    await _refreshTransferTable();
  } catch (err) {
    showToast(err.message || 'حدث خطأ أثناء تنفيذ التحويل', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'تنفيذ التحويل';
  }
}

async function _refreshTransferTable() {
  _allTransfersCache = await getAllCashBankTransfers();

  const rows = _allTransfersCache.map(entry => {
    const total = (entry.lines || []).reduce((s, l) => s + Number(l.debit || 0), 0);
    return {
      dateLabel: formatDateArabic(entry.date),
      entryNumber: entry.entryNumber,
      description: entry.description.replace('تحويل صندوق↔بنك: ', ''),
      amountLabel: formatCurrency(total),
    };
  });

  renderDataTable('transfer-table', [
    { key: 'dateLabel', label: 'التاريخ', sortable: true },
    { key: 'entryNumber', label: 'رقم القيد', sortable: false },
    { key: 'description', label: 'الاتجاه/ملاحظات', sortable: false },
    { key: 'amountLabel', label: 'المبلغ', sortable: false },
  ], rows, {
    emptyMessage: 'لا توجد تحويلات مسجَّلة بعد',
  });
}
