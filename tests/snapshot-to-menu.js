// Turns the compact snapshot Claude captured on Nov 16, 2026 into docs/menu-data.js.
// Only needed once: after this, scraper/collect.js produces the real daily file.
const fs = require('fs');
const path = require('path');
const chains = require('../scraper/chains.js');
const locations = require('../scraper/locations.js');
const [recPart, locPart] = fs.readFileSync(path.join(__dirname, 'snapshot-2026-11-16.txt'), 'utf8').split('\n####\n');
const TAG = { v: 'vegetarian', V: 'vegan', g: 'made_without_gluten' };
const recipes = {};
const lines = recPart.split('\n');
lines.forEach((line, i) => {
  const f = line.split('|');
  if (f.length !== 8) throw new Error('bad line ' + i + ': ' + line);
  const num = (x) => (x === '' ? null : Number(x));
  const r = { name: f[0], serving: f[1], cal: num(f[2]), protein: num(f[3]), carbs: num(f[4]), fat: num(f[5]), satFat: null, sugar: null, fiber: null, sodium: null, tags: f[6] ? f[6].split(',').map((t) => TAG[t] || t) : [], allergens: f[7] };
  if ([r.cal, r.protein, r.carbs, r.fat].some((x) => x === null || isNaN(x))) throw new Error('bad number line ' + i);
  if (r.fat * 9 + r.protein * 4 + r.carbs * 4 > r.cal * 1.6 + 60) r.flag = true;
  recipes['s' + i] = r;
});
const menu = { date: '2026-11-16', generatedAt: '2026-11-16T23:30:00Z', source: 'https://dining.wfu.edu', snapshot: 'Dinner menus only, captured Nov 16, 2026', locations: [], recipes };
for (const line of locPart.trim().split('\n')) {
  const [id, rest] = line.split('>>');
  const loc = locations.find((l) => l.id === id);
  const meals = rest.split('^^').map((m) => {
    const [name, hours, st] = m.split('~');
    return { name, hours, stations: st.split(';').map((s) => { const k = s.lastIndexOf(':'); return { name: s.slice(0, k), items: s.slice(k + 1).split(',').map((n) => { if (!recipes['s' + n]) throw new Error('bad index ' + n); return 's' + n; }) }; }) };
  });
  menu.locations.push({ ...loc, meals });
}
const c = chains();
Object.assign(menu.recipes, c.recipes);
menu.locations.push(...c.locations);
const out = path.join(__dirname, '..', 'docs');
fs.writeFileSync(path.join(out, 'menu.json'), JSON.stringify(menu));
fs.writeFileSync(path.join(out, 'menu-data.js'), 'window.MENU = ' + JSON.stringify(menu) + ';\n');
console.log(lines.length, 'recipes;', menu.locations.map((l) => l.id + ':' + l.meals.map((m) => m.stations.reduce((a, s) => a + s.items.length, 0)).join('/')).join(' '), '; flagged:', Object.values(recipes).filter((r) => r.flag).map((r) => r.name).join(', '));
