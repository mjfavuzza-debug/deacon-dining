// Run with:  node scraper/collect.js
// Reads every dining page, then writes docs/menu-data.js (used by the app)
// and docs/menu.json (same data, for anything else that wants it).
const fs = require('fs');
const path = require('path');
const { parseMenu } = require('./parse.js');
const locations = require('./locations.js');
const chains = require('./chains.js');

function todayEastern() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

async function main() {
  const menu = { date: todayEastern(), generatedAt: new Date().toISOString(), source: 'https://dining.wfu.edu', locations: [], recipes: {} };
  const problems = [];
  for (const loc of locations) {
    try {
      const res = await fetch(loc.url, { headers: { 'User-Agent': 'Mozilla/5.0 (student class project: Deacon Plate menu collector)' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const parsed = parseMenu(await res.text());
      const count = Object.keys(parsed.recipes).length;
      if (!count) throw new Error('no menu items found on the page');
      Object.assign(menu.recipes, parsed.recipes);
      menu.locations.push({ ...loc, meals: parsed.meals });
      console.log(`${loc.name}: ${count} items, ${parsed.meals.length} menu(s)` + (parsed.errors ? `, ${parsed.errors} unreadable` : ''));
    } catch (e) {
      problems.push(`${loc.name}: ${e.message}`);
      console.error(`PROBLEM ${loc.name}: ${e.message}`);
    }
  }
  const c = chains();
  Object.assign(menu.recipes, c.recipes);
  menu.locations.push(...c.locations);

  if (!menu.locations.some((l) => l.kind === 'hall')) {
    console.error('No dining hall could be read. Keeping the old menu file.');
    process.exit(1);
  }
  const out = path.join(__dirname, '..', 'docs');
  fs.writeFileSync(path.join(out, 'menu.json'), JSON.stringify(menu));
  fs.writeFileSync(path.join(out, 'menu-data.js'), 'window.MENU = ' + JSON.stringify(menu) + ';\n');
  console.log(`Saved ${Object.keys(menu.recipes).length} items for ${menu.date}.` + (problems.length ? ' Problems: ' + problems.join('; ') : ''));
}

main().catch((e) => { console.error(e); process.exit(1); });
