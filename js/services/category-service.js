// js/services/category-service.js
// بنود المصروفات والإيرادات ("تكويدات") — قائمة قابلة للتعديل تحل محل الثوابت الثابتة سابقًا

async function getAllCategories(type) {
  const all = await dbGetAll('Categories');
  return all.filter(c => c.status !== 'deleted' && (!type || c.type === type));
}

async function getCategoryNames(type) {
  const categories = await getAllCategories(type);
  return categories.map(c => c.name);
}

async function createCategory(data) {
  return dbAdd('Categories', data);
}

async function updateCategory(id, data) {
  return dbUpdate('Categories', id, data);
}

async function deleteCategory(id) {
  return dbSoftDelete('Categories', id);
}

async function isCategoryNameTaken(type, name, excludeId = null) {
  const all = await getAllCategories(type);
  return all.some(c => c.name === name && c.id !== excludeId);
}

const CATEGORY_TYPE_LABELS = { expense: 'بند مصروف', revenue: 'بند إيراد', purchase: 'بند مشتريات' };
