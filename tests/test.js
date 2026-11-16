// Run with:  node tests/test.js
const assert = require('assert');
const E = require('../docs/engine.js');
const { parseMenu } = require('../scraper/parse.js');
const menu = JSON.parse(require('fs').readFileSync(__dirname + '/../docs/menu.json', 'utf8'));
let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log('ok  ' + name); }
const at = (h, m, day) => { const d = new Date(2026, 10, 16 + (day || 0), h, m || 0); return d; }; // Nov 16, 2026 is a Monday

test('parser reads meals, stations and nutrition, including the active tab', () => {
  const html = '<div class="c-tabs-nav"><a><div class="c-tabs-nav__link-inner">LUNCH (11am-2pm)</div></a><a><div class="c-tabs-nav__link-inner">DINNER (4:30pm-9pm)</div></a></div>' +
    '<div class="c-tab"><div class="c-tab__content"><h4 class="toggle-menu-station-data" data-id="1">southern kitchen</h4><div id="recipe-nutrition-a" style="display: none">{"name":"Eggs","serving_size":"0.5 cup","attributes":[{"icon":"vegetarian"}],"allergens_list":"Eggs","facts":[{"label":"Calories","value":220},{"label":"Protein","value":15},{"label":"Total Fat","value":17},{"label":"Total Carbohydrate","value":1}]}</div></div></div>' +
    '<div class="c-tab is-active"><div class="c-tab__content"><h4 class="toggle-menu-station-data" data-id="2">grill</h4><div id="recipe-nutrition-b">{"name":"Pizza","facts":[{"label":"Calories","value":240},{"label":"Total Fat","value":82}]}</div><div id="recipe-nutrition-c">not json</div></div></div>';
  const p = parseMenu(html);
  assert.deepStrictEqual(p.meals.map((m) => m.name + '|' + m.hours), ['Lunch|11am-2pm', 'Dinner|4:30pm-9pm']);
  assert.strictEqual(p.recipes.a.protein, 15);
  assert.strictEqual(p.recipes.b.flag, true);
  assert.strictEqual(p.errors, 1);
});

test('hours and day ranges', () => {
  assert.deepStrictEqual(E.parseHours('4:30pm-9pm'), { start: 990, end: 1260 });
  assert.deepStrictEqual(E.parseHours('11am-12am'), { start: 660, end: 1440 });
  assert.deepStrictEqual(E.parseDays('Sun - Wed'), [0, 1, 2, 3]);
  assert.deepStrictEqual(E.parseDays('Mon - Sun'), [1, 2, 3, 4, 5, 6, 0]);
  assert.strictEqual(E.parseDays('Dinner'), null);
});

test('knows what is open at 6 pm Monday and what is not on Saturday', () => {
  const pit = menu.locations.find((l) => l.id === 'pit');
  assert.strictEqual(E.activeMeal(pit, at(18)).status, 'open');
  assert.strictEqual(E.activeMeal(pit, at(10)).status, 'later');
  assert.strictEqual(E.activeMeal(pit, at(22)), null);
  const shortys = menu.locations.find((l) => l.id === 'shortys');
  assert.strictEqual(E.activeMeal(shortys, at(18)).status, 'open');
  assert.strictEqual(E.activeMeal(shortys, at(18, 0, 5)), null); // Saturday
});

test('builds a plate near the target and ranks every open place', () => {
  const s = E.newState();
  const ranked = E.rankLocations(menu, s, at(18));
  assert.ok(ranked.length >= 5, 'expected 5+ places, got ' + ranked.length);
  for (const r of ranked) {
    assert.ok(r.plate.items.length >= 1);
    console.log('     ' + r.loc.name.padEnd(18) + r.plate.totals.cal + ' cal, ' + r.plate.totals.protein + 'g protein: ' + r.plate.items.map((i) => (i.servings > 1 ? i.servings + 'x ' : '') + i.name).join(' + '));
  }
  const top = ranked[0];
  assert.ok(Math.abs(top.plate.totals.cal - top.target.cal) < top.target.cal * 0.25, 'top plate should be within 25% of target');
  assert.ok(!top.plate.items.some((i) => /Pizza$/.test(i.name) && menu.recipes[i.id].flag), 'flagged items are never auto-picked');
});

test('shuffle gives a different main', () => {
  const s = E.newState();
  const pit = menu.locations.find((l) => l.id === 'pit');
  const t = E.mealTarget(s, at(18));
  const a = E.buildPlate(menu, pit.meals[0], t, s.prefs, { seed: 1, kind: 'hall' });
  const b = E.buildPlate(menu, pit.meals[0], t, s.prefs, { seed: 2, kind: 'hall', avoidIds: a.items.map((i) => i.id) });
  assert.notStrictEqual(a.items[0].id, b.items[0].id);
});

test('vegan and no-pork filters hold', () => {
  const s = E.newState();
  s.prefs.diet = 'vegan';
  for (const r of E.rankLocations(menu, s, at(18))) for (const i of r.plate.items) assert.ok(menu.recipes[i.id].tags.includes('vegan'), i.name + ' is not vegan');
  s.prefs = { diet: 'any', noPork: true, noGluten: false, avoid: ['milk'] };
  for (const r of E.rankLocations(menu, s, at(18))) for (const i of r.plate.items) { assert.ok(!/milk/i.test(menu.recipes[i.id].allergens), i.name); assert.ok(!menu.recipes[i.id].tags.includes('pork')); }
});

test('AI actions log food, workouts and goals, and the day adds up', () => {
  const s = E.newState();
  const now = at(18);
  const { text, index } = E.buildSystemPrompt(s, menu, now);
  assert.ok(text.includes('OPEN NOW'));
  const n = Object.keys(index).find((k) => menu.recipes[index[k].id].name === 'Sauteed Chicken Teriyaki');
  const raw = '```json\n{"reply":"Logged it!","actions":[{"type":"log_food","n":' + n + ',"servings":2},{"type":"log_exercise","name":"Run","minutes":30,"calories":350},{"type":"log_exercise","name":"Lifting","minutes":45,"calories":0},{"type":"set_goals","cal":2600,"protein":150},{"type":"suggest_plate","title":"Refuel","items":[{"n":' + n + ',"servings":1}]},{"type":"log_food","n":99999}]}\n```';
  const parsed = E.parseModelReply(raw);
  assert.strictEqual(parsed.reply, 'Logged it!');
  const res = E.applyActions(s, parsed.actions, menu, now, index);
  const t = E.dayTotals(s, now);
  assert.strictEqual(t.eaten.cal, 460);
  assert.strictEqual(t.eaten.protein, 44);
  assert.ok(t.burned > 350, 'second workout should be estimated');
  assert.strictEqual(t.budget, 2600 + t.burned);
  assert.strictEqual(res.plates.length, 1);
  assert.ok(res.notes.some((x) => /could not match/.test(x)));
  E.applyActions(s, [{ type: 'undo' }], menu, now, index);
  assert.strictEqual(E.dayLog(s, now).length, 2);
  console.log('     prompt size: about ' + Math.round(text.length / 4) + ' tokens');
});

test('plain text from a model still becomes a reply', () => {
  assert.deepStrictEqual(E.parseModelReply('Sure thing'), { reply: 'Sure thing', actions: [] });
});

test('built-in brain (no AI key) handles the basics', () => {
  const s = E.newState();
  const now = at(18);
  let b = E.localBrain('where should I eat?', s, menu, now);
  assert.strictEqual(b.actions[0].type, 'recommend');
  b = E.localBrain('I ran 30 minutes', s, menu, now);
  assert.deepStrictEqual([b.actions[0].type, b.actions[0].minutes], ['log_exercise', 30]);
  b = E.localBrain('lifted and burned 400', s, menu, now);
  assert.strictEqual(b.actions[0].calories, 400);
  b = E.localBrain('I had the chicken teriyaki and jasmine rice', s, menu, now);
  assert.strictEqual(b.actions.length, 2);
  const res = E.applyActions(s, b.actions, menu, now, b.index);
  assert.ok(/Chicken Teriyaki/.test(res.notes[0]) && /Jasmine Rice/.test(res.notes[1]), res.notes.join(' / '));
  b = E.localBrain('what should I get at zicks', s, menu, now);
  assert.strictEqual(b.actions[0].loc, 'zicks');
});

test('near the calorie goal the plate gets lighter, never tiny', () => {
  const s = E.newState();
  const now = at(18);
  E.logFood(s, now, { name: 'Big lunch', cal: 1900, protein: 80, carbs: 100, fat: 60 }, 1, '');
  const t = E.mealTarget(s, now);
  assert.strictEqual(t.cal, 350);
  assert.ok(t.note.length > 0);
});

console.log('\n' + passed + ' tests passed');
