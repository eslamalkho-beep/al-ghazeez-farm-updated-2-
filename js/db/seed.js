// js/db/seed.js
// تهيئة أولية عند أول تشغيل فقط: حسابا الدخول الافتراضيان + شجرة الحسابات الافتراضية الهرمية (بنودها هي نفسها
// حسابات المصروفات/الإيرادات — لا مخزن "تكويدات" منفصل، انظر CLAUDE.md).
// لا تُدرج أي بيانات تشغيلية تجريبية (قطيع/مصروفات/إيرادات) — قاعدة البيانات تبدأ نظيفة.

// خريطة تحويل كود حساب قديم → جديد (للترحيل لمرة واحدة لقواعد بيانات موجودة مسبقًا بشجرة الحسابات المسطحة
// القديمة). القيمة المساوية للمفتاح (3020) تعني: يُبقى الحساب نفسه مع ضبط حقول الهرم فقط دون حذف/إعادة توجيه
const ACCOUNT_CODE_MIGRATIONS = {
  '1000': '11101', '1010': '11102', '1020': '12105', '1021': '12106', '1022': '12107',
  '1030': '11301', '1031': '11303', '1035': '11401', '1040': '13301', '2000': '211', '2010': '22101',
  '3000': '31101', '3010': '32102', '3020': '3020',
  '4000': '41101', '4010': '41101', '4020': '43104', '4030': '49', '4040': '82101', '4050': '82103',
  '5000': '61101', '5010': '62101', '5020': '71101', '5030': '72105', '5040': '72109', '5045': '51103',
  '5050': '74107', '5060': '51101', '5070': '74107', '5080': '74107', '5090': '74107',
  '5091': '81105', '5092': '81105', '5095': '81',
  '5100': '75101', '5101': '75103', '5102': '75102', '5103': '75104', '5104': '75104', '5105': '75104',
  '5106': '81101', '5110': '81104',
  '1042': '13101', '1043': '13201', '1044': '13601', '1045': '13401', '1046': '13603',
  '1048': '13602', '1049': '13502', '1052': '13604', '1053': '13501', '1054': '13604',
  '1055': '13504', '1056': '13604',
  '1060': '11203', '1061': '12101', '2020': '21205', '2030': '21205',
};

// الشجرة الهرمية الجديدة كاملة — [الكود, الاسم, النوع, الحساب الأب, القائمة المالية, قابل للترحيل]
// القائمة المالية: 'balanceSheet' = المركز المالي، 'incomeStatement' = قائمة الدخل
// الحساب 3020 "أرصدة افتتاحية (عملاء وموردون)" إضافة ضرورية فوق الشجرة المقترحة (حساب موازنة للقيد الافتتاحي
// لرصيد العميل/المورّد — انظر _postPartyOpeningBalanceJournal في party-service.js)
const _NEW_CHART_ACCOUNTS = [
  ['1', 'الأصول', 'asset', null, 'balanceSheet', false],
  ['11', 'الأصول المتداولة', 'asset', '1', 'balanceSheet', false],
  ['111', 'النقدية والبنوك', 'asset', '11', 'balanceSheet', false],
  ['11101', 'الصندوق الرئيسي', 'asset', '111', 'balanceSheet', true],
  ['11102', 'بنك الرياض حـ/', 'asset', '111', 'balanceSheet', true],
  ['11103', 'حسابات بنكية أخرى', 'asset', '111', 'balanceSheet', true],
  ['112', 'العملاء والذمم المدينة', 'asset', '11', 'balanceSheet', false],
  ['11201', 'العملاء - افراد', 'asset', '112', 'balanceSheet', true],
  ['11202', 'العملاء - السوق', 'asset', '112', 'balanceSheet', true],
  ['11203', 'ذمم مدينة أخرى', 'asset', '112', 'balanceSheet', true],
  ['113', 'المخزون', 'asset', '11', 'balanceSheet', false],
  ['11301', 'مخزون الأعلاف', 'asset', '113', 'balanceSheet', false],
  ['1130101', 'شعير', 'asset', '11301', 'balanceSheet', true],
  ['1130102', 'برسيم', 'asset', '11301', 'balanceSheet', true],
  ['1130103', 'تبن', 'asset', '11301', 'balanceSheet', true],
  ['1130104', 'أعلاف مركزة', 'asset', '11301', 'balanceSheet', true],
  ['1130105', 'مكعبات أعلاف', 'asset', '11301', 'balanceSheet', true],
  ['1130106', 'إضافات وأملاح', 'asset', '11301', 'balanceSheet', true],
  ['1130110', 'أعلاف أخرى', 'asset', '11301', 'balanceSheet', true],
  ['11302', 'الأدوية والمستلزمات البيطرية', 'asset', '113', 'balanceSheet', false],
  ['1130201', 'أدوية', 'asset', '11302', 'balanceSheet', true],
  ['1130202', 'لقاحات', 'asset', '11302', 'balanceSheet', true],
  ['1130203', 'فيتامينات', 'asset', '11302', 'balanceSheet', true],
  ['1130204', 'مضادات حيوية', 'asset', '11302', 'balanceSheet', true],
  ['1130205', 'مستلزمات بيطرية', 'asset', '11302', 'balanceSheet', true],
  ['1130206', 'أدوية أخري', 'asset', '11302', 'balanceSheet', true],
  ['11303', 'مواد ومستلزمات المزرعة', 'asset', '113', 'balanceSheet', false],
  ['1130301', 'أدوات نظافة', 'asset', '11303', 'balanceSheet', true],
  ['1130302', 'أدوات تشغيل', 'asset', '11303', 'balanceSheet', true],
  ['1130303', 'قطع غيار', 'asset', '11303', 'balanceSheet', true],
  ['1130304', 'مستلزمات أخرى', 'asset', '11303', 'balanceSheet', true],
  ['114', 'المخزون الحيواني', 'asset', '11', 'balanceSheet', false],
  ['11401', 'الأغنام', 'asset', '114', 'balanceSheet', false],
  ['1140101', 'أمهات أغنام', 'asset', '11401', 'balanceSheet', true],
  ['1140102', 'كباش أغنام', 'asset', '11401', 'balanceSheet', true],
  ['1140103', 'حملان ذكور', 'asset', '11401', 'balanceSheet', true],
  ['1140104', 'حملان اناث', 'asset', '11401', 'balanceSheet', true],
  ['11402', 'الماعز', 'asset', '114', 'balanceSheet', false],
  ['1140201', 'أمهات ماعز', 'asset', '11402', 'balanceSheet', true],
  ['1140202', 'تيوس ماعز', 'asset', '11402', 'balanceSheet', true],
  ['1140203', 'جديان ذكور', 'asset', '11402', 'balanceSheet', true],
  ['1140204', 'جديان اناث', 'asset', '11402', 'balanceSheet', true],
  ['12', 'المصروفات المقدمة والذمم الأخرى', 'asset', '1', 'balanceSheet', false],
  ['12101', 'مصروفات مدفوعة مقدمًا', 'asset', '12', 'balanceSheet', true],
  ['12102', 'إيجارات مدفوعة مقدمًا', 'asset', '12', 'balanceSheet', true],
  ['12103', 'تأمينات مدفوعة مقدمًا', 'asset', '12', 'balanceSheet', true],
  ['12104', 'دفعات مقدمة للموردين', 'asset', '12', 'balanceSheet', true],
  ['12105', 'عهد الموظفين', 'asset', '12', 'balanceSheet', true],
  ['12106', 'سلف الموظفين', 'asset', '12', 'balanceSheet', true],
  ['12107', 'ذمم مدينة أخرى', 'asset', '12', 'balanceSheet', true],
  ['13', 'الأصول الثابتة', 'asset', '1', 'balanceSheet', false],
  ['131', 'أراضي', 'asset', '13', 'balanceSheet', false],
  ['13101', 'أرض المزرعة', 'asset', '131', 'balanceSheet', true],
  ['13102', 'أراضي أخرى', 'asset', '131', 'balanceSheet', true],
  ['132', 'مباني وإنشاءات', 'asset', '13', 'balanceSheet', false],
  ['13201', 'مباني المزرعة', 'asset', '132', 'balanceSheet', true],
  ['13202', 'الأسوار والبوابات', 'asset', '132', 'balanceSheet', true],
  ['13203', 'خزانات المياه', 'asset', '132', 'balanceSheet', true],
  ['133', 'المعدات والآلات', 'asset', '13', 'balanceSheet', false],
  ['13301', 'معدات زراعية', 'asset', '133', 'balanceSheet', true],
  ['13302', 'معدات النظافة', 'asset', '133', 'balanceSheet', true],
  ['13303', 'معدات بيطرية', 'asset', '133', 'balanceSheet', true],
  ['13304', 'مولدات', 'asset', '133', 'balanceSheet', true],
  ['13305', 'مضخات مياه', 'asset', '133', 'balanceSheet', true],
  ['134', 'السيارات والمركبات', 'asset', '13', 'balanceSheet', false],
  ['13401', 'سيارات', 'asset', '134', 'balanceSheet', true],
  ['13402', 'شاحنات', 'asset', '134', 'balanceSheet', true],
  ['13403', 'مركبات أخرى', 'asset', '134', 'balanceSheet', true],
  ['135', 'الأثاث والأجهزة', 'asset', '13', 'balanceSheet', false],
  ['13501', 'أثاث', 'asset', '135', 'balanceSheet', true],
  ['13502', 'أجهزة كمبيوتر', 'asset', '135', 'balanceSheet', true],
  ['13503', 'أجهزة مكتبية', 'asset', '135', 'balanceSheet', true],
  ['13504', 'أجهزة اتصال', 'asset', '135', 'balanceSheet', true],
  ['136', 'مجمع الإهلاك', 'asset', '13', 'balanceSheet', false],
  ['13601', 'مجمع إهلاك المباني', 'asset', '136', 'balanceSheet', true],
  ['13602', 'مجمع إهلاك المعدات', 'asset', '136', 'balanceSheet', true],
  ['13603', 'مجمع إهلاك السيارات', 'asset', '136', 'balanceSheet', true],
  ['13604', 'مجمع إهلاك الأثاث والأجهزة', 'asset', '136', 'balanceSheet', true],
  ['2', 'الالتزامات', 'liability', null, 'balanceSheet', false],
  ['21', 'الالتزامات المتداولة', 'liability', '2', 'balanceSheet', false],
  ['211', 'الموردون', 'liability', '21', 'balanceSheet', false],
  ['21101', 'موردو الأعلاف', 'liability', '211', 'balanceSheet', true],
  ['21102', 'موردو الأدوية', 'liability', '211', 'balanceSheet', true],
  ['21103', 'موردو الحيوانات', 'liability', '211', 'balanceSheet', true],
  ['21104', 'موردو الخدمات', 'liability', '211', 'balanceSheet', true],
  ['21105', 'موردون آخرون', 'liability', '211', 'balanceSheet', true],
  ['212', 'مصروفات مستحقة', 'liability', '21', 'balanceSheet', false],
  ['21201', 'رواتب وأجور مستحقة', 'liability', '212', 'balanceSheet', true],
  ['21202', 'كهرباء مستحقة', 'liability', '212', 'balanceSheet', true],
  ['21203', 'مياه مستحقة', 'liability', '212', 'balanceSheet', true],
  ['21204', 'إيجارات مستحقة', 'liability', '212', 'balanceSheet', true],
  ['21205', 'مصروفات مستحقة أخرى', 'liability', '212', 'balanceSheet', true],
  ['213', 'ضرائب ورسوم مستحقة', 'liability', '21', 'balanceSheet', false],
  ['21301', 'ضريبة القيمة المضافة', 'liability', '213', 'balanceSheet', true],
  ['21302', 'ضرائب مستحقة أخرى', 'liability', '213', 'balanceSheet', true],
  ['21303', 'رسوم حكومية مستحقة', 'liability', '213', 'balanceSheet', true],
  ['214', 'قروض والتزامات قصيرة الأجل', 'liability', '21', 'balanceSheet', false],
  ['21401', 'قروض قصيرة الأجل', 'liability', '214', 'balanceSheet', true],
  ['21402', 'أقساط مستحقة', 'liability', '214', 'balanceSheet', true],
  ['22', 'الالتزامات طويلة الأجل', 'liability', '2', 'balanceSheet', false],
  ['22101', 'قروض طويلة الأجل', 'liability', '22', 'balanceSheet', true],
  ['22102', 'تمويل شراء الأصول', 'liability', '22', 'balanceSheet', true],
  ['22103', 'التزامات طويلة الأجل أخرى', 'liability', '22', 'balanceSheet', true],
  ['3', 'حقوق الملكية', 'equity', null, 'balanceSheet', false],
  ['3010', 'جاري الشريك', 'equity', '3', 'balanceSheet', true],
  ['3020', 'أرصدة افتتاحية (عملاء وموردون)', 'equity', '3', 'balanceSheet', true],
  ['31', 'رأس المال', 'equity', '3', 'balanceSheet', false],
  ['31101', 'رأس مال المالك', 'equity', '31', 'balanceSheet', true],
  ['31102', 'رأس مال إضافي', 'equity', '31', 'balanceSheet', true],
  ['31103', 'مسحوبات المالك', 'equity', '31', 'balanceSheet', true],
  ['32', 'الأرباح', 'equity', '3', 'balanceSheet', false],
  ['32101', 'أرباح سنوات سابقة', 'equity', '32', 'balanceSheet', true],
  ['32102', 'أرباح محتجزة', 'equity', '32', 'balanceSheet', true],
  ['32103', 'صافي ربح السنة الحالية', 'equity', '32', 'balanceSheet', true],
  ['4', 'الإيرادات', 'revenue', null, 'incomeStatement', false],
  ['41', 'إيرادات بيع الحيوانات', 'revenue', '4', 'incomeStatement', false],
  ['411', 'الأغنام', 'revenue', '41', 'incomeStatement', false],
  ['41101', 'مبيعات أمهات أغنام', 'revenue', '411', 'incomeStatement', true],
  ['41102', 'مبيعات كباش أغنام', 'revenue', '411', 'incomeStatement', true],
  ['41103', 'مبيعات حملان ذكور', 'revenue', '411', 'incomeStatement', true],
  ['41104', 'مبيعات حملان اناث', 'revenue', '411', 'incomeStatement', true],
  ['412', 'الماعز', 'revenue', '41', 'incomeStatement', false],
  ['41201', 'مبيعات أمهات ماعز', 'revenue', '412', 'incomeStatement', true],
  ['41202', 'مبيعات تيوس ماعز', 'revenue', '412', 'incomeStatement', true],
  ['41203', 'جديان ذكور', 'revenue', '412', 'incomeStatement', true],
  ['41204', 'جديان اناث', 'revenue', '412', 'incomeStatement', true],
  ['42', 'إيرادات الذبائح', 'revenue', '4', 'incomeStatement', false],
  ['42101', 'مبيعات ذبائح أغنام', 'revenue', '42', 'incomeStatement', true],
  ['42102', 'مبيعات ذبائح ماعز', 'revenue', '42', 'incomeStatement', true],
  ['43', 'إيرادات أخرى', 'revenue', '4', 'incomeStatement', false],
  ['43101', 'بيع السماد والمخلفات', 'revenue', '43', 'incomeStatement', true],
  ['43102', 'بيع الجلود إن وجد', 'revenue', '43', 'incomeStatement', true],
  ['43103', 'إيرادات خدمات تلقيح', 'revenue', '43', 'incomeStatement', true],
  ['43104', 'إيرادات أخرى', 'revenue', '43', 'incomeStatement', true],
  ['49', 'مردودات وخصومات المبيعات', 'revenue', '4', 'incomeStatement', false],
  ['49101', 'مردودات مبيعات أغنام', 'revenue', '49', 'incomeStatement', true],
  ['49102', 'مردودات مبيعات ماعز', 'revenue', '49', 'incomeStatement', true],
  ['49103', 'مردودات ذبائح', 'revenue', '49', 'incomeStatement', true],
  ['49201', 'خصم مسموح به', 'revenue', '49', 'incomeStatement', true],
  ['5', 'تكلفة المبيعات والإنتاج', 'expense', null, 'incomeStatement', false],
  ['51', 'تكلفة الحيوانات المباعة', 'expense', '5', 'incomeStatement', false],
  ['51101', 'تكلفة الأغنام المباعة', 'expense', '51', 'incomeStatement', true],
  ['51102', 'تكلفة الماعز المباعة', 'expense', '51', 'incomeStatement', true],
  ['51103', 'تكلفة الحملان المباعة', 'expense', '51', 'incomeStatement', true],
  ['51104', 'تكلفة الجديان المباعة', 'expense', '51', 'incomeStatement', true],
  ['52', 'تكلفة الذبائح', 'expense', '5', 'incomeStatement', false],
  ['52101', 'تكلفة الأغنام المذبوحة', 'expense', '52', 'incomeStatement', true],
  ['52102', 'تكلفة الماعز المذبوحة', 'expense', '52', 'incomeStatement', true],
  ['52103', 'تكاليف الذبح', 'expense', '52', 'incomeStatement', true],
  ['52104', 'تكاليف التجهيز والتعبئة', 'expense', '52', 'incomeStatement', true],
];

// ⚠️ مجموعات "تكاليف الإنتاج والتربية (6)" و"مصروفات التشغيل والإدارة (7)" و"إيرادات ومصروفات أخرى (8)"
// أُزيلت من الشجرة بطلب من صاحب المشروع (2026-08) — انظر _RETIRED_SYSTEM_ACCOUNT_CODES أدناه
// لحذفها لمرة واحدة من قواعد البيانات الموجودة مسبقًا. أوراق حسابات المصروفات/الإيرادات اليدوية
// تعود إلى ما يضيفه المستخدم بنفسه من شاشة شجرة الحسابات.

// استثناءات الطبيعة عن افتراضي النوع: مجمع الإهلاك طبيعته دائنة رغم نوعه أصل، ومردودات/خصومات المبيعات
// ومسحوبات المالك طبيعتها مدينة رغم نوعها (إيراد/حقوق ملكية)
const _NEW_CHART_NORMAL_BALANCE_OVERRIDES = {
  '136': 'credit', '13601': 'credit', '13602': 'credit', '13603': 'credit', '13604': 'credit',
  '49': 'debit', '49101': 'debit', '49102': 'debit', '49103': 'debit', '49201': 'debit',
  '31103': 'debit',
};

// أوراق تُرحَّل حصرًا من أتمتة وحدة أخرى ولا تظهر كخيار بند يدوي في نماذج المصروفات/الإيرادات/المشتريات
// (نفس مفهوم "حسابات التحكم" القديم: isCategoryAccount:false مباشرة عند الإنشاء)
const _NEW_CHART_SYSTEM_ONLY_CODES = new Set([
  '49101', '49102', '49103', '49201', // مردودات وخصومات المبيعات — تُرحَّل من party-service.js
  '51101', '51102', '51103', '51104', '52101', '52102', '52103', '52104', // تكلفة المبيعات — تُرحَّل من وحدة الجملة/الذبائح
]);

// أكواد مجموعات "تكاليف الإنتاج والتربية (6)" و"مصروفات التشغيل والإدارة (7)" و"إيرادات ومصروفات أخرى (8)"
// أُزيلت من الشجرة الهرمية بطلب من صاحب المشروع (2026-08) — تُحذف ناعمًا لمرة واحدة (_removeRetiredSystemAccountsIfNeeded
// أدناه) من أي قاعدة بيانات موجودة مسبقًا، إلا إن كان لها قيود/روابط فعلية فتبقى ظاهرة كجذر مستقل حتى تُراجع يدويًا.
// انعكاسها على "ربط العمليات بالحسابات": مفاتيح كانت تشير إليها افتراضيًا (depExpense*، assetGain/Loss، cashShortage/Overage،
// custodyWriteOff/AdminWaiver، expense/purchaseFallback، purchaseReturn، inventoryExpense*) بلا هدف الآن — الخدمات المتأثرة
// تتخطى الترحيل أو ترمي رسالة واضحة حتى يختار المستخدم حسابات بدائل من الشاشة نفسها بعد إنشائها في شجرة الحسابات
const _RETIRED_SYSTEM_ACCOUNT_CODES = new Set([
  '6', '61', '61101', '61102',
  '62', '62101', '62102', '62103', '62104', '62105', '62106', '62107',
  '7', '71', '71101', '71102',
  '72', '72101', '72102', '72103', '72104', '72105', '72106', '72107', '72108', '72109', '72110',
  '73', '73101', '73102', '73103', '73104', '73105',
  '74', '74101', '74102', '74103', '74104', '74105', '74106', '74107',
  '75', '75101', '75102', '75103', '75104',
  '8', '81', '81101', '81102', '81103', '81104', '81105',
  '82', '82101', '82102', '82103',
]);

function _expandChartSpec([code, name, type, parentCode, financialStatement, isPostable]) {
  return {
    code,
    name,
    type,
    parentCode: parentCode || null,
    financialStatement,
    isPostable,
    normalBalance: _NEW_CHART_NORMAL_BALANCE_OVERRIDES[code] || ACCOUNT_NORMAL_BALANCE_BY_TYPE[type],
    isCategoryAccount: (type === 'expense' || type === 'revenue') && isPostable
      ? !_NEW_CHART_SYSTEM_ONLY_CODES.has(code)
      : false,
  };
}

async function seedDatabaseIfEmpty() {
  await _seedDefaultChartOfAccountsIfEmpty();
  await _migrateChartOfAccountsIfNeeded();
  await _removeRetiredSystemAccountsIfNeeded();
  await _migrateLegacyUserRolesIfNeeded();
  await _migrateCategoryToAccountIdIfNeeded();
  await _postExpenseJournalEntriesIfMissing();
  await _migrateLegacyBulkDataIfNeeded();
  await _migrateBulkBatchesToPurchaseSaleIfNeeded();
  await _postRevenueJournalEntriesIfMissing();
  await _postPurchaseJournalEntriesIfMissing();
  await _postBulkPurchaseJournalEntriesIfMissing();
  await _postBulkSaleJournalEntriesIfMissing();

  const users = await dbGetAll('Users');
  if (users.length > 0) return; // تمت التهيئة من قبل

  const adminHash = await hashPassword('admin123');
  await dbAdd('Users', {
    username: 'admin',
    passwordHash: adminHash,
    role: 'systemAdmin',
    fullName: 'مدير النظام',
    phone: '0500000000',
  });

  const ownerHash = await hashPassword('owner123');
  await dbAdd('Users', {
    username: 'owner',
    passwordHash: ownerHash,
    role: 'farmManager',
    fullName: 'مدير المزرعة',
    phone: '0511111111',
  });

  console.log('تمت تهيئة حسابات الدخول الافتراضية');
}

// ترحيل بأثر رجعي لمرة واحدة: يحوّل قيم Users.role القديمة ('manager'/'owner' — من نظام صلاحيتين قبل
// نظام الأدوار الثلاثة الحالي: مدير النظام/مدير المزرعة/مستخدم مخصص) إلى المفاتيح الجديدة فعليًا في القاعدة.
// 'manager' كان يمنح وصولاً كاملاً دائمًا فيقابله الآن 'systemAdmin'؛ 'owner' كان مقيّدًا بصلاحياته المحفوظة
// (Users.permissions) فيقابله الآن 'custom' (نفس مبدأ "مستخدم مخصص": لا افتراضات، فقط الصلاحيات المحفوظة
// فعليًا لهذا المستخدم تحديدًا) — resolveRoleKey() في auth-service.js طبقة توافق إضافية لأي جلسة لم
// تُحدَّث بعد وقت الترحيل، لكن هذه الدالة هي التي تُصحّح البيانات المخزَّنة فعليًا
async function _migrateLegacyUserRolesIfNeeded() {
  const users = await dbGetAll('Users');
  for (const user of users) {
    if (user.role === 'manager') await dbUpdate('Users', user.id, { role: 'systemAdmin' });
    else if (user.role === 'owner') await dbUpdate('Users', user.id, { role: 'custom' });
  }
}

// منفصلة عن باقي التهيئة وتُفحص بمعزل عن مخزن Users، حتى تُضيف شجرة الحسابات الافتراضية
// لقواعد بيانات موجودة مسبقًا (قبل إضافة مخزن ChartOfAccounts) دون التأثير على بياناتها الأخرى
async function _seedDefaultChartOfAccountsIfEmpty() {
  const existingAccounts = await dbGetAll('ChartOfAccounts');
  if (existingAccounts.length > 0) return;

  for (const spec of _NEW_CHART_ACCOUNTS) {
    await dbAdd('ChartOfAccounts', _expandChartSpec(spec));
  }
}

// يضمن وجود كل حسابات الشجرة الجديدة (بالكود) ويضبط حقولها القانونية على أي حساب موجود مسبقًا بنفس الكود —
// يُستدعى مرة واحدة فقط عند اكتشاف نقص في الشجرة الجديدة (شرط _migrateChartOfAccountsIfNeeded أدناه)،
// حتى لا يكتب فوق أي تعديل يدوي لاحق للمستخدم في الزيارات التالية
async function _normalizeNewChartAccounts() {
  const active = (await dbGetAll('ChartOfAccounts')).filter(a => a.status !== 'deleted');
  const byCode = new Map(active.map(a => [a.code, a]));

  for (const spec of _NEW_CHART_ACCOUNTS) {
    const canonical = _expandChartSpec(spec);
    const existing = byCode.get(canonical.code);
    if (!existing) {
      await dbAdd('ChartOfAccounts', canonical);
      continue;
    }
    const patch = {};
    ['name', 'type', 'parentCode', 'financialStatement', 'isPostable', 'normalBalance', 'isCategoryAccount']
      .forEach(key => {
        if (existing[key] !== canonical[key]) patch[key] = canonical[key];
      });
    if (Object.keys(patch).length) await dbUpdate('ChartOfAccounts', existing.id, patch);
  }
}

// يُستبدل شجرة الحسابات المسطحة القديمة بالهرمية الجديدة (أب/فرعي + قائمة مالية + قابل للترحيل) لمرة واحدة
// فعليًا، ويعمل في حالتين مستقلتين: (1) أي كود من الشجرة الجديدة ناقص → تُضاف/تُضبط كل حسابات الشجرة الجديدة؛
// (2) أي حساب قديم نشط (كوده في ACCOUNT_CODE_MIGRATIONS) → تُعاد توجيه كل مراجعه (سطور القيود اليومية +
// روابط categoryAccountId) إلى الحساب الجديد المقابل ثم يُحذف ناعمًا، وتُرحَّل معه أكواد الصندوق/البنك
// النصية المخزَّنة في وحدات أخرى. بعد اكتمال الترحيل تُحذف الحسابات القديمة ناعمًا فلا يعود الشرط صحيحًا
// أبدًا (idempotent). الحسابات المخصصة التي أنشأها المستخدم (بكود خارج الخريطة) تبقى كما هي وستظهر كجذور
// مستقلة في الشجرة حتى يحدد لها المستخدم أبًا
async function _migrateChartOfAccountsIfNeeded() {
  const active = (await dbGetAll('ChartOfAccounts')).filter(a => a.status !== 'deleted');
  const legacyAccounts = active.filter(a => ACCOUNT_CODE_MIGRATIONS[a.code] && ACCOUNT_CODE_MIGRATIONS[a.code] !== a.code);

  const existingCodes = new Set(active.map(a => a.code));
  const missingNewAccounts = _NEW_CHART_ACCOUNTS.some(spec => !existingCodes.has(spec[0]));

  if (!legacyAccounts.length && !missingNewAccounts) return;

  await _normalizeNewChartAccounts();

  if (legacyAccounts.length) {
    const nowActive = (await dbGetAll('ChartOfAccounts')).filter(a => a.status !== 'deleted');
    const byCode = new Map(nowActive.map(a => [a.code, a]));
    const allEntries = await dbGetAll('JournalEntries');

    for (const oldAccount of legacyAccounts) {
      const target = byCode.get(ACCOUNT_CODE_MIGRATIONS[oldAccount.code]);
      if (!target || Number(target.id) === Number(oldAccount.id)) continue;
      await _repointAccountReferences(oldAccount.id, target.id, allEntries);
      await dbSoftDelete('ChartOfAccounts', oldAccount.id);
    }

    await _migrateCashAccountCodeStrings();
  }

  console.log('تم استبدال شجرة الحسابات القديمة بالهرمية الجديدة وإضافتها لقاعدة البيانات');
}

// يعيد توجيه كل المراجع من حساب قديم (سيُحذف ناعمًا) إلى الحساب الجديد المقابل له: سطور القيود اليومية
// (مع دمج أي سطر مكرر لنفس الحساب ينتج عن تعدد الحسابات القديمة على هدف واحد، مثل 5091+5092 → 81105)
// وروابط categoryAccountId في المصروفات/الإيرادات/المشتريات/التسويات
async function _repointAccountReferences(fromAccountId, toAccountId, allEntries) {
  for (const entry of allEntries) {
    if (entry.status === 'deleted') continue;
    const lines = entry.lines || [];
    if (!lines.some(l => Number(l.accountId) === Number(fromAccountId))) continue;

    const totals = {};
    const order = [];
    lines.forEach(line => {
      const id = Number(line.accountId) === Number(fromAccountId) ? Number(toAccountId) : Number(line.accountId);
      if (!totals[id]) { totals[id] = { debit: 0, credit: 0, lineNote: line.lineNote || '' }; order.push(id); }
      totals[id].debit += Number(line.debit || 0);
      totals[id].credit += Number(line.credit || 0);
      if (line.lineNote) totals[id].lineNote = line.lineNote;
    });

    const merged = order
      .map(id => {
        const { debit, credit } = totals[id];
        if (Math.abs(debit - credit) < 0.01) return null;
        return debit > credit
          ? { accountId: id, debit: Math.round((debit - credit) * 100) / 100, credit: 0, lineNote: totals[id].lineNote }
          : { accountId: id, debit: 0, credit: Math.round((credit - debit) * 100) / 100, lineNote: totals[id].lineNote };
      })
      .filter(Boolean);

    await dbUpdate('JournalEntries', entry.id, { lines: merged });
  }

  for (const store of ['Expenses', 'Revenues', 'Purchases', 'Adjustments']) {
    const records = await dbQuery(store, r => Number(r.categoryAccountId) === Number(fromAccountId));
    for (const record of records) {
      await dbUpdate(store, record.id, { categoryAccountId: toAccountId });
    }
  }
}

// حذف ناعم لمرة واحدة لحسابات المجموعات الملغاة (6/7/8) من قواعد البيانات الموجودة مسبقًا — يحذف فقط
// الحسابات غير المستخدمة في أي قيد أو رابط بند؛ المستخدم منها في قيود تاريخية يبقى نشطًا كجذر مستقل
// (نفس اتفاقية الحسابات المخصصة) حتى تُراجع/تُعالج يدويًا حفاظًا على سلامة أرصدة التقارير القديمة.
// الخدمة idempotent: الزيارات التالية لا تجد ما يُحذف (أو تجد المحجوز وحده وتتخطاه)
async function _removeRetiredSystemAccountsIfNeeded() {
  const active = (await dbGetAll('ChartOfAccounts')).filter(a => a.status !== 'deleted');
  const retired = active.filter(a => _RETIRED_SYSTEM_ACCOUNT_CODES.has(a.code));
  if (!retired.length) return;

  const referencedAccountIds = new Set();
  const entries = await dbGetAll('JournalEntries');
  entries.forEach(entry => {
    if (entry.status === 'deleted') return;
    (entry.lines || []).forEach(line => referencedAccountIds.add(Number(line.accountId)));
  });
  for (const store of ['Expenses', 'Revenues', 'Purchases', 'Adjustments']) {
    const records = await dbGetAll(store);
    records.forEach(record => {
      if (record.status === 'deleted' || record.categoryAccountId == null) return;
      referencedAccountIds.add(Number(record.categoryAccountId));
    });
  }

  let removed = 0;
  for (const account of retired) {
    if (referencedAccountIds.has(Number(account.id))) continue;
    await dbSoftDelete('ChartOfAccounts', account.id);
    removed++;
  }
  console.log(`تم حذف ${removed} حساب من مجموعات الشجرة الملغاة (تكاليف الإنتاج / مصروفات التشغيل والإدارة / إيرادات ومصروفات أخرى)`);
}

// يرحّل أكواد حسابي الصندوق/البنك النصية المخزَّنة في سجلات وحدات أخرى (CustodyItems/Adjustments/CashCounts)
async function _migrateCashAccountCodeStrings() {
  const codeMap = { '1000': '11101', '1010': '11102' };

  const custodyItems = await dbQuery('CustodyItems', c => !!codeMap[c.cashAccountCode]);
  for (const item of custodyItems) await dbUpdate('CustodyItems', item.id, { cashAccountCode: codeMap[item.cashAccountCode] });

  const adjustments = await dbQuery('Adjustments', a => !!codeMap[a.cashAccountCode]);
  for (const item of adjustments) await dbUpdate('Adjustments', item.id, { cashAccountCode: codeMap[item.cashAccountCode] });

  const cashCounts = await dbQuery('CashCounts', c => !!codeMap[c.accountCode]);
  for (const item of cashCounts) await dbUpdate('CashCounts', item.id, { accountCode: codeMap[item.accountCode] });
}

// أسماء بنود قديمة لم تعد تطابق أسماء حسابات الشجرة الجديدة — خريطة دفاعية أخيرة (بعد مطابقة الاسم الحرفية
// وفشلها) حتى لا تقع سجلات قديمة بلا categoryAccountId صامتةً على حساب fallback عام (الحسابات القديمة
// محذوفة ناعمًا بعد الاستبدال، فلا تعود مطابقة الاسم عليها ممكنة)
const _LEGACY_CATEGORY_NAME_TO_ACCOUNT_CODE = {
  'مصروفات أعلاف': '61101',
  'مصروفات أدوية وعلاج': '62101',
  'رواتب': '71101',
  'صيانة': '72105',
  'نقل': '72109',
  'إيجار': '74107',
  'مصروفات أخرى': '74107',
  'مصروفات معدات ومستلزمات': '74107',
  'مشتريات حيوانات': '51103',
  'تكلفة البضاعة المباعة - الشراء والبيع الجماعي': '51101',
  'مصاريف الشراء والبيع الجماعي': '74107',
  'إيرادات بيع حيوانات': '41101',
  'إيرادات الشراء والبيع الجماعي': '41101',
  'إيرادات أخرى': '43104',
  'مرتجعات وخصومات المبيعات': '49',
  'مرتجعات وخصومات المشتريات': '81',
};

// ترحيل بأثر رجعي لمرة واحدة فعليًا: يملأ categoryAccountId على كل مصروف/إيراد/مشترى ناقصه — البند صار حسابًا
// مباشرة من شجرة الحسابات بدل مخزن Categories المُلغى (لا يزال محفوظًا في القاعدة لأي قاعدة بيانات قديمة، فقط
// لم تعد أي واجهة تنشئ/تعدّل/تقرأ منه). يعتمد أولاً linkedAccountId المحفوظ سابقًا لبند بنفس الاسم/النوع إن
// وُجد، ثم مطابقة اسم البند النصي بحساب نشط من نفس النوع، ثم خريطة الأسماء القديمة أعلاه (لأن استبدال الشجرة
// غيّر أسماء الحسابات وحذف القديمة)؛ أي سجل لم يُطابَق يبقى بلا categoryAccountId (تتولى syncExpenseJournalEntry/
// syncRevenueJournalEntry/syncPurchaseJournalEntry نفس المطابقة بالاسم كخط دفاع ثانٍ عند أول مزامنة قيد لاحقة)
async function _migrateCategoryToAccountIdIfNeeded() {
  const [categories, accounts] = await Promise.all([dbGetAll('Categories'), getAllAccounts()]);

  const resolveAccountId = (categoryType, categoryName, accountType) => {
    if (!categoryName) return null;
    const category = categories.find(c => c.type === categoryType && c.name === categoryName);
    if (category && category.linkedAccountId && accounts.some(a => a.id === category.linkedAccountId)) {
      return category.linkedAccountId;
    }
    const byName = accounts.find(a => a.type === accountType && a.name === categoryName);
    if (byName) return byName.id;
    const legacyCode = _LEGACY_CATEGORY_NAME_TO_ACCOUNT_CODE[categoryName];
    const byLegacyCode = legacyCode && accounts.find(a => a.code === legacyCode);
    return byLegacyCode ? byLegacyCode.id : null;
  };

  const expenses = await dbQuery('Expenses', e => !e.categoryAccountId && !!e.category);
  for (const expense of expenses) {
    const accountId = resolveAccountId('expense', expense.category, 'expense');
    if (accountId) await dbUpdate('Expenses', expense.id, { categoryAccountId: accountId });
  }

  const revenues = await dbQuery('Revenues', r => !r.categoryAccountId && !!r.category);
  for (const revenue of revenues) {
    const accountId = resolveAccountId('revenue', revenue.category, 'revenue');
    if (accountId) await dbUpdate('Revenues', revenue.id, { categoryAccountId: accountId });
  }

  const purchases = await dbQuery('Purchases', p => !p.categoryAccountId && !!p.category);
  for (const purchase of purchases) {
    const accountId = resolveAccountId('purchase', purchase.category, 'expense');
    if (accountId) await dbUpdate('Purchases', purchase.id, { categoryAccountId: accountId });
  }
}

// ترحيل بأثر رجعي لمرة واحدة فعليًا: لكل مصروف غير محذوف بلا journalEntryId وبمبلغ > 0 — يُنشئ له قيدًا
// يعكس حالته الحالية (نفس منطق syncExpenseJournalEntry في expense-service.js)، حتى تكتمل تقارير المحاسبة
// للبيانات الموجودة مسبقًا. يُفحص بمعزل عن باقي التهيئة (لكل مصروف ناقص قيد لا "هل Expenses فارغ؟")
async function _postExpenseJournalEntriesIfMissing() {
  const pendingExpenses = await dbQuery('Expenses', e => e.status !== 'deleted' && !e.journalEntryId && Number(e.amount) > 0);
  for (const expense of pendingExpenses) {
    await syncExpenseJournalEntry(expense.id);
  }
}

// نفس مبدأ _postExpenseJournalEntriesIfMissing تمامًا، لكن للإيرادات
async function _postRevenueJournalEntriesIfMissing() {
  const pendingRevenues = await dbQuery('Revenues', r => r.status !== 'deleted' && !r.journalEntryId && Number(r.amount) > 0);
  for (const revenue of pendingRevenues) {
    await syncRevenueJournalEntry(revenue.id);
  }
}

// نفس مبدأ _postExpenseJournalEntriesIfMissing تمامًا، لكن للمشتريات
async function _postPurchaseJournalEntriesIfMissing() {
  const pendingPurchases = await dbQuery('Purchases', p => p.status !== 'deleted' && !p.journalEntryId && Number(p.amount) > 0);
  for (const purchase of pendingPurchases) {
    await syncPurchaseJournalEntry(purchase.id);
  }
}

// نفس المبدأ لعمليات الشراء/البيع الجماعي المستقلة — يُنفَّذان بعد _migrateBulkBatchesToPurchaseSaleIfNeeded
// عمدًا حتى تُرحَّل محاسبيًا أيضًا أي عمليات جديدة نتجت عن ترحيل الدفعات القديمة
async function _postBulkPurchaseJournalEntriesIfMissing() {
  const pending = await dbQuery('BulkPurchaseBatches', p => p.status !== 'deleted' && !p.journalEntryId);
  for (const purchase of pending) {
    await syncBulkPurchaseJournalEntry(purchase.id);
  }
}

async function _postBulkSaleJournalEntriesIfMissing() {
  const pending = await dbQuery('BulkSaleBatches', s => s.status !== 'deleted' && !s.journalEntryId);
  for (const sale of pending) {
    await syncBulkSaleJournalEntry(sale.id);
  }
}

// ترحيل تلقائي لمرة واحدة: يحوّل سجلات BulkPurchases/BulkSales/BulkExpenses القديمة (كل معاملة سجل مستقل)
// إلى نموذج "الدفعات" الوسيط في BulkBatches (سجل واحد يحوي بنود شراء/بيع/مصاريف). يعمل بمعزل عن باقي التهيئة
// ويُفحص شرطه الخاص (BulkBatches فارغ + وجود بيانات قديمة) حتى يعمل مع قواعد بيانات موجودة مسبقًا قبل هذه الميزة.
// ⚠️ لا تستخدم دوال bulk-batch-service.js هنا (أُزيلت دوال BulkBatches القديمة منه بالكامل بعد إعادة الهيكلة
// لنظام الشراء/البيع المستقلّين) — الوصول لمخزن BulkBatches الوسيط هنا مباشرة عبر db.js فقط، لأن نتيجته تُستهلك
// فورًا بعدها في نفس تسلسل seedDatabaseIfEmpty() عبر _migrateBulkBatchesToPurchaseSaleIfNeeded أدناه
async function _migrateLegacyBulkDataIfNeeded() {
  const existingBatches = await dbGetAll('BulkBatches');
  if (existingBatches.length > 0) return;

  const [legacyPurchases, legacySales, legacyExpenses] = await Promise.all([
    dbQuery('BulkPurchases', p => p.status !== 'deleted'),
    dbQuery('BulkSales', s => s.status !== 'deleted'),
    dbQuery('BulkExpenses', e => e.status !== 'deleted'),
  ]);

  if (!legacyPurchases.length && !legacySales.length && !legacyExpenses.length) return;

  const _nextLegacyBatchCode = async () => {
    const all = await dbGetAll('BulkBatches');
    const numbers = all
      .map(b => (b.code && b.code.startsWith('DF-')) ? parseInt(b.code.replace('DF-', ''), 10) : 0)
      .filter(n => !isNaN(n));
    const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
    return `DF-${String(next).padStart(4, '0')}`;
  };

  const groupKey = (r) => `${r.type}|${r.gender}|${(r.breed || '').trim().toLowerCase()}`;
  const batchIdsByKey = {}; // مفتاح التركيبة (نوع/جنس/سلالة) → [batchId...] بترتيب الأقدم فالأحدث
  let generalExpenseBatchId = null;

  const migrateAttachments = async (oldRecordType, oldId, newBatchId) => {
    const atts = await dbQuery('Attachments', a => a.recordType === oldRecordType && a.recordId === oldId);
    for (const att of atts) {
      await dbUpdate('Attachments', att.id, { recordType: 'bulkBatch', recordId: newBatchId });
    }
  };

  const sortedPurchases = [...legacyPurchases].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  for (const p of sortedPurchases) {
    const code = await _nextLegacyBatchCode();
    const newBatchId = await dbAdd('BulkBatches', {
      code,
      purchaseDate: p.date,
      purchaseLines: [{ type: p.type, gender: p.gender, breed: p.breed, count: Number(p.count || 0), unitPrice: Number(p.unitPrice || 0) }],
      saleLines: [],
      expenseLines: [],
      notes: p.notes || '',
    });
    const key = groupKey(p);
    (batchIdsByKey[key] = batchIdsByKey[key] || []).push(newBatchId);
    await migrateAttachments('bulkPurchase', p.id, newBatchId);
  }

  const sortedSales = [...legacySales].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  for (const s of sortedSales) {
    const key = groupKey(s);
    const candidates = batchIdsByKey[key];
    let targetBatchId = candidates && candidates.length ? candidates[0] : null;

    if (!targetBatchId) {
      const code = await _nextLegacyBatchCode();
      targetBatchId = await dbAdd('BulkBatches', { code, purchaseDate: s.date, purchaseLines: [], saleLines: [], expenseLines: [], notes: '' });
      (batchIdsByKey[key] = batchIdsByKey[key] || []).push(targetBatchId);
    }

    const batch = await dbGet('BulkBatches', targetBatchId);
    const saleLines = [...(batch.saleLines || []), { date: s.date, type: s.type, gender: s.gender, breed: s.breed, count: Number(s.count || 0), unitPrice: Number(s.unitPrice || 0) }];
    await dbUpdate('BulkBatches', targetBatchId, { saleLines });
    await migrateAttachments('bulkSale', s.id, targetBatchId);
  }

  const sortedExpenses = [...legacyExpenses].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  for (const e of sortedExpenses) {
    let targetBatchId = null;
    if (e.type && e.gender) {
      const candidates = batchIdsByKey[groupKey(e)];
      if (candidates && candidates.length) targetBatchId = candidates[0];
    }

    if (!targetBatchId) {
      if (!generalExpenseBatchId) {
        const code = await _nextLegacyBatchCode();
        generalExpenseBatchId = await dbAdd('BulkBatches', {
          code,
          purchaseDate: e.date,
          purchaseLines: [],
          saleLines: [],
          expenseLines: [],
          notes: 'دفعة مرحّلة تلقائيًا لتجميع مصاريف جماعية عامة سابقة غير مرتبطة بتركيبة نوع/جنس/سلالة محددة',
        });
      }
      targetBatchId = generalExpenseBatchId;
    }

    const batch = await dbGet('BulkBatches', targetBatchId);
    const expenseLines = [...(batch.expenseLines || []), { date: e.date, description: e.description, amount: Number(e.amount || 0) }];
    await dbUpdate('BulkBatches', targetBatchId, { expenseLines });
  }

  console.log('تم ترحيل بيانات الشراء والبيع الجماعي القديمة إلى نظام الدفعات الوسيط (سيُستكمل ترحيله فورًا لنظام الشراء/البيع المستقلّين)');
}

// ترحيل تلقائي لمرة واحدة (الخطوة التالية بعد _migrateLegacyBulkDataIfNeeded أعلاه): يفكّك دفعات BulkBatches
// (شراء+بيع+مصاريف في سجل واحد بقيد واحد مُعاد الصياغة) إلى النظام الجديد المستقل — BulkPurchaseBatches/
// BulkSaleBatches، كل سجل بقيده الخاص، مع متوسط تكلفة متحرك محسوب من الشراء فقط (انظر bulk-batch-service.js).
// يعمل بمعزل عن باقي التهيئة ويُفحص شرطه الخاص (BulkPurchaseBatches فارغ + وجود دفعات قديمة غير محذوفة) حتى
// يعمل مع قواعد بيانات موجودة مسبقًا قبل هذا التغيير. لا حذف لسجلات BulkBatches القديمة نفسها ولا لمخازن
// BulkPurchases/BulkSales/BulkExpenses الأقدم منها — تبقى أرشيفًا صامتًا في OBJECT_STORES/النسخ الاحتياطي
// فقط، بلا أي كود بعد هذا التغيير يقرأ منها
async function _migrateBulkBatchesToPurchaseSaleIfNeeded() {
  const existingNew = await dbGetAll('BulkPurchaseBatches');
  if (existingNew.length > 0) return;

  const oldBatches = await dbQuery('BulkBatches', b => b.status !== 'deleted');
  if (!oldBatches.length) return;

  const [accounts, mappings] = await Promise.all([getAllAccounts(), loadAccountMappings()]);
  const miscExpenseAccount = getMappedAccount('expenseFallback', accounts, mappings);

  // الخطوة 1: كل دفعة قديمة → عملية شراء مستقلة واحدة بنفس بنودها وتاريخها، + تحويل بنود مصاريفها لسجلات
  // Expenses حقيقية مستقلة (قرار عمل: لا مصاريف خاصة بوحدة الجملة بعد الآن)، + إعادة توجيه مرفقاتها
  const allNewPurchases = [];
  for (const batch of oldBatches) {
    const code = await generateNextBulkPurchaseCode();
    const notesSuffix = `مرحّل من الدفعة القديمة ${batch.code}`;
    const newPurchaseId = await createBulkPurchase({
      code,
      date: batch.purchaseDate,
      lines: (batch.purchaseLines || []).map(l => ({
        partyId: l.partyId || null, type: l.type, gender: l.gender, breed: l.breed,
        count: Number(l.count || 0), unitPrice: Number(l.unitPrice || 0),
      })),
      notes: batch.notes ? `${batch.notes} — ${notesSuffix}` : notesSuffix,
      source: 'manual',
    });
    await syncBulkPurchaseJournalEntry(newPurchaseId);
    allNewPurchases.push(await getBulkPurchaseById(newPurchaseId));

    const atts = await dbQuery('Attachments', a => a.recordType === 'bulkBatch' && a.recordId === batch.id);
    for (const att of atts) {
      await dbUpdate('Attachments', att.id, { recordType: 'bulkPurchase', recordId: newPurchaseId });
    }

    for (const line of (batch.expenseLines || [])) {
      const newExpenseId = await dbAdd('Expenses', {
        category: miscExpenseAccount ? miscExpenseAccount.name : (line.description || 'مصروفات إدارية أخرى'),
        categoryAccountId: miscExpenseAccount ? miscExpenseAccount.id : null,
        amount: Number(line.amount || 0),
        date: line.date,
        hasTaxInvoice: false,
        amountBeforeTax: null,
        taxAmount: null,
        paymentMethod: 'cash',
        vendor: '',
        status: 'approved',
        notes: `${line.description || ''} — مرحّل من الدفعة القديمة ${batch.code}`.trim(),
      });
      await syncExpenseJournalEntry(newExpenseId);
    }
  }

  // الخطوة 2: بنود البيع القديمة كانت مؤرَّخة كل بند على حدة داخل الدفعة الواحدة — تُجمَّع حسب تاريخها
  // الفريد (سجل بيع مستقل واحد لكل تاريخ)، ثم تُرتَّب كل عمليات البيع الناتجة عبر كل الدفعات معًا تصاعديًا
  // بالتاريخ قبل إنشائها، حتى يُحسب متوسط التكلفة بناءً على كل عمليات الشراء المُرحَّلة أعلاه (اكتملت جميعها
  // بصرف النظر عن ترتيب الدفعات الأصلي)
  const pendingSaleGroups = [];
  for (const batch of oldBatches) {
    const byDate = {};
    (batch.saleLines || []).forEach(l => {
      const d = l.date || batch.purchaseDate;
      (byDate[d] = byDate[d] || []).push(l);
    });
    Object.keys(byDate).forEach(date => {
      pendingSaleGroups.push({ date, lines: byDate[date], sourceBatchCode: batch.code });
    });
  }
  pendingSaleGroups.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  for (const group of pendingSaleGroups) {
    const code = await generateNextBulkSaleCode();
    const rawLines = group.lines.map(l => ({
      partyId: l.partyId || null, type: l.type, gender: l.gender, breed: l.breed,
      count: Number(l.count || 0), unitPrice: Number(l.unitPrice || 0),
    }));
    const linesWithCost = computeSaleLinesCosts(rawLines, allNewPurchases, group.date);
    const newSaleId = await createBulkSale({
      code,
      date: group.date,
      lines: linesWithCost,
      notes: `مرحّل من الدفعة القديمة ${group.sourceBatchCode}`,
      source: 'manual',
    });
    await syncBulkSaleJournalEntry(newSaleId);
  }

  // حذف القيود المحاسبية القديمة المدمجة (استُبدلت بقيود الشراء/البيع المنفصلة الجديدة أعلاه)
  for (const batch of oldBatches) {
    if (batch.journalEntryId) await deleteJournalEntry(batch.journalEntryId);
  }

  console.log('تم ترحيل دفعات الشراء والبيع الجماعي القديمة إلى نظام الشراء/البيع المستقلّين الجديد');
}
