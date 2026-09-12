// js/services/party-service.js
// عملاء وموردون — بدأت "تكويدات" بسيطة (اسم فقط)، وامتدت لنظام ذمم مدينة/دائنة مبسّط:
// كل عميل/مورّد له رصيد "مدين/دائن" حيّ (غير مخزَّن، محسوب من computePartyBalance) يتغذّى من ثلاثة مصادر —
// فواتير آجلة (Revenues.receiveMethod/Purchases.paymentMethod === 'credit')، سندات قبض/صرف (PartyTransactions)،
// ومرتجعات/خصومات (أيضًا PartyTransactions، لكنها تُنشئ إلى جانبها سجل Revenues/Purchases سالبًا حقيقيًا —
// انظر createReturnOrDiscount أدناه). فواتير نقدي/تحويل لا تدخل هذا النظام إطلاقًا (تحصّلت فورًا وقت الإدخال).
// نفس روح custody-service.js تمامًا (إصدار/تسوية بقيود محاسبية تلقائية + سجل تراكمي)، لكن بلا سقف "مبلغ مُصدَر"
// (حساب طرف مفتوح النهاية بعكس عهدة موظف محدودة القيمة).

const PARTY_TYPE_LABELS = { client: 'عميل', supplier: 'مورّد', partner: 'شريك' };
const PARTY_ACCOUNT_STATUS_LABELS = { active: 'نشط', suspended: 'موقوف' };
const PARTY_TRANSACTION_TYPE_LABELS = { collection: 'سند قبض', payment: 'سند صرف', return: 'مرتجع', discount: 'خصم', capitalIn: 'ضخ فلوس', capitalOut: 'سحب فلوس' };
// ⚠️ "شبكة" (مدى/بطاقات) تُسجَّل محاسبيًا على حساب البنك لعدم وجود حساب "شبكة" مخصّص — نفس أسلوب التبسيط
// الموثّق لحالات مشابهة في CLAUDE.md. كل الحسابات تُحل عبر "ربط العمليات بالحسابات" (account-mapping-service.js)
const PARTY_TRANSACTION_METHOD_LABELS = { cash: 'نقدي', bank: 'بنك', transfer: 'تحويل', network: 'شبكة' };

// مفتاح الربط حسب طريقة السند: نقدي → مفتاح نقدي خاص بالسند، والباقي (بنك/تحويل/شبكة) → مفتاح البنك
// الخاص بالسند — مفاتيح تفصيلية مستقلة عن مصروفات/إيرادات النظام (collectionCash/collectionBank و
// paymentCash/paymentBank في شاشة ربط العمليات بالحسابات)
const PARTY_COLLECTION_MAPPING_KEY_BY_METHOD = { cash: 'collectionCash', bank: 'collectionBank', transfer: 'collectionBank', network: 'collectionBank' };
const PARTY_PAYMENT_MAPPING_KEY_BY_METHOD = { cash: 'paymentCash', bank: 'paymentBank', transfer: 'paymentBank', network: 'paymentBank' };
const PARTY_RETURN_CATEGORY_LABEL = { client: 'مرتجعات وخصومات المبيعات', supplier: 'مرتجعات وخصومات المشتريات' };

// حركات "جاري الشريك" (ضخ فلوس/سحب فلوس) — نفس مبدأ خرائط التحصيل/السداد أعلاه، لكن بحساب مقابل واحد
// (partnerControl، افتراضيًا 3010) بدل arControl/apControl، انظر createCapitalTransaction أدناه
const PARTY_CAPITAL_IN_MAPPING_KEY_BY_METHOD = { cash: 'partnerCapitalInCash', bank: 'partnerCapitalInBank', transfer: 'partnerCapitalInBank', network: 'partnerCapitalInBank' };
const PARTY_CAPITAL_OUT_MAPPING_KEY_BY_METHOD = { cash: 'partnerCapitalOutCash', bank: 'partnerCapitalOutBank', transfer: 'partnerCapitalOutBank', network: 'partnerCapitalOutBank' };

async function getAllParties(type) {
  const all = await dbGetAll('Parties');
  return all.filter(p => p.status !== 'deleted' && (!type || p.type === type));
}

async function getPartyById(id) {
  if (!id) return null;
  return dbGet('Parties', id);
}

// كود تلقائي متسلسل لكل نوع على حدة (CL-0001.../SUP-0001.../PTR-0001...) — يُحسب من كل الأطراف بصرف النظر
// عن الحذف الناعم، حتى لا يتكرر كود سبق استخدامه لسجل محذوف
async function generateNextPartyCode(type) {
  const prefix = type === 'client' ? 'CL-' : (type === 'partner' ? 'PTR-' : 'SUP-');
  const all = await dbGetAll('Parties');
  const numbers = all
    .filter(p => p.type === type && p.partyCode && p.partyCode.startsWith(prefix))
    .map(p => parseInt(p.partyCode.replace(prefix, ''), 10))
    .filter(n => !isNaN(n));
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

async function createParty(data) {
  const partyCode = await generateNextPartyCode(data.type);
  const id = await dbAdd('Parties', { ...data, partyCode });
  if (data.type === 'partner') {
    await _ensurePartnerAccountMapping(id);
  }
  if (Number(data.openingBalance || 0) > 0) {
    const party = await dbGet('Parties', id);
    await _postPartyOpeningBalanceJournal(party);
  }
  return id;
}

// يضبط تلقائيًا "حساب الذمم المخصص" لشريك جديد على جاري الشريك (partnerControl، افتراضيًا 3010) — بلا هذا
// الربط ستستخدم syncRevenueJournalEntry/syncPurchaseJournalEntry حساب العملاء/الموردين العام (112/211) عن طريق
// الخطأ، لأن partyAccount:<id> هو المفتاح الوحيد الذي يميّز شريكًا عن عميل/مورّد عاديين في تلك الخدمتين.
// لا يُستبدل ربط موجود بالفعل (تعديل يدوي سابق من شاشة "ربط العمليات بالحسابات" يبقى كما هو)
async function _ensurePartnerAccountMapping(partyId) {
  const mappings = await loadAccountMappings();
  const key = `partyAccount:${partyId}`;
  if (mappings[key]) return;
  const accounts = await getAllAccounts();
  const defaultAccount = getMappedAccount('partnerControl', accounts, mappings);
  if (defaultAccount) await setAccountMapping(key, defaultAccount.code);
}

// يعيد ترحيل القيد الافتتاحي بالكامل إن تغيّر المبلغ أو الاتجاه (نفس مبدأ "إعادة الصياغة الكاملة" في
// syncRevenueJournalEntry) — لا يلمس أي قيد آخر (فواتير آجلة/سندات قبض وصرف) خاص بنفس الطرف
async function updateParty(id, data) {
  const existing = await dbGet('Parties', id);
  await dbUpdate('Parties', id, data);
  const updated = await dbGet('Parties', id);

  if (updated.type === 'partner' && existing?.type !== 'partner') {
    await _ensurePartnerAccountMapping(id);
  }

  const openingChanged = Number(existing?.openingBalance || 0) !== Number(updated.openingBalance || 0)
    || (existing?.openingBalanceType || 'debit') !== (updated.openingBalanceType || 'debit');
  if (openingChanged) {
    await _postPartyOpeningBalanceJournal(updated);
  }
  return updated;
}

async function _postPartyOpeningBalanceJournal(party) {
  if (party.openingBalanceJournalEntryId) {
    await deleteJournalEntry(party.openingBalanceJournalEntryId);
  }

  const amount = Number(party.openingBalance || 0);
  if (!(amount > 0)) {
    await dbUpdate('Parties', party.id, { openingBalanceJournalEntryId: null });
    return null;
  }

  const [accounts, mappings] = await Promise.all([getAllAccounts(), loadAccountMappings()]);
  const partyAccount = party.type === 'partner'
    ? getMappedAccountWithFallback([`partyAccount:${party.id}`, 'partnerControl'], accounts, mappings)
    : getMappedAccount(party.type === 'client' ? 'arControl' : 'apControl', accounts, mappings);
  const balancingAccount = getMappedAccount('openingBalancePlug', accounts, mappings);
  const isDebit = (party.openingBalanceType || 'debit') === 'debit';

  const journalEntryId = await _postPartyJournal({
    date: party.createdAt ? party.createdAt.slice(0, 10) : todayIso(),
    description: `رصيد افتتاحي - ${PARTY_TYPE_LABELS[party.type] || party.type} ${party.name} (${party.partyCode || ''})`,
    debitAccountId: isDebit ? partyAccount?.id : balancingAccount?.id,
    creditAccountId: isDebit ? balancingAccount?.id : partyAccount?.id,
    value: amount,
  });

  await dbUpdate('Parties', party.id, { openingBalanceJournalEntryId: journalEntryId });
  return journalEntryId;
}

// حذف طرف لا يمس القيود/الفواتير/السندات المرتبطة به تاريخيًا (تبقى كما هي، بنفس مبدأ حذف تكويد بند
// لا يغيّر مصروفات سابقة) — يُلغى فقط قيد الرصيد الافتتاحي نفسه لأن الطرف لم يعد فعليًا ضمن الحسابات الحيّة
async function deleteParty(id) {
  const party = await dbGet('Parties', id);
  if (party && party.openingBalanceJournalEntryId) {
    await deleteJournalEntry(party.openingBalanceJournalEntryId);
  }
  return dbSoftDelete('Parties', id);
}

async function isPartyNameTaken(type, name, excludeId = null) {
  const all = await getAllParties(type);
  return all.some(p => p.name === name && p.id !== excludeId);
}

async function _postPartyJournal({ date, description, debitAccountId, creditAccountId, value }) {
  if (!debitAccountId || !creditAccountId || !(value > 0)) return null; // دفاعي: حساب أساسي محذوف يدويًا أو قيمة صفرية
  const lines = [
    { accountId: debitAccountId, debit: value, credit: 0 },
    { accountId: creditAccountId, debit: 0, credit: value },
  ];
  const entryNumber = await generateNextEntryNumber();
  return createJournalEntry({ entryNumber, date, description, lines });
}

// ===== سندات القبض والصرف والمرتجعات/الخصومات (PartyTransactions) =====

const PARTY_VOUCHER_PREFIX = { collection: 'RC-', payment: 'PV-', return: 'RTN-', discount: 'DSC-', capitalIn: 'CIN-', capitalOut: 'COUT-' };

async function generateNextVoucherNumber(type) {
  const prefix = PARTY_VOUCHER_PREFIX[type];
  const all = await dbGetAll('PartyTransactions');
  const numbers = all
    .filter(t => t.type === type && t.voucherNumber && t.voucherNumber.startsWith(prefix))
    .map(t => parseInt(t.voucherNumber.replace(prefix, ''), 10))
    .filter(n => !isNaN(n));
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

async function getAllPartyTransactions(partyId = null, type = null) {
  const all = await dbGetAll('PartyTransactions');
  return all
    .filter(t => t.status !== 'deleted' && (!partyId || Number(t.partyId) === Number(partyId)) && (!type || t.type === type))
    .sort((a, b) => (a.date === b.date ? (a.id - b.id) : (a.date < b.date ? -1 : 1)));
}

// سند قبض من عميل: يدين الصندوق/البنك حسب الطريقة، يدائن "العملاء والذمم المدينة" — قيد منفصل تمامًا عن قيد
// الفاتورة الآجلة الأصلية (بلا إعادة كتابة له)، بنفس مبدأ عدم لمس قيد إصدار العهدة عند تسويتها
async function createCollection(data) {
  const party = await dbGet('Parties', data.partyId);
  if (!party || party.type !== 'client') throw new Error('يرجى اختيار عميل مسجّل');
  const amount = Number(data.amount || 0);
  if (!(amount > 0)) throw new Error('المبلغ غير صحيح');

  const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  const [accounts, mappings] = await Promise.all([getAllAccounts(), loadAccountMappings()]);
  const arAccount = getMappedAccount('arControl', accounts, mappings);
  const cashAccount = getMappedAccount(PARTY_COLLECTION_MAPPING_KEY_BY_METHOD[data.method] || 'collectionCash', accounts, mappings);
  const voucherNumber = await generateNextVoucherNumber('collection');

  const journalEntryId = await _postPartyJournal({
    date: data.date,
    description: `سند قبض ${voucherNumber} - ${party.name}${data.description ? ' — ' + data.description : ''}`,
    debitAccountId: cashAccount?.id,
    creditAccountId: arAccount?.id,
    value: amount,
  });

  return dbAdd('PartyTransactions', {
    type: 'collection', voucherNumber, date: data.date, partyId: party.id, method: data.method,
    amount, description: data.description || '', journalEntryId,
    createdByUserId: currentUser?.id || null, createdByUserName: currentUser?.fullName || '',
  });
}

// سند صرف لمورّد: يدين "الموردون"، يدائن الصندوق/البنك حسب الطريقة
async function createPayment(data) {
  const party = await dbGet('Parties', data.partyId);
  if (!party || party.type !== 'supplier') throw new Error('يرجى اختيار مورّد مسجّل');
  const amount = Number(data.amount || 0);
  if (!(amount > 0)) throw new Error('المبلغ غير صحيح');

  const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  const [accounts, mappings] = await Promise.all([getAllAccounts(), loadAccountMappings()]);
  const apAccount = getMappedAccount('apControl', accounts, mappings);
  const cashAccount = getMappedAccount(PARTY_PAYMENT_MAPPING_KEY_BY_METHOD[data.method] || 'paymentCash', accounts, mappings);
  const voucherNumber = await generateNextVoucherNumber('payment');

  const journalEntryId = await _postPartyJournal({
    date: data.date,
    description: `سند صرف ${voucherNumber} - ${party.name}${data.description ? ' — ' + data.description : ''}`,
    debitAccountId: apAccount?.id,
    creditAccountId: cashAccount?.id,
    value: amount,
  });

  return dbAdd('PartyTransactions', {
    type: 'payment', voucherNumber, date: data.date, partyId: party.id, method: data.method,
    amount, description: data.description || '', journalEntryId,
    createdByUserId: currentUser?.id || null, createdByUserName: currentUser?.fullName || '',
  });
}

// ضخ فلوس (capitalIn) أو سحب فلوس (capitalOut) من/إلى شريك — حركة على "جاري الشريك" الموحّد (لا ذمم)،
// نفس نمط createCollection/createPayment لكن الطرف المقابل حساب الشريك المخصص (partyAccount:<id>، افتراضيًا
// partnerControl/3010) بدل arControl/apControl الثابتين. capitalIn: مدين نقد/بنك، دائن جاري الشريك (زيادة ما
// تدين به المزرعة له). capitalOut: عكسها تمامًا (مدين جاري الشريك، دائن نقد/بنك)
async function createCapitalTransaction(data) {
  const party = await dbGet('Parties', data.partyId);
  if (!party || party.type !== 'partner') throw new Error('يرجى اختيار شريك مسجّل');
  if (data.type !== 'capitalIn' && data.type !== 'capitalOut') throw new Error('نوع غير معروف');
  const amount = Number(data.amount || 0);
  if (!(amount > 0)) throw new Error('المبلغ غير صحيح');

  const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  const [accounts, mappings] = await Promise.all([getAllAccounts(), loadAccountMappings()]);
  const partnerAccount = getMappedAccountWithFallback([`partyAccount:${party.id}`, 'partnerControl'], accounts, mappings);
  const mappingKey = data.type === 'capitalIn'
    ? (PARTY_CAPITAL_IN_MAPPING_KEY_BY_METHOD[data.method] || 'partnerCapitalInCash')
    : (PARTY_CAPITAL_OUT_MAPPING_KEY_BY_METHOD[data.method] || 'partnerCapitalOutCash');
  const cashAccount = getMappedAccount(mappingKey, accounts, mappings);
  const voucherNumber = await generateNextVoucherNumber(data.type);
  const typeLabel = PARTY_TRANSACTION_TYPE_LABELS[data.type];

  const journalEntryId = await _postPartyJournal({
    date: data.date,
    description: `${typeLabel} ${voucherNumber} - ${party.name}${data.description ? ' — ' + data.description : ''}`,
    debitAccountId: data.type === 'capitalIn' ? cashAccount?.id : partnerAccount?.id,
    creditAccountId: data.type === 'capitalIn' ? partnerAccount?.id : cashAccount?.id,
    value: amount,
  });

  return dbAdd('PartyTransactions', {
    type: data.type, voucherNumber, date: data.date, partyId: party.id, method: data.method,
    amount, description: data.description || '', journalEntryId,
    createdByUserId: currentUser?.id || null, createdByUserName: currentUser?.fullName || '',
  });
}

// مرتجع/خصم: ينشئ سجل Revenues/Purchases **حقيقي بمبلغ سالب** (receiveMethod/paymentMethod: 'credit') حتى
// يُخصم تلقائيًا من SUM(amount) في كل تقارير/داشبورد المبيعات والمشتريات الحالية بلا أي تعديل عليها (قرار
// عمل)، مع قيد محاسبي مخصّص (مدين حساب المردودات/دائن الذمم للعميل، مدين الموردون/دائن حساب مرتجعات
// المشتريات للمورّد) بدل المرور عبر syncRevenueJournalEntry/syncPurchaseJournalEntry العاديتين (تفترضان
// مبلغًا موجبًا دومًا). نفس مبدأ إنشاء createExpense بقيد مخصّص فوق سجل عادي في custody-service.js
// (تسوية invoiceSettlement/convertToExpense).
// ⚠️ أي كود مستقبلي يقرأ Revenues/Purchases ويفترض amount > 0 دومًا سيُخطئ بوجود هذه السجلات — راجع CLAUDE.md
async function createReturnOrDiscount(data) {
  const party = await dbGet('Parties', data.partyId);
  if (!party) throw new Error('الطرف غير موجود');
  if (party.type === 'partner') throw new Error('المرتجعات والخصومات غير مدعومة لحساب جاري الشريك حاليًا');
  const amount = Number(data.amount || 0);
  if (!(amount > 0)) throw new Error('المبلغ غير صحيح');
  if (data.type !== 'return' && data.type !== 'discount') throw new Error('نوع غير معروف');

  const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  const [accounts, mappings] = await Promise.all([getAllAccounts(), loadAccountMappings()]);
  const voucherNumber = await generateNextVoucherNumber(data.type);
  const typeLabel = PARTY_TRANSACTION_TYPE_LABELS[data.type];

  let journalEntryId, linkedRevenueId = null, linkedPurchaseId = null;

  if (party.type === 'client') {
    const returnAccount = getMappedAccount('salesReturn', accounts, mappings);
    linkedRevenueId = await createRevenue({
      category: PARTY_RETURN_CATEGORY_LABEL.client,
      categoryAccountId: returnAccount?.id || null,
      amount: -amount,
      date: data.date,
      hasTaxInvoice: false,
      amountBeforeTax: null,
      taxAmount: null,
      receiveMethod: 'credit',
      partyId: party.id,
      client: party.name,
      notes: `${typeLabel} ${voucherNumber}${data.description ? ' — ' + data.description : ''}`,
      animalId: null,
    });
    const arAccount = getMappedAccount('arControl', accounts, mappings);
    journalEntryId = await _postPartyJournal({
      date: data.date, description: `${typeLabel} مبيعات ${voucherNumber} - ${party.name}`,
      debitAccountId: returnAccount?.id, creditAccountId: arAccount?.id, value: amount,
    });
    if (journalEntryId) await dbUpdate('Revenues', linkedRevenueId, { journalEntryId });
  } else {
    const returnAccount = getMappedAccount('purchaseReturn', accounts, mappings);
    linkedPurchaseId = await createPurchase({
      category: PARTY_RETURN_CATEGORY_LABEL.supplier,
      categoryAccountId: returnAccount?.id || null,
      amount: -amount,
      date: data.date,
      hasTaxInvoice: false,
      amountBeforeTax: null,
      taxAmount: null,
      paymentMethod: 'credit',
      partyId: party.id,
      vendor: party.name,
      status: 'approved',
      notes: `${typeLabel} ${voucherNumber}${data.description ? ' — ' + data.description : ''}`,
    });
    const apAccount = getMappedAccount('apControl', accounts, mappings);
    journalEntryId = await _postPartyJournal({
      date: data.date, description: `${typeLabel} مشتريات ${voucherNumber} - ${party.name}`,
      debitAccountId: apAccount?.id, creditAccountId: returnAccount?.id, value: amount,
    });
    if (journalEntryId) await dbUpdate('Purchases', linkedPurchaseId, { journalEntryId });
  }

  return dbAdd('PartyTransactions', {
    type: data.type, voucherNumber, date: data.date, partyId: party.id,
    amount, description: data.description || '', journalEntryId,
    linkedRevenueId, linkedPurchaseId,
    createdByUserId: currentUser?.id || null, createdByUserName: currentUser?.fullName || '',
  });
}

// ===== الرصيد الحيّ وكشف الحساب =====
// اتفاقية موحّدة لعميل/مورّد/شريك: موجب = مدين (الطرف مدين لنا)، سالب = دائن (نحن مدينون له).
// `fixedAssets` باراميتر اختياري (افتراضيًا []) — مطلوب فقط لدقة رصيد الشريك (مساهمات الأصول)، لا يؤثر على
// عميل/مورّد فبقاء الاستدعاءات القديمة بلا هذا الوسيط لا يكسر شيئًا
function computePartyBalance(party, revenues, purchases, partyTransactions, fixedAssets = []) {
  const openingSigned = (party.openingBalanceType || 'debit') === 'debit'
    ? Number(party.openingBalance || 0) : -Number(party.openingBalance || 0);

  if (party.type === 'client') {
    const creditInvoicesTotal = revenues
      .filter(r => Number(r.partyId) === Number(party.id) && r.receiveMethod === 'credit')
      .reduce((s, r) => s + Number(r.amount || 0), 0);
    const collectionsTotal = partyTransactions
      .filter(t => Number(t.partyId) === Number(party.id) && t.type === 'collection')
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    return openingSigned + creditInvoicesTotal - collectionsTotal;
  }

  if (party.type === 'partner') {
    // حساب "جاري الشريك" الموحّد: مبيعات آجلة له تزيد ما يدين به لنا، مشتريات آجلة منه/ضخ فلوس/مساهمة أصل
    // تزيد ما ندين به له، سحب فلوس يعكس ذلك — انظر شرح القرار في CLAUDE.md (صف PartyTransactions)
    const saleCreditsTotal = revenues
      .filter(r => Number(r.partyId) === Number(party.id) && r.receiveMethod === 'credit')
      .reduce((s, r) => s + Number(r.amount || 0), 0);
    const purchaseCreditsTotal = purchases
      .filter(p => Number(p.partyId) === Number(party.id) && p.paymentMethod === 'credit')
      .reduce((s, p) => s + Number(p.amount || 0), 0);
    const capitalInTotal = partyTransactions
      .filter(t => Number(t.partyId) === Number(party.id) && t.type === 'capitalIn')
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    const capitalOutTotal = partyTransactions
      .filter(t => Number(t.partyId) === Number(party.id) && t.type === 'capitalOut')
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    // computeAssetCostBasis (fixed-asset-service.js) قد لا تكون محمَّلة في صفحات لا تتعامل مع الشريك أصلاً
    // (مثل customer-collection.html) — دفاعي بمجموع تكلفة الشراء وحدها في تلك الحالة النادرة
    const costBasisFn = (typeof computeAssetCostBasis === 'function')
      ? computeAssetCostBasis : (a) => Number(a.purchaseCost || 0);
    const assetContributionsTotal = fixedAssets
      .filter(a => Number(a.partyId) === Number(party.id) && a.paymentMethod === 'partnerContribution')
      .reduce((s, a) => s + costBasisFn(a), 0);
    return openingSigned + saleCreditsTotal - purchaseCreditsTotal - capitalInTotal + capitalOutTotal - assetContributionsTotal;
  }

  const creditPurchasesTotal = purchases
    .filter(p => Number(p.partyId) === Number(party.id) && p.paymentMethod === 'credit')
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  const paymentsTotal = partyTransactions
    .filter(t => Number(t.partyId) === Number(party.id) && t.type === 'payment')
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  return openingSigned - creditPurchasesTotal + paymentsTotal;
}

// يبني كشف الحساب الزمني الكامل (فواتير آجلة + سندات قبض/صرف + مرتجعات/خصومات، أو لشريك: فواتير آجلة +
// ضخ/سحب فلوس + مساهمات أصول) مع رصيد تراكمي — الفواتير السالبة (مرتجع/خصم) تُوسَم بنوعها الحقيقي عبر البحث
// في PartyTransactions المرتبطة بدل تخمينه من نص الفئة (كلا النوعين يتشاركان نفس نص الفئة في
// Revenues/Purchases، انظر PARTY_RETURN_CATEGORY_LABEL أعلاه). `fixedAssets` اختياري (افتراضيًا [])، مطلوب
// فقط لعرض مساهمات الأصول ضمن كشف حساب شريك (انظر computePartyBalance أعلاه لنفس المبدأ). كل سطر يحمل أيضًا
// `journalEntryId` (من السجل المصدر نفسه — Revenues/Purchases/PartyTransactions/FixedAssets، قد يكون null لو
// تعذّر ترحيل قيده وقتها) ليعرضه المستهلك (party-statement-page.js) كـ"رقم القيد" مع رابط لصفحة القيد
function getPartyLedgerEntries(party, revenues, purchases, partyTransactions, fixedAssets = []) {
  const openingSigned = (party.openingBalanceType || 'debit') === 'debit'
    ? Number(party.openingBalance || 0) : -Number(party.openingBalance || 0);

  const adjustmentsByRevenueId = new Map();
  const adjustmentsByPurchaseId = new Map();
  partyTransactions
    .filter(t => Number(t.partyId) === Number(party.id) && (t.type === 'return' || t.type === 'discount'))
    .forEach(t => {
      if (t.linkedRevenueId) adjustmentsByRevenueId.set(t.linkedRevenueId, t);
      if (t.linkedPurchaseId) adjustmentsByPurchaseId.set(t.linkedPurchaseId, t);
    });

  let events = [];
  if (party.type === 'client') {
    events = revenues
      .filter(r => Number(r.partyId) === Number(party.id) && r.receiveMethod === 'credit')
      .map(r => {
        const adj = adjustmentsByRevenueId.get(r.id);
        return {
          date: r.date, sortKey: r.id,
          kind: adj ? adj.type : 'invoice',
          label: adj ? `${PARTY_TRANSACTION_TYPE_LABELS[adj.type]} ${adj.voucherNumber}${adj.description ? ' — ' + adj.description : ''}` : r.category,
          amount: Number(r.amount || 0),
          journalEntryId: r.journalEntryId || null,
        };
      })
      .concat(partyTransactions
        .filter(t => Number(t.partyId) === Number(party.id) && t.type === 'collection')
        .map(t => ({
          date: t.date, sortKey: t.id, kind: 'collection',
          label: `سند قبض ${t.voucherNumber} (${PARTY_TRANSACTION_METHOD_LABELS[t.method] || t.method})${t.description ? ' — ' + t.description : ''}`,
          amount: -Number(t.amount || 0),
          journalEntryId: t.journalEntryId || null,
        })));
  } else if (party.type === 'partner') {
    events = revenues
      .filter(r => Number(r.partyId) === Number(party.id) && r.receiveMethod === 'credit')
      .map(r => ({
        date: r.date, sortKey: `r${r.id}`, kind: 'invoice',
        label: `بيع آجل — ${r.category}`, amount: Number(r.amount || 0),
        journalEntryId: r.journalEntryId || null,
      }))
      .concat(purchases
        .filter(p => Number(p.partyId) === Number(party.id) && p.paymentMethod === 'credit')
        .map(p => ({
          date: p.date, sortKey: `p${p.id}`, kind: 'invoice',
          label: `شراء آجل — ${p.category}`, amount: -Number(p.amount || 0),
          journalEntryId: p.journalEntryId || null,
        })))
      .concat(partyTransactions
        .filter(t => Number(t.partyId) === Number(party.id) && t.type === 'capitalIn')
        .map(t => ({
          date: t.date, sortKey: `t${t.id}`, kind: 'capitalIn',
          label: `ضخ فلوس ${t.voucherNumber} (${PARTY_TRANSACTION_METHOD_LABELS[t.method] || t.method})${t.description ? ' — ' + t.description : ''}`,
          amount: -Number(t.amount || 0),
          journalEntryId: t.journalEntryId || null,
        })))
      .concat(partyTransactions
        .filter(t => Number(t.partyId) === Number(party.id) && t.type === 'capitalOut')
        .map(t => ({
          date: t.date, sortKey: `t${t.id}`, kind: 'capitalOut',
          label: `سحب فلوس ${t.voucherNumber} (${PARTY_TRANSACTION_METHOD_LABELS[t.method] || t.method})${t.description ? ' — ' + t.description : ''}`,
          amount: Number(t.amount || 0),
          journalEntryId: t.journalEntryId || null,
        })))
      .concat(fixedAssets
        .filter(a => Number(a.partyId) === Number(party.id) && a.paymentMethod === 'partnerContribution')
        .map(a => ({
          date: a.purchaseDate, sortKey: `a${a.id}`, kind: 'assetContribution',
          label: `مساهمة أصل — ${a.name} (${a.assetCode || ''})`,
          amount: -((typeof computeAssetCostBasis === 'function') ? computeAssetCostBasis(a) : Number(a.purchaseCost || 0)),
          journalEntryId: a.journalEntryId || null,
        })));
  } else {
    events = purchases
      .filter(p => Number(p.partyId) === Number(party.id) && p.paymentMethod === 'credit')
      .map(p => {
        const adj = adjustmentsByPurchaseId.get(p.id);
        return {
          date: p.date, sortKey: p.id,
          kind: adj ? adj.type : 'invoice',
          label: adj ? `${PARTY_TRANSACTION_TYPE_LABELS[adj.type]} ${adj.voucherNumber}${adj.description ? ' — ' + adj.description : ''}` : p.category,
          amount: -Number(p.amount || 0),
          journalEntryId: p.journalEntryId || null,
        };
      })
      .concat(partyTransactions
        .filter(t => Number(t.partyId) === Number(party.id) && t.type === 'payment')
        .map(t => ({
          date: t.date, sortKey: t.id, kind: 'payment',
          label: `سند صرف ${t.voucherNumber} (${PARTY_TRANSACTION_METHOD_LABELS[t.method] || t.method})${t.description ? ' — ' + t.description : ''}`,
          amount: Number(t.amount || 0),
          journalEntryId: t.journalEntryId || null,
        })));
  }

  // مقارنة عامة (لا طرح رقمي) لأن sortKey رقم لعميل/مورّد لكن نص مسبوق بحرف نوع المصدر (r/p/t/a) لشريك —
  // تفادي تصادم أرقام id بين Revenues/Purchases/PartyTransactions/FixedAssets المختلفة
  events.sort((a, b) => (a.date === b.date ? (a.sortKey > b.sortKey ? 1 : (a.sortKey < b.sortKey ? -1 : 0)) : (a.date < b.date ? -1 : 1)));

  let running = openingSigned;
  const rows = events.map(e => {
    running += e.amount;
    return { ...e, runningBalance: running };
  });

  return { openingBalance: openingSigned, rows, closingBalance: running };
}

// هل الطرف "متأخر" (عميل)/"مستحق سداده" (مورّد)؟ تقريب مبسّط (تاريخ أقدم فاتورة آجلة موجبة له + paymentTermDays
// مقارنة باليوم) وليس تخصيصًا FIFO دقيقًا يربط كل فاتورة بما سُدِّد منها تحديدًا — كافٍ لتنبيه/فلتر عام
// "متأخر/مستحق" (انظر computeDebtAging أدناه للتوزيع الزمني الدقيق المستخدم في تقرير "أعمار الديون")
function isPartyOverdue(party, revenues, purchases, asOfDate = null) {
  if (party.type !== 'client' && party.type !== 'supplier') return false; // الشريك ليس له مفهوم "متأخر" (جاري لا ذمم)
  if (!(Number(party.paymentTermDays) > 0)) return false;
  const list = (party.type === 'client' ? revenues : purchases)
    .filter(x => Number(x.partyId) === Number(party.id)
      && (party.type === 'client' ? x.receiveMethod : x.paymentMethod) === 'credit'
      && Number(x.amount) > 0);
  const oldestDate = list.reduce((min, x) => (!min || x.date < min) ? x.date : min, null);
  if (!oldestDate) return false;
  const due = new Date(oldestDate);
  due.setDate(due.getDate() + Number(party.paymentTermDays));
  return due.toISOString().slice(0, 10) < (asOfDate || todayIso());
}

// ملخّص "سجل" لطرف واحد (عدد الفواتير/الإجمالي/المسدد أو المدفوع/الرصيد/آخر فاتورة/آخر تحصيل أو سداد) —
// يُستخدم في تبويب "سجل الأرصدة" بتقارير الأطراف وفي بطاقة العميل/المورّد معًا. **`totalAmount` يشمل كل
// الفواتير (نقدي وآجل)** بعكس `computePartyBalance` الذي يقتصر على الآجلة فقط — "إجمالي المبيعات/المشتريات"
// هنا رقم إجمالي معلوماتي، أما تأثير الذمم الفعلي فمقصور على الآجل كما هو موثّق أعلاه
function getPartyRegistrySummary(party, revenues, purchases, partyTransactions) {
  const list = party.type === 'client' ? revenues : purchases;
  const txType = party.type === 'client' ? 'collection' : 'payment';

  const relevant = list.filter(x => Number(x.partyId) === Number(party.id));
  const invoiceCount = relevant.filter(x => Number(x.amount) > 0).length;
  const totalAmount = relevant.reduce((s, x) => s + Number(x.amount || 0), 0);

  const settlements = partyTransactions.filter(t => Number(t.partyId) === Number(party.id) && t.type === txType);
  const settledAmount = settlements.reduce((s, t) => s + Number(t.amount || 0), 0);

  const lastInvoiceDate = relevant.reduce((max, x) => (!max || x.date > max) ? x.date : max, null);
  const lastSettlementDate = settlements.reduce((max, t) => (!max || t.date > max) ? t.date : max, null);

  const balance = computePartyBalance(party, revenues, purchases, partyTransactions);

  return { invoiceCount, totalAmount, settledAmount, balance, lastInvoiceDate, lastSettlementDate };
}

// أعمار الديون (تخصيص FIFO حقيقي، بعكس isPartyOverdue التقريبي أعلاه): تُبنى قائمة أحداث زمنية واحدة —
// كل فاتورة آجلة موجبة تفتح "دفعة" (bucket) جديدة، وكل مرتجع/خصم (مبلغ سالب من نفس مصدر الفاتورة) أو
// تحصيل/سداد يُستهلك من أقدم دفعة مفتوحة أولاً (FIFO) حتى تُطفأ بالكامل أو ينتهي المبلغ. الدفعات المتبقية
// غير المطفأة في نهاية المعالجة تُصنَّف حسب عمرها (أيام منذ تاريخها) عند `asOfDate`
function computeDebtAging(party, revenues, purchases, partyTransactions, asOfDate = null) {
  const cutoff = asOfDate || todayIso();
  const list = party.type === 'client' ? revenues : purchases;
  const methodField = party.type === 'client' ? 'receiveMethod' : 'paymentMethod';
  const txType = party.type === 'client' ? 'collection' : 'payment';

  const invoiceEvents = list
    .filter(x => Number(x.partyId) === Number(party.id) && x[methodField] === 'credit' && x.date <= cutoff)
    .map(x => ({ date: x.date, sortKey: x.id, amount: Number(x.amount || 0) })); // + فاتورة، − مرتجع/خصم

  const settlementEvents = partyTransactions
    .filter(t => Number(t.partyId) === Number(party.id) && t.type === txType && t.date <= cutoff)
    .map(t => ({ date: t.date, sortKey: t.id, amount: -Number(t.amount || 0) }));

  const events = [...invoiceEvents, ...settlementEvents]
    .sort((a, b) => (a.date === b.date ? a.sortKey - b.sortKey : (a.date < b.date ? -1 : 1)));

  const queue = []; // {date, remaining} — دفعات فواتير لم تُطفأ بالكامل بعد، بترتيب الأقدم فالأحدث
  events.forEach(e => {
    if (e.amount > 0) {
      queue.push({ date: e.date, remaining: e.amount });
      return;
    }
    let toConsume = -e.amount;
    while (toConsume > 0.01 && queue.length) {
      const bucket = queue[0];
      const consumed = Math.min(bucket.remaining, toConsume);
      bucket.remaining -= consumed;
      toConsume -= consumed;
      if (bucket.remaining <= 0.01) queue.shift();
    }
  });

  const buckets = { current: 0, d30: 0, d60: 0, d90: 0, over90: 0 };
  const cutoffTime = new Date(cutoff).getTime();
  queue.forEach(b => {
    const days = Math.floor((cutoffTime - new Date(b.date).getTime()) / (24 * 60 * 60 * 1000));
    if (days <= 0) buckets.current += b.remaining;
    else if (days <= 30) buckets.d30 += b.remaining;
    else if (days <= 60) buckets.d60 += b.remaining;
    else if (days <= 90) buckets.d90 += b.remaining;
    else buckets.over90 += b.remaining;
  });

  const total = buckets.current + buckets.d30 + buckets.d60 + buckets.d90 + buckets.over90;
  return { ...buckets, total, unpaidInvoiceCount: queue.length };
}
