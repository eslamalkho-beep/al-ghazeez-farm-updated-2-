// js/services/fixed-asset-service.js
// إدارة الأصول الثابتة: تسجيل الأصل (شراء/إضافة) + الإهلاك بالقسط الثابت + نقل/تحسينات/بيع/استبعاد/جرد.
// كل عملية ذات أثر مالي تُنشئ تلقائيًا قيدًا محاسبيًا مزدوجًا (اقتناء: مدين حساب الأصل/دائن صندوق أو بنك أو
// ذمم دائنة؛ إهلاك دوري: مدين مصروف الإهلاك/دائن مجمع الإهلاك مجمَّعًا لكل نوع؛ تحسين: مدين حساب الأصل مجددًا؛
// بيع/استبعاد: قيد مركّب يُصفّي حساب الأصل ومجمع إهلاكه ويثبت ربح أو خسارة البيع/الاستبعاد).
// `FixedAssetTransactions` سجل أحداث append-only لكل أصل (نفس مبدأ CustodySettlements/PartyTransactions) —
// يبني السجل الزمني في بطاقة الأصل، بأنواع: 'depreciation'|'improvement'|'maintenance'|'transfer'|'sale'|'disposal'.
// ⚠️ 'maintenance' (صيانة) ≠ 'improvement' (تحسين): الصيانة مصروف عادي (مدين حساب مصروف صيانة/دائن نقد-بنك-
// ذمم) لا يُرسمَل على حساب الأصل ولا يزيد `improvementsTotal`/التكلفة الدفترية — فقط يُسجَّل مرتبطًا بالأصل
// للتتبع التاريخي، بعكس التحسين الذي يُرسمَل كإضافة فعلية لتكلفة الأصل نفسه.
// `FixedAssetCounts` سجل جلسات جرد دوري منفصل (نمط StockCounts) — توثيق فقط بلا أثر محاسبي، عدا تحديث
// الموقع تلقائيًا للأصول التي يكتشف الجرد نقلها فعليًا (انظر createFixedAssetCount).

const FIXED_ASSET_TYPE_LABELS = {
  land: 'أرض', building: 'مبنى/حظيرة', vehicle: 'سيارة',
  equipment: 'معدات وآلات', device: 'جهاز', furniture: 'أثاث', other: 'أخرى',
};

// 'sold' تُضبط من sellFixedAsset، 'disposed' من disposeFixedAsset — 'underMaintenance' غير مستخدمة فعليًا
// من أي واجهة حاليًا (محجوزة لتوسّع لاحق)، كل الأصول غير المباعة/المستبعدة تبقى 'active'
const FIXED_ASSET_STATUS_LABELS = {
  active: 'نشط', sold: 'مباع', disposed: 'مستبعد', underMaintenance: 'تحت الصيانة',
};

// تعيين ثابت (نوع الأصل ← مفاتيح ربط "الأصول الثابتة" في شاشة ربط العمليات بالحسابات) — الأرض بلا إهلاك
// فبلا مفتاحي مجمع/مصروف. الافتراضيات من الشجرة الهرمية: 13 الأصول الثابتة / 136 مجمع الإهلاك / 75 الإهلاك
const FIXED_ASSET_TYPE_MAPPING_KEYS = {
  land: { assetKey: 'assetLand', depreciationKey: null, expenseKey: null },
  building: { assetKey: 'assetBuilding', depreciationKey: 'accDepBuilding', expenseKey: 'depExpenseBuilding' },
  vehicle: { assetKey: 'assetVehicle', depreciationKey: 'accDepVehicle', expenseKey: 'depExpenseVehicle' },
  equipment: { assetKey: 'assetEquipment', depreciationKey: 'accDepEquipment', expenseKey: 'depExpenseEquipment' },
  device: { assetKey: 'assetDevice', depreciationKey: 'accDepOther', expenseKey: 'depExpenseOther' },
  furniture: { assetKey: 'assetFurniture', depreciationKey: 'accDepOther', expenseKey: 'depExpenseOther' },
  other: { assetKey: 'assetOther', depreciationKey: 'accDepOther', expenseKey: 'depExpenseOther' },
};

// طريقة دفع اقتناء الأصل → مفتاح الربط (نقدي = assetPayCash، تحويل/شيك = assetPayBank، آجل = assetPayCredit)
const FIXED_ASSET_PAYMENT_MAPPING_KEY_BY_METHOD = { cash: 'assetPayCash', transfer: 'assetPayBank', cheque: 'assetPayBank', credit: 'assetPayCredit' };

// استلام حصيلة بيع الأصل → مفتاح الربط (نقدي = cash، تحويل/شيك = bank، آجل = العملاء arControl) — 'credit'
// هنا يدين "العملاء والذمم المدينة" مباشرة لأن البيع نفسه ليس فاتورة Revenues عادية (لا يمر عبر
// syncRevenueJournalEntry)، فيتطلب partyId إلزاميًا (عميل مسجّل) ليُحسب له كذمة مدينة صحيحة.
// ⚠️ **قيد معروف**: بعكس Revenues/Purchases، لا حقل partyId مخزَّن فعليًا على معاملة FixedAssetTransactions
// (فقط اسم المشتري نصًا في notes) — لذا بيع أصل آجلاً يزيد رصيد حساب الذمم الإجمالي في شجرة الحسابات بشكل
// صحيح، لكنه **لا يظهر** ضمن رصيد ذلك العميل تحديدًا في computePartyBalance()/party-card.html (تلك الدالة
// تقرأ فقط Revenues/Purchases/PartyTransactions). تسوية بيع أصل آجل تتم يدويًا حاليًا (سند قبض عادي من
// customer-collection.html يُخفّض الذمم الإجمالي لكن بلا ربط تلقائي بهذا العميل تحديدًا)
const FIXED_ASSET_SALE_MAPPING_KEY_BY_METHOD = { cash: 'assetSaleCash', transfer: 'assetSaleBank', cheque: 'assetSaleBank', credit: 'assetSaleCredit' };

// ربح/خسارة بيع أو استبعاد الأصل الثابت — الفرق بين سعر البيع (أو صفر عند الاستبعاد) والقيمة الدفترية
const FIXED_ASSET_GAIN_MAPPING_KEY = 'assetGain';
const FIXED_ASSET_LOSS_MAPPING_KEY = 'assetLoss';

// ===== قراءة أساسية =====

async function getAllFixedAssets() {
  const all = await dbGetAll('FixedAssets');
  return all.filter(a => a.status !== 'deleted');
}

async function getFixedAssetById(id) {
  if (!id) return null;
  return dbGet('FixedAssets', id);
}

async function getAllFixedAssetTransactions(assetId = null) {
  const all = await dbGetAll('FixedAssetTransactions');
  return all
    .filter(t => t.status !== 'deleted' && (!assetId || Number(t.assetId) === Number(assetId)))
    .sort((a, b) => (a.date === b.date ? (a.id - b.id) : (a.date < b.date ? -1 : 1)));
}

async function generateNextFixedAssetCode() {
  const all = await getAllFixedAssets();
  const numbers = all
    .map(a => (a.assetCode && a.assetCode.startsWith('FA-')) ? parseInt(a.assetCode.replace('FA-', ''), 10) : 0)
    .filter(n => !isNaN(n));
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `FA-${String(next).padStart(4, '0')}`;
}

// ===== حسابات حيّة (غير مخزَّنة) — نفس مبدأ computeBulkGroupBalances/computeItemStockLevel =====

function computeAssetCostBasis(asset) {
  // improvementsTotal مجموع تراكمي مخزَّن (يُحدَّث في createFixedAssetImprovement)، بنفس مبدأ
  // accumulatedDepreciation — تفاديًا لجعل هذه الدالة async (تُستدعى من كل صفحة عرض/قائمة حاليًا)
  return Number(asset.purchaseCost || 0) + Number(asset.acquisitionAdditionalCosts || 0) + Number(asset.improvementsTotal || 0);
}

function computeAssetBookValue(asset) {
  return computeAssetCostBasis(asset) - Number(asset.accumulatedDepreciation || 0);
}

// القسط الثابت الشهري: (تكلفة الأصل − القيمة المتبقية) ÷ (العمر الإنتاجي بالسنوات × 12) — صفر دومًا للأراضي
function computeMonthlyDepreciation(asset) {
  if (asset.assetType === 'land') return 0;
  const lifeYears = Number(asset.usefulLifeYears || 0);
  if (!(lifeYears > 0)) return 0;
  const depreciableValue = Math.max(computeAssetCostBasis(asset) - Number(asset.residualValue || 0), 0);
  return Math.round((depreciableValue / (lifeYears * 12)) * 100) / 100;
}

// ===== CRUD الأصل + قيد الاقتناء =====

async function createFixedAsset(data) {
  const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  const assetCode = await generateNextFixedAssetCode();
  const isLand = data.assetType === 'land';
  const id = await dbAdd('FixedAssets', {
    ...data,
    assetCode,
    usefulLifeYears: isLand ? null : (data.usefulLifeYears || null),
    residualValue: isLand ? 0 : Number(data.residualValue || 0),
    accumulatedDepreciation: 0,
    assetStatus: 'active',
    journalEntryId: null,
    createdByUserId: currentUser?.id || null,
    createdByUserName: currentUser?.fullName || '',
  });
  await syncFixedAssetJournalEntry(id);
  return id;
}

async function updateFixedAsset(id, data) {
  const isLand = data.assetType === 'land';
  await dbUpdate('FixedAssets', id, {
    ...data,
    usefulLifeYears: isLand ? null : (data.usefulLifeYears || null),
    residualValue: isLand ? 0 : Number(data.residualValue || 0),
  });
  return syncFixedAssetJournalEntry(id);
}

// حذف ناعم للأصل نفسه — لا يحذف سجل معاملات الإهلاك السابقة (نفس مبدأ بقاء المرفقات بعد حذف مصروف
// ناعمًا، موثّق في CLAUDE.md)، فقط يعكس قيد الاقتناء الأصلي
async function deleteFixedAsset(id) {
  await reverseFixedAssetJournalEntry(id);
  return dbSoftDelete('FixedAssets', id);
}

// يبني/يحدّث قيد اقتناء الأصل (مدين حساب الأصل حسب النوع / دائن صندوق أو بنك أو ذمم دائنة حسب طريقة الدفع) —
// نفس نمط syncPurchaseJournalEntry تمامًا، يُستدعى بعد كل إنشاء/تعديل حتى يواكب القيد أي تغيير لاحق في
// التكلفة/طريقة الدفع
async function syncFixedAssetJournalEntry(assetId) {
  const asset = await getFixedAssetById(assetId);
  const costBasis = asset ? computeAssetCostBasis(asset) : 0;
  if (!asset || !(costBasis > 0)) return null;

  const [accounts, mappings] = await Promise.all([getAllAccounts(), loadAccountMappings()]);
  const typeKeys = FIXED_ASSET_TYPE_MAPPING_KEYS[asset.assetType] || FIXED_ASSET_TYPE_MAPPING_KEYS.other;
  const debitAccount = getMappedAccount(typeKeys.assetKey, accounts, mappings);

  if ((asset.paymentMethod === 'credit' || asset.paymentMethod === 'partnerContribution') && !asset.partyId) return null; // دفاعي — يُفرَض فعليًا في asset-form-page.js
  // 'partnerContribution' (مساهمة أصل من شريك): دائن حساب الشريك المخصص (partyAccount:<id>، افتراضيًا
  // partnerControl/3010) بدل مفتاح ثابت — نفس آلية partyAccount المستخدمة في syncRevenueJournalEntry/
  // syncPurchaseJournalEntry، بعكس بقية طرق الدفع هنا (مفتاح عام واحد بصرف النظر عن المورّد)
  const creditAccount = asset.paymentMethod === 'partnerContribution'
    ? getMappedAccountWithFallback([`partyAccount:${asset.partyId}`, 'partnerControl'], accounts, mappings)
    : getMappedAccount(FIXED_ASSET_PAYMENT_MAPPING_KEY_BY_METHOD[asset.paymentMethod] || 'cash', accounts, mappings);
  if (!debitAccount || !creditAccount) return null; // حساب أساسي محذوف يدويًا من شجرة الحسابات

  const lines = [
    { accountId: debitAccount.id, debit: costBasis, credit: 0 },
    { accountId: creditAccount.id, debit: 0, credit: costBasis },
  ];
  const description = `اقتناء أصل ثابت: ${asset.name} (${asset.assetCode})`;

  const existingEntry = asset.journalEntryId ? await getJournalEntryById(asset.journalEntryId) : null;
  if (existingEntry && existingEntry.status !== 'deleted') {
    await updateJournalEntry(existingEntry.id, { date: asset.purchaseDate, description, lines });
    return existingEntry.id;
  }

  const entryNumber = await generateNextEntryNumber();
  const newEntryId = await createJournalEntry({ entryNumber, date: asset.purchaseDate, description, lines });
  await dbUpdate('FixedAssets', assetId, { journalEntryId: newEntryId });
  return newEntryId;
}

async function reverseFixedAssetJournalEntry(assetId) {
  const asset = await getFixedAssetById(assetId);
  if (asset && asset.journalEntryId) await deleteJournalEntry(asset.journalEntryId);
}

// ===== تشغيل إهلاك الفترة (يدوي — لا يوجد cron في تطبيق client-side) =====

// آخر يوم في الشهر لصيغة period 'YYYY-MM' — يُستخدم لمقارنة usageStartDate ولتاريخ القيد الافتراضي
function _lastDayOfMonthIso(period) {
  const [year, month] = period.split('-').map(Number);
  const lastDay = new Date(year, month, 0); // اليوم صفر من الشهر التالي = آخر يوم في الشهر الحالي
  return lastDay.toISOString().slice(0, 10);
}

// معاينة حيّة: الأصول المستحقة إهلاكًا لشهر period، بمبلغ لا يتجاوز القيمة القابلة للإهلاك المتبقية،
// ومستبعدة تلقائيًا إن سبق ترحيل إهلاك لنفس الأصل في نفس الفترة (منع الترحيل المزدوج)
async function previewDepreciationForPeriod(period) {
  const [assets, allTxns] = await Promise.all([getAllFixedAssets(), getAllFixedAssetTransactions()]);
  const alreadyDone = new Set(
    allTxns.filter(t => t.type === 'depreciation' && t.period === period).map(t => Number(t.assetId))
  );
  const periodEnd = _lastDayOfMonthIso(period);

  return assets
    .filter(a => a.assetStatus !== 'sold' && a.assetStatus !== 'disposed' && a.assetType !== 'land' && a.usageStartDate && a.usageStartDate <= periodEnd)
    .filter(a => !alreadyDone.has(a.id))
    .map(a => {
      const monthly = computeMonthlyDepreciation(a);
      const depreciableValue = Math.max(computeAssetCostBasis(a) - Number(a.residualValue || 0), 0);
      const remaining = Math.max(depreciableValue - Number(a.accumulatedDepreciation || 0), 0);
      const amount = Math.round(Math.min(monthly, remaining) * 100) / 100;
      return { asset: a, amount };
    })
    .filter(row => row.amount > 0.001);
}

// يبني سطور قيد مجمَّعة حسب زوج (مصروف/مجمع) لكل نوع أصل — نفس مبدأ _buildJournalLinesForStockCount
function _buildDepreciationJournalLines(rows, accounts, mappings) {
  const totalsByType = {}; // assetType -> { expenseAccount, depreciationAccount, value }
  rows.forEach(({ asset, amount }) => {
    if (!(amount > 0)) return;
    const keys = FIXED_ASSET_TYPE_MAPPING_KEYS[asset.assetType] || FIXED_ASSET_TYPE_MAPPING_KEYS.other;
    if (!keys.expenseKey || !keys.depreciationKey) return;
    const expenseAccount = getMappedAccount(keys.expenseKey, accounts, mappings);
    const depreciationAccount = getMappedAccount(keys.depreciationKey, accounts, mappings);
    if (!expenseAccount || !depreciationAccount) return;
    const key = asset.assetType;
    if (!totalsByType[key]) totalsByType[key] = { expenseAccount, depreciationAccount, value: 0 };
    totalsByType[key].value += amount;
  });

  const lines = [];
  Object.values(totalsByType).forEach(({ expenseAccount, depreciationAccount, value }) => {
    lines.push({ accountId: expenseAccount.id, debit: value, credit: 0 });
    lines.push({ accountId: depreciationAccount.id, debit: 0, credit: value });
  });
  return lines;
}

// يرحّل إهلاك شهر period دفعة واحدة: قيد يومية واحد مجمَّع + معاملة FixedAssetTransactions لكل أصل +
// تحديث accumulatedDepreciation لكل أصل
async function runDepreciationForPeriod(period, date) {
  const rows = await previewDepreciationForPeriod(period);
  if (!rows.length) throw new Error('لا توجد أصول مستحقة إهلاكًا لهذه الفترة');

  const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  const [accounts, mappings] = await Promise.all([getAllAccounts(), loadAccountMappings()]);
  const journalLines = _buildDepreciationJournalLines(rows, accounts, mappings);
  if (!journalLines.length) throw new Error('تعذّر بناء قيد الإهلاك — تأكد من وجود حسابات الإهلاك في شجرة الحسابات');

  const entryDate = date || _lastDayOfMonthIso(period);
  const entryNumber = await generateNextEntryNumber();
  const journalEntryId = await createJournalEntry({
    entryNumber, date: entryDate,
    description: `إهلاك دوري - شهر ${period}`,
    lines: journalLines,
  });

  let totalAmount = 0;
  for (const { asset, amount } of rows) {
    await dbAdd('FixedAssetTransactions', {
      assetId: asset.id, type: 'depreciation', date: entryDate, period, amount,
      notes: '', journalEntryId,
      createdByUserId: currentUser?.id || null, createdByUserName: currentUser?.fullName || '',
    });
    await dbUpdate('FixedAssets', asset.id, {
      accumulatedDepreciation: Number(asset.accumulatedDepreciation || 0) + amount,
    });
    totalAmount += amount;
  }

  return { journalEntryId, count: rows.length, totalAmount };
}

// سجل عمليات الإهلاك السابقة مجمَّعة حسب الفترة — تُستخدم في asset-depreciation-run.html لعرض/التراجع
async function getDepreciationPeriodsSummary() {
  const txns = (await getAllFixedAssetTransactions()).filter(t => t.type === 'depreciation');
  const byPeriod = {};
  txns.forEach(t => {
    if (!byPeriod[t.period]) byPeriod[t.period] = { period: t.period, count: 0, totalAmount: 0 };
    byPeriod[t.period].count += 1;
    byPeriod[t.period].totalAmount += Number(t.amount || 0);
  });
  return Object.values(byPeriod).sort((a, b) => (a.period < b.period ? 1 : -1));
}

// تراجع كامل عن ترحيل إهلاك فترة: يحذف القيد (أو القيود إن وُجد أكثر من واحد لسبب ما) ومعاملات الإهلاك،
// ويُنقص accumulatedDepreciation لكل أصل متأثر — نفس مبدأ unapproveStockCount
async function reverseDepreciationPeriod(period) {
  const allTxns = await getAllFixedAssetTransactions();
  const periodTxns = allTxns.filter(t => t.type === 'depreciation' && t.period === period);
  if (!periodTxns.length) throw new Error('لا يوجد ترحيل إهلاك لهذه الفترة');

  const journalEntryIds = [...new Set(periodTxns.map(t => t.journalEntryId).filter(Boolean))];
  for (const entryId of journalEntryIds) await deleteJournalEntry(entryId);

  for (const txn of periodTxns) {
    const asset = await getFixedAssetById(txn.assetId);
    if (asset) {
      await dbUpdate('FixedAssets', asset.id, {
        accumulatedDepreciation: Math.max(0, Number(asset.accumulatedDepreciation || 0) - Number(txn.amount || 0)),
      });
    }
    await dbSoftDelete('FixedAssetTransactions', txn.id);
  }
}

// ===== نقل الأصل (بلا أثر محاسبي — تحديث إداري بحت) =====

async function createFixedAssetTransfer(assetId, data) {
  const asset = await getFixedAssetById(assetId);
  if (!asset) throw new Error('الأصل غير موجود');
  const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;

  await dbUpdate('FixedAssets', assetId, {
    locationId: data.locationId || null,
    responsibleEmployeeId: data.responsibleEmployeeId || null,
  });

  return dbAdd('FixedAssetTransactions', {
    assetId, type: 'transfer', date: data.date, amount: 0, notes: data.notes || '',
    journalEntryId: null,
    createdByUserId: currentUser?.id || null, createdByUserName: currentUser?.fullName || '',
  });
}

// ===== تحسينات على الأصل (تزيد التكلفة الدفترية) =====

async function createFixedAssetImprovement(assetId, data) {
  const asset = await getFixedAssetById(assetId);
  if (!asset) throw new Error('الأصل غير موجود');
  const amount = Number(data.amount || 0);
  if (!(amount > 0)) throw new Error('أدخل مبلغًا صحيحًا للتحسين');
  if (data.paymentMethod === 'credit' && !data.partyId) throw new Error('التحسين الآجل يتطلب اختيار مورّد مسجّل');

  const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  const [accounts, mappings] = await Promise.all([getAllAccounts(), loadAccountMappings()]);
  const typeKeys = FIXED_ASSET_TYPE_MAPPING_KEYS[asset.assetType] || FIXED_ASSET_TYPE_MAPPING_KEYS.other;
  const debitAccount = getMappedAccount(typeKeys.assetKey, accounts, mappings);
  const creditKey = FIXED_ASSET_PAYMENT_MAPPING_KEY_BY_METHOD[data.paymentMethod] || 'cash';
  const creditAccount = getMappedAccount(creditKey, accounts, mappings);
  if (!debitAccount || !creditAccount) throw new Error('حساب أساسي مفقود من شجرة الحسابات');

  const lines = [
    { accountId: debitAccount.id, debit: amount, credit: 0 },
    { accountId: creditAccount.id, debit: 0, credit: amount },
  ];
  const description = `تحسين على أصل ثابت: ${asset.name} (${asset.assetCode})${data.description ? ' — ' + data.description : ''}`;
  const entryNumber = await generateNextEntryNumber();
  const journalEntryId = await createJournalEntry({ entryNumber, date: data.date, description, lines });

  const txnId = await dbAdd('FixedAssetTransactions', {
    assetId, type: 'improvement', date: data.date, amount, notes: data.description || '',
    journalEntryId,
    createdByUserId: currentUser?.id || null, createdByUserName: currentUser?.fullName || '',
  });

  await dbUpdate('FixedAssets', assetId, {
    improvementsTotal: Number(asset.improvementsTotal || 0) + amount,
  });

  return txnId;
}

// ===== صيانة الأصل (مصروف عادي مرتبط بالأصل للتتبع فقط — بعكس "تحسين" أعلاه لا يُرسمَل على حساب الأصل
// ولا يزيد تكلفته الدفترية؛ نفس نمط createFixedAssetImprovement تمامًا لكن المدين حساب مصروف صيانة
// (مُعرَّف من صاحب المشروع في شجرة الحسابات ثم يُربط من شاشة "ربط العمليات بالحسابات") بدل حساب الأصل نفسه) =====

const FIXED_ASSET_MAINTENANCE_PAYMENT_MAPPING_KEY_BY_METHOD = {
  cash: 'assetMaintenancePayCash', transfer: 'assetMaintenancePayBank', cheque: 'assetMaintenancePayBank', credit: 'assetMaintenancePayCredit',
};

async function createFixedAssetMaintenance(assetId, data) {
  const asset = await getFixedAssetById(assetId);
  if (!asset) throw new Error('الأصل غير موجود');
  const amount = Number(data.amount || 0);
  if (!(amount > 0)) throw new Error('أدخل مبلغًا صحيحًا لتكلفة الصيانة');
  if (data.paymentMethod === 'credit' && !data.partyId) throw new Error('الصيانة الآجلة تتطلب اختيار مورّد مسجّل');

  const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  const [accounts, mappings] = await Promise.all([getAllAccounts(), loadAccountMappings()]);
  const debitAccount = getMappedAccount('assetMaintenanceExpense', accounts, mappings);
  if (!debitAccount) throw new Error('حساب "مصروف صيانة الأصول" غير محدَّد — أنشئه من شجرة الحسابات (شاشة "شجرة الحسابات") ثم اربطه من شاشة "ربط العمليات بالحسابات" أولاً');
  const creditKey = FIXED_ASSET_MAINTENANCE_PAYMENT_MAPPING_KEY_BY_METHOD[data.paymentMethod] || 'assetMaintenancePayCash';
  const creditAccount = getMappedAccount(creditKey, accounts, mappings);
  if (!creditAccount) throw new Error('حساب أساسي مفقود من شجرة الحسابات');

  const lines = [
    { accountId: debitAccount.id, debit: amount, credit: 0 },
    { accountId: creditAccount.id, debit: 0, credit: amount },
  ];
  const description = `صيانة أصل ثابت: ${asset.name} (${asset.assetCode})${data.description ? ' — ' + data.description : ''}`;
  const entryNumber = await generateNextEntryNumber();
  const journalEntryId = await createJournalEntry({ entryNumber, date: data.date, description, lines });

  return dbAdd('FixedAssetTransactions', {
    assetId, type: 'maintenance', date: data.date, amount, notes: data.description || '',
    journalEntryId,
    createdByUserId: currentUser?.id || null, createdByUserName: currentUser?.fullName || '',
  });
}

// ===== بيع الأصل =====
// قيد مركّب: مدين حساب الاستلام (نقدية/بنك/ذمم مدينة) بسعر البيع + مدين مجمع إهلاك الأصل (تصفيته) /
// دائن حساب الأصل بكامل تكلفته الدفترية (تصفيته)، والفرق ربحًا أو خسارة (انظر ربط assetGain/assetLoss)

async function sellFixedAsset(assetId, data) {
  const asset = await getFixedAssetById(assetId);
  if (!asset) throw new Error('الأصل غير موجود');
  if (asset.assetStatus === 'sold' || asset.assetStatus === 'disposed') throw new Error('هذا الأصل مباع أو مستبعد بالفعل');
  if (data.paymentMethod === 'credit' && !data.partyId) throw new Error('البيع الآجل يتطلب اختيار عميل مسجّل (ليُحسب له كذمة مدينة)');

  const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  const [accounts, mappings] = await Promise.all([getAllAccounts(), loadAccountMappings()]);
  const typeKeys = FIXED_ASSET_TYPE_MAPPING_KEYS[asset.assetType] || FIXED_ASSET_TYPE_MAPPING_KEYS.other;
  const assetAccount = getMappedAccount(typeKeys.assetKey, accounts, mappings);
  const depreciationAccount = typeKeys.depreciationKey ? getMappedAccount(typeKeys.depreciationKey, accounts, mappings) : null;
  const receiveKey = FIXED_ASSET_SALE_MAPPING_KEY_BY_METHOD[data.paymentMethod] || 'cash';
  const receiveAccount = getMappedAccount(receiveKey, accounts, mappings);
  if (!assetAccount || !receiveAccount) throw new Error('حساب أساسي مفقود من شجرة الحسابات');

  const costBasis = computeAssetCostBasis(asset);
  const accumulatedDepreciation = Number(asset.accumulatedDepreciation || 0);
  const salePrice = Number(data.salePrice || 0);
  const bookValue = costBasis - accumulatedDepreciation;
  const gainLoss = salePrice - bookValue; // موجب = ربح، سالب = خسارة

  const lines = [];
  if (salePrice > 0) lines.push({ accountId: receiveAccount.id, debit: salePrice, credit: 0 });
  if (accumulatedDepreciation > 0.01 && depreciationAccount) lines.push({ accountId: depreciationAccount.id, debit: accumulatedDepreciation, credit: 0 });
  lines.push({ accountId: assetAccount.id, debit: 0, credit: costBasis });
  if (Math.abs(gainLoss) > 0.01) {
    if (gainLoss > 0) {
      const gainAccount = getMappedAccount(FIXED_ASSET_GAIN_MAPPING_KEY, accounts, mappings);
      if (!gainAccount) throw new Error('حساب أرباح بيع الأصول الثابتة مفقود من شجرة الحسابات');
      lines.push({ accountId: gainAccount.id, debit: 0, credit: gainLoss });
    } else {
      const lossAccount = getMappedAccount(FIXED_ASSET_LOSS_MAPPING_KEY, accounts, mappings);
      if (!lossAccount) throw new Error('حساب خسائر بيع الأصول الثابتة مفقود من شجرة الحسابات');
      lines.push({ accountId: lossAccount.id, debit: -gainLoss, credit: 0 });
    }
  }

  const description = `بيع أصل ثابت: ${asset.name} (${asset.assetCode})`;
  const entryNumber = await generateNextEntryNumber();
  const journalEntryId = await createJournalEntry({ entryNumber, date: data.date, description, lines });

  const buyerNote = data.buyerName ? `المشتري: ${data.buyerName}` : '';
  const notes = [buyerNote, data.notes].filter(Boolean).join(' — ');
  await dbAdd('FixedAssetTransactions', {
    assetId, type: 'sale', date: data.date, amount: salePrice, notes,
    journalEntryId,
    createdByUserId: currentUser?.id || null, createdByUserName: currentUser?.fullName || '',
  });

  await dbUpdate('FixedAssets', assetId, { assetStatus: 'sold' });

  return { journalEntryId, gainLoss };
}

// ===== استبعاد الأصل (إعدام/فاقد بلا بيع — كامل القيمة الدفترية خسارة) =====
// مقصورة على مدير النظام، نفس مبدأ تسوية "إعدام أو فاقد" في custody-service.js

async function disposeFixedAsset(assetId, data) {
  const asset = await getFixedAssetById(assetId);
  if (!asset) throw new Error('الأصل غير موجود');
  if (asset.assetStatus === 'sold' || asset.assetStatus === 'disposed') throw new Error('هذا الأصل مباع أو مستبعد بالفعل');

  const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  if (!currentUser || resolveRoleKey(currentUser.role) !== 'systemAdmin') {
    throw new Error('استبعاد أصل ثابت يتطلب اعتماد مدير النظام');
  }

  const [accounts, mappings] = await Promise.all([getAllAccounts(), loadAccountMappings()]);
  const typeKeys = FIXED_ASSET_TYPE_MAPPING_KEYS[asset.assetType] || FIXED_ASSET_TYPE_MAPPING_KEYS.other;
  const assetAccount = getMappedAccount(typeKeys.assetKey, accounts, mappings);
  const depreciationAccount = typeKeys.depreciationKey ? getMappedAccount(typeKeys.depreciationKey, accounts, mappings) : null;
  const lossAccount = getMappedAccount(FIXED_ASSET_LOSS_MAPPING_KEY, accounts, mappings);
  if (!assetAccount || !lossAccount) throw new Error('حساب أساسي مفقود من شجرة الحسابات');

  const costBasis = computeAssetCostBasis(asset);
  const accumulatedDepreciation = Number(asset.accumulatedDepreciation || 0);
  const bookValue = Math.max(costBasis - accumulatedDepreciation, 0);

  const lines = [];
  if (accumulatedDepreciation > 0.01 && depreciationAccount) lines.push({ accountId: depreciationAccount.id, debit: accumulatedDepreciation, credit: 0 });
  if (bookValue > 0.01) lines.push({ accountId: lossAccount.id, debit: bookValue, credit: 0 });
  lines.push({ accountId: assetAccount.id, debit: 0, credit: costBasis });

  const description = `استبعاد أصل ثابت: ${asset.name} (${asset.assetCode})${data.reason ? ' — ' + data.reason : ''}`;
  const entryNumber = await generateNextEntryNumber();
  const journalEntryId = await createJournalEntry({ entryNumber, date: data.date, description, lines });

  await dbAdd('FixedAssetTransactions', {
    assetId, type: 'disposal', date: data.date, amount: bookValue, notes: data.reason || '',
    journalEntryId,
    createdByUserId: currentUser?.id || null, createdByUserName: currentUser?.fullName || '',
  });

  await dbUpdate('FixedAssets', assetId, { assetStatus: 'disposed' });

  return { journalEntryId, lossAmount: bookValue };
}

// ===== جرد الأصول (نمط StockCounts، لكن توثيق فقط بلا تسوية قيمة) =====

const FIXED_ASSET_COUNT_RESULT_LABELS = {
  matched: 'مطابق', missing: 'مفقود', damaged: 'تالف', relocated: 'تم نقله',
};

async function getAllFixedAssetCounts() {
  const all = await dbGetAll('FixedAssetCounts');
  return all.filter(c => c.status !== 'deleted').sort((a, b) => (a.date < b.date ? 1 : (a.date > b.date ? -1 : b.id - a.id)));
}

// data: { date, notes, lines: [{assetId, resultStatus, locationId?, notes?}] } — أسطر resultStatus:'relocated'
// بموقع فعلي مختلف تُحدِّث موقع الأصل تلقائيًا + تسجّل معاملة 'transfer' مرجعها هذا الجرد، حتى لا يبقى
// الموقع المسجَّل مخالفًا لما اكتُشف فعليًا أثناء الجرد
async function createFixedAssetCount(data) {
  const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  const countId = await dbAdd('FixedAssetCounts', {
    date: data.date, notes: data.notes || '', lines: data.lines || [],
    createdByUserId: currentUser?.id || null, createdByUserName: currentUser?.fullName || '',
  });

  for (const line of (data.lines || [])) {
    if (line.resultStatus !== 'relocated' || !line.locationId) continue;
    const asset = await getFixedAssetById(line.assetId);
    if (!asset || Number(asset.locationId) === Number(line.locationId)) continue;
    await dbUpdate('FixedAssets', asset.id, { locationId: Number(line.locationId) });
    await dbAdd('FixedAssetTransactions', {
      assetId: asset.id, type: 'transfer', date: data.date, amount: 0,
      notes: `اكتُشف نقله أثناء الجرد بتاريخ ${data.date}${line.notes ? ' — ' + line.notes : ''}`,
      journalEntryId: null,
      createdByUserId: currentUser?.id || null, createdByUserName: currentUser?.fullName || '',
    });
  }

  return countId;
}

// آخر نتيجة جرد لأصل معيّن — تُستخدم في تقرير "جرد الأصول" لعرض "لم يُجرد بعد" للأصول التي لا سجل لها
function getLatestCountLineForAsset(assetId, allCounts) {
  for (const count of allCounts) { // allCounts مرتّبة تنازليًا حسب التاريخ (getAllFixedAssetCounts)
    const line = (count.lines || []).find(l => Number(l.assetId) === Number(assetId));
    if (line) return { count, line };
  }
  return null;
}
