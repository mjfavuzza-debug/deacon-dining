// Full page test in a pretend browser. Needs jsdom once:  npm install jsdom
// Run with:  node tests/page-test.js docs
const { JSDOM } = require('jsdom');
const fs = require('fs');
const dir = process.argv[2] || 'docs';
const assert = require('assert');
(async () => {
  const html = fs.readFileSync(dir + '/index.html', 'utf8')
    .replace('<script src="menu-data.js"></script>', '<script>' + fs.readFileSync(dir + '/menu-data.js', 'utf8') + '</script>')
    .replace('<script src="engine.js"></script>', '<script>' + fs.readFileSync(dir + '/engine.js', 'utf8') + '</script>')
    .replace('<script src="app.js"></script>', '<script>' + fs.readFileSync(dir + '/app.js', 'utf8') + '</script>');
  const errors = [];
  const { VirtualConsole } = require('jsdom');
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String(e.stack || e)));
  vc.on('error', (e) => errors.push(String(e)));
  let fetchCalls = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', url: 'https://example.test/', virtualConsole: vc, pretendToBeVisual: true,
    beforeParse(w) {
      // Pin the clock to Monday Nov 16, 2026, 6:30 pm
      const RealDate = w.Date; const fixed = new RealDate(2026, 10, 16, 18, 30).getTime();
      w.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(fixed); } static now() { return fixed; } };
      w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
      w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
      w.fetch = async (url, opts) => { fetchCalls.push({ url, opts }); return w.__fetchImpl(url, opts); };
    },
  });
  const w = dom.window; const d = w.document;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(50);
  assert.deepStrictEqual(errors, [], 'page errors: ' + errors.join('\n'));
  const txt = (sel) => d.querySelector(sel).textContent.replace(/\s+/g, ' ').trim();
  console.log('PICK   :', txt('#pick').slice(0, 260));
  console.log('TODAY  :', txt('#today').slice(0, 160));
  assert.ok(/Top pick/.test(txt('#pick')));
  // eat the top pick
  d.querySelector('#pick [data-eat]').click();
  console.log('AFTER EAT:', txt('#today').slice(0, 120));
  assert.ok(/logged today/.test(txt('#today')));
  // no-key chat
  d.querySelector('#chat-input').value = 'lifted and burned 400';
  d.querySelector('#chat-form').dispatchEvent(new w.Event('submit', { cancelable: true }));
  await wait(30);
  assert.ok(/Burned 400/.test(txt('#today')), txt('#today'));
  assert.strictEqual(fetchCalls.length, 0, 'no network without a key');
  // shuffle inside chat
  const before = d.querySelector('#messages .plate ul').textContent;
  d.querySelector('#messages [data-shuffle]').click();
  assert.notStrictEqual(d.querySelector('#messages .plate ul').textContent, before, 'shuffle changes the plate');
  // browse + search + add
  d.querySelector('#b-loc').value = 'cfa'; d.querySelector('#b-loc').dispatchEvent(new w.Event('change'));
  d.querySelector('#b-search').value = 'nuggets'; d.querySelector('#b-search').dispatchEvent(new w.Event('input'));
  assert.strictEqual(d.querySelectorAll('#browse .item').length, 4);
  d.querySelector('#browse [data-add]').click();
  // settings: add a Gemini key and goals
  d.querySelector('#open-settings').click();
  d.querySelector('#g-cal').value = '2600'; d.querySelector('#g-protein').value = '150'; d.querySelector('#ai-key').value = 'TEST-KEY';
  d.querySelector('#settings-form').dispatchEvent(new w.Event('submit', { cancelable: true }));
  assert.ok(/AI chat is on \(Gemini\)/.test(txt('#ai-hint')));
  // simulated Gemini reply
  w.__fetchImpl = async (url, opts) => {
    const body = JSON.parse(opts.body);
    const sys = body.systemInstruction.parts[0].text;
    const line = sys.split('\n').find((l) => /\|Sauteed Chicken Teriyaki\|/.test(l));
    const n = line.split('|')[0];
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ reply: 'Teriyaki logged. Try this to finish strong.', actions: [{ type: 'log_food', n: Number(n), servings: 1 }, { type: 'suggest_plate', title: 'Protein finisher', items: [{ n: Number(n), servings: 2 }] }] }) }] } }] }) };
  };
  d.querySelector('#chat-input').value = 'had the chicken teriyaki at north';
  d.querySelector('#chat-form').dispatchEvent(new w.Event('submit', { cancelable: true }));
  await wait(50);
  const call = fetchCalls[0];
  assert.ok(/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-flash-latest:generateContent$/.test(call.url), call.url);
  assert.strictEqual(call.opts.headers['x-goog-api-key'], 'TEST-KEY');
  assert.ok(!/TEST-KEY/.test(call.url), 'key never goes in the URL');
  const sent = JSON.parse(call.opts.body);
  assert.strictEqual(sent.contents[0].role, 'user');
  for (let i = 1; i < sent.contents.length; i++) assert.notStrictEqual(sent.contents[i].role, sent.contents[i - 1].role, 'turns alternate');
  const msgs = txt('#messages');
  assert.ok(/Teriyaki logged/.test(msgs) && /Logged Sauteed Chicken Teriyaki: 230 cal, 22g protein/.test(msgs) && /Protein finisher/.test(msgs), msgs.slice(-400));
  // Claude provider + an error falls back to the built-in brain
  d.querySelector('#open-settings').click();
  d.querySelector('#ai-provider').value = 'claude';
  d.querySelector('#settings-form').dispatchEvent(new w.Event('submit', { cancelable: true }));
  w.__fetchImpl = async () => ({ ok: false, status: 429, json: async () => ({ error: { message: 'rate' } }) });
  d.querySelector('#chat-input').value = 'where should I eat?';
  d.querySelector('#chat-form').dispatchEvent(new w.Event('submit', { cancelable: true }));
  await wait(50);
  const c2 = fetchCalls[fetchCalls.length - 1];
  assert.strictEqual(c2.url, 'https://api.anthropic.com/v1/messages');
  assert.strictEqual(JSON.parse(c2.opts.body).model, 'claude-haiku-5-5');
  assert.ok(/usage limit/.test(txt('#messages')) && /built-in brain/.test(txt('#messages')));
  // saved state survives
  const saved = JSON.parse(w.localStorage.getItem('deaconplate.v1'));
  assert.strictEqual(saved.goals.cal, 2600);
  assert.ok(saved.days['2026-11-16'].log.length >= 4);
  console.log('FINAL TODAY:', txt('#today').slice(0, 200));
  assert.deepStrictEqual(errors, [], 'page errors: ' + errors.join('\n'));
  console.log('\npage test passed');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
