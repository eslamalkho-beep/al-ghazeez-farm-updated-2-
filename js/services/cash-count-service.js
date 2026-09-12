// js/services/cash-count-service.js
// جرد الصندوق/البنك — محضر فرق الصندوق: يقارن مبلغًا معدودًا فعليًا برصيد النظام كما في نفس التاريخ
// (computeAccountBalance)، ويُنشئ/يحذف تلقائيًا تسوية Adjustments من نوع 'cashDifference' (adjustment-service.js
// المبني في جلسة "التسويات المحاسبية") عند وجود فرق — بلا إدخال يدوي مزدوج لنفس الفرق

async function getAllCashCounts() {
  const all = await dbGetAll('CashCounts');
  return all.filter(c => c.status !== 'deleted').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

async function getCashCountById(id) {
  if (!id) return null;
  return dbGet('CashCounts', id);
}

// معاينة حيّة (بلا حفظ) لرصيد النظام كما في تاريخ مُعيّن — تُستخدم في الصفحة قبل الحفظ لعرض الفرق المتوقَّع
async function previewSystemAmount(accountCode, date) {
  const accounts = await getAllAccounts();
  const account = getAccountByCode(accountCode, accounts);
  if (!account) return 0;
  const entries = await getPostedJournalEntries();
  return computeAccountBalance(account, entries, date).balance;
}

async function createCashCount(data) {
  const accounts = await getAllAccounts();
  const account = getAccountByCode(data.accountCode, accounts);
  if (!account) throw new Error('الحساب غير موجود');

  const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  const entries = await getPostedJournalEntries();
  const systemAmount = computeAccountBalance(account, entries, data.date).balance;
  const countedAmount = Number(data.countedAmount || 0);
  const difference = Math.round((countedAmount - systemAmount) * 100) / 100;

  let adjustmentId = null;
  if (Math.abs(difference) > 0.004) {
    adjustmentId = await createAdjustment({
      type: 'cashDifference',
      date: data.date,
      amount: Math.abs(difference),
      direction: difference < 0 ? 'shortage' : 'overage',
      cashAccountCode: data.accountCode,
      description: `فرق جرد صندوق بتاريخ ${data.date}${data.notes ? ' — ' + data.notes : ''}`,
    });
  }

  return dbAdd('CashCounts', {
    date: data.date, accountCode: data.accountCode, systemAmount, countedAmount, difference,
    notes: data.notes || '', adjustmentId,
    createdByUserId: currentUser?.id || null, createdByUserName: currentUser?.fullName || '',
  });
}

async function deleteCashCount(id) {
  const count = await getCashCountById(id);
  if (count && count.adjustmentId) {
    await deleteAdjustment(count.adjustmentId);
  }
  return dbSoftDelete('CashCounts', id);
}
