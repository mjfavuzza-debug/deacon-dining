// Deacon Plate: the thinking part. No page code in here, so it can be tested on its own.
(function (root) {
  'use strict';

  // ---------- time ----------
  const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  function parseClock(s) {
    const m = String(s).trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
    if (!m) return null;
    let h = parseInt(m[1], 10) % 12;
    if (m[3] === 'pm') h += 12;
    return h * 60 + parseInt(m[2] || '0', 10);
  }

  // "4:30pm-9pm" -> {start: 990, end: 1260}. An end at or before the start means past midnight.
  function parseHours(str) {
    const parts = String(str || '').split(/\s*[-–]\s*/);
    if (parts.length !== 2) return null;
    const start = parseClock(parts[0]);
    let end = parseClock(parts[1]);
    if (start === null || end === null) return null;
    if (end <= start) end += 24 * 60;
    return { start, end };
  }

  // Retail tabs are named for days, like "Sun - Wed". Returns the weekdays covered, or null.
  function parseDays(name) {
    const m = String(name || '').toUpperCase().match(/^(SUN|MON|TUE|WED|THU|FRI|SAT)[A-Z]*\s*[-–]\s*(SUN|MON|TUE|WED|THU|FRI|SAT)[A-Z]*$/);
    if (!m) {
      const one = String(name || '').toUpperCase().match(/^(SUN|MON|TUE|WED|THU|FRI|SAT)[A-Z]*$/);
      return one ? [DAYS.indexOf(one[1])] : null;
    }
    const a = DAYS.indexOf(m[1]);
    const b = DAYS.indexOf(m[2]);
    const out = [];
    for (let d = a; ; d = (d + 1) % 7) { out.push(d); if (d === b) break; }
    return out;
  }

  // 'open' | 'later' | 'done' | 'unknown' (no hours published) | 'off' (not today)
  function mealStatus(meal, now) {
    const days = parseDays(meal.name);
    if (days && !days.includes(now.getDay())) return 'off';
    const h = parseHours(meal.hours);
    if (!h) return 'unknown';
    const mins = now.getHours() * 60 + now.getMinutes();
    if (mins < h.start) return 'later';
    if (mins < h.end) return 'open';
    return 'done';
  }

  // The meal to plan around at this location: open now, else the next one today, else null.
  function activeMeal(loc, now) {
    const meals = loc.meals || [];
    let later = null;
    let unknown = null;
    for (const meal of meals) {
      const st = mealStatus(meal, now);
      if (st === 'open') return { meal, status: 'open' };
      if (st === 'later' && !later) later = meal;
      if (st === 'unknown' && !unknown) unknown = meal;
    }
    if (later) return { meal: later, status: 'later' };
    if (unknown) return { meal: unknown, status: 'unknown' };
    return null;
  }

  function mealLabel(loc, meal) {
    if (loc.kind === 'hall') return meal.name + (meal.hours ? ' (' + meal.hours + ')' : '');
    return meal.hours ? 'open ' + meal.hours : 'menu';
  }

  // ---------- food ----------
  const EXTRA_STATION = /topping|add-?\s?ins|sauce|dressing|select breads|bagel|cereal|self serve|condiment|additions|top it off|beverage|drink|spreads|build your own pizza/i;
  // Build-your-own lines in the dining halls: fine as a protein, odd as an automatic side.
  const COMPONENT_STATION = /omelet|yogurt|deli|produce market|performance dining|pastabilities|choose your|build a bowl|veggie burger/i;
  const TREAT = /bakery|dessert|cookie|brownie|cake|ice cream|milkshake|pie\b|donut|pastry|muffin|lemonade/i;
  const VEG = /broccoli|green bean|spinach|salad|vegetable|veggie|carrot|squash|zucchini|brussels|asparagus|kale|cauliflower|\bpeas\b|greens|cucumber|tomato|cabbage|mushroom|fruit|edamame|bok choy/i;

  function okForPrefs(r, prefs) {
    prefs = prefs || {};
    const tags = r.tags || [];
    if (prefs.diet === 'vegan' && !tags.includes('vegan')) return false;
    if (prefs.diet === 'vegetarian' && !tags.includes('vegetarian') && !tags.includes('vegan')) return false;
    if (prefs.noGluten && !tags.includes('made_without_gluten')) return false;
    if (prefs.noPork && (tags.includes('pork') || /pork|bacon|ham\b|sausage|pepperoni/i.test(r.name))) return false;
    const al = (r.allergens || '').toLowerCase();
    for (const a of prefs.avoid || []) {
      if (a && al.includes(String(a).toLowerCase().replace(/s$/, ''))) return false;
    }
    return true;
  }

  function role(r, stationName, kind) {
    if (r.cal === null || r.cal === undefined) return 'extra';
    if (r.flag) return 'extra'; // numbers on the dining site do not add up, so never auto-pick it
    if (TREAT.test(stationName) || TREAT.test(r.name)) return 'treat';
    if (EXTRA_STATION.test(stationName)) return 'extra';
    if ((r.protein || 0) >= 12 && r.cal >= 150) return 'main';
    if (kind === 'hall' && COMPONENT_STATION.test(stationName)) return 'extra';
    if (kind === 'hall' && /\b(roll|bun|bread|bagel|wrap|tortilla|crust)\b/i.test(r.name)) return 'extra';
    if (r.cal >= 40 && r.cal <= 450) return VEG.test(r.name) ? 'veg' : 'side';
    if (r.cal > 450) return 'main';
    return 'extra';
  }

  // Every item in a meal, flattened, with its station and role.
  function mealItems(menu, meal, prefs, kind) {
    const out = [];
    const seen = {};
    for (const st of meal.stations || []) {
      for (const id of st.items) {
        const r = menu.recipes[id];
        if (!r || seen[id]) continue;
        seen[id] = true;
        if (!okForPrefs(r, prefs)) continue;
        out.push({ id, r, station: st.name, role: role(r, st.name, kind) });
      }
    }
    return out;
  }

  function addTotals(t, r, servings) {
    t.cal += (r.cal || 0) * servings;
    t.protein += (r.protein || 0) * servings;
    t.carbs += (r.carbs || 0) * servings;
    t.fat += (r.fat || 0) * servings;
    return t;
  }
  function zero() { return { cal: 0, protein: 0, carbs: 0, fat: 0 }; }
  function round(t) { return { cal: Math.round(t.cal), protein: Math.round(t.protein), carbs: Math.round(t.carbs), fat: Math.round(t.fat) }; }

  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Put together a plate close to the target. Tries many combinations and keeps the best.
  // target: {cal, protein}. opts: {seed, avoidIds}
  function buildPlate(menu, meal, target, prefs, opts) {
    opts = opts || {};
    const items = mealItems(menu, meal, prefs, opts.kind);
    const avoid = new Set(opts.avoidIds || []);
    let mains = items.filter((i) => i.role === 'main');
    const sides = items.filter((i) => i.role === 'side');
    const vegs = items.filter((i) => i.role === 'veg');
    if (!mains.length) mains = sides.concat(vegs).sort((a, b) => (b.r.protein || 0) - (a.r.protein || 0)).slice(0, 8);
    if (!mains.length) return null;
    const freshMains = mains.filter((m) => !avoid.has(m.id));
    const pool = freshMains.length ? freshMains : mains;
    const rand = rng(opts.seed || 1);
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    let best = null;
    for (let n = 0; n < 500; n++) {
      const main = pick(pool);
      const chosen = [{ id: main.id, servings: 1, item: main }];
      if (main.r.cal * 2 <= target.cal * 0.7 && rand() < 0.5) chosen[0].servings = 2;
      if (vegs.length && rand() < 0.85) {
        const v = pick(vegs);
        if (v.id !== main.id) chosen.push({ id: v.id, servings: 1, item: v });
      }
      const nSides = sides.length ? (rand() < 0.75 ? 1 : 0) + (rand() < 0.25 ? 1 : 0) : 0;
      for (let k = 0; k < nSides; k++) {
        const s = pick(sides);
        if (!chosen.some((c) => c.id === s.id)) chosen.push({ id: s.id, servings: 1, item: s });
      }
      const t = zero();
      chosen.forEach((c) => addTotals(t, c.item.r, c.servings));
      const calMiss = Math.abs(t.cal - target.cal) / Math.max(target.cal, 1);
      const proteinHit = Math.min(t.protein / Math.max(target.protein, 1), 1.4);
      const stations = new Set(chosen.map((c) => c.item.station)).size;
      let score = -1.2 * calMiss + (target.proteinWeight || 0.8) * proteinHit;
      if (chosen.some((c) => c.item.role === 'veg')) score += 0.12;
      if (stations <= 2) score += 0.05;
      if (t.cal > target.cal * 1.15) score -= 0.4;
      if (!best || score > best.score) best = { score, chosen, totals: t };
    }
    return {
      items: best.chosen.map((c) => ({ id: c.id, servings: c.servings, name: c.item.r.name, station: c.item.station, serving: c.item.r.serving, cal: Math.round(c.item.r.cal * c.servings), protein: Math.round((c.item.r.protein || 0) * c.servings) })),
      totals: round(best.totals),
      score: best.score,
    };
  }

  // ---------- the day ----------
  const DEFAULT_GOALS = { cal: 2000, protein: 50, carbs: 275, fat: 78 }; // the reference values printed on US nutrition labels

  function dayKey(now) {
    const p = (n) => String(n).padStart(2, '0');
    return now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate());
  }

  function newState() {
    return { goals: Object.assign({}, DEFAULT_GOALS), goalsSet: false, mode: 'balanced', prefs: { diet: 'any', noPork: false, noGluten: false, avoid: [] }, weightLb: null, days: {}, ai: { provider: 'gemini', key: '', model: '' } };
  }

  function dayLog(state, now) {
    const k = dayKey(now);
    if (!state.days[k]) state.days[k] = { log: [] };
    return state.days[k].log;
  }

  function dayTotals(state, now) {
    const eaten = zero();
    let burned = 0;
    for (const e of dayLog(state, now)) {
      if (e.type === 'food') { eaten.cal += e.cal; eaten.protein += e.protein; eaten.carbs += e.carbs; eaten.fat += e.fat; }
      if (e.type === 'exercise') burned += e.cal;
    }
    const budget = state.goals.cal + burned;
    return { eaten: round(eaten), burned: Math.round(burned), budget: Math.round(budget), left: Math.round(budget - eaten.cal), proteinLeft: Math.round(state.goals.protein - eaten.protein) };
  }

  function mealsLeft(now) {
    const mins = now.getHours() * 60 + now.getMinutes();
    if (mins < 11 * 60) return 3;
    if (mins < 16 * 60 + 30) return 2;
    return 1;
  }

  // What the next meal should aim for, given what is left today.
  function mealTarget(state, now) {
    const t = dayTotals(state, now);
    const n = mealsLeft(now);
    let cal = t.left / n;
    let note = '';
    if (cal < 350) { cal = 350; note = 'You are close to your calorie goal for today, so this is a lighter plate.'; }
    if (cal > 900) cal = 900;
    let protein = Math.max(20, t.proteinLeft / n);
    let proteinWeight = 0.8;
    if (state.mode === 'high-protein') { protein = Math.max(protein, 40); proteinWeight = 1.4; }
    if (state.mode === 'lighter') cal = Math.max(350, cal * 0.8);
    return { cal: Math.round(cal), protein: Math.round(protein), proteinWeight, note };
  }

  // Best plate at every place that is open (or opening later today), best first.
  function rankLocations(menu, state, now, opts) {
    opts = opts || {};
    const target = mealTarget(state, now);
    const out = [];
    for (const loc of menu.locations) {
      if (opts.only && opts.only !== loc.id) continue;
      const am = activeMeal(loc, now);
      if (!am) continue;
      const plate = buildPlate(menu, am.meal, target, state.prefs, { seed: (opts.seed || 1) + loc.id.length * 7, avoidIds: opts.avoidIds, kind: loc.kind });
      if (!plate) continue;
      let score = plate.score;
      if (am.status === 'open') score += 0.3;
      if (loc.kind !== 'hall') score -= 0.1;
      out.push({ loc, meal: am.meal, status: am.status, plate, score, target });
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  }

  // ---------- exercise ----------
  const MET = [
    [/run|jog|sprint/i, 9.8], [/lift|weights|gym|strength/i, 5], [/basketball|hoop/i, 7], [/soccer|football/i, 8],
    [/walk/i, 3.5], [/bike|cycl|spin/i, 7.5], [/swim/i, 7], [/tennis|pickleball/i, 6.5], [/golf/i, 4.5],
    [/yoga|stretch/i, 2.8], [/hike/i, 6], [/row/i, 7], [/stair|elliptical|cardio|hiit/i, 8],
  ];
  function estimateBurn(activity, minutes, weightLb) {
    let met = 5;
    for (const [re, v] of MET) if (re.test(activity || '')) { met = v; break; }
    const kg = (weightLb || 160) * 0.4536;
    return Math.round(met * kg * (minutes / 60));
  }

  // ---------- actions (what the chat can do to your day) ----------
  let idCounter = 0;
  function uid() { idCounter += 1; return Date.now().toString(36) + '-' + idCounter; }

  function logFood(state, now, r, servings, locName) {
    const s = servings > 0 ? servings : 1;
    const e = { id: uid(), t: now.getTime(), type: 'food', name: r.name, loc: locName || '', servings: s, cal: Math.round((r.cal || 0) * s), protein: Math.round((r.protein || 0) * s), carbs: Math.round((r.carbs || 0) * s), fat: Math.round((r.fat || 0) * s) };
    dayLog(state, now).push(e);
    return e;
  }

  // actions: list from the AI or the built-in brain. index: number -> {id, loc} map for menu references.
  // Returns {notes: [text], plates: [plate cards], recommend: bool}
  function applyActions(state, actions, menu, now, index) {
    const res = { notes: [], plates: [], recommend: false };
    const num = (v) => (typeof v === 'number' && isFinite(v) ? v : parseFloat(v) || 0);
    for (const a of actions || []) {
      if (!a || !a.type) continue;
      if (a.type === 'log_food') {
        const ref = index && index[a.n];
        const r = ref && menu.recipes[ref.id];
        if (!r) { res.notes.push('Skipped one item I could not match to the menu.'); continue; }
        const e = logFood(state, now, r, num(a.servings) || 1, ref.loc);
        res.notes.push('Logged ' + e.name + (e.servings !== 1 ? ' x' + e.servings : '') + ': ' + e.cal + ' cal, ' + e.protein + 'g protein');
      } else if (a.type === 'log_custom') {
        const e = logFood(state, now, { name: String(a.name || 'Food').slice(0, 80), cal: num(a.cal), protein: num(a.protein), carbs: num(a.carbs), fat: num(a.fat) }, 1, 'off menu');
        e.est = true;
        res.notes.push('Logged ' + e.name + ' (estimate): ' + e.cal + ' cal, ' + e.protein + 'g protein');
      } else if (a.type === 'log_exercise') {
        const minutes = num(a.minutes);
        let cal = num(a.calories);
        let est = false;
        if (!cal && minutes) { cal = estimateBurn(a.name, minutes, state.weightLb); est = true; }
        if (!cal) { res.notes.push('I need either calories burned or how many minutes for that workout.'); continue; }
        dayLog(state, now).push({ id: uid(), t: now.getTime(), type: 'exercise', name: String(a.name || 'Workout').slice(0, 60), minutes, cal: Math.round(cal), est });
        res.notes.push('Logged ' + (a.name || 'workout') + ': ' + Math.round(cal) + ' cal burned' + (est ? ' (rough estimate)' : ''));
      } else if (a.type === 'set_goals') {
        for (const k of ['cal', 'protein', 'carbs', 'fat']) if (num(a[k]) > 0) state.goals[k] = Math.round(num(a[k]));
        state.goalsSet = true;
        res.notes.push('Goals set: ' + state.goals.cal + ' cal, ' + state.goals.protein + 'g protein');
      } else if (a.type === 'set_mode') {
        if (['balanced', 'high-protein', 'lighter'].includes(a.mode)) { state.mode = a.mode; res.notes.push('Plate style: ' + a.mode.replace('-', ' ')); }
      } else if (a.type === 'set_prefs') {
        if (['any', 'vegetarian', 'vegan'].includes(a.diet)) state.prefs.diet = a.diet;
        if (typeof a.noPork === 'boolean') state.prefs.noPork = a.noPork;
        if (typeof a.noGluten === 'boolean') state.prefs.noGluten = a.noGluten;
        if (Array.isArray(a.avoid)) state.prefs.avoid = a.avoid.map(String).slice(0, 10);
        res.notes.push('Food preferences updated.');
      } else if (a.type === 'undo') {
        const log = dayLog(state, now);
        const gone = log.pop();
        res.notes.push(gone ? 'Removed ' + gone.name + '.' : 'Nothing to undo.');
      } else if (a.type === 'suggest_plate') {
        const items = [];
        const t = zero();
        let locName = '';
        for (const it of a.items || []) {
          const ref = index && index[it.n];
          const r = ref && menu.recipes[ref.id];
          if (!r) continue;
          const s = num(it.servings) || 1;
          locName = ref.loc;
          addTotals(t, r, s);
          items.push({ id: ref.id, servings: s, name: r.name, station: ref.station || '', serving: r.serving, cal: Math.round(r.cal * s), protein: Math.round((r.protein || 0) * s) });
        }
        if (items.length) res.plates.push({ locName, title: a.title || '', plate: { items, totals: round(t) } });
      } else if (a.type === 'recommend') {
        res.recommend = a.loc || true;
      }
    }
    return res;
  }

  // ---------- the AI prompt ----------
  // Lists what is being served and numbers each item so the AI can point at it.
  function buildMenuContext(menu, now, prefs) {
    const index = {};
    const lines = [];
    let n = 0;
    for (const loc of menu.locations) {
      const am = activeMeal(loc, now);
      if (!am) { lines.push('## ' + loc.name + ' [' + loc.id + ']: closed for the rest of today'); continue; }
      lines.push('## ' + loc.name + ' [' + loc.id + '], ' + loc.where + ': ' + mealLabel(loc, am.meal) + (am.status === 'open' ? ', OPEN NOW' : am.status === 'later' ? ', opens later today' : ''));
      for (const it of mealItems(menu, am.meal, prefs)) {
        n += 1;
        index[n] = { id: it.id, loc: loc.name, station: it.station };
        const r = it.r;
        lines.push(n + '|' + r.name + '|' + it.station + '|' + (r.serving || '') + '|' + r.cal + '|' + (r.protein || 0) + '|' + (r.carbs || 0) + '|' + (r.fat || 0));
      }
    }
    return { text: lines.join('\n'), index };
  }

  function buildSystemPrompt(state, menu, now) {
    const t = dayTotals(state, now);
    const target = mealTarget(state, now);
    const ctx = buildMenuContext(menu, now, state.prefs);
    const log = dayLog(state, now).map((e) => (e.type === 'food' ? '- ate ' + e.name + ' (' + e.cal + ' cal, ' + e.protein + 'g protein)' : '- ' + e.name + ', burned ' + e.cal + ' cal')).join('\n') || '- nothing logged yet';
    const text = [
      'You are Deacon Plate, a friendly dining and fitness sidekick for a Wake Forest student. You do the tracking and planning so the student does as little work as possible.',
      'It is ' + now.toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit' }) + '. Menu date: ' + menu.date + '.',
      'Daily goals: ' + state.goals.cal + ' cal, ' + state.goals.protein + 'g protein, ' + state.goals.carbs + 'g carbs, ' + state.goals.fat + 'g fat.' + (state.goalsSet ? '' : ' (These are the default label values. The student has not set personal goals yet.)'),
      'Plate style: ' + state.mode + '. Food preferences: ' + JSON.stringify(state.prefs) + '.',
      'Today so far: eaten ' + t.eaten.cal + ' cal and ' + t.eaten.protein + 'g protein; burned ' + t.burned + ' cal in workouts; ' + t.left + ' cal left. A good next meal is about ' + target.cal + ' cal with at least ' + target.protein + 'g protein.',
      "Today's log:\n" + log,
      '',
      'MENU being served. Each line is: number|name|station|serving|calories|protein g|carbs g|fat g',
      ctx.text,
      '',
      'Reply with ONE JSON object and nothing else: {"reply": "short, friendly text", "actions": [ ... ]}',
      'Actions you can use (zero or more):',
      '{"type":"log_food","n":<menu number>,"servings":1}  when the student says they ate something on the menu. Match loosely ("the chicken" = the chicken dish at the place they named).',
      '{"type":"log_custom","name":"...","cal":0,"protein":0,"carbs":0,"fat":0}  for food not on the menu. Use your best estimate and say it is an estimate.',
      '{"type":"log_exercise","name":"...","minutes":0,"calories":0}  when they mention a workout. Use the calories they give. If they give none, send calories 0 with the minutes and the app estimates.',
      '{"type":"suggest_plate","title":"...","items":[{"n":<menu number>,"servings":1}]}  to propose a specific meal from ONE location. The app shows it as a card with an "I ate this" button.',
      '{"type":"recommend"}  to have the app pick the best hall and plate with its own math. Use this for a plain "where should I eat?".',
      '{"type":"set_goals","cal":0,"protein":0,"carbs":0,"fat":0}  only when the student states a goal.',
      '{"type":"set_mode","mode":"balanced|high-protein|lighter"}',
      '{"type":"set_prefs","diet":"any|vegetarian|vegan","noPork":false,"noGluten":false,"avoid":["peanut"]}',
      '{"type":"undo"}  remove the last logged entry.',
      'Rules: Only use menu numbers that appear above. Never invent nutrition numbers for menu items. Prefer places that are OPEN NOW. After a workout, lean the next meal toward protein and say why in a few words. The app prints the numbers for anything you log, so keep "reply" to one to three sentences and do not repeat totals. Be upbeat and brief. You are not a doctor or dietitian. If the student describes skipping meals to compensate, eating very little, or anything that sounds unhealthy, do not help with that; say kindly that you would rather help them fuel well, and suggest talking to Deacon Health.',
    ].join('\n');
    return { text, index: ctx.index };
  }

  // Pull the JSON object out of whatever the model sent back.
  function parseModelReply(raw) {
    const s = String(raw || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const a = s.indexOf('{');
    const b = s.lastIndexOf('}');
    if (a !== -1 && b > a) {
      try {
        const o = JSON.parse(s.slice(a, b + 1));
        if (o && typeof o === 'object') return { reply: String(o.reply || ''), actions: Array.isArray(o.actions) ? o.actions : [] };
      } catch (e) { /* fall through */ }
    }
    return { reply: s, actions: [] };
  }

  // ---------- the built-in brain (works with no AI key) ----------
  function findMenuItem(phrase, menu, now, prefs) {
    const words = phrase.toLowerCase().replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !['the', 'and', 'had', 'ate', 'some', 'with', 'from', 'for', 'just', 'pit', 'north', 'lunch', 'dinner', 'breakfast'].includes(w));
    if (!words.length) return null;
    const ctx = buildMenuContext(menu, now, prefs);
    let best = null;
    for (const n of Object.keys(ctx.index)) {
      const ref = ctx.index[n];
      const name = menu.recipes[ref.id].name.toLowerCase();
      const nameWords = name.split(/\s+/);
      const hit = words.filter((w) => name.includes(w)).length;
      if (!hit) continue;
      const score = hit / words.length + hit / nameWords.length;
      if (!best || score > best.score) best = { n: Number(n), score, index: ctx.index };
    }
    return best && best.score >= 1 ? best : null;
  }

  function localBrain(text, state, menu, now) {
    const s = text.toLowerCase();
    const actions = [];
    let reply = '';
    let index = null;
    const burn = s.match(/burn(?:ed|t)?\s*(?:about|around|like)?\s*(\d{2,4})/) || s.match(/(\d{2,4})\s*(?:cal|kcal)\w*\s*burn/);
    const mins = s.match(/(\d{1,3})\s*(?:min|minutes)/) || (s.match(/(\d(?:\.\d)?)\s*(?:hr|hour)/) ? [null, String(Math.round(parseFloat(s.match(/(\d(?:\.\d)?)\s*(?:hr|hour)/)[1]) * 60))] : null);
    const activity = (s.match(/run|ran|jog|lift|weights|gym|basketball|soccer|walk|bike|cycl|swim|tennis|pickleball|golf|yoga|hike|row|elliptical|cardio|workout|worked out/) || [])[0];
    if (/^\s*undo|remove (the )?last|take that back/.test(s)) {
      actions.push({ type: 'undo' });
    } else if (burn || (activity && mins)) {
      const name = activity ? activity.replace('ran', 'run').replace('worked out', 'workout') : 'workout';
      actions.push({ type: 'log_exercise', name: name.charAt(0).toUpperCase() + name.slice(1), minutes: mins ? parseInt(mins[1], 10) : 0, calories: burn ? parseInt(burn[1], 10) : 0 });
      actions.push({ type: 'recommend' });
      reply = 'Nice work. I added that to your day. Here is a plate to refuel, leaning toward protein.';
    } else if (activity && !mins) {
      reply = 'How long did you go, or how many calories did your watch say? Try "ran 30 minutes" or "lifted, burned 250".';
    } else if (/high[- ]protein|more protein|bulk/.test(s)) {
      actions.push({ type: 'set_mode', mode: 'high-protein' }, { type: 'recommend' });
      reply = 'Switching to high protein plates.';
    } else if (/light|smaller|not that hungry/.test(s)) {
      actions.push({ type: 'set_mode', mode: 'lighter' }, { type: 'recommend' });
      reply = 'Going lighter.';
    } else if (/\b(ate|had|eating|got|finished)\b/.test(s)) {
      const phrases = s.replace(/.*?\b(ate|had|eating|got|finished)\b/, '').split(/,| and | with |\+/);
      let found = 0;
      for (const p of phrases) {
        const m = findMenuItem(p, menu, now, null);
        if (m) { index = m.index; actions.push({ type: 'log_food', n: m.n, servings: /\b(two|2|double)\b/.test(p) ? 2 : 1 }); found += 1; }
      }
      reply = found ? 'Got it, logged.' : 'I could not match that to today\'s menu. Use the Browse section to tap what you ate, or add a free AI key in Settings and I can understand anything you type.';
    } else if (/where|which|what should|hungry|eat|plate|recommend|suggest|dinner|lunch|breakfast|food|open/.test(s)) {
      const only = menu.locations.find((l) => s.includes(l.name.toLowerCase().replace(/^the /, '')) || s.includes(l.id));
      actions.push({ type: 'recommend', loc: only ? only.id : undefined });
      reply = only ? 'Here is what I would get at ' + only.name + '.' : 'Here is where I would go right now.';
    } else {
      reply = 'Without an AI key I understand a few things: "where should I eat?", "I had the grilled chicken", "ran 30 minutes", "burned 400", "high protein", "undo". Add a free key in Settings and you can type anything.';
    }
    return { reply, actions, index };
  }

  const Engine = { parseHours, parseDays, mealStatus, activeMeal, mealLabel, okForPrefs, role, mealItems, buildPlate, DEFAULT_GOALS, dayKey, newState, dayLog, dayTotals, mealsLeft, mealTarget, rankLocations, estimateBurn, logFood, applyActions, buildMenuContext, buildSystemPrompt, parseModelReply, localBrain, findMenuItem };
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  else root.Engine = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
