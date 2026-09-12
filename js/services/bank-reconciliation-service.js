// js/services/bank-reconciliation-service.js
// تسوية البنوك — إدخال يدوي لسطور كشف البنك (بلا رفع/تحليل ملف، انظر CLAUDE.md) + مطابقة يدوية مع حركات
// النظام على حساب البنك (يُحل عبر ربط "bank" في شاشة ربط العمليات بالحسابات — computeAccountLedgerRows
// في accounting-service.js)

async function getAllBankStatementLines() {
  const all = await dbGetAll('BankStatementLines');
  return all.filter(l => l.status !== 'deleted').sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

async function createBankStatementLine(data) {
  const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  const amount = Number(data.amount || 0);
  if (!(amount > 0)) throw new Error('المبلغ غير صحيح');
  if (data.direction !== 'debit' && data.direction !== 'credit') throw new Error('يرجى اختيار اتجاه الحركة');

  return dbAdd('BankStatementLines', {
    date: data.date, description: data.description || '', amount, direction: data.direction,
    reference: data.reference || '', reconciled: false, matchedEntryId: null,
    createdByUserId: currentUser?.id || null, createdByUserName: currentUser?.fullName || '',
  });
}

async function deleteBankStatementLine(id) {
  return dbSoftDelete('BankStatementLines', id);
}

async function matchBankStatementLine(lineId, entryId) {
  return dbUpdate('BankStatementLines', lineId, { reconciled: true, matchedEntryId: Number(entryId) });
}

async function unmatchBankStatementLine(lineId) {
  return dbUpdate('BankStatementLines', lineId, { reconciled: false, matchedEntryId: null });
}

// نتيجة التسوية الكاملة لفترة معيّنة: حركات النظام (ledger) وحركات الكشف لنفس الفترة، مقسَّمة إلى
// متطابقة/معلّقة من النظام/غير مسجَّلة من الكشف — حسابات حيّة بلا تخزين، بنفس مبدأ computeBulkGroupBalances
function computeReconciliation(systemLedgerRows, statementLines, from, to) {
  const periodSystemRows = systemLedgerRows.filter(r => (!from || r.date >= from) && (!to || r.date <= to));
  const periodStatementLines = statementLines.filter(l => (!from || l.date >= from) && (!to || l.date <= to));

  const matchedEntryIds = new Set(
    periodStatementLines.filter(l => l.reconciled && l.matchedEntryId).map(l => Number(l.matchedEntryId))
  );

  const matchedSystemRows = periodSystemRows.filter(r => matchedEntryIds.has(Number(r.entryId)));
  const unmatchedSystemRows = periodSystemRows.filter(r => !matchedEntryIds.has(Number(r.entryId)));
  const matchedStatementLines = periodStatementLines.filter(l => l.reconciled);
  const unmatchedStatementLines = periodStatementLines.filter(l => !l.reconciled);

  const sum = (arr, fn) => arr.reduce((s, x) => s + fn(x), 0);

  return {
    matchedSystemRows, unmatchedSystemRows, matchedStatementLines, unmatchedStatementLines,
    matchedAmount: sum(matchedStatementLines, l => l.amount),
    unmatchedSystemAmount: sum(unmatchedSystemRows, r => Math.abs(r.signedAmount)),
    unmatchedStatementAmount: sum(unmatchedStatementLines, l => l.amount),
  };
}

// يقترح حركات نظام غير مطابَقة بنفس مبلغ سطر كشف معيّن (بنفس اتجاهه: credit بالكشف = دخول للبنك = مدين بالنظام)
function suggestSystemMatches(statementLine, unmatchedSystemRows) {
  return unmatchedSystemRows.filter(r => {
    const rowAmount = statementLine.direction === 'credit' ? r.debit : r.credit;
    return rowAmount > 0 && Math.abs(rowAmount - statementLine.amount) < 0.01;
  });
}
