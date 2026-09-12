// js/pages/partner-capital-page.js
// ضخ فلوس (مساهمة) أو سحب فلوس بواسطة شريك — append-only (بلا تعديل/حذف، بنفس مبدأ CustodySettlements/
// PartyTransactions الأخرى)، كل حركة تُنشئ قيدًا محاسبيًا تلقائيًا عبر createCapitalTransaction في
// party-service.js (مدين/دائن الصندوق أو البنك، مقابل حساب "جاري الشريك" — انظر CLAUDE.md)

let _allPartnersForCapital = [];
let _allRevenuesForCapital = [];
let _allPurchasesForCapital = [];
let _allPartyTransactionsForCapital = [];
let _allFixedAssetsForCapital = [];
let _capitalExportColumns = [];
let _capitalExportRows = [];

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('parties');
  renderSidebar('parties-partner-capital');
  renderHeader('ضخ/سحب فلوس (جاري الشريك)');

  document.getElementById('date').value = todayIso();

  await _loadPartners();

  document.getElementById('partyId').addEventListener('change', _updateBalanceHint);
  document.getElementById('capital-form').addEventListener('submit', _handleSubmit);

  document.getElementById('export-excel-btn').addEventListener('click', () => {
    exportRowsToExcel('حركات_جاري_الشريك', _capitalExportColumns, _capitalExportRows);
  });
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    exportRowsToPdf('حركات جاري الشريك', _capitalExportColumns, _capitalExportRows);
  });

  await _refreshTable();
});

async function _loadPartners() {
  [_allPartnersForCapital, _allRevenuesForCapital, _allPurchasesForCapital, _allPartyTransactionsForCapital, _allFixedAssetsForCapital] = await Promise.all([
    getAllParties('partner'), getAllRevenues(), getAllPurchases(), getAllPartyTransactions(), getAllFixedAssets(),
  ]);
  const select = document.getElementById('partyId');
  select.innerHTML = _allPartnersForCapital.length
    ? `<option value="">-- اختر شريكًا --</option>` + _allPartnersForCapital.map(p => `<option value="${p.id}">${p.name} (${p.partyCode || ''})</option>`).join('')
    : `<option value="">لا يوجد شركاء مكوَّدون بعد</option>`;
  _updateBalanceHint();
}

function _updateBalanceHint() {
  const hint = document.getElementById('party-balance-hint');
  const partyId = Number(document.getElementById('partyId').value);
  const party = _allPartnersForCapital.find(p => p.id === partyId);
  if (!party) { hint.textContent = ''; return; }
  const balance = computePartyBalance(party, _allRevenuesForCapital, _allPurchasesForCapital, _allPartyTransactionsForCapital, _allFixedAssetsForCapital);
  if (balance > 0.01) {
    hint.textContent = `الرصيد الحالي: ${formatCurrency(balance)} مدين (الشريك مدين للمزرعة)`;
  } else if (balance < -0.01) {
    hint.textContent = `الرصيد الحالي: ${formatCurrency(Math.abs(balance))} دائن (المزرعة مدينة له)`;
  } else {
    hint.textContent = 'الرصيد الحالي: صفر';
  }
}

async function _handleSubmit(e) {
  e.preventDefault();

  const isValid = validateForm([
    { fieldId: 'date', validatorFn: isValidDate, message: 'التاريخ مطلوب' },
    { fieldId: 'partyId', validatorFn: isRequired, message: 'يرجى اختيار الشريك' },
    { fieldId: 'amount', validatorFn: isPositiveNumber, message: 'أدخل مبلغًا صحيحًا' },
  ]);
  if (!isValid) return;

  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'جاري الحفظ...';

  try {
    await createCapitalTransaction({
      type: document.getElementById('type').value,
      date: document.getElementById('date').value,
      partyId: Number(document.getElementById('partyId').value),
      method: document.getElementById('method').value,
      amount: Number(document.getElementById('amount').value),
      description: document.getElementById('description').value.trim(),
    });

    showToast('تم حفظ الحركة بنجاح', 'success');
    document.getElementById('capital-form').reset();
    document.getElementById('date').value = todayIso();
    await _loadPartners();
    await _refreshTable();
  } catch (err) {
    showToast(err.message || 'حدث خطأ أثناء الحفظ', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'حفظ الحركة';
  }
}

async function _refreshTable() {
  const [capitalIn, capitalOut] = await Promise.all([
    getAllPartyTransactions(null, 'capitalIn'), getAllPartyTransactions(null, 'capitalOut'),
  ]);
  const all = [...capitalIn, ...capitalOut].sort((a, b) => (a.date === b.date ? a.id - b.id : (a.date < b.date ? -1 : 1)));
  const partners = _allPartnersForCapital.length ? _allPartnersForCapital : await getAllParties('partner');

  const rows = all.map(t => {
    const party = partners.find(p => p.id === t.partyId);
    return {
      ...t,
      dateLabel: formatDateArabic(t.date),
      typeLabel: PARTY_TRANSACTION_TYPE_LABELS[t.type] || t.type,
      partyName: party ? party.name : '-',
      methodLabel: PARTY_TRANSACTION_METHOD_LABELS[t.method] || t.method,
      amountLabel: formatCurrency(t.amount),
    };
  }).reverse();

  _capitalExportColumns = [
    { key: 'voucherNumber', label: 'رقم المرجع' },
    { key: 'dateLabel', label: 'التاريخ' },
    { key: 'typeLabel', label: 'النوع' },
    { key: 'partyName', label: 'الشريك' },
    { key: 'methodLabel', label: 'الطريقة' },
    { key: 'amountLabel', label: 'المبلغ' },
    { key: 'description', label: 'البيان' },
  ];
  _capitalExportRows = rows;

  renderDataTable('capital-table', [
    { key: 'voucherNumber', label: 'رقم المرجع', sortable: true },
    { key: 'dateLabel', label: 'التاريخ', sortable: true },
    { key: 'typeLabel', label: 'النوع', sortable: true },
    { key: 'partyName', label: 'الشريك', sortable: true },
    { key: 'methodLabel', label: 'الطريقة', sortable: false },
    { key: 'amountLabel', label: 'المبلغ', sortable: false },
    { key: 'description', label: 'البيان', sortable: false },
  ], rows, {
    emptyMessage: 'لا توجد حركات جاري شريك مسجّلة بعد',
  });
}
