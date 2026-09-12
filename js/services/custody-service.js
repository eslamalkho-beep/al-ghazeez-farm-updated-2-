// js/services/custody-service.js
// عهد الموظفين — نقدية أو عينية (من المخزون)، بأتمتة كاملة: كل إصدار/تسوية يُنشئ تلقائيًا قيدًا محاسبيًا
// مزدوجًا (حساب 12105 "عهد الموظفين") و/أو حركة مخزون مقابلة. سجلات `CustodyItems` القديمة (بلا `custodyType`،
// من قبل هذه الميزة) تُعامَل كعهدة نقدية ضمنيًا عبر `isCashCustody()`، بلا `journalEntryId` (خارج نطاق المحاسبة
// المزدوجة الجديدة — نفس مبدأ التوافق الخلفي الموثّق مع سجلات الفاتورة الضريبية في CLAUDE.md).
// `CustodySettlements` سجل تسويات منفصل (append-only فعليًا، لا تعديل/حذف) يبني "السجل الزمني" لكل عهدة/موظف.

const CUSTODY_TYPE_LABELS = {
  cash: 'نقدية', equipment: 'معدات', devices: 'أجهزة', vehicle: 'سيارة',
  tools: 'أدوات', supplies: 'مستلزمات', other: 'أخرى',
};

// 'overdue' حالة محسوبة حيًا للعرض فقط (انظر getEffectiveCustodyStatus) — لا تُخزَّن أبدًا في status الفعلي
const CUSTODY_STATUS_LABELS = {
  open: 'مفتوحة', partially_settled: 'مسوّاة جزئيًا', settled: 'مسوّاة بالكامل',
  overdue: 'متأخرة', cancelled: 'ملغاة',
};

const CUSTODY_SETTLEMENT_TYPE_LABELS = {
  cashReturn: 'رد نقدية', itemsReturn: 'رد أصناف', invoiceSettlement: 'تسوية بفواتير',
  salaryDeduction: 'خصم من الراتب', convertToExpense: 'تحويل لمصروف', writeOff: 'إعدام أو فاقد',
  chargeToEmployee: 'تحميل على الموظف', adminWaiver: 'إلغاء بقرار الإدارة',
  transferOut: 'نقل/تسوية رصيد لعهدة أخرى',
};

// الأنواع الثلاثة التي تمثّل "تصفية" طبيعية (custody-liquidate.html) — البقية "تسوية" استثنائية (custody-settle.html)
const CUSTODY_LIQUIDATION_TYPES = ['cashReturn', 'itemsReturn', 'invoiceSettlement'];

const CUSTODY_ACCOUNT_CODE = '12105'; // عهد الموظفين — الافتراضي (يُحل عبر ربط custodyControl)

// تعيين تصنيف صنف المخزون ← مفتاح ربط "العهد العينية" في شاشة ربط العمليات بالحسابات (نفس تعيين
// STOCK_COUNT_CATEGORY_MAPPING_KEYS في stock-count-service.js لكن بمفاتيح العهد الخاصة)
const _CUSTODY_INVENTORY_MAPPING_KEY_BY_CATEGORY = {
  fodder: 'custodyInventoryFodder',
  medicine: 'custodyInventoryMedicine',
  equipment: 'custodyInventoryEquipment',
  other: 'custodyInventoryEquipment',
};

// ===== قراءة أساسية =====

async function getAllCustodyItems() {
  const all = await dbGetAll('CustodyItems');
  return all.filter(c => c.status !== 'deleted');
}

async function getCustodyItemById(id) {
  if (!id) return null;
  return dbGet('CustodyItems', id);
}

async function getAllCustodySettlements(custodyItemId = null) {
  const all = await dbGetAll('CustodySettlements');
  return all
    .filter(s => s.status !== 'deleted' && (!custodyItemId || Number(s.custodyItemId) === Number(custodyItemId)))
    .sort((a, b) => (a.date === b.date ? (a.id - b.id) : (a.date < b.date ? -1 : 1)));
}

async function generateNextCustodyNumber() {
  const all = await getAllCustodyItems();
  const numbers = all
    .map(c => (c.custodyNumber && c.custodyNumber.startsWith('CUS-')) ? parseInt(c.custodyNumber.replace('CUS-', ''), 10) : 0)
    .filter(n => !isNaN(n));
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `CUS-${String(next).padStart(4, '0')}`;
}

// مرجع تلقائي لكل مستند تصفية/تسوية/نقل — يمنح كل حركة في كشف الحساب رقمًا مرجعيًا (نفس مبدأ
// generateNextVoucherNumber في party-service.js لكن محلي هنا لعدم تحميل party-service.js في صفحات العهد).
// TSF لعمليات التصفية (custody-liquidate.html)، TSW لعمليات التسوية الاستثنائية (custody-settle.html)،
// TRF لعمليات نقل/تسوية الرصيد بعهدة أخرى (transferCustodyBalance)
async function generateNextCustodyVoucherNumber(prefix) {
  const all = await getAllCustodySettlements();
  const search = `${prefix}-`;
  const numbers = all
    .map(s => (s.voucherNumber && s.voucherNumber.startsWith(search)) ? parseInt(s.voucherNumber.replace(search, ''), 10) : 0)
    .filter(n => !isNaN(n));
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `${prefix}-${String(next).padStart(4, '0')}`;
}

// السجلات القديمة (قبل هذه الميزة) بلا custodyType تُعامَل كنقدية ضمنيًا
function isCashCustody(item) {
  return (item.custodyType || 'cash') === 'cash';
}

function remainingCustodyAmount(item) {
  return Number(item.amount || 0) - Number(item.settledAmount || 0);
}

function remainingCustodyQuantity(item) {
  return Number(item.quantity || 0) - Number(item.settledQuantity || 0);
}

// الحالة المعروضة فعليًا (تضيف "متأخرة" حيًا فوق الحالة المخزَّنة، بلا تعديل status نفسه)
function getEffectiveCustodyStatus(item) {
  if (item.status === 'cancelled' || item.status === 'settled') return item.status;
  if (item.expectedReturnDate && item.expectedReturnDate < todayIso()) return 'overdue';
  return item.status || 'open';
}

function _computeStoredStatus(item, newSettledAmount, newSettledQuantity) {
  const cash = isCashCustody(item);
  const total = cash ? Number(item.amount || 0) : Number(item.quantity || 0);
  const settled = cash ? newSettledAmount : newSettledQuantity;
  if (total <= 0.0001) return 'settled';
  if (settled >= total - 0.0001) return 'settled';
  if (settled > 0.0001) return 'partially_settled';
  return 'open';
}

async function _postCustodyJournal({ date, description, debitAccountId, creditAccountId, value }) {
  if (!debitAccountId || !creditAccountId || !(value > 0)) return null; // دفاعي: حساب أساسي محذوف يدويًا أو قيمة صفرية
  const lines = [
    { accountId: debitAccountId, debit: value, credit: 0 },
    { accountId: creditAccountId, debit: 0, credit: value },
  ];
  const entryNumber = await generateNextEntryNumber();
  return createJournalEntry({ entryNumber, date, description, lines });
}

function _inventoryAssetAccountCode(category, mappings) {
  const key = _CUSTODY_INVENTORY_MAPPING_KEY_BY_CATEGORY[category] || _CUSTODY_INVENTORY_MAPPING_KEY_BY_CATEGORY.other;
  return resolveMappedAccountCode(key, mappings);
}

function _custodyAccountByKey(key, accounts, mappings) {
  return getMappedAccount(key, accounts, mappings);
}

// ===== إصدار عهدة (البند 1) =====

async function createCustodyIssue(data) {
  const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  const custodyNumber = await generateNextCustodyNumber();
  const cash = data.custodyType === 'cash';
  const [accounts, mappings] = await Promise.all([getAllAccounts(), loadAccountMappings()]);
  const custodyAccount = _custodyAccountByKey('custodyControl', accounts, mappings);

  let journalEntryId = null;
  let inventoryMovementId = null;
  let amount = 0;

  if (cash) {
    amount = Number(data.amount || 0);
    const cashAccount = getAccountByCode(data.cashAccountCode || resolveMappedAccountCode('cash', mappings), accounts);
    journalEntryId = await _postCustodyJournal({
      date: data.date,
      description: `إصدار عهدة نقدية ${custodyNumber}`,
      debitAccountId: custodyAccount?.id,
      creditAccountId: cashAccount?.id,
      value: amount,
    });
  } else {
    const quantity = Number(data.quantity || 0);
    const unitValue = Number(data.unitValue || 0);
    amount = quantity * unitValue;

    inventoryMovementId = await createInventoryMovement({
      itemId: Number(data.inventoryItemId),
      direction: 'out',
      quantity,
      date: data.date,
      reasonType: 'custody',
      unitCost: unitValue || null,
      notes: `صرف عهدة ${custodyNumber}`,
    });

    const invItem = await getInventoryItemById(data.inventoryItemId);
    const assetAccount = getAccountByCode(_inventoryAssetAccountCode(invItem?.category, mappings), accounts);
    journalEntryId = await _postCustodyJournal({
      date: data.date,
      description: `إصدار عهدة عينية ${custodyNumber} (${invItem?.name || ''})`,
      debitAccountId: custodyAccount?.id,
      creditAccountId: assetAccount?.id,
      value: amount,
    });
  }

  return dbAdd('CustodyItems', {
    custodyNumber,
    date: data.date,
    employeeId: Number(data.employeeId),
    custodyType: data.custodyType,
    purpose: data.purpose || '',
    notes: data.notes || '',
    expectedReturnDate: data.expectedReturnDate || null,
    cashAccountCode: cash ? (data.cashAccountCode || resolveMappedAccountCode('cash', mappings)) : null,
    amount,
    inventoryItemId: cash ? null : Number(data.inventoryItemId),
    quantity: cash ? null : Number(data.quantity || 0),
    unitValue: cash ? null : Number(data.unitValue || 0),
    serialNumber: cash ? null : (data.serialNumber || ''),
    settledAmount: 0,
    settledQuantity: 0,
    status: 'open',
    journalEntryId,
    inventoryMovementId,
    createdByUserId: currentUser?.id || null,
    createdByUserName: currentUser?.fullName || '',
  });
}

// إلغاء عهدة لم تجرِ عليها أي تسوية بعد — يعكس القيد وحركة المخزون الأصليين (نفس مبدأ unapproveStockCount)
async function cancelCustodyItem(id) {
  const item = await getCustodyItemById(id);
  if (!item) throw new Error('العهدة غير موجودة');
  if (Number(item.settledAmount || 0) > 0.0001 || Number(item.settledQuantity || 0) > 0.0001) {
    throw new Error('لا يمكن إلغاء عهدة جرت عليها تسوية بالفعل');
  }
  if (item.journalEntryId) await deleteJournalEntry(item.journalEntryId);
  if (item.inventoryMovementId) await deleteInventoryMovement(item.inventoryMovementId);
  return dbUpdate('CustodyItems', id, { status: 'cancelled', journalEntryId: null, inventoryMovementId: null });
}

// ===== تسوية عهدة (البند 2) =====

async function settleCustody(custodyItemId, input) {
  const item = await getCustodyItemById(custodyItemId);
  if (!item) throw new Error('العهدة غير موجودة');
  if (item.status === 'settled') throw new Error('هذه العهدة مسوّاة بالكامل بالفعل');
  if (item.status === 'cancelled') throw new Error('لا يمكن تسوية عهدة ملغاة');

  const cash = isCashCustody(item);
  const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  const [accounts, mappings] = await Promise.all([getAllAccounts(), loadAccountMappings()]);
  const custodyAccount = _custodyAccountByKey('custodyControl', accounts, mappings);
  const type = input.settlementType;

  let journalEntryId = null;
  let inventoryMovementId = null;
  let linkedExpenseId = null;
  let settledAmountDelta = 0;
  let settledQuantityDelta = 0;
  let expenseCategoryLabel = null; // اسم حساب البند وقت التسوية (invoiceSettlement/convertToExpense فقط) — يُخزَّن على CustodySettlements نفسها للعرض

  if ((type === 'writeOff' || type === 'adminWaiver') && (!currentUser || resolveRoleKey(currentUser.role) !== 'systemAdmin')) {
    throw new Error('هذا النوع من التسوية يتطلب اعتماد مدير النظام');
  }

  switch (type) {
    case 'cashReturn': {
      if (!cash) throw new Error('رد نقدية متاح فقط للعهد النقدية');
      const amount = Number(input.amount || 0);
      if (!(amount > 0) || amount > remainingCustodyAmount(item) + 0.01) throw new Error('مبلغ الرد غير صحيح');
      const cashAccount = getAccountByCode(item.cashAccountCode || resolveMappedAccountCode('cash', mappings), accounts);
      journalEntryId = await _postCustodyJournal({
        date: input.date, description: `رد نقدية - عهدة ${item.custodyNumber || item.reference}`,
        debitAccountId: cashAccount?.id, creditAccountId: custodyAccount?.id, value: amount,
      });
      settledAmountDelta = amount;
      break;
    }
    case 'itemsReturn': {
      if (cash) throw new Error('رد أصناف متاح فقط للعهد العينية');
      const quantity = Number(input.quantity || 0);
      if (!(quantity > 0) || quantity > remainingCustodyQuantity(item) + 0.001) throw new Error('الكمية المرتجعة غير صحيحة');
      const value = quantity * Number(item.unitValue || 0);
      inventoryMovementId = await createInventoryMovement({
        itemId: item.inventoryItemId, direction: 'in', quantity, date: input.date,
        reasonType: 'custody', unitCost: item.unitValue || null,
        notes: `إرجاع من عهدة ${item.custodyNumber || item.reference}`,
      });
      const invItem = await getInventoryItemById(item.inventoryItemId);
      const assetAccount = getAccountByCode(_inventoryAssetAccountCode(invItem?.category, mappings), accounts);
      journalEntryId = await _postCustodyJournal({
        date: input.date, description: `رد أصناف - عهدة ${item.custodyNumber || item.reference}`,
        debitAccountId: assetAccount?.id, creditAccountId: custodyAccount?.id, value,
      });
      settledAmountDelta = value;
      settledQuantityDelta = quantity;
      break;
    }
    case 'invoiceSettlement':
    case 'convertToExpense': {
      if (!cash) throw new Error('هذا النوع متاح فقط للعهد النقدية');
      const amount = Number(input.amount || 0);
      if (!(amount > 0) || amount > remainingCustodyAmount(item) + 0.01) throw new Error('المبلغ غير صحيح');
      if (!input.expenseCategoryAccountId) throw new Error('يرجى اختيار بند المصروف');
      const categoryAccount = accounts.find(a => a.id === Number(input.expenseCategoryAccountId));
      if (!categoryAccount) throw new Error('بند المصروف المختار غير موجود في شجرة الحسابات');

      // سجل مصروف فعلي (يظهر في تقارير/قوائم المصروفات) — لكن بقيد مخصّص (مدين حساب البند / دائن 12105)
      // وليس عبر syncExpenseJournalEntry، لأن تلك الدالة تفترض دومًا دائن صندوق/بنك/ذمم، بينما النقدية هنا
      // خرجت فعليًا من الصندوق/البنك عند إصدار العهدة نفسها. ⚠️ تعديل هذا المصروف لاحقًا من expense-form.html
      // سيستدعي syncExpenseJournalEntry العادية ويكسر هذا الربط بصمت (نفس روح التحذيرات الموثّقة في CLAUDE.md).
      const expenseId = await createExpense({
        category: categoryAccount.name, categoryAccountId: categoryAccount.id, amount, date: input.date,
        hasTaxInvoice: false, amountBeforeTax: null, taxAmount: null,
        // '1010' كود قديم قبل الشجرة الهرمية (مُرحَّل آليًا) — يُقارن بكود البنك المربوط فعليًا
        paymentMethod: item.cashAccountCode === resolveMappedAccountCode('bank', mappings) ? 'transfer' : 'cash',
        vendor: '', status: 'approved',
        notes: `${type === 'invoiceSettlement' ? 'تسوية بفواتير' : 'تحويل لمصروف'} من عهدة ${item.custodyNumber || item.reference}${input.notes ? ' — ' + input.notes : ''}`,
        linkedCustodyItemId: item.id,
      });

      const debitAccount = categoryAccount;
      expenseCategoryLabel = categoryAccount.name;

      journalEntryId = await _postCustodyJournal({
        date: input.date,
        description: `${type === 'invoiceSettlement' ? 'تسوية بفواتير' : 'تحويل لمصروف'} - عهدة ${item.custodyNumber || item.reference}`,
        debitAccountId: debitAccount?.id, creditAccountId: custodyAccount?.id, value: amount,
      });
      if (journalEntryId) await dbUpdate('Expenses', expenseId, { journalEntryId });

      linkedExpenseId = expenseId;
      settledAmountDelta = amount;
      break;
    }
    case 'salaryDeduction': {
      if (!cash) throw new Error('خصم من الراتب متاح فقط للعهد النقدية');
      const amount = Number(input.amount || 0);
      if (!(amount > 0) || amount > remainingCustodyAmount(item) + 0.01) throw new Error('المبلغ غير صحيح');
      const deductionAccount = _custodyAccountByKey('custodyPayrollDeduction', accounts, mappings);
      journalEntryId = await _postCustodyJournal({
        date: input.date, description: `خصم من الراتب - عهدة ${item.custodyNumber || item.reference}`,
        debitAccountId: deductionAccount?.id, creditAccountId: custodyAccount?.id, value: amount,
      });
      settledAmountDelta = amount;
      break;
    }
    case 'writeOff': {
      const writeOffAccount = _custodyAccountByKey('custodyWriteOff', accounts, mappings);
      if (cash) {
        const amount = Number(input.amount || 0);
        if (!(amount > 0) || amount > remainingCustodyAmount(item) + 0.01) throw new Error('المبلغ غير صحيح');
        journalEntryId = await _postCustodyJournal({
          date: input.date, description: `إعدام/فاقد - عهدة ${item.custodyNumber || item.reference}`,
          debitAccountId: writeOffAccount?.id, creditAccountId: custodyAccount?.id, value: amount,
        });
        settledAmountDelta = amount;
      } else {
        const quantity = Number(input.quantity || 0);
        if (!(quantity > 0) || quantity > remainingCustodyQuantity(item) + 0.001) throw new Error('الكمية غير صحيحة');
        const value = quantity * Number(item.unitValue || 0);
        // لا حركة مخزون إرجاع — الصنف مفقود فعليًا، بقي خارج المخزون كما كان عند الصرف
        journalEntryId = await _postCustodyJournal({
          date: input.date, description: `إعدام/فاقد - عهدة ${item.custodyNumber || item.reference}`,
          debitAccountId: writeOffAccount?.id, creditAccountId: custodyAccount?.id, value,
        });
        settledAmountDelta = value;
        settledQuantityDelta = quantity;
      }
      break;
    }
    case 'chargeToEmployee': {
      // مديونية مفتوحة على الموظف (دون تحديد آلية استرداد بعد — استرجاعها لاحقًا نقدًا أو خصمًا من الراتب
      // يتطلب قيدًا يدويًا من accounting/journal-entries.html، خارج نطاق هذه الميزة)
      const chargeAccount = _custodyAccountByKey('custodyChargeToEmployee', accounts, mappings);
      if (cash) {
        const amount = Number(input.amount || 0);
        if (!(amount > 0) || amount > remainingCustodyAmount(item) + 0.01) throw new Error('المبلغ غير صحيح');
        journalEntryId = await _postCustodyJournal({
          date: input.date, description: `تحميل على الموظف - عهدة ${item.custodyNumber || item.reference}`,
          debitAccountId: chargeAccount?.id, creditAccountId: custodyAccount?.id, value: amount,
        });
        settledAmountDelta = amount;
      } else {
        const quantity = Number(input.quantity || 0);
        if (!(quantity > 0) || quantity > remainingCustodyQuantity(item) + 0.001) throw new Error('الكمية غير صحيحة');
        const value = quantity * Number(item.unitValue || 0);
        journalEntryId = await _postCustodyJournal({
          date: input.date, description: `تحميل على الموظف - عهدة ${item.custodyNumber || item.reference}`,
          debitAccountId: chargeAccount?.id, creditAccountId: custodyAccount?.id, value,
        });
        settledAmountDelta = value;
        settledQuantityDelta = quantity;
      }
      break;
    }
    case 'adminWaiver': {
      // إلغاء جزء أو كل رصيد العهدة بقرار إداري (بعكس writeOff الذي يمثّل فاقدًا/خسارة فعلية) — نفس تفريع
      // writeOff بالضبط لكن بحساب/تسمية مختلفين لتمييزه في التقارير، ومقصور على مدير النظام كذلك (انظر أعلى)
      const waiverAccount = _custodyAccountByKey('custodyAdminWaiver', accounts, mappings);
      if (cash) {
        const amount = Number(input.amount || 0);
        if (!(amount > 0) || amount > remainingCustodyAmount(item) + 0.01) throw new Error('المبلغ غير صحيح');
        journalEntryId = await _postCustodyJournal({
          date: input.date, description: `إلغاء بقرار الإدارة - عهدة ${item.custodyNumber || item.reference}`,
          debitAccountId: waiverAccount?.id, creditAccountId: custodyAccount?.id, value: amount,
        });
        settledAmountDelta = amount;
      } else {
        const quantity = Number(input.quantity || 0);
        if (!(quantity > 0) || quantity > remainingCustodyQuantity(item) + 0.001) throw new Error('الكمية غير صحيحة');
        const value = quantity * Number(item.unitValue || 0);
        journalEntryId = await _postCustodyJournal({
          date: input.date, description: `إلغاء بقرار الإدارة - عهدة ${item.custodyNumber || item.reference}`,
          debitAccountId: waiverAccount?.id, creditAccountId: custodyAccount?.id, value,
        });
        settledAmountDelta = value;
        settledQuantityDelta = quantity;
      }
      break;
    }
    default:
      throw new Error('نوع تسوية غير معروف');
  }

  const voucherNumber = input.voucherNumber
    || await generateNextCustodyVoucherNumber(CUSTODY_LIQUIDATION_TYPES.includes(type) ? 'TSF' : 'TSW');

  const settlementId = await dbAdd('CustodySettlements', {
    custodyItemId: item.id,
    date: input.date,
    settlementType: type,
    amount: settledAmountDelta,
    quantity: settledQuantityDelta || null,
    expenseCategory: expenseCategoryLabel,
    notes: input.notes || '',
    journalEntryId,
    linkedExpenseId,
    inventoryMovementId,
    voucherNumber,
    createdByUserId: currentUser?.id || null,
    createdByUserName: currentUser?.fullName || '',
  });

  const newSettledAmount = Number(item.settledAmount || 0) + settledAmountDelta;
  const newSettledQuantity = Number(item.settledQuantity || 0) + settledQuantityDelta;
  const newStatus = _computeStoredStatus(item, newSettledAmount, newSettledQuantity);

  await dbUpdate('CustodyItems', item.id, {
    settledAmount: newSettledAmount, settledQuantity: newSettledQuantity, status: newStatus,
  });

  return settlementId;
}

// ===== نقل/تسوية رصيد عهدة إلى عهدة أخرى (البند الجديد) =====
// يغطي كلاً من "نقل رصيد العهدة لعهدة أخرى" و"تسوية عهدة بأخرى" بنفس الآلية: إغلاق/تخفيض العهدة المصدر
// (settledAmount فقط، بلا لمس amount الأصلي) + إنشاء عهدة جديدة فعليًا للموظف المستفيد (نفس الموظف أو
// موظف آخر) — لا يوجد رصيد محاسبي "دائن" يُصفَّى به رصيد "مدين" آخر على نفس الحساب 1020 كي تصح عملية
// Netting مباشرة بين عهدتين قائمتين، وزيادة amount عهدة موجودة تخالف مبدأ عدم تعديل العهدة الأصلية —
// فالعهدة الجديدة هي التوثيق الآمن الوحيد المتّسق مع بقية النموذج. مقصورة على العهد النقدية فقط (لا معنى
// لعهدة عينية جديدة بلا صنف مخزون فعلي وراءها). بلا أي قيد محاسبي (دفعتان على نفس حساب 1020 تتوازنان
// داخليًا بلا حركة نقدية حقيقية) — نفس مبدأ source:'transfer' المستثنى من القيد في BulkPurchaseBatches/BulkSaleBatches.
async function transferCustodyBalance(sourceCustodyId, { date, targetEmployeeId, amount, notes }) {
  const source = await getCustodyItemById(sourceCustodyId);
  if (!source) throw new Error('العهدة غير موجودة');
  if (!isCashCustody(source)) throw new Error('نقل/تسوية الرصيد متاح فقط للعهد النقدية');
  if (source.status === 'settled') throw new Error('هذه العهدة مسوّاة بالكامل بالفعل');
  if (source.status === 'cancelled') throw new Error('لا يمكن التعامل مع عهدة ملغاة');
  if (!targetEmployeeId) throw new Error('اختر الموظف المستفيد من النقل');

  const value = Number(amount || 0);
  if (!(value > 0) || value > remainingCustodyAmount(source) + 0.01) throw new Error('المبلغ غير صحيح');

  const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  const voucherNumber = await generateNextCustodyVoucherNumber('TRF');
  const mappings = await loadAccountMappings();

  const settlementId = await dbAdd('CustodySettlements', {
    custodyItemId: source.id,
    date,
    settlementType: 'transferOut',
    amount: value,
    quantity: null,
    expenseCategory: null,
    notes: notes || '',
    journalEntryId: null,
    linkedExpenseId: null,
    inventoryMovementId: null,
    voucherNumber,
    createdByUserId: currentUser?.id || null,
    createdByUserName: currentUser?.fullName || '',
  });

  const newSettledAmount = Number(source.settledAmount || 0) + value;
  const newStatus = _computeStoredStatus(source, newSettledAmount, source.settledQuantity || 0);
  await dbUpdate('CustodyItems', source.id, { settledAmount: newSettledAmount, status: newStatus });

  const custodyNumber = await generateNextCustodyNumber();
  const newCustodyItemId = await dbAdd('CustodyItems', {
    custodyNumber,
    date,
    employeeId: Number(targetEmployeeId),
    custodyType: 'cash',
    purpose: `منقولة من عهدة ${source.custodyNumber || source.reference || ('#' + source.id)}`,
    notes: notes || '',
    expectedReturnDate: null,
    cashAccountCode: source.cashAccountCode || resolveMappedAccountCode('cash', mappings),
    amount: value,
    inventoryItemId: null,
    quantity: null,
    unitValue: null,
    serialNumber: null,
    settledAmount: 0,
    settledQuantity: 0,
    status: 'open',
    journalEntryId: null,
    inventoryMovementId: null,
    source: 'transfer',
    transferredFromCustodyId: source.id,
    transferredFromVoucherNumber: voucherNumber,
    createdByUserId: currentUser?.id || null,
    createdByUserName: currentUser?.fullName || '',
  });

  return { settlementId, newCustodyItemId, voucherNumber };
}

// ===== تصفية/تسوية/نقل "على إجمالي رصيد الموظف" (مقصورة على العهد النقدية) =====
// كل عهد الموظف العينية تبقى تُصفّى/تُسوّى فرديًا (custodyId محدد) لارتباطها بصنف مخزون/سيريال بعينه — لا معنى
// لتجميع "3 معدات + جهاز" في عملية واحدة. أما العهد النقدية فيمكن معاملتها كرصيد واحد متجانس، فتُستهلك بترتيب
// FIFO (الأقدم تاريخًا/رقمًا أولاً) دون أن يضطر المستخدم لاختيار عهدة بعينها أو معرفة توزيعها الداخلي. كل أجزاء
// نفس عملية التصفية/التسوية (قد تنتج عدة سجلات CustodySettlements موزّعة على أكثر من عهدة) تشترك بنفس
// voucherNumber حتى تظهر كحركة واحدة مفهومة في كشف حساب الموظف رغم توزّعها الداخلي.

// عهد الموظف النقدية المفتوحة/المسوّاة جزئيًا فقط، بترتيب FIFO
function getOpenCashCustodyItemsForEmployee(employeeId, allItems) {
  return allItems
    .filter(i => Number(i.employeeId) === Number(employeeId) && isCashCustody(i)
      && ['open', 'partially_settled'].includes(i.status))
    .sort((a, b) => (a.date === b.date ? (a.id - b.id) : (a.date < b.date ? -1 : 1)));
}

// إجمالي الرصيد النقدي المتبقي لموظف عبر كل عهده النقدية المفتوحة — الرقم المعروض في صفحتي التصفية والتسوية
function getEmployeeCashBalance(employeeId, allItems) {
  const items = getOpenCashCustodyItemsForEmployee(employeeId, allItems);
  const total = items.reduce((s, i) => s + remainingCustodyAmount(i), 0);
  return { items, total };
}

// يوزّع amount على عهد الموظف النقدية المفتوحة بترتيب FIFO، ويستدعي handlerFn(item, chunk) لكل جزء حتى
// يُستهلك المبلغ بالكامل. يرمي خطأ إن كان المبلغ أكبر من إجمالي المتاح. أساس التصفية/التسوية/النقل المُجمَّعة أدناه.
async function _forEachCashCustodyChunk(employeeId, amount, handlerFn) {
  const allItems = await getAllCustodyItems();
  const items = getOpenCashCustodyItemsForEmployee(employeeId, allItems);
  let remaining = Number(amount || 0);
  if (!(remaining > 0)) throw new Error('المبلغ غير صحيح');
  const totalAvailable = items.reduce((s, i) => s + remainingCustodyAmount(i), 0);
  if (remaining > totalAvailable + 0.01) throw new Error('المبلغ أكبر من إجمالي رصيد الموظف المتاح');

  const results = [];
  for (const item of items) {
    if (remaining <= 0.001) break;
    const itemRemaining = remainingCustodyAmount(item);
    if (itemRemaining <= 0.001) continue;
    const chunk = Math.min(itemRemaining, remaining);
    results.push(await handlerFn(item, chunk));
    remaining -= chunk;
  }
  return results;
}

// نسخة "على إجمالي رصيد الموظف" من settleCustody — نفس settlementType/input لكل جزء، فقط amount يتغيّر حسب
// نصيب كل عهدة. تُستخدم لكل أنواع التسوية النقدية (cashReturn/invoiceSettlement/convertToExpense/
// salaryDeduction/chargeToEmployee/writeOff/adminWaiver) بلا أي تعديل على settleCustody نفسها.
async function settleCustodyAmountForEmployee(employeeId, amount, inputTemplate) {
  return _forEachCashCustodyChunk(employeeId, amount, (item, chunk) =>
    settleCustody(item.id, { ...inputTemplate, amount: chunk }));
}

// نسخة "على إجمالي رصيد الموظف" من transferCustodyBalance — تُغلق/تخفّض settledAmount على كل عهدة مصدر
// استُهلك منها جزء (بنفس منطق transferCustodyBalance بالضبط لكل جزء)، ثم تُنشئ عهدة مستفيدة واحدة فقط
// بإجمالي المبلغ المنقول (بدل عهدة جديدة لكل جزء مصدر) — نفس مبدأ عدم الـNetting المباشر الموثّق أعلاه.
async function transferCustodyBalanceForEmployee(sourceEmployeeId, { date, targetEmployeeId, amount, notes }) {
  if (!targetEmployeeId) throw new Error('اختر الموظف المستفيد من النقل');

  const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  const voucherNumber = await generateNextCustodyVoucherNumber('TRF');
  const mappings = await loadAccountMappings();
  let firstCashAccountCode = null;

  const settlementIds = await _forEachCashCustodyChunk(sourceEmployeeId, amount, async (item, chunk) => {
    if (!firstCashAccountCode) firstCashAccountCode = item.cashAccountCode || resolveMappedAccountCode('cash', mappings);
    const settlementId = await dbAdd('CustodySettlements', {
      custodyItemId: item.id, date, settlementType: 'transferOut', amount: chunk,
      quantity: null, expenseCategory: null, notes: notes || '', journalEntryId: null,
      linkedExpenseId: null, inventoryMovementId: null, voucherNumber,
      createdByUserId: currentUser?.id || null, createdByUserName: currentUser?.fullName || '',
    });
    const newSettledAmount = Number(item.settledAmount || 0) + chunk;
    const newStatus = _computeStoredStatus(item, newSettledAmount, item.settledQuantity || 0);
    await dbUpdate('CustodyItems', item.id, { settledAmount: newSettledAmount, status: newStatus });
    return settlementId;
  });

  const custodyNumber = await generateNextCustodyNumber();
  const newCustodyItemId = await dbAdd('CustodyItems', {
    custodyNumber, date, employeeId: Number(targetEmployeeId), custodyType: 'cash',
    purpose: `منقولة من إجمالي رصيد الموظف عبر ${voucherNumber}`, notes: notes || '',
    expectedReturnDate: null, cashAccountCode: firstCashAccountCode || resolveMappedAccountCode('cash', mappings),
    amount: Number(amount || 0), inventoryItemId: null, quantity: null, unitValue: null, serialNumber: null,
    settledAmount: 0, settledQuantity: 0, status: 'open', journalEntryId: null, inventoryMovementId: null,
    source: 'transfer', transferredFromCustodyId: null, transferredFromVoucherNumber: voucherNumber,
    createdByUserId: currentUser?.id || null, createdByUserName: currentUser?.fullName || '',
  });

  return { settlementIds, newCustodyItemId, voucherNumber };
}

// ===== تجميعات لكل موظف (تُستخدم في المحفظة/كشف الحساب/لوحة التحكم) =====

function getEmployeeCustodySummary(employeeId, allItems) {
  const items = allItems.filter(i => Number(i.employeeId) === Number(employeeId));
  const totalIssued = items.reduce((s, i) => s + Number(i.amount || 0), 0);
  const totalSettled = items.reduce((s, i) => s + Number(i.settledAmount || 0), 0);
  const currentBalance = totalIssued - totalSettled;
  const hasOverdue = items.some(i => getEffectiveCustodyStatus(i) === 'overdue');
  const hasOpen = items.some(i => ['open', 'partially_settled'].includes(getEffectiveCustodyStatus(i)));
  return { items, totalIssued, totalSettled, currentBalance, hasOverdue, hasOpen };
}
