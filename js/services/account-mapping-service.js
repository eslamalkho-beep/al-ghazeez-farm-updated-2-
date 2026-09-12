// js/services/account-mapping-service.js
// ربط العمليات بالحسابات: كل نقطة ترحيل تلقائي في النظام (صندوق/بنك/عهد/ذمم/مخزون/جملة/أصول ثابتة/تسويات...)
// لها حساب افتراضي من الشجرة الهرمية، وقابل للتغيير من شاشة "ربط العمليات بالحسابات" (accounting/account-mappings.html)
// — يُخزَّن الاختيار المخصص في مخزن AccountMappings (سجل واحد لكل مفتاح)، وغالبية الخدمات تحل الحساب عبر
// resolveMappedAccountCode() بالترتيب: مخصص > افتراضي. غياب أي سجل = استخدام الافتراضي (نفس اتفاقية
// "الغياب = افتراضي" المستخدمة في Users.permissions/AccountingPeriods)

// تعريفات كل نقاط الربط — المجموعة تظهر كبطاقة في الشاشة، وdefaultCode هو الافتراضي من الشجرة الجديدة
const ACCOUNT_MAPPING_GROUPS = [
  { key: 'cashBank', label: 'النقدية والبنوك' },
  { key: 'receivables', label: 'الذمم والمرتجعات' },
  { key: 'core', label: 'المصروفات والإيرادات والمشتريات' },
  { key: 'custody', label: 'إدارة العهد' },
  { key: 'inventory', label: 'المخزون' },
  { key: 'bulk', label: 'الشراء والبيع الجماعي' },
  { key: 'fixedAssets', label: 'الأصول الثابتة' },
  { key: 'adjustments', label: 'التسويات المحاسبية' },
];

const ACCOUNT_MAPPING_DEFINITIONS = [
  // ===== النقدية والبنوك =====
  { key: 'cash', group: 'cashBank', label: 'حساب الصندوق', note: 'عمليات النقد في المصروفات/الإيرادات/المشتريات/الجملة/العهد/السندات', defaultCode: '11101' },
  { key: 'bank', group: 'cashBank', label: 'حساب البنك', note: 'التحويلات والمدفوعات البنكية و"شبكة" في السندات', defaultCode: '11102' },

  // ===== الذمم والمرتجعات =====
  { key: 'arControl', group: 'receivables', label: 'العملاء والذمم المدينة', note: 'الحساب الرأسي للفواتير الآجلة وسندات القبض', defaultCode: '112' },
  { key: 'apControl', group: 'receivables', label: 'الموردون (الذمم الدائنة)', note: 'الحساب الرأسي للمشتريات الآجلة وسندات الصرف', defaultCode: '211' },
  { key: 'openingBalancePlug', group: 'receivables', label: 'موازنة الرصيد الافتتاحي', note: 'الطرف المقابل لقيد الرصيد الافتتاحي للعميل/المورّد', defaultCode: '3020' },
  { key: 'salesReturn', group: 'receivables', label: 'مرتجعات وخصومات المبيعات', note: 'تُرحَّل من سندات المرتجع/الخصم للعملاء', defaultCode: '49' },
  { key: 'purchaseReturn', group: 'receivables', label: 'مرتجعات وخصومات المشتريات', note: 'تُرحَّل من سندات المرتجع/الخصم للموردين', defaultCode: '81' },
  { key: 'collectionCash', group: 'receivables', label: 'سند قبض: نقدي', note: 'المدين عند تحصيل من عميل نقدًا', defaultCode: '11101' },
  { key: 'collectionBank', group: 'receivables', label: 'سند قبض: بنك/تحويل/شبكة', note: 'المدين عند تحصيل بغير النقد', defaultCode: '11102' },
  { key: 'paymentCash', group: 'receivables', label: 'سند صرف: نقدي', note: 'الدائن عند سداد لمورّد نقدًا', defaultCode: '11101' },
  { key: 'paymentBank', group: 'receivables', label: 'سند صرف: بنك/تحويل/شبكة', note: 'الدائن عند سداد لمورّد بغير النقد', defaultCode: '11102' },
  { key: 'partnerControl', group: 'receivables', label: 'جاري الشريك (افتراضي)', note: 'الحساب الافتراضي لأي شريك بلا حساب ذمم مخصص من شاشة حسابات الأطراف', defaultCode: '3010' },
  { key: 'partnerCapitalInCash', group: 'receivables', label: 'ضخ فلوس (شريك): نقدي', note: 'المدين عند استلام مساهمة نقدية من شريك نقدًا', defaultCode: '11101' },
  { key: 'partnerCapitalInBank', group: 'receivables', label: 'ضخ فلوس (شريك): بنك/تحويل/شبكة', note: 'المدين عند استلام مساهمة نقدية من شريك بغير النقد', defaultCode: '11102' },
  { key: 'partnerCapitalOutCash', group: 'receivables', label: 'سحب فلوس (شريك): نقدي', note: 'الدائن عند صرف سحب لشريك نقدًا', defaultCode: '11101' },
  { key: 'partnerCapitalOutBank', group: 'receivables', label: 'سحب فلوس (شريك): بنك/تحويل/شبكة', note: 'الدائن عند صرف سحب لشريك بغير النقد', defaultCode: '11102' },

  // ===== المصروفات والإيرادات والمشتريات =====
  { key: 'expenseFallback', group: 'core', label: 'مصروف افتراضي', note: 'لسجل مصروف بلا بند قابل للمطابقة (دفاعي)', defaultCode: '74107' },
  { key: 'revenueFallback', group: 'core', label: 'إيراد افتراضي', note: 'لسجل إيراد بلا بند قابل للمطابقة (دفاعي)', defaultCode: '43104' },
  { key: 'purchaseFallback', group: 'core', label: 'مشترى افتراضي', note: 'لسجل مشترى بلا بند قابل للمطابقة (دفاعي)', defaultCode: '74107' },
  { key: 'expensePayCash', group: 'core', label: 'مصروف: دفع نقدي', note: 'الدائن عند دفع مصروف نقدًا', defaultCode: '11101' },
  { key: 'expensePayBank', group: 'core', label: 'مصروف: دفع تحويل/بنك', note: 'الدائن عند دفع مصروف بتحويل أو شيك', defaultCode: '11102' },
  { key: 'expensePayPending', group: 'core', label: 'مصروف: معلّق بانتظار الاعتماد', note: 'الدائن ما لم يُعتمد المصروف بعد', defaultCode: '211' },
  { key: 'purchasePayCash', group: 'core', label: 'مشترى: دفع نقدي', note: 'الدائن عند دفع مشترى نقدًا', defaultCode: '11101' },
  { key: 'purchasePayBank', group: 'core', label: 'مشترى: دفع تحويل/بنك', note: 'الدائن عند دفع مشترى بتحويل أو شيك', defaultCode: '11102' },
  { key: 'purchasePayCredit', group: 'core', label: 'مشترى: آجل (مورّد)', note: 'يدائن الموردون عند الشراء الآجل', defaultCode: '211' },
  { key: 'purchasePayPending', group: 'core', label: 'مشترى: معلّق بانتظار الاعتماد', note: 'الدائن ما لم يُعتمد المشترى بعد', defaultCode: '211' },
  { key: 'revenueReceiveCash', group: 'core', label: 'إيراد: تحصيل نقدي', note: 'المدين عند تحصيل إيراد نقدًا', defaultCode: '11101' },
  { key: 'revenueReceiveBank', group: 'core', label: 'إيراد: تحصيل تحويل/بنك', note: 'المدين عند تحصيل إيراد بتحويل', defaultCode: '11102' },
  { key: 'revenueReceiveCredit', group: 'core', label: 'إيراد: آجل (عميل)', note: 'يدين العملاء عند البيع الآجل', defaultCode: '112' },
  { key: 'animalSaleSheep', group: 'core', label: 'بيع حيوان فردي: أغنام', note: 'بند الإيراد المقترح تلقائيًا عند اختيار حيوان أغنام في نموذج الإيراد', defaultCode: '41101' },
  { key: 'animalSaleGoat', group: 'core', label: 'بيع حيوان فردي: ماعز', note: 'بند الإيراد المقترح تلقائيًا عند اختيار حيوان ماعز في نموذج الإيراد', defaultCode: '41201' },

  // ===== إدارة العهد =====
  { key: 'custodyControl', group: 'custody', label: 'عهد الموظفين', note: 'إصدار وتصفية وتسوية كل العهد (نقدية وعينية)', defaultCode: '12105' },
  { key: 'custodyPayrollDeduction', group: 'custody', label: 'تسوية "خصم من الراتب"', note: 'المدين عند خصم العهدة من راتب الموظف', defaultCode: '12106' },
  { key: 'custodyChargeToEmployee', group: 'custody', label: 'تسوية "تحميل على الموظف"', note: 'مديونية مفتوحة على الموظف', defaultCode: '12107' },
  { key: 'custodyWriteOff', group: 'custody', label: 'تسوية "إعدام أو فاقد"', note: 'خسارة عهدة فعلية (مدير النظام فقط)', defaultCode: '81105' },
  { key: 'custodyAdminWaiver', group: 'custody', label: 'تسوية "إلغاء بقرار الإدارة"', note: 'إلغاء رصيد بقرار إداري (مدير النظام فقط)', defaultCode: '81105' },
  { key: 'custodyExpenseDefault', group: 'custody', label: 'مصروف افتراضي لتسويات العهد', note: 'عند "تحويل لمصروف"/"تسوية بفواتير" بلا بند محدد', defaultCode: '74107' },
  { key: 'custodyInventoryFodder', group: 'custody', label: 'مخزون الأعلاف (عهد عينية)', note: 'عند صرف/رد أصناف علف', defaultCode: '11301' },
  { key: 'custodyInventoryMedicine', group: 'custody', label: 'مخزون الأدوية (عهد عينية)', note: 'عند صرف/رد أصناف أدوية', defaultCode: '11302' },
  { key: 'custodyInventoryEquipment', group: 'custody', label: 'مخزون معدات/مستلزمات (عهد عينية)', note: 'عند صرف/رد معدات أو مستلزمات', defaultCode: '11303' },

  // ===== المخزون =====
  { key: 'inventoryAssetFodder', group: 'inventory', label: 'مخزون الأعلاف (جرد)', note: 'الدائن عند اعتماد جرد أعلاف', defaultCode: '11301' },
  { key: 'inventoryAssetMedicine', group: 'inventory', label: 'مخزون الأدوية (جرد)', note: 'الدائن عند اعتماد جرد أدوية', defaultCode: '11302' },
  { key: 'inventoryAssetEquipment', group: 'inventory', label: 'مخزون معدات/مستلزمات (جرد)', note: 'الدائن عند اعتماد جرد معدات/مستلزمات', defaultCode: '11303' },
  { key: 'inventoryExpenseFodder', group: 'inventory', label: 'مصروف استهلاك الأعلاف (جرد)', note: 'المدين عند اعتماد جرد أعلاف', defaultCode: '61101' },
  { key: 'inventoryExpenseMedicine', group: 'inventory', label: 'مصروف استهلاك الأدوية (جرد)', note: 'المدين عند اعتماد جرد أدوية', defaultCode: '62101' },
  { key: 'inventoryExpenseEquipment', group: 'inventory', label: 'مصروف استهلاك معدات/مستلزمات (جرد)', note: 'المدين عند اعتماد جرد معدات/مستلزمات', defaultCode: '74107' },

  // ===== الشراء والبيع الجماعي =====
  { key: 'bulkInventorySheepMale', group: 'bulk', label: 'مخزون: ذكور أغنام', note: 'مدين شراء/دائن بيع جملة', defaultCode: '1140102' },
  { key: 'bulkInventorySheepFemale', group: 'bulk', label: 'مخزون: إناث أغنام', note: 'مدين شراء/دائن بيع جملة', defaultCode: '1140101' },
  { key: 'bulkInventoryGoatMale', group: 'bulk', label: 'مخزون: ذكور ماعز', note: 'مدين شراء/دائن بيع جملة', defaultCode: '1140202' },
  { key: 'bulkInventoryGoatFemale', group: 'bulk', label: 'مخزون: إناث ماعز', note: 'مدين شراء/دائن بيع جملة', defaultCode: '1140201' },
  { key: 'bulkRevenueSheepMale', group: 'bulk', label: 'مبيعات: ذكور أغنام', note: 'دائن إيراد بيع جملة', defaultCode: '41102' },
  { key: 'bulkRevenueSheepFemale', group: 'bulk', label: 'مبيعات: إناث أغنام', note: 'دائن إيراد بيع جملة', defaultCode: '41101' },
  { key: 'bulkRevenueGoatMale', group: 'bulk', label: 'مبيعات: ذكور ماعز', note: 'دائن إيراد بيع جملة', defaultCode: '41202' },
  { key: 'bulkRevenueGoatFemale', group: 'bulk', label: 'مبيعات: إناث ماعز', note: 'دائن إيراد بيع جملة', defaultCode: '41201' },
  { key: 'bulkCogsSheep', group: 'bulk', label: 'تكلفة بضاعة مباعة: أغنام', note: 'مدين تكلفة المبيعات عند بيع جملة', defaultCode: '51101' },
  { key: 'bulkCogsGoat', group: 'bulk', label: 'تكلفة بضاعة مباعة: ماعز', note: 'مدين تكلفة المبيعات عند بيع جملة', defaultCode: '51102' },

  // ===== الأصول الثابتة =====
  { key: 'assetLand', group: 'fixedAssets', label: 'أصل: أرض', note: 'حساب اقتناء الأرض', defaultCode: '13101' },  { key: 'assetBuilding', group: 'fixedAssets', label: 'أصل: مبنى/إنشاءات', note: 'حساب اقتناء المباني', defaultCode: '13201' },
  { key: 'assetVehicle', group: 'fixedAssets', label: 'أصل: سيارة/مركبة', note: 'حساب اقتناء المركبات', defaultCode: '13401' },
  { key: 'assetEquipment', group: 'fixedAssets', label: 'أصل: معدات وآلات', note: 'حساب اقتناء المعدات', defaultCode: '13301' },
  { key: 'assetDevice', group: 'fixedAssets', label: 'أصل: جهاز', note: 'حساب اقتناء الأجهزة', defaultCode: '13502' },
  { key: 'assetFurniture', group: 'fixedAssets', label: 'أصل: أثاث', note: 'حساب اقتناء الأثاث', defaultCode: '13501' },
  { key: 'assetOther', group: 'fixedAssets', label: 'أصل: أخرى', note: 'حساب اقتناء أصول أخرى', defaultCode: '13504' },
  { key: 'accDepBuilding', group: 'fixedAssets', label: 'مجمع إهلاك: مباني', note: 'دائن ترحيل الإهلاك', defaultCode: '13601' },
  { key: 'accDepEquipment', group: 'fixedAssets', label: 'مجمع إهلاك: معدات', note: 'دائن ترحيل الإهلاك', defaultCode: '13602' },
  { key: 'accDepVehicle', group: 'fixedAssets', label: 'مجمع إهلاك: سيارات', note: 'دائن ترحيل الإهلاك', defaultCode: '13603' },
  { key: 'accDepOther', group: 'fixedAssets', label: 'مجمع إهلاك: أثاث/أجهزة/أخرى', note: 'دائن ترحيل الإهلاك', defaultCode: '13604' },
  { key: 'depExpenseBuilding', group: 'fixedAssets', label: 'مصروف إهلاك: مباني', note: 'مدين ترحيل الإهلاك', defaultCode: '75101' },
  { key: 'depExpenseEquipment', group: 'fixedAssets', label: 'مصروف إهلاك: معدات', note: 'مدين ترحيل الإهلاك', defaultCode: '75102' },
  { key: 'depExpenseVehicle', group: 'fixedAssets', label: 'مصروف إهلاك: سيارات', note: 'مدين ترحيل الإهلاك', defaultCode: '75103' },
  { key: 'depExpenseOther', group: 'fixedAssets', label: 'مصروف إهلاك: أثاث/أجهزة/أخرى', note: 'مدين ترحيل الإهلاك', defaultCode: '75104' },
  { key: 'assetGain', group: 'fixedAssets', label: 'أرباح بيع أصل', note: 'الفرق الموجب عند البيع/الاستبعاد', defaultCode: '82101' },
  { key: 'assetLoss', group: 'fixedAssets', label: 'خسائر بيع أصل', note: 'الفرق السالب عند البيع/الاستبعاد', defaultCode: '81101' },
  { key: 'assetPayCash', group: 'fixedAssets', label: 'اقتناء أصل: نقدي', note: 'الدائن عند اقتناء أصل نقدًا', defaultCode: '11101' },
  { key: 'assetPayBank', group: 'fixedAssets', label: 'اقتناء أصل: تحويل/بنك', note: 'الدائن عند اقتناء أصل بتحويل أو شيك', defaultCode: '11102' },
  { key: 'assetPayCredit', group: 'fixedAssets', label: 'اقتناء أصل: آجل (مورّد)', note: 'يدائن الموردون عند الاقتناء الآجل', defaultCode: '211' },
  { key: 'assetSaleCash', group: 'fixedAssets', label: 'بيع أصل: نقدي', note: 'المدين عند استلام حصيلة البيع نقدًا', defaultCode: '11101' },
  { key: 'assetSaleBank', group: 'fixedAssets', label: 'بيع أصل: تحويل/بنك', note: 'المدين عند استلام حصيلة البيع بتحويل', defaultCode: '11102' },
  { key: 'assetSaleCredit', group: 'fixedAssets', label: 'بيع أصل: آجل (عميل)', note: 'يدين العملاء عند البيع الآجل', defaultCode: '112' },
  { key: 'assetMaintenanceExpense', group: 'fixedAssets', label: 'مصروف صيانة الأصول', note: 'المدين عند تسجيل صيانة أصل — أنشئ حسابًا مخصصًا من شجرة الحسابات واربطه هنا', defaultCode: '74107' },
  { key: 'assetMaintenancePayCash', group: 'fixedAssets', label: 'صيانة أصل: نقدي', note: 'الدائن عند دفع تكلفة الصيانة نقدًا', defaultCode: '11101' },
  { key: 'assetMaintenancePayBank', group: 'fixedAssets', label: 'صيانة أصل: تحويل/بنك', note: 'الدائن عند دفع تكلفة الصيانة بتحويل أو شيك', defaultCode: '11102' },
  { key: 'assetMaintenancePayCredit', group: 'fixedAssets', label: 'صيانة أصل: آجل (مورّد)', note: 'يدائن الموردون عند الصيانة الآجلة', defaultCode: '211' },

  // ===== التسويات المحاسبية =====
  { key: 'accruedExpenseControl', group: 'adjustments', label: 'مصروفات مستحقة', note: 'حساب التحكم لمصروف مستحق', defaultCode: '21205' },
  { key: 'accruedRevenueControl', group: 'adjustments', label: 'إيرادات مستحقة', note: 'حساب التحكم لإيراد مستحق', defaultCode: '11203' },
  { key: 'prepaidExpenseControl', group: 'adjustments', label: 'مصروفات مدفوعة مقدمًا', note: 'حساب التحكم لمصروف مقدم', defaultCode: '12101' },
  { key: 'deferredRevenueControl', group: 'adjustments', label: 'إيرادات مقدمة', note: 'حساب التحكم لإيراد مقدم', defaultCode: '21205' },
  { key: 'cashShortage', group: 'adjustments', label: 'عجز الصندوق', note: 'فرق جرد سالب', defaultCode: '81104' },
  { key: 'cashOverage', group: 'adjustments', label: 'فائض الصندوق', note: 'فرق جرد موجب', defaultCode: '82103' },
];

const _ACCOUNT_MAPPING_DEFS_BY_KEY = new Map(ACCOUNT_MAPPING_DEFINITIONS.map(d => [d.key, d]));

// يقرأ كل الاختيارات المخصصة من المخزن ويعيد خريطة {key: accountCode} — المفاتيح بلا سجل تُهمَل
// (تُحل بالافتراضي عبر resolveMappedAccountCode)
async function loadAccountMappings() {
  const all = await dbGetAll('AccountMappings');
  const map = {};
  all.filter(m => m.status !== 'deleted' && m.accountCode).forEach(m => { map[m.key] = m.accountCode; });
  return map;
}

// يحفظ (أو يحدّث) ربط مفتاح بحساب — null/فارغ يُزيل السجل فيعود الافتراضي (أو بلا ربط للمفاتيح المركّبة)
// المفاتيح المركّبة الديناميكية (خارج ACCOUNT_MAPPING_DEFINITIONS) مسموحة: catInventory:<accountId>،
// catPayCash/catPayBank/catPayCredit:<accountId>، catReceiveCash/catReceiveBank/catReceiveCredit:<accountId>،
// partyAccount:<partyId>
async function setAccountMapping(key, accountCode) {
  const definition = _ACCOUNT_MAPPING_DEFS_BY_KEY.get(key);

  const existing = (await dbGetAll('AccountMappings')).find(m => m.key === key && m.status !== 'deleted');

  if (!accountCode || (definition && accountCode === definition.defaultCode)) {
    // بلا قيمة، أو نفس الافتراضي = بلا حاجة لسجل مخصص (يُحذف أي سجل قديم إن وُجد)
    if (existing) await dbHardDelete('AccountMappings', existing.id);
    return null;
  }

  const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  if (existing) {
    return dbUpdate('AccountMappings', existing.id, {
      accountCode,
      updatedByUserId: currentUser?.id || null,
      updatedByUserName: currentUser?.fullName || '',
    });
  }
  return dbAdd('AccountMappings', {
    key,
    accountCode,
    updatedByUserId: currentUser?.id || null,
    updatedByUserName: currentUser?.fullName || '',
  });
}

// يحل كود الحساب الفعلي لمفتاح: مخصص > افتراضي من التعريف (المفاتيح المركّبة بلا تعريف تُعيد مخصصها فقط أو null)
function resolveMappedAccountCode(key, mappings) {
  if (mappings && mappings[key]) return mappings[key];
  const definition = _ACCOUNT_MAPPING_DEFS_BY_KEY.get(key);
  return definition ? definition.defaultCode : null;
}

// يحل كود الحساب عبر سلسلة تراجع (الأول الذي له قيمة يفوز) — للتفصيل التدريجي: حساب الطرف > حساب البند > العام
function resolveMappedAccountCodeWithFallback(keys, mappings) {
  for (const key of keys) {
    if (!key) continue;
    const code = resolveMappedAccountCode(key, mappings);
    if (code) return code;
  }
  return null;
}

// يجد كائن الحساب الفعلي من قائمة حسابات محمَّلة مسبقًا (نفس مبدأ getAccountByCode لكن عبر الربط)
function getMappedAccount(key, accounts, mappings) {
  const code = resolveMappedAccountCode(key, mappings);
  return code ? getAccountByCode(code, accounts) : null;
}

// نفس getMappedAccount لكن بسلسلة تراجع (مفاتيح مرتبة بالأولوية)
function getMappedAccountWithFallback(keys, accounts, mappings) {
  const code = resolveMappedAccountCodeWithFallback(keys, mappings);
  return code ? getAccountByCode(code, accounts) : null;
}
