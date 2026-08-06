// js/db/seed.js
// تهيئة أولية عند أول تشغيل فقط: حسابا الدخول الافتراضيان + بنود التكويدات الافتراضية.
// لا تُدرج أي بيانات تشغيلية تجريبية (قطيع/مصروفات/إيرادات) — قاعدة البيانات تبدأ نظيفة.

async function seedDatabaseIfEmpty() {
  await _seedDefaultCategoriesIfEmpty();
  await _seedDefaultChartOfAccountsIfEmpty();
  await _seedStockCountAccountsIfMissing();
  await _linkDefaultExpenseCategoriesToAccountsIfMissing();
  await _postExpenseJournalEntriesIfMissing();
  await _migrateLegacyBulkDataIfNeeded();

  const users = await dbGetAll('Users');
  if (users.length > 0) return; // تمت التهيئة من قبل

  const adminHash = await hashPassword('admin123');
  await dbAdd('Users', {
    username: 'admin',
    passwordHash: adminHash,
    role: 'manager',
    fullName: 'مدير المزرعة',
    phone: '0500000000',
  });

  const ownerHash = await hashPassword('owner123');
  await dbAdd('Users', {
    username: 'owner',
    passwordHash: ownerHash,
    role: 'owner',
    fullName: 'صاحب الحلال',
    phone: '0511111111',
  });

  console.log('تمت تهيئة حسابات الدخول الافتراضية');
}

// منفصلة عن باقي التهيئة وتُفحص بمعزل عن مخزن Users، حتى تُضيف البنود الافتراضية
// لقواعد بيانات موجودة مسبقًا (قبل إضافة مخزن Categories) دون التأثير على بياناتها الأخرى
async function _seedDefaultCategoriesIfEmpty() {
  const existingCategories = await dbGetAll('Categories');
  if (existingCategories.length > 0) return;

  const defaultExpenseCategories = ['أعلاف', 'أدوية', 'رواتب', 'صيانة', 'نقل', 'إيجار', 'أخرى'];
  for (const name of defaultExpenseCategories) {
    await dbAdd('Categories', { type: 'expense', name });
  }

  const defaultRevenueCategories = ['بيع حيوان', 'بيع حليب', 'بيع صوف/شعر', 'بيع سماد', 'خدمات تلقيح', 'أخرى'];
  for (const name of defaultRevenueCategories) {
    await dbAdd('Categories', { type: 'revenue', name });
  }

  const defaultPurchaseCategories = ['أعلاف ومركزات', 'شراء حيوانات', 'معدات ومستلزمات', 'أخرى'];
  for (const name of defaultPurchaseCategories) {
    await dbAdd('Categories', { type: 'purchase', name });
  }
}

// منفصلة عن باقي التهيئة وتُفحص بمعزل عن مخزن Users، حتى تُضيف شجرة الحسابات الافتراضية
// لقواعد بيانات موجودة مسبقًا (قبل إضافة مخزن ChartOfAccounts) دون التأثير على بياناتها الأخرى
async function _seedDefaultChartOfAccountsIfEmpty() {
  const existingAccounts = await dbGetAll('ChartOfAccounts');
  if (existingAccounts.length > 0) return;

  const defaultAccounts = [
    // أصول
    { code: '1000', name: 'الصندوق (نقدية)', type: 'asset' },
    { code: '1010', name: 'البنك', type: 'asset' },
    { code: '1020', name: 'عهد الموظفين', type: 'asset' },
    { code: '1030', name: 'مخزون الأعلاف والأدوية', type: 'asset' },
    { code: '1040', name: 'معدات وأصول ثابتة', type: 'asset' },
    // خصوم
    { code: '2000', name: 'ذمم دائنة (موردون)', type: 'liability' },
    { code: '2010', name: 'قروض', type: 'liability' },
    // حقوق ملكية
    { code: '3000', name: 'رأس المال', type: 'equity' },
    { code: '3010', name: 'أرباح مرحّلة', type: 'equity' },
    // إيرادات
    { code: '4000', name: 'إيرادات بيع حيوانات', type: 'revenue' },
    { code: '4010', name: 'إيرادات الشراء والبيع الجماعي', type: 'revenue' },
    { code: '4020', name: 'إيرادات أخرى', type: 'revenue' },
    // مصروفات
    { code: '5000', name: 'مصروفات أعلاف', type: 'expense' },
    { code: '5010', name: 'مصروفات أدوية وعلاج', type: 'expense' },
    { code: '5020', name: 'رواتب', type: 'expense' },
    { code: '5030', name: 'صيانة', type: 'expense' },
    { code: '5040', name: 'نقل', type: 'expense' },
    { code: '5050', name: 'إيجار', type: 'expense' },
    { code: '5060', name: 'مشتريات الشراء والبيع الجماعي', type: 'expense' },
    { code: '5070', name: 'مصاريف الشراء والبيع الجماعي', type: 'expense' },
    { code: '5080', name: 'مصروفات أخرى', type: 'expense' },
  ];

  for (const account of defaultAccounts) {
    await dbAdd('ChartOfAccounts', { ...account, normalBalance: ACCOUNT_NORMAL_BALANCE_BY_TYPE[account.type] });
  }
}

// منفصلة عن باقي التهيئة وتُفحص **بكود الحساب لا بفراغ المخزن** (بعكس _seedDefaultChartOfAccountsIfEmpty أعلاه) —
// لازمة لإضافة حسابات جديدة لقواعد بيانات سبق أن بُذرت فيها شجرة الحسابات الأساسية (مثل حسابات تصنيفَي المعدات/الأخرى
// اللازمة لميزة الجرد)، دون التأثير على الحسابات الموجودة أصلاً
async function _seedStockCountAccountsIfMissing() {
  const existingAccounts = await dbGetAll('ChartOfAccounts');
  const existingCodes = new Set(existingAccounts.map(a => a.code));

  const additions = [
    { code: '1031', name: 'مخزون المعدات والمستلزمات الأخرى', type: 'asset' },
    { code: '5090', name: 'مصروفات معدات ومستلزمات', type: 'expense' },
  ];

  for (const account of additions) {
    if (existingCodes.has(account.code)) continue;
    await dbAdd('ChartOfAccounts', { ...account, normalBalance: ACCOUNT_NORMAL_BALANCE_BY_TYPE[account.type] });
  }
}

// تربط بنود المصروفات الافتراضية السبعة (بالاسم المطابق تمامًا) بحساباتها المقابلة في شجرة الحسابات —
// مفحوصة لكل بند على حدة (بلا `linkedAccountId` بعد)، فلا تكتب فوق ربط اختاره المستخدم بنفسه من شاشة التكويدات
async function _linkDefaultExpenseCategoriesToAccountsIfMissing() {
  const defaultCategoryAccountCodes = {
    'أعلاف': '5000', 'أدوية': '5010', 'رواتب': '5020',
    'صيانة': '5030', 'نقل': '5040', 'إيجار': '5050', 'أخرى': '5080',
  };

  const [categories, accounts] = await Promise.all([dbGetAll('Categories'), dbGetAll('ChartOfAccounts')]);
  for (const category of categories) {
    if (category.type !== 'expense' || category.linkedAccountId) continue;
    const accountCode = defaultCategoryAccountCodes[category.name];
    if (!accountCode) continue;
    const account = getAccountByCode(accountCode, accounts);
    if (account) await dbUpdate('Categories', category.id, { linkedAccountId: account.id });
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

// ترحيل تلقائي لمرة واحدة: يحوّل سجلات BulkPurchases/BulkSales/BulkExpenses القديمة (كل معاملة سجل مستقل)
// إلى نموذج "الدفعات" الجديد في BulkBatches (سجل واحد يحوي بنود شراء/بيع/مصاريف). يعمل بمعزل عن باقي التهيئة
// ويُفحص شرطه الخاص (BulkBatches فارغ + وجود بيانات قديمة) حتى يعمل مع قواعد بيانات موجودة مسبقًا قبل هذه الميزة
async function _migrateLegacyBulkDataIfNeeded() {
  const existingBatches = await dbGetAll('BulkBatches');
  if (existingBatches.length > 0) return;

  const [legacyPurchases, legacySales, legacyExpenses] = await Promise.all([
    dbQuery('BulkPurchases', p => p.status !== 'deleted'),
    dbQuery('BulkSales', s => s.status !== 'deleted'),
    dbQuery('BulkExpenses', e => e.status !== 'deleted'),
  ]);

  if (!legacyPurchases.length && !legacySales.length && !legacyExpenses.length) return;

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
    const code = await generateNextBulkBatchCode();
    const newBatchId = await createBulkBatch({
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
      const code = await generateNextBulkBatchCode();
      targetBatchId = await createBulkBatch({ code, purchaseDate: s.date, purchaseLines: [], saleLines: [], expenseLines: [], notes: '' });
      (batchIdsByKey[key] = batchIdsByKey[key] || []).push(targetBatchId);
    }

    const batch = await getBulkBatchById(targetBatchId);
    const saleLines = [...(batch.saleLines || []), { date: s.date, type: s.type, gender: s.gender, breed: s.breed, count: Number(s.count || 0), unitPrice: Number(s.unitPrice || 0) }];
    await updateBulkBatch(targetBatchId, { saleLines });
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
        const code = await generateNextBulkBatchCode();
        generalExpenseBatchId = await createBulkBatch({
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

    const batch = await getBulkBatchById(targetBatchId);
    const expenseLines = [...(batch.expenseLines || []), { date: e.date, description: e.description, amount: Number(e.amount || 0) }];
    await updateBulkBatch(targetBatchId, { expenseLines });
  }

  console.log('تم ترحيل بيانات الشراء والبيع الجماعي القديمة إلى نظام الدفعات الجديد');
}
