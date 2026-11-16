// Deacon Plate: the page. Draws everything and talks to the AI. The thinking lives in engine.js.
(function () {
  'use strict';
  const E = window.Engine;
  const MENU = window.MENU;
  const STORE = 'deaconplate.v1';
  const DEFAULT_MODEL = { gemini: 'gemini-flash-latest', claude: 'claude-haiku-5-5' };
  // Tried in this order when the model box in settings is blank. Names from ai.google.dev/gemini-api/docs/models, Nov 16, 2026.
  const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.6-flash'];
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const now = () => new Date();

  if (!MENU || !MENU.locations) {
    $('#banner').innerHTML = '<div class="banner">No menu data found. Run the collector (see README) so that menu-data.js exists next to this page.</div>';
    return;
  }

  // ---------- saved state ----------
  function load() {
    const fresh = E.newState();
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) {
        const s = JSON.parse(raw);
        Object.assign(fresh, s);
        fresh.prefs = Object.assign(E.newState().prefs, s.prefs || {});
        fresh.ai = Object.assign(E.newState().ai, s.ai || {});
        fresh.goals = Object.assign(E.newState().goals, s.goals || {});
      }
    } catch (e) { /* storage blocked: run without saving */ }
    const keys = Object.keys(fresh.days || {}).sort();
    while (keys.length > 14) delete fresh.days[keys.shift()];
    return fresh;
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* ignore */ } }

  const state = load();
  const chat = []; // {who, text, notes, cards}
  const cards = {}; // card id -> {locId, locName, plate, shuffle}
  let cardSeq = 0;
  let seed = Math.floor(Math.random() * 1000) + 1;
  let lastMains = [];
  let busy = false;

  // ---------- banner ----------
  function renderBanner() {
    const msgs = [];
    if (MENU.date !== E.dayKey(now())) {
      const d = new Date(MENU.date + 'T12:00:00');
      msgs.push('Showing the menu from ' + d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) + ". Today's menu has not been collected yet, so dishes may differ.");
    }
    if (MENU.snapshot) msgs.push('Starter data: ' + MENU.snapshot + '. Breakfast and lunch appear once the daily collector runs.');
    $('#banner').innerHTML = msgs.length ? '<div class="banner">' + msgs.map(esc).join('<br>') + '</div>' : '';
  }

  // ---------- the day (black area at the top) ----------
  const ARC = 270.2; // length of the dial's half circle
  let lastOffset = ARC;
  const fmt = (n) => Number(n).toLocaleString('en-US');

  function meter(label, value, goal) {
    const pct = goal > 0 ? Math.min(100, Math.round((value / goal) * 100)) : 0;
    return '<div class="meter' + (value >= goal ? ' hit' : '') + '"><span>' + label + '</span><div class="rail"><i style="width:' + pct + '%"></i></div><span class="num">' + value + ' of ' + goal + 'g</span></div>';
  }
  function renderToday() {
    const t = E.dayTotals(state, now());
    const pct = t.budget > 0 ? Math.min(1, t.eaten.cal / t.budget) : 0;
    const offset = ARC * (1 - pct);
    const week = E.weekSummary(state, now());
    const hits = week.filter((d) => d.proteinHit).length;
    $('#today').innerHTML =
      '<div class="dial' + (t.left < 0 ? ' over' : '') + '"><svg viewBox="0 0 200 112" aria-hidden="true">' +
      '<path class="track" d="M 14 100 A 86 86 0 0 1 186 100" fill="none" stroke-width="14" stroke-linecap="round"/>' +
      '<path class="fill" d="M 14 100 A 86 86 0 0 1 186 100" fill="none" stroke-width="14" stroke-linecap="round" stroke-dasharray="' + ARC + '" stroke-dashoffset="' + lastOffset + '"/></svg>' +
      '<div class="dial-read"><b>' + fmt(Math.abs(t.left)) + '</b><span>calories ' + (t.left >= 0 ? 'left' : 'over') + ' of ' + fmt(t.budget) + '</span></div></div>' +
      '<div><div class="meters">' + meter('Protein', t.eaten.protein, state.goals.protein) + meter('Carbs', t.eaten.carbs, state.goals.carbs) + meter('Fat', t.eaten.fat, state.goals.fat) + '</div>' +
      '<div class="hero-foot"><div class="week" title="Last 7 days. Gold means you hit your protein goal.">' + week.map((d) => '<i class="' + (d.proteinHit ? 'hit' : d.logged ? 'logged' : '') + (d.today ? ' today' : '') + '">' + d.letter + '</i>').join('') + '</div>' +
      '<span>' + (hits ? 'Protein goal hit ' + hits + ' of the last 7 days. ' : '') + (t.burned ? 'Burned ' + fmt(t.burned) + ' in workouts, added to your budget.' : state.goalsSet ? 'Tell me about a workout and I add it to your budget.' : 'These are the standard label goals. Set your own in settings.') + '</span></div></div>';
    const fill = $('#today .fill');
    requestAnimationFrame(() => { if (fill) fill.setAttribute('stroke-dashoffset', offset); });
    lastOffset = offset;
    renderLogged();
  }

  function renderLogged() {
    const log = E.dayLog(state, now());
    $('#logged').innerHTML = '<h2>Logged today</h2>' + (log.length
      ? '<ul class="log">' + log.map((e) =>
        '<li><span>' + esc(e.name) + (e.servings && e.servings !== 1 ? ' x' + e.servings : '') + (e.loc ? ' <span class="meta">' + esc(e.loc) + '</span>' : '') + '</span><span class="meta">' +
        (e.type === 'food' ? e.cal + ' cal, ' + e.protein + 'g protein' : 'burned ' + e.cal + ' cal' + (e.est ? ' (estimate)' : '')) +
        ' <button class="x" data-remove="' + esc(e.id) + '" aria-label="Remove ' + esc(e.name) + '">&times;</button></span></li>').join('') + '</ul>'
      : '<p class="empty">Nothing yet. Tap "I ate this" on a ticket, add items from a menu, or just tell me in the chat.</p>');
  }

  // ---------- places ----------
  let pickLoc = null; // a place the student tapped, or null for "best right now"
  function renderPlaces() {
    $('#places').innerHTML = '<div class="places-inner">' + MENU.locations.map((l) => {
      const st = E.placeStatus(l, now());
      return '<button class="place ' + st.state + (pickLoc === l.id ? ' on' : '') + '" data-place="' + esc(l.id) + '"' + (st.state === 'closed' ? ' disabled' : '') + '><span class="dot"></span><b>' + esc(l.name) + '</b><small>' + esc(st.text) + '</small></button>';
    }).join('') + '</div>';
  }

  // ---------- tickets ----------
  function registerCard(c) { cardSeq += 1; const id = 'c' + cardSeq; cards[id] = c; return id; }

  function plateHTML(id, opts) {
    const c = cards[id];
    opts = opts || {};
    const just = c.justEaten;
    c.justEaten = false;
    return '<div class="plate' + (opts.mini ? ' mini' : '') + (c.eaten ? ' eaten' : '') + (just ? ' just-eaten' : '') + '">' +
      '<div class="stamp">Logged</div>' +
      '<h3>' + esc(c.title || c.locName) + '</h3>' +
      '<div class="where">' + (opts.top ? '<span class="tag top">Top pick</span>' : '') + (c.status === 'open' ? '<span class="tag open">Open now</span>' : c.status === 'later' ? '<span class="tag">Opens later</span>' : '') + esc(c.sub || '') + '</div><ul>' +
      c.plate.items.map((i) => '<li><span class="what">' + (i.servings !== 1 ? i.servings + ' x ' : '') + esc(i.name) + (i.station ? '<span class="st">' + esc(i.station) + (i.serving ? ', ' + esc(i.serving) + (i.servings !== 1 ? ' each' : '') : '') + '</span>' : '') + '</span><span class="lead"></span><span class="nums">' + i.cal + ' cal, ' + i.protein + 'g protein</span></li>').join('') +
      '</ul><div class="total"><b>' + fmt(c.plate.totals.cal) + ' cal</b><b>' + c.plate.totals.protein + 'g protein</b><span>' + c.plate.totals.carbs + 'g carbs, ' + c.plate.totals.fat + 'g fat</span></div>' +
      '<div class="actions"><button class="gold" data-eat="' + id + '"' + (c.eaten ? ' disabled' : '') + '>' + (c.eaten ? 'Logged' : 'I ate this') + '</button>' +
      (c.shuffle && !c.eaten ? '<button class="quiet dark" data-shuffle="' + id + '">Shuffle</button>' : '') + '</div></div>';
  }

  function pickCards(only, count) {
    const ranked = E.rankLocations(MENU, state, now(), { seed, only: only || undefined, avoidIds: lastMains });
    return ranked.slice(0, count || 3).map((r) => registerCard({
      locId: r.loc.id, locName: r.loc.name, title: r.loc.name, status: r.status,
      sub: r.loc.where + ', ' + E.placeStatus(r.loc, now()).text.replace(/^./, (ch) => ch.toLowerCase()), plate: r.plate, shuffle: true,
    }));
  }

  let pickId = null;
  function newPick() { pickId = pickCards(pickLoc, 1)[0] || null; drawPick(); }
  function drawPick() {
    const target = E.mealTarget(state, now());
    const head = '<div class="pick-head"><h2>' + (pickLoc ? 'What to get here' : 'Where to eat right now') + '</h2><p>Aiming for about ' + target.cal + ' cal and at least ' + target.protein + 'g protein' + (state.mode !== 'balanced' ? ', ' + esc(state.mode.replace('-', ' ')) : '') + '</p></div>';
    if (!pickId) {
      $('#pick').innerHTML = head + '<div class="panel"><p class="empty">' + (pickLoc ? 'Nothing here fits your food preferences right now. Tap another place above.' : 'Everything is closed for the rest of today. Check back in the morning.') + '</p></div>';
      return;
    }
    $('#pick').innerHTML = head + plateHTML(pickId, { top: !pickLoc }) + (target.note ? '<p class="note">' + esc(target.note) + '</p>' : '') +
      (pickLoc ? '<p class="note"><button class="quiet dark small" data-place="">Back to the best place right now</button></p>' : '');
  }
  function renderPick() { newPick(); }

  // ---------- chat ----------
  function say(who, text, extra) {
    chat.push(Object.assign({ who, text: text || '' }, extra || {}));
    renderChat();
  }
  function renderChat() {
    const box = $('#messages');
    box.innerHTML = chat.map((m) => {
      let html = '';
      if (m.text || (m.notes && m.notes.length)) {
        html += '<div class="msg ' + m.who + (m.typing ? ' typing' : '') + '">' + esc(m.text) + (m.notes || []).map((n) => '<span class="logged">' + esc(n) + '</span>').join('') + '</div>';
      }
      if (m.cards && m.cards.length) html += '<div class="msg bot wide">' + m.cards.map((id, i) => plateHTML(id, { mini: true, top: m.rank && i === 0 })).join('') + '</div>';
      return html;
    }).join('');
    box.scrollTop = box.scrollHeight;
  }

  function leftLine() {
    const t = E.dayTotals(state, now());
    return t.left >= 0 ? t.left + ' cal left today, ' + Math.max(0, t.proteinLeft) + 'g protein to go.' : 'You are ' + Math.abs(t.left) + ' cal over your goal today. One day does not matter much.';
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function geminiOnce(model, sys, turns) {
    return fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': state.ai.key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sys }] },
        contents: turns.map((t) => ({ role: t.who === 'me' ? 'user' : 'model', parts: [{ text: t.text }] })),
        generationConfig: { responseMimeType: 'application/json', temperature: 0.5 },
      }),
    });
  }

  async function errorFrom(res) {
    let detail = '';
    try { const j = await res.json(); detail = (j.error && (j.error.message || j.error.type)) || ''; } catch (e) { /* ignore */ }
    const st = res.status;
    const msg = st === 429 ? 'The AI is at its usage limit right now (free keys have a daily cap).'
      : st === 401 || st === 403 || (st === 400 && /key/i.test(detail)) ? 'The AI key was not accepted. Check it in settings.'
      : st === 503 || st === 500 || st === 529 ? "The AI company's servers are overloaded right now. Try again in a minute."
      : 'The AI service answered with an error (' + st + ').';
    const err = new Error(msg + (detail && !/key/i.test(msg) ? ' Their message: "' + detail.slice(0, 140) + '"' : ''));
    err.status = st;
    return err;
  }

  async function callAI(sys, turns) {
    const provider = state.ai.provider === 'claude' ? 'claude' : 'gemini';
    const chosen = (state.ai.model || '').trim();
    if (provider === 'gemini') {
      // A busy or missing model is common on free keys, so try a few before giving up.
      const models = chosen ? [chosen] : GEMINI_MODELS;
      let lastErr = null;
      for (const model of models) {
        for (let attempt = 0; attempt < 2; attempt++) {
          const res = await geminiOnce(model, sys, turns);
          if (res.ok) {
            const data = await res.json();
            return (((data.candidates || [])[0] || {}).content || { parts: [] }).parts.map((p) => p.text || '').join('');
          }
          lastErr = await errorFrom(res);
          if (lastErr.status === 401 || lastErr.status === 403 || lastErr.status === 400) throw lastErr; // a bad key will not get better
          if (lastErr.status === 503 || lastErr.status === 500) { await wait(1200); continue; } // overloaded: one more try on this model
          break; // 404 or 429: move to the next model
        }
      }
      throw lastErr;
    }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': state.ai.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: chosen || DEFAULT_MODEL.claude, max_tokens: 1024, system: sys, messages: turns.map((t) => ({ role: t.who === 'me' ? 'user' : 'assistant', content: t.text })) }),
    });
    if (!res.ok) throw await errorFrom(res);
    const data = await res.json();
    return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  }

  // Recent conversation as alternating turns, starting with the student.
  function recentTurns() {
    const out = [];
    for (const m of chat.slice(-12)) {
      const text = [m.text].concat(m.notes || []).filter(Boolean).join(' ');
      if (!text || m.typing) continue;
      if (out.length && out[out.length - 1].who === m.who) out[out.length - 1].text += '\n' + text;
      else out.push({ who: m.who, text });
    }
    while (out.length && out[0].who !== 'me') out.shift();
    return out;
  }

  async function send(text) {
    text = String(text || '').trim();
    if (!text || busy) return;
    busy = true;
    $('#send').disabled = true;
    say('me', text);
    let out;
    if (state.ai.key) {
      chat.push({ who: 'bot', text: 'Thinking...', typing: true });
      renderChat();
      try {
        const sys = E.buildSystemPrompt(state, MENU, now());
        const raw = await callAI(sys.text, recentTurns());
        out = E.parseModelReply(raw);
        out.index = sys.index;
      } catch (e) {
        out = E.localBrain(text, state, MENU, now());
        out.reply = (e.message || 'The AI could not be reached.') + '\nUsing my built-in brain for now. ' + out.reply;
      }
      chat.pop();
    } else {
      out = E.localBrain(text, state, MENU, now());
    }
    const res = E.applyActions(state, out.actions, MENU, now(), out.index);
    save();
    const cardIds = res.plates.map((p) => registerCard({ locName: p.locName, title: p.title || p.locName, sub: p.title ? p.locName : '', plate: p.plate, shuffle: false }));
    // A recommendation goes on the big ticket instead of repeating it inside the chat.
    let pickLine = '';
    if (res.recommend) {
      seed += 1;
      pickLoc = typeof res.recommend === 'string' && MENU.locations.some((l) => l.id === res.recommend) ? res.recommend : null;
    }
    renderToday();
    renderPlaces();
    newPick();
    if (res.recommend) {
      const c = pickId && cards[pickId];
      pickLine = c
        ? '\n' + c.locName + ': ' + c.plate.items.map((i) => (i.servings !== 1 ? i.servings + ' x ' : '') + i.name).join(', ') + ' (' + c.plate.totals.cal + ' cal, ' + c.plate.totals.protein + 'g protein). It is on the ticket, with a shuffle button if you want something else.'
        : '\nEverything I track is closed for the rest of today.';
    }
    const logged = (out.actions || []).some((a) => /^log_|undo/.test(a.type));
    say('bot', (out.reply || (res.notes.length ? 'Done.' : 'Okay.')) + pickLine + (logged ? '\n' + leftLine() : ''), { notes: res.notes, cards: cardIds });
    busy = false;
    $('#send').disabled = false;
  }

  // ---------- browse ----------
  function fillBrowseSelects() {
    $('#b-loc').innerHTML = MENU.locations.map((l) => '<option value="' + esc(l.id) + '">' + esc(l.name) + '</option>').join('');
    fillMealSelect();
  }
  function fillMealSelect() {
    const loc = MENU.locations.find((l) => l.id === $('#b-loc').value) || MENU.locations[0];
    const am = E.activeMeal(loc, now());
    $('#b-meal').innerHTML = loc.meals.map((m, i) => '<option value="' + i + '"' + (am && am.meal === m ? ' selected' : '') + '>' + esc(m.name + (m.hours ? ' (' + m.hours + ')' : '')) + '</option>').join('');
    renderBrowse();
  }
  function renderBrowse() {
    const loc = MENU.locations.find((l) => l.id === $('#b-loc').value) || MENU.locations[0];
    const meal = loc.meals[Number($('#b-meal').value) || 0];
    const q = $('#b-search').value.trim().toLowerCase();
    if (!meal) { $('#browse').innerHTML = '<p class="note">No menu published.</p>'; return; }
    let html = loc.note ? '<p class="note">' + esc(loc.note) + '</p>' : '';
    let shown = 0;
    for (const st of meal.stations) {
      const rows = st.items.map((id) => ({ id, r: MENU.recipes[id] })).filter((x) => x.r && E.okForPrefs(x.r, state.prefs) && (!q || x.r.name.toLowerCase().includes(q) || st.name.toLowerCase().includes(q)));
      if (!rows.length) continue;
      shown += rows.length;
      html += '<details class="station"' + (q || meal.stations.length <= 4 ? ' open' : '') + '><summary>' + esc(st.name) + ' <span>' + rows.length + '</span></summary>' + rows.map((x) =>
        '<div class="item"><div><div class="n">' + esc(x.r.name) + '</div><div class="m">' + (x.r.serving ? esc(x.r.serving) + ' · ' : '') + x.r.cal + ' cal · ' + (x.r.protein || 0) + 'g protein · ' + (x.r.carbs || 0) + 'g carbs · ' + (x.r.fat || 0) + 'g fat' +
        (x.r.flag ? ' <span class="flag">(numbers look off on the dining site)</span>' : '') + (x.r.allergens ? '<br>Contains: ' + esc(x.r.allergens) : '') + '</div></div>' +
        '<button class="small" data-add="' + esc(x.id) + '" data-loc="' + esc(loc.name) + '" aria-label="Log ' + esc(x.r.name) + '">+ Ate</button></div>').join('') + '</details>';
    }
    $('#browse').innerHTML = shown ? html : '<p class="note">Nothing matches' + (q ? ' "' + esc(q) + '"' : '') + ' with your food preferences.</p>';
  }

  // ---------- settings ----------
  function openSettings() {
    $('#g-cal').value = state.goals.cal; $('#g-protein').value = state.goals.protein; $('#g-carbs').value = state.goals.carbs; $('#g-fat').value = state.goals.fat;
    $('#s-mode').value = state.mode; $('#s-weight').value = state.weightLb || '';
    $('#p-diet').value = state.prefs.diet; $('#p-pork').checked = !!state.prefs.noPork; $('#p-gluten').checked = !!state.prefs.noGluten; $('#p-avoid').value = (state.prefs.avoid || []).join(', ');
    $('#ai-provider').value = state.ai.provider; $('#ai-key').value = state.ai.key || ''; $('#ai-model').value = state.ai.model || '';
    $('#ai-model').placeholder = DEFAULT_MODEL[state.ai.provider] || '';
    $('#settings').showModal();
  }
  function saveSettings() {
    const n = (id, lo, hi, fallback) => { const v = parseFloat($(id).value); return isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fallback; };
    const before = JSON.stringify(state.goals);
    state.goals = { cal: n('#g-cal', 800, 6000, state.goals.cal), protein: n('#g-protein', 10, 400, state.goals.protein), carbs: n('#g-carbs', 10, 900, state.goals.carbs), fat: n('#g-fat', 10, 400, state.goals.fat) };
    if (JSON.stringify(state.goals) !== before) state.goalsSet = true;
    state.mode = $('#s-mode').value;
    state.weightLb = parseFloat($('#s-weight').value) || null;
    state.prefs = { diet: $('#p-diet').value, noPork: $('#p-pork').checked, noGluten: $('#p-gluten').checked, avoid: $('#p-avoid').value.split(',').map((s) => s.trim()).filter(Boolean) };
    state.ai = { provider: $('#ai-provider').value, key: $('#ai-key').value.trim(), model: $('#ai-model').value.trim() };
    save();
    refreshAll();
  }

  function renderHint() {
    $('#ai-hint').textContent = state.ai.key
      ? 'AI chat is on (' + (state.ai.provider === 'claude' ? 'Claude' : 'Gemini') + '). Type anything.'
      : 'AI chat is off. Buttons and simple phrases work now. Add a free Gemini key in settings to type anything.';
  }
  function refreshAll() { renderBanner(); renderToday(); renderPlaces(); renderPick(); renderBrowse(); renderHint(); }

  // ---------- events ----------
  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('button');
    if (!t) return;
    if (t.dataset.place !== undefined) {
      pickLoc = t.dataset.place && pickLoc !== t.dataset.place ? t.dataset.place : null;
      renderPlaces();
      newPick();
    } else if (t.dataset.eat) {
      const c = cards[t.dataset.eat];
      if (!c || c.eaten) return;
      for (const i of c.plate.items) E.logFood(state, now(), MENU.recipes[i.id], i.servings, c.locName);
      c.eaten = true;
      c.justEaten = true;
      save();
      const fromChat = !!t.closest('#messages');
      if (!fromChat) drawPick();
      c.justEaten = fromChat;
      say('bot', 'Logged the ' + c.locName + ' plate: ' + c.plate.totals.cal + ' cal, ' + c.plate.totals.protein + 'g protein.\n' + leftLine());
      renderToday();
      if (fromChat) newPick();
    } else if (t.dataset.shuffle) {
      const c = cards[t.dataset.shuffle];
      if (!c) return;
      seed += 1;
      lastMains = lastMains.concat(c.plate.items.slice(0, 1).map((i) => i.id)).slice(-6);
      const loc = MENU.locations.find((l) => l.id === c.locId);
      const am = loc && E.activeMeal(loc, now());
      if (am) {
        const p = E.buildPlate(MENU, am.meal, E.mealTarget(state, now()), state.prefs, { seed, avoidIds: lastMains, kind: loc.kind });
        if (p) c.plate = p;
      }
      if (t.dataset.shuffle === pickId) drawPick(); else renderChat();
    } else if (t.dataset.add) {
      const r = MENU.recipes[t.dataset.add];
      if (!r) return;
      const e = E.logFood(state, now(), r, 1, t.dataset.loc);
      save();
      t.textContent = 'Added';
      setTimeout(() => { t.textContent = '+ Ate'; }, 900);
      say('bot', 'Logged ' + e.name + ': ' + e.cal + ' cal, ' + e.protein + 'g protein.\n' + leftLine());
      renderToday(); renderPick();
    } else if (t.dataset.remove) {
      const log = E.dayLog(state, now());
      const i = log.findIndex((e) => e.id === t.dataset.remove);
      if (i !== -1) log.splice(i, 1);
      save(); renderToday(); renderPick();
    } else if (t.dataset.say) {
      send(t.dataset.say);
    } else if (t.dataset.fill) {
      const inp = $('#chat-input');
      inp.value = t.dataset.fill;
      inp.focus();
      inp.setSelectionRange(inp.value.length, inp.value.length);
    }
  });
  $('#chat-form').addEventListener('submit', (ev) => { ev.preventDefault(); const v = $('#chat-input').value; $('#chat-input').value = ''; send(v); });
  $('#b-loc').addEventListener('change', fillMealSelect);
  $('#b-meal').addEventListener('change', renderBrowse);
  $('#b-search').addEventListener('input', renderBrowse);
  $('#open-settings').addEventListener('click', openSettings);
  $('#cancel-settings').addEventListener('click', () => $('#settings').close());
  $('#ai-provider').addEventListener('change', () => { $('#ai-model').placeholder = DEFAULT_MODEL[$('#ai-provider').value] || ''; });
  $('#settings-form').addEventListener('submit', saveSettings);
  $('#clear-day').addEventListener('click', () => { E.dayLog(state, now()).length = 0; save(); $('#settings').close(); refreshAll(); say('bot', "Cleared today's log."); });

  // ---------- start ----------
  $('#subtitle').textContent = now().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  fillBrowseSelects();
  refreshAll();
  say('bot', "Hey, I'm Deacon Plate. Tell me what you ate or what you did at the gym and I'll keep track. Or just ask where to eat.");
  window.DeaconPlate = { state, send }; // handy for testing from the browser console
})();
