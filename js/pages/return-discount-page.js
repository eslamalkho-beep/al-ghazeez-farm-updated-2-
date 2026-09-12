// js/pages/return-discount-page.js
// صفحة إدارة كاملة للمرتجعات والخصومات (عملاء وموردين معًا)، مستقلة بالتنقل من القائمة الجانبية بدل نافذة
// منبثقة داخل كشف الحساب — append-only (بلا تعديل/حذف، بنفس مبدأ سندات القبض/الصرف)، كل سجل يُنشأ عبر
// createReturnOrDiscount في party-service.js: مرتجع/خصم مبيعات يقلّل رصيد العميل المدين علينا، ومرتجع/خصم
// مشتريات يقلّل الرصيد المستحق علينا للمورّد — وكلاهما يظهران تلقائيًا في كشف حساب الطرف (party-statement.html)

let _allClientsForReturnDiscount = [];
let _allSuppliersForReturnDiscount = [];
let _allRevenuesForReturnDiscount = [];
let _allPurchasesForReturnDiscount = [];
let _allPartyTransactionsForReturnDiscount = [];
let _rdExportColumns = [];
let _rdExportRows = [];

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('parties');
  renderSidebar('parties-return-discount');
  renderHeader('المرتجعات والخصومات');

  document.getElementById('date').value = todayIso();

  await _loadPartiesForReturnDiscount();

  document.getElementById('partyType').addEventListener('change', () => { _populatePartySelect(); _updateHints(); });
  document.getElementById('partyId').addEventListener('change', _updateHints);
  document.getElementById('opType').addEventListener('change', _updateHints);
  document.getElementById('return-discount-form').addEventListener('submit', _handleSubmit);

  document.getElementById('export-excel-btn').addEventListener('click', () => {
    exportRowsToExcel('المرتجعات_والخصومات', _rdExportColumns, _rdExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    exportRowsToPdf('سجل المرتجعات والخصومات', _rdExportColumns, _rdExportRows);
  });

  await _refreshReturnDiscountTable();
});

async function _loadPartiesForReturnDiscount() {
  [_allClientsForReturnDiscount, _allSuppliersForReturnDiscount, _allRevenuesForReturnDiscount, _allPurchasesForReturnDiscount, _allPartyTransactionsForReturnDiscount] = await Promise.all([
    getAllParties('client'), getAllParties('supplier'), getAllRevenues(), getAllPurchases(), getAllPartyTransactions(),
  ]);
  _populatePartySelect();
}

function _populatePartySelect() {
  const type = document.getElementById('partyType').value;
  const list = type === 'client' ? _allClientsForReturnDiscount : _allSuppliersForReturnDiscount;
  const select = document.getElementById('partyId');
  select.innerHTML = list.length
    ? `<option value="">-- اختر ${type === 'client' ? 'عميلاً' : 'مورّدًا'} --</option>` + list.map(p => `<option value="${p.id}">${p.name} (${p.partyCode || ''})</option>`).join('')
    : `<option value="">لا يوجد ${type === 'client' ? 'عملاء' : 'موردون'} مكوَّدون بعد</option>`;
  _updateHints();
}

function _currentSelectedParty() {
  const type = document.getElementById('partyType').value;
  const partyId = Number(document.getElementById('partyId').value);
  const list = type === 'client' ? _allClientsForReturnDiscount : _allSuppliersForReturnDiscount;
  return list.find(p => p.id === partyId) || null;
}

function _updateHints() {
  const hint = document.getElementById('party-balance-hint');
  const effectHint = document.getElementById('effect-hint');
  const party = _currentSelectedParty();
  const opType = document.getElementById('opType').value;
  const opLabel = PARTY_TRANSACTION_TYPE_LABELS[opType];

  if (!party) {
    hint.textContent = '';
    effectHint.textContent = '';
    return;
  }

  const balance = computePartyBalance(party, _allRevenuesForReturnDiscount, _allPurchasesForReturnDiscount, _allPartyTransactionsForReturnDiscount);
  if (balance > 0.01) {
    hint.textContent = `الرصيد الحالي: ${formatCurrency(balance)} مدين`;
  } else if (balance < -0.01) {
    hint.textContent = `الرصيد الحالي: ${formatCurrency(Math.abs(balance))} دائن`;
  } else {
    hint.textContent = 'الرصيد الحالي: صفر';
  }

  effectHint.textContent = party.type === 'client'
    ? `سيقلّل هذا الـ${opLabel} من رصيد "${party.name}" المدين علينا (ذمم العميل)، ومن إجمالي المبيعات الظاهر في التقارير.`
    : `سيقلّل هذا الـ${opLabel} من الرصيد المستحق علينا لـ"${party.name}" (ذمم المورّد)، ومن إجمالي المشتريات الظاهر في التقارير.`;
}

async function _handleSubmit(e) {
  e.preventDefault();

  const isValid = validateForm([
    { fieldId: 'partyId', validatorFn: isRequired, message: 'يرجى اختيار الطرف' },
    { fieldId: 'date', validatorFn: isValidDate, message: 'التاريخ مطلوب' },
    { fieldId: 'amount', validatorFn: isPositiveNumber, message: 'أدخل مبلغًا صحيحًا' },
  ]);
  if (!isValid) return;

  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'جاري الحفظ...';

  try {
    await createReturnOrDiscount({
      partyId: Number(document.getElementById('partyId').value),
      type: document.getElementById('opType').value,
      date: document.getElementById('date').value,
      amount: Number(document.getElementById('amount').value),
      description: document.getElementById('description').value.trim(),
    });

    showToast('تم الحفظ بنجاح', 'success');
    document.getElementById('return-discount-form').reset();
    document.getElementById('date').value = todayIso();
    await _loadPartiesForReturnDiscount();
    await _refreshReturnDiscountTable();
  } catch (err) {
    showToast(err.message || 'حدث خطأ أثناء الحفظ', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'حفظ';
  }
}

async function _refreshReturnDiscountTable() {
  const all = (await getAllPartyTransactions()).filter(t => t.type === 'return' || t.type === 'discount');
  const clients = _allClientsForReturnDiscount.length ? _allClientsForReturnDiscount : await getAllParties('client');
  const suppliers = _allSuppliersForReturnDiscount.length ? _allSuppliersForReturnDiscount : await getAllParties('supplier');
  const allParties = [...clients, ...suppliers];

  const rows = all.map(t => {
    const party = allParties.find(p => p.id === t.partyId);
    return {
      ...t,
      dateLabel: formatDateArabic(t.date),
      partyTypeLabel: party ? PARTY_TYPE_LABELS[party.type] : '-',
      partyName: party ? party.name : '-',
      typeLabel: PARTY_TRANSACTION_TYPE_LABELS[t.type] || t.type,
      amountLabel: formatCurrency(t.amount),
      attachBtn: `<button type="button" class="btn btn--outline btn--sm" onclick="event.stopPropagation(); openAttachmentsModal('partyTransaction', ${t.id}, '${t.voucherNumber}')">📎 مرفقات</button>`,
    };
  }).reverse();

  _rdExportColumns = [
    { key: 'voucherNumber', label: 'رقم السند' },
    { key: 'dateLabel', label: 'التاريخ' },
    { key: 'partyTypeLabel', label: 'نوع الطرف' },
    { key: 'partyName', label: 'الطرف' },
    { key: 'typeLabel', label: 'النوع' },
    { key: 'amountLabel', label: 'المبلغ' },
    { key: 'description', label: 'البيان' },
  ];
  _rdExportRows = rows;

  renderDataTable('return-discount-table', [
    { key: 'voucherNumber', label: 'رقم السند', sortable: true },
    { key: 'dateLabel', label: 'التاريخ', sortable: true },
    { key: 'partyTypeLabel', label: 'نوع الطرف', sortable: true },
    { key: 'partyName', label: 'الطرف', sortable: true },
    { key: 'typeLabel', label: 'النوع', sortable: false },
    { key: 'amountLabel', label: 'المبلغ', sortable: false },
    { key: 'description', label: 'البيان', sortable: false },
    { key: 'attachBtn', label: 'مرفقات', sortable: false },
  ], rows, {
    emptyMessage: 'لا توجد مرتجعات أو خصومات مسجّلة بعد',
  });
}
