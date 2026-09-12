const fs = require('fs');
const src = fs.readFileSync('js/db/seed.js', 'utf8');
function grabArray(name) {
  const m = src.match(new RegExp('const ' + name + '\\s*=\\s*([\\s\\S]*?)\\s*;'));
  if (!m) throw new Error(name + ' not found');
  let body = m[1];
  const setMatch = body.match(/^new Set\(([\s\S]*)\)$/);
  return setMatch ? setMatch[1] : body;
}
global.eval(grabArray('_NEW_CHART_ACCOUNTS'));
global.eval('var RETIRED=' + grabArray('_RETIRED_SYSTEM_ACCOUNT_CODES') + ']');
global.eval('var SYSONLY=' + grabArray('_NEW_CHART_SYSTEM_ONLY_CODES') + ']');

console.log('total accounts:', _NEW_CHART_ACCOUNTS.length);
const codes = new Set(_NEW_CHART_ACCOUNTS.map(a => a[0]));
console.log('bad parents:', JSON.stringify(_NEW_CHART_ACCOUNTS.filter(a => a[3] && !codes.has(a[3]))));
console.log('duplicates:', _NEW_CHART_ACCOUNTS.map(a => a[0]).filter((c, i, arr) => arr.indexOf(c) !== i));
console.log('retired still in tree:', [...codes].filter(c => RETIRED.includes(c)));
console.log('retired still in sysonly:', SYSONLY.filter(c => RETIRED.includes(c)));
console.log('partner account:', JSON.stringify(_NEW_CHART_ACCOUNTS.filter(a => a[0] === '3010')));
const cats = _NEW_CHART_ACCOUNTS.filter(a => (a[2] === 'expense' || a[2] === 'revenue') && a[5] && !SYSONLY.includes(a[0]));
console.log('postable category accounts:', cats.length);
cats.forEach(a => console.log(' ', a[0], a[1], a[2]));
