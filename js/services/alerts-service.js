// js/services/alerts-service.js
// المصدر المركزي الوحيد لحساب "التنبيهات" الحيّة عبر كل وحدات النظام — يُستهلك من دشبورد "تنبيهات سريعة"
// (dashboard-page.js، أول 6 فقط) ومن صفحة "مركز التنبيهات" الكاملة (notifications/alerts-center.html).
// بنفس مبدأ التنبيهات السريعة الموثّق في CLAUDE.md: كل شيء هنا محسوب حيًا من البيانات مباشرة عند كل
// استدعاء، لا يُقرأ من مخزن Notifications ولا يكتب فيه — آلية موازية تمامًا لمركز الإشعارات الدائم
// (بعض هذه الفئات تُنشئ أيضًا إشعارًا دائمًا من صفحتها الخاصة عند زيارتها، مثل التحصين/الحمل/العهد/الأطراف،
// وهذا مقصود وليس تكرارًا يجب توحيده).
//
// الفئات العشر الأصلية (بنفس ترتيب الطلب): نفاد الأعلاف، قرب التحصين، قرب الولادة، وجود نفوق، عهد متأخرة،
// عملاء متأخرون، موردون مستحقون، تجاوز الحد الائتماني، انخفاض رصيد الصندوق، عمليات تحتاج اعتماد.
// + 4 فئات إضافية اختيارية (تُفعَّل من settings.html، انظر getAlertsPreferences أدناه): بلوغ السن المحدد،
// إحصائية المواليد، إحصائية الوفيات، تغيّر عدد القطيع — مُلحَقة بالترتيب حتى لا تُغيّر ترتيب/فهرسة الأصلية.
//
// ⚠️ كل تنبيه يحمل أيضًا `date` (ISO، للعرض عبر formatDateArabic) — تاريخ الحدث الفعلي المرتبط بالتنبيه إن
// وُجد (تاريخ التحصين/الولادة المتوقعة/النفوق/الإرجاع المتوقع...)، وإلا تاريخ اليوم (todayIso()) للفئات
// التجميعية التي لا ترتبط بتاريخ سجل واحد بعينه (نفاد أعلاف/أرصدة/عدد إجمالي...).
//
// ⚠️ كل تنبيه يحمل الآن `id` ثابت (مبني من الفئة + مفتاح مميّز، انظر كل قسم أدناه) + `isRead` (محسوبة من
// localStorage['alertsReadIds']، انظر getReadAlertIds/markAlertAsRead/markAllAlertsAsRead) — تُستهلك من
// alerts-center-page.js (زر "مقروء" لكل تنبيه) وheader.js (عداد غير مقروء على جرس التنبيهات، محمَّل ديناميكيًا
// عبر _ensureAlertsDependenciesLoaded عند الحاجة لأن alerts-service.js لا يُحمَّل ثابتًا في كل صفحة). النتيجة
// النهائية مرتّبة: غير المقروء أولاً، ثم الفئات كما كانت (severity ثم ترتيب الفئة) — "التنبيهات الجديدة تظهر
// أولاً". فئة `herdCountChange` تحديدًا **تختفي بالكامل** بمجرد قراءتها (id يتضمن العدد نفسه، فتغيّر العدد
// ينشئ id جديدًا غير مقروء تلقائيًا) — بعكس بقية الفئات التي تبقى ظاهرة بعد القراءة، فقط بأولوية أقل.

const ALERT_CATEGORY_META = {
  fodder: { label: 'نفاد الأعلاف', icon: '🌾' },
  vaccination: { label: 'قرب التحصين', icon: '💉' },
  pregnancy: { label: 'قرب الولادة', icon: '🤰' },
  death: { label: 'وجود نفوق', icon: '⚠️' },
  custody: { label: 'عهد متأخرة', icon: '📦' },
  customerOverdue: { label: 'عملاء متأخرون', icon: '👤' },
  supplierDue: { label: 'موردون مستحقون', icon: '🏭' },
  creditLimit: { label: 'تجاوز الحد الائتماني', icon: '💳' },
  cashLow: { label: 'انخفاض رصيد الصندوق/البنك', icon: '💰' },
  approval: { label: 'عمليات تحتاج اعتماد', icon: '✅' },
  ageMilestone: { label: 'بلوغ السن المحدد', icon: '🎂' },
  birthsSummary: { label: 'إحصائية المواليد', icon: '👶' },
  deathsSummary: { label: 'إحصائية الوفيات', icon: '📉' },
  herdCountChange: { label: 'تغيّر عدد القطيع', icon: '📈' },
};
const ALERT_CATEGORY_ORDER = Object.keys(ALERT_CATEGORY_META);

// أربع تركيبات نوع/جنس القطيع القابلة لضبط "سن تنبيه" مستقل لكل منها من settings.html
const ALERT_AGE_GROUPS = [
  { key: 'sheepMale', type: 'sheep', gender: 'male', label: 'الأغنام (ذكور)' },
  { key: 'sheepFemale', type: 'sheep', gender: 'female', label: 'الأغنام (إناث)' },
  { key: 'goatMale', type: 'goat', gender: 'male', label: 'الماعز (ذكور)' },
  { key: 'goatFemale', type: 'goat', gender: 'female', label: 'الماعز (إناث)' },
];

const ALERTS_PREFERENCES_KEY = 'alertsPreferences';

// تفضيلات المستخدم لتنبيهات بلوغ السن + إحصائيات المواليد/الوفيات — تُدار حصرًا من قسم "🔔 تنبيهات القطيع"
// في settings.html (settings-page.js)، جنبًا إلى جنب مع حد تنبيه الصندوق/البنك (cashAlertThreshold) الذي
// يُدار من نفس القسم أيضًا (نُقل من مركز التنبيهات). الغياب/القيمة الفارغة = الفئة معطّلة (نفس اتفاقية cashAlertThreshold أعلاه)
function getAlertsPreferences() {
  const defaultAgeThresholds = Object.fromEntries(ALERT_AGE_GROUPS.map(g => [g.key, { enabled: false, months: null }]));
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(ALERTS_PREFERENCES_KEY) || '{}'); } catch (e) { saved = {}; }
  return {
    ageThresholds: { ...defaultAgeThresholds, ...(saved.ageThresholds || {}) },
    birthsMonthly: !!saved.birthsMonthly,
    births3Months: !!saved.births3Months,
    deathsMonthly: !!saved.deathsMonthly,
    deaths3Months: !!saved.deaths3Months,
    herdCountChange: !!saved.herdCountChange,
  };
}

function saveAlertsPreferences(prefs) {
  localStorage.setItem(ALERTS_PREFERENCES_KEY, JSON.stringify(prefs));
}

const ALERTS_READ_IDS_KEY = 'alertsReadIds';

// أرشيف معرّفات التنبيهات "المقروءة" — كل تنبيه من computeAllAlerts() له id ثابت (فئة + مفتاح مميّز:
// معرّف سجل/طرف/مفتاح تجميع...). التنظيف التلقائي لهذه القائمة (حذف أي id لم يعد ضمن التنبيهات الحيّة
// الحالية) يحدث داخل computeAllAlerts نفسها لتفادي تضخّمها بلا حدود بمرور الوقت
function getReadAlertIds() {
  try { return JSON.parse(localStorage.getItem(ALERTS_READ_IDS_KEY) || '[]'); } catch (e) { return []; }
}

function _saveReadAlertIds(ids) {
  localStorage.setItem(ALERTS_READ_IDS_KEY, JSON.stringify(ids));
}

function markAlertAsRead(id) {
  const ids = getReadAlertIds();
  if (!ids.includes(id)) { ids.push(id); _saveReadAlertIds(ids); }
}

function markAllAlertsAsRead(ids) {
  const current = new Set(getReadAlertIds());
  ids.forEach(id => current.add(id));
  _saveReadAlertIds([...current]);
}

// نوافذ "الاقتراب" الزمنية الثابتة لكل فئة زمنية — بنفس أسلوب الثوابت الثابتة المستخدمة أصلاً (7 أيام
// للتحصين في vaccinations-page.js، 30 يومًا لركود العهدة في custody-service.js...)
const _VACCINATION_DUE_SOON_MS = 7 * 24 * 60 * 60 * 1000;
const _PREGNANCY_DUE_SOON_MS = 14 * 24 * 60 * 60 * 1000;
const _DEATH_RECENT_MS = 5 * 24 * 60 * 60 * 1000;

// حد تنبيه انخفاض رصيد الصندوق/البنك — نفس مبدأ localStorage['custodyAlertThreshold']، يُدار من قسم
// "🔔 تنبيهات القطيع" في settings.html (settings-page.js) مع بقية تفضيلات التنبيهات. لا تنبيه أصلاً
// إن لم يُحدَّد المستخدم حدًا (0 أو فارغ = تعطيل هذه الفئة)
function getCashAlertThreshold() {
  return Number(localStorage.getItem('cashAlertThreshold') || 0);
}

function setCashAlertThreshold(value) {
  const n = Number(value || 0);
  if (n > 0) localStorage.setItem('cashAlertThreshold', String(n));
  else localStorage.removeItem('cashAlertThreshold');
}

async function computeAllAlerts() {
  const alerts = [];
  const now = Date.now();

  const [
    animals, inventoryItems, inventoryMovements, vaccinations, pregnancies, deaths,
    custodyItems, parties, revenues, purchases, partyTransactions, expenses,
    accounts, journalEntries, mappings, births,
  ] = await Promise.all([
    getAllAnimals(), getAllInventoryItems(), getAllInventoryMovements(), getAllVaccinations(), getAllPregnancies(), getAllDeaths(),
    getAllCustodyItems(), getAllParties(), getAllRevenues(), getAllPurchases(), getAllPartyTransactions(), getAllExpenses(),
    getAllAccounts(), getPostedJournalEntries(), loadAccountMappings(), getAllBirths(),
  ]);

  // 1) نفاد الأعلاف — أصناف مخزون تصنيفها "أعلاف" ووصلت لحد الطلب (أو نفدت تمامًا)
  inventoryItems.filter(item => item.category === 'fodder').forEach(item => {
    const { currentQty, isLowStock } = computeItemStockLevel(item, inventoryMovements);
    if (!isLowStock) return;
    const depleted = currentQty <= 0;
    alerts.push({
      id: `fodder:${item.id}`,
      date: todayIso(),
      category: 'fodder', severity: depleted ? 'red' : 'warning',
      title: depleted ? 'نفاد صنف علف' : 'اقتراب نفاد صنف علف',
      message: `الصنف "${item.name}" ${depleted ? 'نفد تمامًا' : `وصل لحد الطلب (المتبقي: ${formatNumber(currentQty)} ${item.unit || ''})`}`,
      href: getRootPath('inventory/inventory-items.html'),
    });
  });

  // 2) قرب التحصين — جرعة قادمة خلال 7 أيام أو متجاوزة، لحيوان حي
  vaccinations.forEach(v => {
    if (!v.nextDueDate) return;
    const animal = animals.find(a => a.id === v.animalId);
    if (!animal || animal.status !== 'alive') return;
    const diff = new Date(v.nextDueDate).getTime() - now;
    if (diff > _VACCINATION_DUE_SOON_MS) return;
    const overdue = diff < 0;
    alerts.push({
      id: `vaccination:${v.id}`,
      date: v.nextDueDate,
      category: 'vaccination', severity: overdue ? 'red' : 'warning',
      title: overdue ? 'جرعة تحصين متأخرة' : 'موعد تحصين قادم',
      message: `الحيوان ${animal.code} — لقاح "${v.vaccineName}" ${overdue ? 'تجاوز موعده بتاريخ' : 'مستحق بتاريخ'} ${formatDateArabic(v.nextDueDate)}`,
      href: getRootPath(`herd/vaccinations.html?animalId=${animal.id}`),
    });
  });

  // 3) قرب الولادة — حالات حمل قائمة (status: 'pregnant') موعد ولادتها المتوقع خلال 14 يومًا أو تجاوزه
  pregnancies.filter(p => p.status === 'pregnant').forEach(p => {
    if (!p.expectedBirthDate) return;
    const animal = animals.find(a => a.id === p.animalId);
    if (!animal || animal.status !== 'alive') return;
    const diff = new Date(p.expectedBirthDate).getTime() - now;
    if (diff > _PREGNANCY_DUE_SOON_MS) return;
    const overdue = diff < 0;
    alerts.push({
      id: `pregnancy:${p.id}`,
      date: p.expectedBirthDate,
      category: 'pregnancy', severity: overdue ? 'red' : 'warning',
      title: overdue ? 'تجاوزت موعد الولادة المتوقع' : 'اقتراب موعد ولادة',
      message: `الحيوان ${animal.code} — الولادة المتوقعة ${overdue ? 'كانت بتاريخ' : 'بتاريخ'} ${formatDateArabic(p.expectedBirthDate)}`,
      href: getRootPath(`herd/pregnancy.html?animalId=${animal.id}`),
    });
  });

  // 4) وجود نفوق — حالات نفوق حديثة (آخر 5 أيام)
  deaths.forEach(d => {
    if (!d.deathDate) return;
    const age = now - new Date(d.deathDate).getTime();
    if (age < 0 || age > _DEATH_RECENT_MS) return;
    const animal = animals.find(a => a.id === d.animalId);
    alerts.push({
      id: `death:${d.id}`,
      date: d.deathDate,
      category: 'death', severity: 'red',
      title: 'حالة نفوق مسجّلة',
      message: `الحيوان ${animal ? animal.code : ''} نفق بتاريخ ${formatDateArabic(d.deathDate)} (${DEATH_CAUSE_LABELS[d.cause] || d.cause || 'غير معروف'})`,
      href: getRootPath('herd/deaths.html'),
    });
  });

  // 5) عهد متأخرة
  custodyItems
    .filter(c => (c.status === 'open' || c.status === 'partially_settled') && getEffectiveCustodyStatus(c) === 'overdue')
    .forEach(c => {
      alerts.push({
        id: `custody:${c.id}`,
        date: c.expectedReturnDate,
        category: 'custody', severity: 'red',
        title: 'عهدة متأخرة',
        message: `العهدة ${c.custodyNumber || ''} تجاوزت تاريخ الإرجاع المتوقع (${formatDateArabic(c.expectedReturnDate)}) — المتبقي ${formatCurrency(remainingCustodyAmount(c))}`,
        href: getRootPath('custody/custody-list.html'),
      });
    });

  // 6/7/8) عملاء متأخرون / موردون مستحقون / تجاوز الحد الائتماني
  parties.forEach(party => {
    const balance = computePartyBalance(party, revenues, purchases, partyTransactions);

    if (party.type === 'client' && Number(party.creditLimit) > 0 && balance > Number(party.creditLimit) + 0.01) {
      alerts.push({
        id: `creditLimit:${party.id}`,
        date: todayIso(),
        category: 'creditLimit', severity: 'red',
        title: 'تجاوز حد الائتمان',
        message: `العميل "${party.name}" برصيد مدين ${formatCurrency(balance)} تجاوز حد الائتمان المحدد (${formatCurrency(party.creditLimit)})`,
        href: getRootPath(`parties/party-card.html?partyId=${party.id}&type=client`),
      });
    }

    if (isPartyOverdue(party, revenues, purchases)) {
      alerts.push({
        id: `overdue:${party.id}`,
        date: todayIso(),
        category: party.type === 'client' ? 'customerOverdue' : 'supplierDue',
        severity: 'warning',
        title: party.type === 'client' ? 'عميل متأخر في السداد' : 'مورّد مستحق السداد',
        message: party.type === 'client'
          ? `العميل "${party.name}" لديه فاتورة آجلة تجاوزت مدة السداد المحددة (${party.paymentTermDays} يومًا)`
          : `مورّد "${party.name}" لديه فاتورة آجلة مستحقة السداد منذ أكثر من ${party.paymentTermDays} يومًا`,
        href: getRootPath(`parties/party-card.html?partyId=${party.id}&type=${party.type}`),
      });
    }
  });

  // 9) انخفاض رصيد الصندوق/البنك — يتطلب حدًا محفوظًا مسبقًا (0/فارغ = الفئة معطّلة).
  // الحسابات تُحل عبر "ربط العمليات بالحسابات" (مفتاحا cash/bank)
  const cashThreshold = getCashAlertThreshold();
  if (cashThreshold > 0) {
    [{ key: 'cash', label: 'الصندوق' }, { key: 'bank', label: 'البنك' }].forEach(({ key, label }) => {
      const account = getMappedAccount(key, accounts, mappings);
      if (!account) return;
      const { balance } = computeAccountBalance(account, journalEntries);
      if (balance < cashThreshold) {
        alerts.push({
          id: `cashLow:${key}`,
          date: todayIso(),
          category: 'cashLow', severity: 'red',
          title: `انخفاض رصيد ${label}`,
          message: `رصيد ${label} الحالي ${formatCurrency(balance)} أقل من الحد الأدنى المحدد (${formatCurrency(cashThreshold)})`,
          href: getRootPath('accounting/cash-transfer.html'),
        });
      }
    });
  }

  // 10) عمليات تحتاج اعتماد — مصروفات/مشتريات بحالة "معلّق"
  const pendingExpenses = expenses.filter(e => e.status === 'pending');
  if (pendingExpenses.length) {
    alerts.push({
      id: 'approval:expenses',
      date: todayIso(),
      category: 'approval', severity: 'blue',
      title: 'مصروفات بانتظار الاعتماد',
      message: `يوجد ${formatNumber(pendingExpenses.length)} مصروف بانتظار الاعتماد`,
      href: getRootPath('expenses/expense-list.html'),
    });
  }
  const pendingPurchases = purchases.filter(p => p.status === 'pending');
  if (pendingPurchases.length) {
    alerts.push({
      id: 'approval:purchases',
      date: todayIso(),
      category: 'approval', severity: 'blue',
      title: 'مشتريات بانتظار الاعتماد',
      message: `يوجد ${formatNumber(pendingPurchases.length)} مشترى بانتظار الاعتماد`,
      href: getRootPath('purchases/purchase-list.html'),
    });
  }

  // 11) بلوغ السن المحدد — تفضيلات المستخدم من settings.html (localStorage['alertsPreferences']), مقارنة
  // عمر كل حيوان حي (بالأشهر، عبر calculateAgeInMonths) بالسن المحدد لكل تركيبة نوع/جنس على حدة؛ تنبيه
  // واحد بالعدد الإجمالي لكل تركيبة مفعّلة لها سن محدد وبلغه حيوان واحد على الأقل
  const alertsPrefs = getAlertsPreferences();
  ALERT_AGE_GROUPS.forEach(group => {
    const pref = alertsPrefs.ageThresholds[group.key];
    const thresholdMonths = Number(pref && pref.months);
    if (!pref || !pref.enabled || !(thresholdMonths > 0)) return;
    const maturedCount = animals.filter(a => {
      if (a.status !== 'alive' || a.type !== group.type || a.gender !== group.gender) return false;
      const ageMonths = calculateAgeInMonths(a.birthDate);
      return ageMonths !== null && ageMonths >= thresholdMonths;
    }).length;
    if (!maturedCount) return;
    alerts.push({
      id: `ageMilestone:${group.key}`,
      date: todayIso(),
      category: 'ageMilestone', severity: 'blue',
      title: `بلوغ السن المحدد — ${group.label}`,
      message: `يوجد ${formatNumber(maturedCount)} من ${group.label} بلغ أو تجاوز سن ${formatNumber(thresholdMonths)} شهر`,
      href: getRootPath('herd/herd-list.html'),
    });
  });

  // 12) إحصائية المواليد — مجموع offspringCount خلال الشهر الحالي و/أو آخر 3 أشهر، حسب تفعيل المستخدم
  const nowDate = new Date(now);
  const monthStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1);
  const threeMonthsStart = new Date(nowDate.getFullYear(), nowDate.getMonth() - 2, 1);
  const _sumBirthsSince = (sinceDate) => births
    .filter(b => b.birthDate && new Date(b.birthDate) >= sinceDate)
    .reduce((sum, b) => sum + (Number(b.offspringCount) || 0), 0);

  if (alertsPrefs.birthsMonthly) {
    const count = _sumBirthsSince(monthStart);
    if (count > 0) {
      alerts.push({
        id: 'birthsSummary:monthly',
        date: todayIso(),
        category: 'birthsSummary', severity: 'blue',
        title: 'مواليد الشهر الحالي',
        message: `تم تسجيل ${formatNumber(count)} مولود خلال الشهر الحالي`,
        href: getRootPath('herd/births.html'),
      });
    }
  }
  if (alertsPrefs.births3Months) {
    const count = _sumBirthsSince(threeMonthsStart);
    if (count > 0) {
      alerts.push({
        id: 'birthsSummary:3months',
        date: todayIso(),
        category: 'birthsSummary', severity: 'blue',
        title: 'مواليد آخر 3 أشهر',
        message: `تم تسجيل ${formatNumber(count)} مولود خلال آخر 3 أشهر`,
        href: getRootPath('herd/births.html'),
      });
    }
  }

  // 13) إحصائية الوفيات — عدد حالات النفوق خلال الشهر الحالي و/أو آخر 3 أشهر، حسب تفعيل المستخدم (منفصلة
  // عن فئة "وجود نفوق" أعلاه التي تنبّه بكل حالة على حدة خلال آخر 5 أيام فقط)
  const _countDeathsSince = (sinceDate) => deaths.filter(d => d.deathDate && new Date(d.deathDate) >= sinceDate).length;

  if (alertsPrefs.deathsMonthly) {
    const count = _countDeathsSince(monthStart);
    if (count > 0) {
      alerts.push({
        id: 'deathsSummary:monthly',
        date: todayIso(),
        category: 'deathsSummary', severity: 'blue',
        title: 'حالات نفوق الشهر الحالي',
        message: `تم تسجيل ${formatNumber(count)} حالة نفوق خلال الشهر الحالي`,
        href: getRootPath('herd/deaths.html'),
      });
    }
  }
  if (alertsPrefs.deaths3Months) {
    const count = _countDeathsSince(threeMonthsStart);
    if (count > 0) {
      alerts.push({
        id: 'deathsSummary:3months',
        date: todayIso(),
        category: 'deathsSummary', severity: 'blue',
        title: 'حالات نفوق آخر 3 أشهر',
        message: `تم تسجيل ${formatNumber(count)} حالة نفوق خلال آخر 3 أشهر`,
        href: getRootPath('herd/deaths.html'),
      });
    }
  }

  // 14) تغيّر عدد القطيع — تفضيل واحد (alertsPrefs.herdCountChange) يفعّل تنبيهًا بالعدد الحيّ الحالي لكل
  // تركيبة نوع/جنس (نفس ALERT_AGE_GROUPS). id يتضمن العدد نفسه، فتغيّر العدد (مولود/شراء يزيد، بيع/نفوق
  // ينقص) يعني id جديدًا لم يُقرأ من قبل ⇐ يظهر تلقائيًا كتنبيه غير مقروء؛ راجع الفلترة الخاصة بهذه الفئة
  // أسفل الدالة (تختفي بالكامل بمجرد قراءتها، بعكس بقية الفئات)
  if (alertsPrefs.herdCountChange) {
    ALERT_AGE_GROUPS.forEach(group => {
      const count = animals.filter(a => a.status === 'alive' && a.type === group.type && a.gender === group.gender).length;
      if (!count) return;
      alerts.push({
        id: `herdCountChange:${group.key}:${count}`,
        date: todayIso(),
        category: 'herdCountChange', severity: 'blue',
        title: `تغيّر عدد القطيع — ${group.label}`,
        message: `العدد الحالي لـ${group.label}: ${formatNumber(count)} رأس`,
        href: getRootPath('herd/herd-list.html'),
      });
    });
  }

  // تعليم كل تنبيه بحالة "مقروء" (من alertsReadIds) + تنظيف تلقائي للمعرّفات القديمة التي لم تعد ضمن
  // التنبيهات الحالية (تمنع تضخّم القائمة بلا حدود بمرور الوقت). تُحسب المرشّحات من كل التنبيهات المولَّدة
  // قبل استبعاد أي شيء، حتى لا يُحذف معرّف "تغيّر عدد القطيع" المقروء خطأً فيعاود الظهور رغم ثبات العدد
  const readIds = getReadAlertIds();
  const candidateIds = alerts.map(a => a.id);
  const prunedReadIds = readIds.filter(id => candidateIds.includes(id));
  if (prunedReadIds.length !== readIds.length) _saveReadAlertIds(prunedReadIds);

  // "تغيّر عدد القطيع" تحديدًا يختفي بالكامل بمجرد تعليمه مقروءًا (إشعار لحظي بفرق العدد لا حالة دائمة)،
  // بعكس بقية الفئات التي تبقى ظاهرة بعد القراءة بحالة "مقروءة" فقط (أولوية أقل في الترتيب أدناه)
  const visibleAlerts = alerts.filter(a => a.category !== 'herdCountChange' || !prunedReadIds.includes(a.id));
  visibleAlerts.forEach(a => { a.isRead = prunedReadIds.includes(a.id); });

  // ترتيب ثابت: غير المقروء أولاً ("التنبيهات الجديدة تظهر أولاً")، ثم حسب فئة الخطورة (أحمر أولاً)، ثم
  // حسب ترتيب الفئات الأربع عشرة أعلاه
  const severityRank = { red: 0, warning: 1, blue: 2 };
  const categoryRank = Object.fromEntries(ALERT_CATEGORY_ORDER.map((c, i) => [c, i]));
  visibleAlerts.sort((a, b) =>
    (a.isRead - b.isRead) ||
    (severityRank[a.severity] - severityRank[b.severity]) ||
    (categoryRank[a.category] - categoryRank[b.category])
  );

  return visibleAlerts;
}
