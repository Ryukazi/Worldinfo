/* WorldScope — Explore Every Country. Dev: Lord Denish (Ryukazi). Plain JS, no build step. */
(function () {
'use strict';
const WSC = window.WSCountry;
const EARTH = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/earth_atmos_2048.jpg';
const CLOUDS = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/earth_clouds_1024.png';
const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const LEAF = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min';
const POPULAR = ['USD', 'EUR', 'GBP', 'JPY', 'NPR', 'INR', 'AUD', 'CAD'];
const DEST = ['FR', 'JP', 'IT', 'US', 'TH', 'AE', 'NP', 'BR'];
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- utils ---------- */
const $ = (s, r) => (r || document).querySelector(s);
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs || {}) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  kids.flat(Infinity).forEach(c => { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); });
  return e;
}
const store = {
  get(k, d) { try { const v = localStorage.getItem('ws_' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('ws_' + k, JSON.stringify(v)); } catch (e) {} }
};
const num = n => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString();
const cap = s => String(s || '').replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
const safeUrl = u => { try { const x = new URL(u); return x.protocol === 'https:' ? x.href : null; } catch (e) { return null; } };
const errMsg = e => e && e.name === 'AbortError' ? 'The request timed out.' : !navigator.onLine ? 'You are offline.' : (e && e.message) || 'Something went wrong.';
const debounce = (f, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };
async function fetchJSON(url, ms) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms || 15000);
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: c.signal });
    if (r.status === 429) throw new Error('Rate limit reached. Try again shortly.');
    if (!r.ok) throw new Error('Request failed (' + r.status + ')');
    return await r.json();
  } finally { clearTimeout(t); }
}
const loaded = {};
function loadScript(u) { return loaded[u] || (loaded[u] = new Promise((ok, no) => { const s = h('script', { src: u }); s.onload = ok; s.onerror = () => { delete loaded[u]; no(new Error('Could not load ' + u)); }; document.head.append(s); })); }
function loadCss(u) { return loaded[u] || (loaded[u] = new Promise((ok, no) => { const l = h('link', { rel: 'stylesheet', href: u }); l.onload = ok; l.onerror = () => { delete loaded[u]; no(); }; document.head.append(l); })); }
function flagImg(src, cls) { const u = safeUrl(src); return u ? h('img', { src: u, alt: '', loading: 'lazy', class: cls, onerror: e => e.target.style.visibility = 'hidden' }) : null; }

/* ---------- state ---------- */
const S = { dir: [], byCode: {}, fav: store.get('fav', []), recent: store.get('recent', []), cmp: store.get('cmp', []),
  sel: store.get('sel', null), set: Object.assign({ unit: 'c', fx: true }, store.get('settings', {})) };
const saveSet = () => store.set('settings', S.set);
let cleanups = [], navId = 0;
const onLeave = f => cleanups.push(f);
const isFav = c => S.fav.includes(c);
function toggleFav(c) { S.fav = isFav(c) ? S.fav.filter(x => x !== c) : [c, ...S.fav]; store.set('fav', S.fav); }
function addRecent(c) { S.recent = [c, ...S.recent.filter(x => x !== c)].slice(0, 12); store.set('recent', S.recent); S.sel = c; store.set('sel', c); }

/* ---------- data: directory (restcountries) + Country Info API ---------- */
async function loadDir() {
  const cached = store.get('dir', null);
  if (cached && Date.now() - cached.t < 6048e5) S.dir = cached.d;
  else {
    try {
      const r = await fetchJSON('https://restcountries.com/v3.1/all?fields=name,cca2,cca3,capital,region,flags,currencies,population,latlng,timezones', 20000);
      S.dir = r.filter(c => c.cca2 && c.latlng && c.latlng.length === 2).map(c => ({
        name: c.name.common, cca2: c.cca2, cca3: c.cca3, capital: (c.capital || [])[0] || '', region: c.region || '',
        flag: c.flags && c.flags.png, pop: c.population, ll: c.latlng, tz: c.timezones || [],
        cur: Object.entries(c.currencies || {}).map(([code, v]) => ({ code, name: v.name, symbol: v.symbol }))
      })).sort((a, b) => a.name.localeCompare(b.name));
      store.set('dir', { t: Date.now(), d: S.dir });
    } catch (e) { if (cached) S.dir = cached.d; else throw e; }
  }
  S.dir.forEach(c => { S.byCode[c.cca2] = c; c._s = [c.name, c.capital, c.region, c.cca2, c.cca3, ...c.cur.flatMap(x => [x.code, x.name])].join(' ').toLowerCase(); });
}
const infoMem = {};
async function getInfo(name) {
  const k = name.toLowerCase();
  if (infoMem[k]) return infoMem[k];
  let data, err;
  try { data = await WSC.getCountryInfo(name, { base: location.origin, path: '/api/country' }); } catch (e) { err = e; }
  if (!data) { try { data = await WSC.getCountryInfo(name); } catch (e) { err = e; } }
  if (data) { store.set('ci_' + k, data); return infoMem[k] = data; }
  const c = store.get('ci_' + k, null);
  if (c) { c.__stale = true; return c; }
  throw err;
}
const placeMem = {};
async function place(c) {
  if (placeMem[c.cca2]) return placeMem[c.cca2];
  let p = { lat: c.ll[0], lon: c.ll[1], exact: false, name: c.name };
  if (c.capital) {
    try {
      const j = await fetchJSON('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(c.capital) + '&count=10&format=json&country_code=' + c.cca2, 8000);
      const g = (j.results || []).find(x => x.feature_code === 'PPLC');
      if (g) p = { lat: g.latitude, lon: g.longitude, exact: true, name: g.name };
    } catch (e) {}
  }
  return placeMem[c.cca2] = p;
}

/* ---------- weather + time ---------- */
const WX = { 0: ['Clear sky', '☀️'], 1: ['Mainly clear', '🌤️'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁️'], 45: ['Fog', '🌫️'], 48: ['Rime fog', '🌫️'],
  51: ['Light drizzle', '🌦️'], 53: ['Drizzle', '🌦️'], 55: ['Dense drizzle', '🌧️'], 56: ['Freezing drizzle', '🌧️'], 57: ['Freezing drizzle', '🌧️'],
  61: ['Light rain', '🌦️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'], 66: ['Freezing rain', '🌧️'], 67: ['Freezing rain', '🌧️'],
  71: ['Light snow', '🌨️'], 73: ['Snow', '🌨️'], 75: ['Heavy snow', '❄️'], 77: ['Snow grains', '❄️'], 80: ['Rain showers', '🌦️'], 81: ['Rain showers', '🌧️'],
  82: ['Violent showers', '⛈️'], 85: ['Snow showers', '🌨️'], 86: ['Snow showers', '🌨️'], 95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm, hail', '⛈️'], 99: ['Thunderstorm, hail', '⛈️'] };
const wxInfo = (code, day) => { const w = WX[code] || ['Unknown', '❓']; return [w[0], (!day && (code === 0 || code === 1)) ? '🌙' : w[1]]; };
const compass = d => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(d / 45) % 8];
const wxMem = {};
const wxKey = (a, b) => a + ',' + b + S.set.unit;
function getWx(lat, lon, force) {
  const k = wxKey(lat, lon), c = wxMem[k];
  if (!force && c && Date.now() - c.t < 6e5) return c.p;
  const u = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
    '&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,is_day' +
    '&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto&forecast_days=7&temperature_unit=' + (S.set.unit === 'f' ? 'fahrenheit' : 'celsius');
  const p = fetchJSON(u).then(j => (j.fetchedAt = Date.now(), j));
  wxMem[k] = { t: Date.now(), p };
  p.catch(() => delete wxMem[k]);
  return p;
}
function weatherPanel(lat, lon, compact, label) {
  const box = h('div', { class: 'card' });
  async function load(force) {
    if (!box.children.length) box.append(h('p', { class: 'mut' }, 'Loading weather…'));
    try { draw(await getWx(lat, lon, force)); }
    catch (e) { box.replaceChildren(h('h3', null, 'Weather unavailable'), h('p', { class: 'err' }, errMsg(e)), h('button', { class: 'btn ghost', onclick: () => load(true) }, 'Try again')); }
  }
  function draw(j) {
    const c = j.current, d = j.daily, u = S.set.unit === 'f' ? '°F' : '°C', [txt, ic] = wxInfo(c.weather_code, c.is_day);
    const i0 = Math.max(0, j.hourly.time.findIndex(t => t >= c.time.slice(0, 13) + ':00'));
    box.replaceChildren(
      h('div', { class: 'phead' }, h('h3', null, label ? 'Weather · ' + label : 'Weather'), h('button', { class: 'btn ghost', onclick: () => load(true) }, '↻ Refresh')),
      h('div', { class: 'row', style: 'align-items:center;margin:0' }, h('span', { style: 'font-size:3rem' }, ic), h('div', null, h('div', { class: 'big' }, Math.round(c.temperature_2m) + u), h('div', null, txt))),
      h('div', { class: 'facts', style: 'margin-top:12px' },
        fact('Feels like', Math.round(c.apparent_temperature) + u), fact('Humidity', c.relative_humidity_2m + '%'),
        fact('Wind', c.wind_speed_10m + ' km/h ' + compass(c.wind_direction_10m)), fact('Precipitation', c.precipitation + ' mm'),
        fact('Sunrise', d.sunrise[0].slice(11, 16)), fact('Sunset', d.sunset[0].slice(11, 16))),
      compact ? null : [
        h('h3', { style: 'margin-top:16px' }, 'Next 24 hours'),
        h('div', { class: 'strip' }, j.hourly.time.slice(i0, i0 + 24).map((t, i) => h('div', null, h('small', { class: 'mut' }, t.slice(11, 16)), h('div', null, wxInfo(j.hourly.weather_code[i0 + i], true)[1]), h('b', null, Math.round(j.hourly.temperature_2m[i0 + i]) + '°')))),
        h('h3', { style: 'margin-top:12px' }, '7-day forecast'),
        h('div', { class: 'days' }, d.time.map((t, i) => h('div', null, h('span', null, new Date(t + 'T12:00').toLocaleDateString([], { weekday: 'short', day: 'numeric' })), h('span', null, wxInfo(d.weather_code[i], true)[1] + ' ' + wxInfo(d.weather_code[i], true)[0]), h('b', null, Math.round(d.temperature_2m_min[i]) + '° / ' + Math.round(d.temperature_2m_max[i]) + '°'))))],
      h('p', { class: 'mut', style: 'font-size:.75rem' }, 'Open-Meteo · updated ' + new Date(j.fetchedAt).toLocaleTimeString() + ' · refreshes every 10 min'));
  }
  load(); const iv = setInterval(() => load(true), 6e5); onLeave(() => clearInterval(iv));
  return box;
}
function fact(k, v) { return (v == null || v === '' || v === 'undefined') ? null : h('div', { class: 'fact' }, h('small', null, k), h('b', null, v)); }
const fmtTime = tz => new Intl.DateTimeFormat([], { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date());
const fmtDate = tz => new Intl.DateTimeFormat([], { timeZone: tz, dateStyle: 'full' }).format(new Date());
function offsetName(tz) { try { return new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(new Date()).find(p => p.type === 'timeZoneName').value.replace('GMT', 'UTC'); } catch (e) { return ''; } }
function isDay(tz, sr, ss) { try { const n = new Date().toLocaleString('sv-SE', { timeZone: tz }).replace(' ', 'T').slice(0, 16); return n >= sr && n < ss; } catch (e) { return true; } }
setInterval(() => { if (document.hidden) return; document.querySelectorAll('[data-tz]').forEach(e => e.textContent = fmtTime(e.dataset.tz)); document.querySelectorAll('[data-tzdate]').forEach(e => e.textContent = fmtDate(e.dataset.tzdate)); }, 1000);
function timeCard(lat, lon, offs) {
  const box = h('div', { class: 'card' }, h('p', { class: 'mut' }, 'Loading local time…'));
  getWx(lat, lon).then(j => {
    const tz = j.timezone;
    box.replaceChildren(h('h3', null, 'Local time'), h('div', { class: 'clock', 'data-tz': tz }, fmtTime(tz)), h('p', { 'data-tzdate': tz }, fmtDate(tz)),
      h('p', { class: 'mut' }, tz.replace(/_/g, ' ') + ' · ' + offsetName(tz)), h('span', { class: 'pill' }, isDay(tz, j.daily.sunrise[0], j.daily.sunset[0]) ? '☀️ Daytime' : '🌙 Nighttime'),
      offs && offs.length > 1 ? h('p', { class: 'mut', style: 'font-size:.8rem' }, 'This country uses several UTC offsets (' + offs.join(', ') + '). The time above is for the location shown.') : null);
  }).catch(e => box.replaceChildren(h('h3', null, 'Local time unavailable'), h('p', { class: 'err' }, errMsg(e))));
  return box;
}

/* ---------- currency (Frankfurter) ---------- */
let curList = null;
async function getCurrencies() {
  if (curList) return curList;
  try { curList = await fetchJSON('https://api.frankfurter.dev/v1/currencies'); store.set('curlist', curList); }
  catch (e) { curList = store.get('curlist', null); if (!curList) throw e; }
  return curList;
}
function money(n, code) { try { return new Intl.NumberFormat([], { style: 'currency', currency: code }).format(n); } catch (e) { return n.toFixed(2) + ' ' + code; } }
function converter(preFrom, preTo) {
  const box = h('div', { class: 'card conv' }, h('p', { class: 'mut' }, 'Loading currencies…'));
  getCurrencies().then(list => {
    const codes = Object.keys(list); let note = null;
    if (!list[preFrom]) { if (preFrom) note = preFrom + ' isn’t supported by the Frankfurter rate source, so live conversion for it is unavailable. Choose another currency.'; preFrom = 'USD'; }
    if (!list[preTo] || preTo === preFrom) preTo = preFrom === 'EUR' ? 'USD' : 'EUR';
    const mk = v => h('select', { 'aria-label': 'Currency' }, codes.map(c => h('option', { value: c, selected: c === v }, c + ' — ' + list[c])));
    const from = mk(preFrom), to = mk(preTo), amt = h('input', { type: 'number', inputmode: 'decimal', value: '100', min: '0', step: 'any', 'aria-label': 'Amount' });
    const out = h('div', { class: 'cout' }), meta = h('p', { class: 'mut' });
    const run = async () => {
      const a = parseFloat(amt.value);
      if (!(a >= 0)) { out.textContent = 'Enter an amount'; meta.textContent = ''; return; }
      if (from.value === to.value) { out.textContent = money(a, to.value); meta.textContent = 'Same currency'; return; }
      out.textContent = 'Converting…';
      try {
        const j = await fetchJSON('https://api.frankfurter.dev/v1/latest?base=' + from.value + '&symbols=' + to.value), r = j.rates[to.value];
        out.textContent = money(a, from.value) + ' = ' + money(a * r, to.value);
        meta.textContent = '1 ' + j.base + ' = ' + r + ' ' + to.value + ' · rates dated ' + j.date;
      } catch (e) { out.textContent = 'Rate unavailable'; meta.textContent = errMsg(e); }
    };
    const go = debounce(run, 350);
    [from, to].forEach(s => s.addEventListener('change', run)); amt.addEventListener('input', go);
    box.replaceChildren(h('h3', null, 'Currency converter'), note ? h('p', { class: 'err' }, note) : null,
      amt, h('div', { class: 'r' }, from, h('button', { class: 'btn ghost', type: 'button', 'aria-label': 'Swap currencies', onclick: () => { const t = from.value; from.value = to.value; to.value = t; run(); } }, '⇄'), to),
      out, meta, h('p', { class: 'mut' }, 'Convert to:'),
      h('div', { class: 'chips' }, POPULAR.map(c => h('button', { class: 'chip', type: 'button', disabled: !list[c], title: list[c] ? list[c] : c + ' is not supported by Frankfurter', onclick: () => { to.value = c; run(); } }, c))));
    run();
  }).catch(e => box.replaceChildren(h('h3', null, 'Converter unavailable'), h('p', { class: 'err' }, errMsg(e))));
  return box;
}

/* ---------- search ---------- */
function searchBox(onPick, opts) {
  opts = opts || {};
  const input = h('input', { type: 'search', placeholder: 'Search country, capital, code or currency', autocomplete: 'off', 'aria-label': 'Search countries', autofocus: opts.focus });
  const list = h('ul', { class: 'sugg', role: 'listbox', hidden: !opts.focus });
  const clear = h('button', { class: 'clr', type: 'button', hidden: true, 'aria-label': 'Clear search', onclick: () => { input.value = ''; close(); input.focus(); } }, '×');
  let items = [], idx = -1;
  const close = () => { list.hidden = true; list.replaceChildren(); items = []; idx = -1; clear.hidden = !input.value; };
  const mark = () => [...list.children].forEach((li, i) => li.classList.toggle('act', i === idx));
  const pick = c => { close(); input.value = ''; clear.hidden = true; if (opts.after) opts.after(); onPick(c); };
  const run = debounce(() => {
    const q = input.value.trim().toLowerCase(); clear.hidden = !q;
    if (!q) return close();
    const sc = c => c.name.toLowerCase().startsWith(q) || c.cca2.toLowerCase() === q || c.cca3.toLowerCase() === q ? 0 : 1;
    items = S.dir.filter(c => c._s.includes(q)).sort((a, b) => sc(a) - sc(b)).slice(0, 8); idx = items.length ? 0 : -1;
    list.hidden = false;
    list.replaceChildren(...(items.length ? items.map(c => h('li', { role: 'option', onmousedown: e => e.preventDefault(), onclick: () => pick(c) }, flagImg(c.flag), h('span', null, c.name), h('small', null, c.capital))) : [h('li', { class: 'empty' }, 'No country matches “' + input.value.trim() + '”')]));
    mark();
  }, 120);
  input.addEventListener('input', run);
  input.addEventListener('blur', () => setTimeout(() => { if (!opts.focus) close(); }, 150));
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' && items.length) { e.preventDefault(); idx = (idx + 1) % items.length; mark(); }
    else if (e.key === 'ArrowUp' && items.length) { e.preventDefault(); idx = (idx - 1 + items.length) % items.length; mark(); }
    else if (e.key === 'Enter' && items[idx]) { e.preventDefault(); pick(items[idx]); }
    else if (e.key === 'Escape') close();
  });
  return h('div', { class: 'sb' }, input, clear, list);
}
function openSearchOverlay() {
  const ov = h('div', { class: 'ov' });
  const done = () => ov.remove();
  ov.append(h('div', { class: 'row', style: 'margin:0;justify-content:space-between;align-items:center' }, h('h2', { style: 'margin:0' }, 'Search'), h('button', { class: 'btn ghost', onclick: done }, 'Close')),
    searchBox(c => { location.hash = '#/country/' + c.cca2; }, { focus: true, after: done }));
  document.body.append(ov); ov.querySelector('input').focus();
}

/* ---------- 3D globe ---------- */
const webgl = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl') || c.getContext('experimental-webgl')); } catch (e) { return false; } };
function mountGlobe(box) {
  let dead = false, impl = null, pending = null;
  const api = { focus(c) { pending = c; if (impl) impl.focus(c); }, destroy() { dead = true; if (impl) impl.destroy(); } };
  initGlobe(box).then(i => { if (dead) return i.destroy(); impl = i; if (pending) i.focus(pending); });
  onLeave(api.destroy);
  return api;
}
async function initGlobe(box) {
  const lab = h('a', { class: 'glabel', hidden: true }); box.replaceChildren(lab);
  const setLabel = c => { lab.hidden = false; lab.href = '#/country/' + c.cca2; lab.replaceChildren(flagImg(c.flag), h('b', null, c.name)); };
  const fallback = () => { box.prepend(h('div', { class: 'cssglobe' })); return { focus: setLabel, destroy() {} }; };
  if (!S.set.fx || !webgl()) return fallback();
  try { await loadScript(THREE_URL); } catch (e) { return fallback(); }
  const T = window.THREE, R = 1.2;
  const renderer = new T.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  const scene = new T.Scene(), camera = new T.PerspectiveCamera(40, 1, .1, 100); camera.position.z = 4.3;
  const size = () => { const w = box.clientWidth || 300, hh = box.clientHeight || 300; renderer.setSize(w, hh, false); camera.aspect = w / hh; camera.updateProjectionMatrix(); };
  box.prepend(renderer.domElement); size();
  const group = new T.Group(); scene.add(group);
  scene.add(new T.AmbientLight(0x99aacc, .9)); const sun = new T.DirectionalLight(0xffffff, 1.1); sun.position.set(4, 2, 5); scene.add(sun);
  const loader = new T.TextureLoader(); loader.setCrossOrigin('anonymous');
  const mat = new T.MeshPhongMaterial({ color: 0x1d5fa8, shininess: 8 });
  loader.load(EARTH, t => { mat.map = t; mat.color.set(0xffffff); mat.needsUpdate = true; });
  group.add(new T.Mesh(new T.SphereGeometry(R, 48, 48), mat));
  const cmat = new T.MeshPhongMaterial({ transparent: true, opacity: 0, depthWrite: false });
  loader.load(CLOUDS, t => { cmat.map = t; cmat.opacity = .45; cmat.needsUpdate = true; });
  const clouds = new T.Mesh(new T.SphereGeometry(R * 1.012, 40, 40), cmat); group.add(clouds);
  scene.add(new T.Mesh(new T.SphereGeometry(R * 1.18, 40, 40), new T.ShaderMaterial({ side: T.BackSide, transparent: true, blending: T.AdditiveBlending, depthWrite: false,
    vertexShader: 'varying vec3 n;void main(){n=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec3 n;void main(){float i=pow(max(.0,.65-dot(n,vec3(0,0,1.))),3.);gl_FragColor=vec4(0.,.78,1.,1.)*i*1.6;}' })));
  const sp = new Float32Array(900); for (let i = 0; i < 300; i++) { const a = Math.random() * 6.283, b = Math.acos(2 * Math.random() - 1), r = 18; sp.set([r * Math.sin(b) * Math.cos(a), r * Math.cos(b), r * Math.sin(b) * Math.sin(a)], i * 3); }
  const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(sp, 3)); scene.add(new T.Points(sg, new T.PointsMaterial({ color: 0xbfe9ff, size: .05 })));
  const marker = new T.Mesh(new T.SphereGeometry(.035, 12, 12), new T.MeshBasicMaterial({ color: 0x00c8ff })); marker.visible = false; group.add(marker);
  let raf = 0, dead = false, drag = false, lx = 0, ly = 0, tgt = null, vis = true;
  const loop = () => {
    raf = 0; if (dead || !vis || document.hidden) return;
    if (tgt) { group.rotation.x += (tgt.x - group.rotation.x) * .08; group.rotation.y += (tgt.y - group.rotation.y) * .08; if (Math.abs(tgt.x - group.rotation.x) + Math.abs(tgt.y - group.rotation.y) < .004) tgt = null; }
    else if (!drag && !REDUCED) group.rotation.y += .0015;
    if (!REDUCED) clouds.rotation.y += .0002;
    renderer.render(scene, camera); raf = requestAnimationFrame(loop);
  };
  const kick = () => { if (!raf && !dead) raf = requestAnimationFrame(loop); };
  const cv = renderer.domElement;
  cv.addEventListener('pointerdown', e => { drag = true; tgt = null; lx = e.clientX; ly = e.clientY; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => { if (!drag) return; group.rotation.y += (e.clientX - lx) * .008; group.rotation.x = Math.max(-1.2, Math.min(1.2, group.rotation.x + (e.clientY - ly) * .006)); lx = e.clientX; ly = e.clientY; kick(); });
  ['pointerup', 'pointercancel'].forEach(t => cv.addEventListener(t, () => drag = false));
  const io = new IntersectionObserver(e => { vis = e[0].isIntersecting; kick(); }); io.observe(box);
  const ro = new ResizeObserver(() => { size(); kick(); }); ro.observe(box);
  const vc = () => kick(); document.addEventListener('visibilitychange', vc);
  kick();
  return {
    focus(c) {
      setLabel(c); const phi = (90 - c.ll[0]) * Math.PI / 180, th = (c.ll[1] + 180) * Math.PI / 180;
      const x = -R * Math.sin(phi) * Math.cos(th), z = R * Math.sin(phi) * Math.sin(th), y = R * Math.cos(phi);
      marker.position.set(x * 1.01, y * 1.01, z * 1.01); marker.visible = true;
      const cur = group.rotation.y, want = -Math.atan2(x, z);
      tgt = { x: c.ll[0] * Math.PI / 180, y: cur + ((want - cur + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI }; kick();
    },
    destroy() { dead = true; cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); document.removeEventListener('visibilitychange', vc); renderer.dispose(); }
  };
}

/* ---------- map (Leaflet + OpenStreetMap) ---------- */
function mapPanel(markers) {
  const box = h('div', { class: 'map' });
  Promise.all([loadCss(LEAF + '.css'), loadScript(LEAF + '.js')]).then(() => {
    const L = window.L, m = L.map(box).setView([markers[0].lat, markers[0].lon], 5);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap contributors' }).addTo(m);
    markers.forEach(k => L.marker([k.lat, k.lon]).addTo(m).bindPopup(h('div', null, flagImg(k.flag), h('b', null, k.title), h('div', null, k.lat.toFixed(4) + ', ' + k.lon.toFixed(4)), k.note ? h('small', null, k.note) : null)));
    if (markers.length > 1) m.fitBounds(markers.map(k => [k.lat, k.lon]), { padding: [30, 30], maxZoom: 6 });
    onLeave(() => m.remove()); [100, 400].forEach(t => setTimeout(() => m.invalidateSize(), t));
  }).catch(() => box.replaceChildren(h('div', { style: 'padding:16px' }, h('p', { class: 'err' }, 'The map could not load.'),
    h('a', { href: 'https://www.openstreetmap.org/?mlat=' + markers[0].lat + '&mlon=' + markers[0].lon + '#map=5/' + markers[0].lat + '/' + markers[0].lon, target: '_blank', rel: 'noopener' }, 'Open in OpenStreetMap'))));
  return box;
}

/* ---------- components ---------- */
function favBtn(code) {
  const b = h('button', { class: 'fav' + (isFav(code) ? ' on' : ''), type: 'button', 'aria-label': 'Toggle favorite', onclick: e => { e.preventDefault(); e.stopPropagation(); toggleFav(code); b.textContent = isFav(code) ? '★' : '☆'; b.classList.toggle('on', isFav(code)); } }, isFav(code) ? '★' : '☆');
  return b;
}
const countryCard = c => h('div', { class: 'card ccard' }, flagImg(c.flag), h('div', { style: 'min-width:0' }, h('a', { class: 'cl', href: '#/country/' + c.cca2 }, c.name), h('small', null, c.capital || c.region)), favBtn(c.cca2));
const cardGrid = list => list.length ? h('div', { class: 'grid g3' }, list.map(countryCard)) : h('p', { class: 'mut' }, 'Nothing here yet.');
const defaultCode = () => (S.byCode[S.sel] ? S.sel : S.recent.find(c => S.byCode[c])) || featured().cca2;
function featured() { const l = S.dir.filter(c => c.capital); return l[Math.floor(Date.now() / 864e5) % l.length]; }
function pageHead(title, c, route) {
  return h('div', { class: 'phead' }, h('h1', null, title), h('div', { class: 'pick' }, flagImg(c.flag), h('b', null, c.name), searchBox(x => { location.hash = '#/' + route + '/' + x.cca2; })));
}

/* ---------- pages ---------- */
function home() {
  const f = featured(), gbox = h('div', { class: 'globe' }), g = mountGlobe(gbox), slot = h('div');
  requestAnimationFrame(() => g.focus(S.byCode[S.recent[0]] || f));
  place(f).then(p => slot.replaceChildren(weatherPanel(p.lat, p.lon, true, p.name)));
  const regions = [...new Set(S.dir.map(c => c.region).filter(Boolean))];
  const rnd = () => { location.hash = '#/country/' + S.dir[Math.floor(Math.random() * S.dir.length)].cca2; };
  return h('div', { class: 'page' },
    h('div', { class: 'card hero' }, h('div', null, h('h1', null, 'Explore every country'), h('p', { class: 'mut' }, 'Live weather, local time, currency, maps and side-by-side comparisons — for ' + S.dir.length + ' countries and territories.'),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: rnd }, '🎲 Random country'), h('a', { class: 'btn ghost', href: '#/country/' + f.cca2, style: 'display:inline-flex;align-items:center' }, 'Today’s pick: ' + f.name))), gbox),
    h('div', { class: 'grid g4' },
      h('div', { class: 'card stat' }, h('b', null, S.dir.length), 'Countries'), h('div', { class: 'card stat' }, h('b', null, regions.length), 'Continents & regions'),
      h('div', { class: 'card stat' }, h('b', { 'data-tz': Intl.DateTimeFormat().resolvedOptions().timeZone, style: 'font-size:1.4rem' }, fmtTime(Intl.DateTimeFormat().resolvedOptions().timeZone)), 'Your local time'),
      h('div', { class: 'card stat' }, h('b', null, S.fav.length), 'Favorites')),
    h('div', { class: 'grid g2' }, h('div', { class: 'card' }, h('h2', null, 'Featured: ' + f.name), countryCard(f), h('p', { class: 'mut' }, 'Weather for its capital →')), slot),
    h('section', null, h('h2', null, 'Popular destinations'), cardGrid(DEST.map(c => S.byCode[c]).filter(Boolean))),
    h('section', null, h('h2', null, 'Continent explorer'), h('div', { class: 'chips' }, regions.map(r => h('a', { class: 'chip', href: '#/explore?region=' + encodeURIComponent(r) }, r + ' · ' + S.dir.filter(c => c.region === r).length)))),
    S.recent.length ? h('section', null, h('h2', null, 'Recently viewed'), cardGrid(S.recent.map(c => S.byCode[c]).filter(Boolean).slice(0, 6))) : null,
    S.fav.length ? h('section', null, h('h2', null, 'Favorites'), cardGrid(S.fav.map(c => S.byCode[c]).filter(Boolean).slice(0, 6))) : null);
}
function explore(r) {
  const region = r.q.get('region') || 'All', sort = r.q.get('sort') || 'az', regions = ['All', ...new Set(S.dir.map(c => c.region).filter(Boolean))];
  let list = S.dir.filter(c => region === 'All' || c.region === region);
  list = list.slice().sort((a, b) => sort === 'za' ? b.name.localeCompare(a.name) : sort === 'pop' ? (b.pop || 0) - (a.pop || 0) : a.name.localeCompare(b.name));
  const nav = (rg, so) => '#/explore?region=' + encodeURIComponent(rg) + '&sort=' + so;
  let shown = 48; const gridBox = h('div'), more = h('button', { class: 'btn ghost', onclick: () => { shown += 48; draw(); } }, 'Show more');
  const draw = () => { gridBox.replaceChildren(cardGrid(list.slice(0, shown))); more.hidden = shown >= list.length; };
  draw();
  return h('div', { class: 'page' }, h('div', { class: 'phead' }, h('h1', null, 'Explore countries'), h('div', { style: 'flex:1;max-width:420px' }, searchBox(c => { location.hash = '#/country/' + c.cca2; }))),
    h('div', { class: 'chips' }, regions.map(x => h('a', { class: 'chip' + (x === region ? ' on' : ''), href: nav(x, sort) }, x))),
    h('div', { class: 'row', style: 'margin:0;align-items:center' }, h('span', { class: 'mut' }, list.length + ' countries · sort'),
      h('select', { 'aria-label': 'Sort', onchange: e => { location.hash = nav(region, e.target.value); } }, [['az', 'A → Z'], ['za', 'Z → A'], ['pop', 'Population']].map(([v, t]) => h('option', { value: v, selected: v === sort }, t)))),
    gridBox, more);
}
function country(r) {
  const c = S.byCode[(r.arg || '').toUpperCase()]; if (!c) throw new Error('Unknown country code.');
  addRecent(c.cca2);
  const infoP = getInfo(c.name), placeP = place(c), panels = {}, tabBtns = {}, body = h('div');
  const compareBtn = h('button', { class: 'btn ghost', onclick: () => { if (!S.cmp.includes(c.cca2)) { S.cmp = [...S.cmp, c.cca2].slice(-4); store.set('cmp', S.cmp); } location.hash = '#/compare'; } }, '⇄ Compare');
  const head = h('div', { class: 'card hero-c' }, flagImg(c.flag), h('div', { style: 'flex:1;min-width:180px' }, h('h1', null, c.name), h('p', { class: 'mut' }, c.capital ? 'Capital: ' + c.capital : 'No capital listed')), h('div', { class: 'row' }, favBtn(c.cca2), compareBtn));
  const makers = {
    overview() {
      const box = h('div', { class: 'grid' }, h('p', { class: 'mut' }, 'Loading country details…'));
      infoP.then(i => {
        const lang = i.languages || {}, ar = i.area || {}, co = i.continent, iso = i.isoCode || {}, map = safeUrl(i.googleMapsLink);
        const mismatch = iso.alpha2 && iso.alpha2.toLowerCase() !== c.cca2.toLowerCase();
        box.replaceChildren(
          i.__stale ? h('p', { class: 'mut' }, 'Showing saved details (offline or API unavailable).') : null,
          mismatch ? h('p', { class: 'err' }, 'The Country Info API matched “' + i.name + '” for this search, so some details may belong to a different country.') : null,
          h('div', { class: 'facts' }, fact('Capital', i.capital || c.capital), fact('Continent', co && ((co.emoji || '') + ' ' + co.name)), fact('Phone code', i.phoneCode),
            fact('Population', c.pop ? num(c.pop) : null), fact('Area', ar.squareKilometers != null ? num(ar.squareKilometers) + ' km² · ' + num(ar.squareMiles) + ' mi²' : null),
            fact('Coordinates', i.coordinates ? i.coordinates.latitude + ', ' + i.coordinates.longitude : null), fact('Landlocked', typeof i.landlocked === 'boolean' ? (i.landlocked ? 'Yes' : 'No') : null),
            fact('Native languages', (lang.native || []).map(cap).join(', ')), fact('Language codes', (lang.codes || []).join(', ')), fact('Famous for', i.famousFor),
            fact('Government', cap(i.constitutionalForm)), fact('Currency', [i.currency && cap(i.currency), c.cur.length ? '(' + c.cur.map(x => x.code + (x.symbol ? ' ' + x.symbol : '')).join(', ') + ')' : ''].filter(Boolean).join(' ')),
            fact('Driving side', cap(i.drivingSide)), fact('Internet TLD', i.internetTLD), fact('ISO numeric', iso.numeric), fact('ISO alpha-2', iso.alpha2 && iso.alpha2.toUpperCase()), fact('ISO alpha-3', iso.alpha3 && iso.alpha3.toUpperCase())),
          map ? h('p', null, h('a', { href: map, target: '_blank', rel: 'noopener noreferrer' }, 'Open in Google Maps ↗')) : null,
          i.neighbors && i.neighbors.length ? h('div', null, h('h3', null, 'Neighbors'), h('div', { class: 'chips' }, i.neighbors.map(n => { const d = S.dir.find(x => x.name.toLowerCase() === String(n.name).toLowerCase()); return d ? h('a', { class: 'chip', href: '#/country/' + d.cca2 }, flagImg(n.flag), n.name) : h('span', { class: 'chip' }, flagImg(n.flag), n.name); }))) : null);
      }).catch(e => box.replaceChildren(h('p', { class: 'err' }, 'Country details unavailable: ' + errMsg(e)), h('div', { class: 'facts' }, fact('Capital', c.capital), fact('Region', c.region), fact('Population', c.pop ? num(c.pop) : null), fact('Currency codes', c.cur.map(x => x.code).join(', '))), h('button', { class: 'btn ghost', onclick: () => render() }, 'Try again')));
      return box;
    },
    weather() { const box = h('div', { class: 'grid g2' }); placeP.then(p => box.append(weatherPanel(p.lat, p.lon, false, p.exact ? p.name : 'near the country’s center'), timeCard(p.lat, p.lon, c.tz))); return box; },
    currency() { return h('div', null, converter(c.cur[0] && c.cur[0].code, 'USD'), c.cur.length ? h('p', { class: 'mut' }, c.cur.map(x => x.name + ' (' + x.code + (x.symbol ? ', ' + x.symbol : '') + ')').join(' · ')) : h('p', { class: 'mut' }, 'No currency listed.')); },
    map() { const box = h('div'); Promise.all([placeP, infoP.catch(() => null)]).then(([p, i]) => box.append(mapPanel(countryMarkers(c, p, i)))); return box; }
  };
  const tabs = [['overview', 'Overview'], ['weather', 'Weather & time'], ['currency', 'Currency'], ['map', 'Map']];
  const show = t => { tabs.forEach(([k]) => { tabBtns[k].classList.toggle('on', k === t); if (panels[k]) panels[k].hidden = k !== t; }); if (!panels[t]) { panels[t] = makers[t](); body.append(panels[t]); } if (t === 'map') setTimeout(() => window.dispatchEvent(new Event('resize')), 50); };
  tabs.forEach(([k, t]) => tabBtns[k] = h('button', { class: 'chip', onclick: () => show(k) }, t));
  const root = h('div', { class: 'page' }, head, h('div', { class: 'tabs' }, Object.values(tabBtns)), body); show('overview'); return root;
}
function countryMarkers(c, p, i) {
  const m = [];
  if (p.exact) m.push({ lat: p.lat, lon: p.lon, title: p.name + ' (capital)', flag: c.flag });
  const co = i && i.coordinates ? [i.coordinates.latitude, i.coordinates.longitude] : c.ll;
  m.push({ lat: co[0], lon: co[1], title: c.name, flag: c.flag, note: 'Country center' });
  ((i && i.neighbors) || []).forEach(n => { if (n.coordinates) m.push({ lat: n.coordinates.latitude, lon: n.coordinates.longitude, title: n.name, flag: n.flag, note: 'Neighbor' }); });
  return m;
}
async function weatherPage(r) {
  const c = S.byCode[(r.arg || '').toUpperCase()] || S.byCode[defaultCode()]; S.sel = c.cca2; store.set('sel', c.cca2);
  const p = await place(c);
  return h('div', { class: 'page' }, pageHead('Weather', c, 'weather'), h('div', { class: 'grid g2' }, weatherPanel(p.lat, p.lon, false, p.exact ? p.name : 'near the country’s center'), timeCard(p.lat, p.lon, c.tz)));
}
function currencyPage(r) {
  const c = S.byCode[(r.arg || '').toUpperCase()] || S.byCode[defaultCode()];
  return h('div', { class: 'page' }, pageHead('Currency', c, 'currency'), h('p', { class: 'mut' }, 'Rates from Frankfurter (daily reference rates). Pick a country to start from its currency.'), converter(c.cur[0] && c.cur[0].code, 'USD'));
}
async function mapPage(r) {
  const c = S.byCode[(r.arg || '').toUpperCase()] || S.byCode[defaultCode()];
  const [p, i] = await Promise.all([place(c), getInfo(c.name).catch(() => null)]);
  const gm = i && safeUrl(i.googleMapsLink);
  return h('div', { class: 'page' }, pageHead('Map', c, 'map'), mapPanel(countryMarkers(c, p, i)), gm ? h('p', null, h('a', { href: gm, target: '_blank', rel: 'noopener noreferrer' }, 'Open in Google Maps ↗')) : null);
}
function comparePage() {
  const root = h('div', { class: 'page' }), cols = S.cmp.map(x => S.byCode[x]).filter(Boolean);
  const save = () => { store.set('cmp', S.cmp); render(); };
  root.append(h('div', { class: 'phead' }, h('h1', null, 'Compare countries'), h('div', { style: 'flex:1;max-width:420px' }, searchBox(c => { if (!S.cmp.includes(c.cca2) && S.cmp.length < 4) S.cmp.push(c.cca2); save(); }))));
  if (cols.length < 2) { root.append(h('p', { class: 'mut' }, 'Search above to add at least two countries (up to four).')); }
  if (!cols.length) return root;
  const T = h('table', { class: 'cmp' }), rows = [];
  T.append(h('tr', null, h('th'), cols.map(c => h('th', null, flagImg(c.flag), c.name, h('div', null, h('button', { class: 'chip', style: 'min-height:32px;padding:2px 10px', onclick: () => { S.cmp = S.cmp.filter(x => x !== c.cca2); save(); } }, 'Remove'))))));
  const defs = [['Capital', (c, i) => i.capital || c.capital], ['Population', c => c.pop ? num(c.pop) : null], ['Area (km²)', (c, i) => i.area && num(i.area.squareKilometers)],
    ['Continent', (c, i) => i.continent ? i.continent.emoji + ' ' + i.continent.name : c.region], ['Languages', (c, i) => i.languages && (i.languages.native || []).map(cap).join(', ')],
    ['Currency', (c, i) => [i.currency && cap(i.currency), c.cur.map(x => x.code).join('/')].filter(Boolean).join(' · ')], ['Phone code', (c, i) => i.phoneCode],
    ['Driving side', (c, i) => cap(i.drivingSide)], ['Landlocked', (c, i) => typeof i.landlocked === 'boolean' ? (i.landlocked ? 'Yes' : 'No') : null]];
  defs.forEach(([k]) => { const tds = cols.map(() => h('td', null, '…')); rows.push(tds); T.append(h('tr', null, h('th', null, k), tds)); });
  const wTd = cols.map(() => h('td', null, '…')), tTd = cols.map(() => h('td', null, '…'));
  T.append(h('tr', null, h('th', null, 'Weather now'), wTd), h('tr', null, h('th', null, 'Local time'), tTd));
  Promise.allSettled(cols.map(c => getInfo(c.name))).then(res => {
    defs.forEach(([, f], ri) => { const vals = cols.map((c, ci) => { const i = res[ci].status === 'fulfilled' ? res[ci].value : {}; let v; try { v = f(c, i); } catch (e) {} return v || null; }); vals.forEach((v, ci) => rows[ri][ci].textContent = v || '—'); if (new Set(vals.map(v => v || '—')).size > 1) rows[ri].forEach(td => td.classList.add('diff')); });
  });
  cols.forEach((c, ci) => place(c).then(p => getWx(p.lat, p.lon).then(j => { const [t, ic] = wxInfo(j.current.weather_code, j.current.is_day); wTd[ci].textContent = ic + ' ' + Math.round(j.current.temperature_2m) + (S.set.unit === 'f' ? '°F' : '°C') + ' ' + t; tTd[ci].setAttribute('data-tz', j.timezone); tTd[ci].textContent = fmtTime(j.timezone); })).catch(() => { wTd[ci].textContent = 'Unavailable'; tTd[ci].textContent = 'Unavailable'; }));
  root.append(h('div', { class: 'card tw' }, T), h('p', { class: 'mut', style: 'font-size:.8rem' }, 'Highlighted rows differ between countries. Weather and time are for each capital when it can be located.'));
  return root;
}
function favoritesPage() {
  const clr = (k, v) => h('button', { class: 'btn ghost', onclick: () => { S[k] = []; store.set(k, []); render(); } }, 'Clear ' + v);
  const list = a => a.map(c => S.byCode[c]).filter(Boolean);
  return h('div', { class: 'page' }, h('h1', null, 'Favorites'), cardGrid(list(S.fav)), S.fav.length ? clr('fav', 'favorites') : h('p', { class: 'mut' }, 'Tap ☆ on any country to save it here.'),
    h('h2', null, 'Recently viewed'), cardGrid(list(S.recent)), S.recent.length ? clr('recent', 'history') : null);
}
let installEvt = null;
function settingsPage() {
  const unit = h('select', { 'aria-label': 'Temperature unit', onchange: e => { S.set.unit = e.target.value; saveSet(); } }, [['c', 'Celsius (°C)'], ['f', 'Fahrenheit (°F)']].map(([v, t]) => h('option', { value: v, selected: S.set.unit === v }, t)));
  const fx = h('input', { type: 'checkbox', checked: S.set.fx, onchange: e => { S.set.fx = e.target.checked; saveSet(); document.body.classList.toggle('nofx', !S.set.fx); } });
  return h('div', { class: 'page' }, h('h1', null, 'Settings'), h('div', { class: 'card grid' },
    h('label', null, 'Temperature unit ', unit), h('label', { style: 'display:flex;gap:10px;align-items:center' }, fx, '3D effects (globe and star field)'),
    REDUCED ? h('p', { class: 'mut' }, 'Your device prefers reduced motion, so auto-rotation is off.') : null,
    h('div', { class: 'row', style: 'margin:0' }, installEvt ? h('button', { class: 'btn', onclick: async () => { installEvt.prompt(); installEvt = null; render(); } }, 'Install app') : null,
      h('button', { class: 'btn ghost', onclick: async () => { Object.keys(localStorage).filter(k => k.startsWith('ws_ci_') || k === 'ws_dir').forEach(k => localStorage.removeItem(k)); try { for (const k of await caches.keys()) await caches.delete(k); } catch (e) {} alert('Saved data cleared.'); } }, 'Clear saved country data'))),
    h('p', { class: 'mut' }, 'Settings and favorites are stored only on this device. No account, no tracking.'));
}
const aboutPage = () => h('div', { class: 'page' }, h('h1', null, 'About WorldScope'), h('div', { class: 'card' },
  h('p', null, 'WorldScope — Explore Every Country. Built by Lord Denish (GitHub: Ryukazi).'),
  h('h3', null, 'Data sources'), h('ul', null, [['Country details', 'Country Info API (api.siputzx.my.id)'], ['Country directory, flags, currency codes', 'REST Countries'], ['Weather, forecast, time zones, capital lookup', 'Open-Meteo'], ['Exchange rates', 'Frankfurter'], ['Maps', 'Leaflet · © OpenStreetMap contributors'], ['3D Earth', 'Three.js with three.js example textures']].map(([a, b]) => h('li', null, a + ': ' + b))),
  h('p', { class: 'mut' }, 'Nothing is invented: when a source has no value, the field is hidden or marked unavailable.')));

/* ---------- shell + router ---------- */
const LOGO = '<svg viewBox="0 0 64 64"><defs><radialGradient id="lg" cx="35%" cy="30%"><stop offset="0" stop-color="#00C8FF"/><stop offset="1" stop-color="#0b3d8a"/></radialGradient></defs><circle cx="32" cy="32" r="21" fill="url(#lg)"/><g fill="none" stroke="#020817" stroke-opacity=".55" stroke-width="1.6"><ellipse cx="32" cy="32" rx="9" ry="21"/><path d="M11 32h42M14 22h36M14 42h36"/></g><circle cx="32" cy="32" r="25" fill="none" stroke="#00C8FF" stroke-opacity=".5"/></svg>';
const brand = () => { const l = h('span', { class: 'logo' }); l.innerHTML = LOGO; return h('a', { class: 'brand', href: '#/' }, l, h('span', null, 'WorldScope', h('small', null, 'Explore Every Country'))); };
const NAV = [['', 'Home', '⌂'], ['explore', 'Explore', '◎'], ['weather', 'Weather', '☁'], ['currency', 'Currency', '¤'], ['compare', 'Compare', '⇄'], ['favorites', 'Favorites', '★'], ['map', 'Map', '⌖'], ['settings', 'Settings', '⚙'], ['about', 'About', 'ⓘ']];
const routes = { '': home, explore, country, weather: weatherPage, currency: currencyPage, compare: comparePage, favorites: favoritesPage, map: mapPage, settings: settingsPage, about: aboutPage };
function buildShell() {
  const link = ([k, t, i]) => h('a', { href: '#/' + k, 'data-nav': k }, h('span', null, i), h('span', null, t));
  const moreMenu = h('div', { class: 'more nav', hidden: true }, NAV.filter(n => ['currency', 'compare', 'map', 'settings', 'about'].includes(n[0])).map(link));
  moreMenu.addEventListener('click', () => moreMenu.hidden = true);
  const bn = ['', 'explore', 'weather', 'favorites'].map(k => NAV.find(n => n[0] === k)).map(([k, t, i]) => h('a', { href: '#/' + k, 'data-nav': k }, h('span', null, i), t));
  const main = h('main', { class: 'main' }, h('div', { class: 'top' }, brand(), h('div', { class: 'hsearch' }, searchBox(c => { location.hash = '#/country/' + c.cca2; })), h('button', { class: 'btn ghost sbtn', 'aria-label': 'Search', onclick: openSearchOverlay }, '🔍'), h('span', { id: 'inst' })), h('div', { id: 'view' }));
  $('#app').replaceChildren(h('div', { class: 'shell' }, h('aside', { class: 'side' }, brand(), h('nav', { class: 'nav' }, NAV.slice(0, 8).map(link)), h('div', { class: 'foot' }, h('a', { href: '#/about' }, 'About'), h('p', null, 'by Lord Denish · Ryukazi'))), main),
    h('nav', { class: 'bnav' }, bn, h('button', { 'aria-label': 'More', onclick: () => moreMenu.hidden = !moreMenu.hidden }, h('span', null, '☰'), 'More')), moreMenu);
}
const parse = () => { const [p, q] = (location.hash.slice(1) || '/').split('?'), s = p.split('/').filter(Boolean); return { name: s[0] || '', arg: s[1] ? decodeURIComponent(s[1]) : '', q: new URLSearchParams(q || '') }; };
async function render() {
  const id = ++navId; cleanups.forEach(f => { try { f(); } catch (e) {} }); cleanups = [];
  const r = parse(), view = $('#view'), key = r.name === 'country' ? 'explore' : r.name;
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === key));
  view.replaceChildren(h('p', { class: 'mut' }, 'Loading…'));
  try { const el = await (routes[r.name] || home)(r); if (id !== navId) return; view.replaceChildren(el); scrollTo(0, 0); }
  catch (e) { if (id !== navId) return; view.replaceChildren(h('div', { class: 'card' }, h('h2', null, 'Something went wrong'), h('p', { class: 'err' }, errMsg(e)), h('a', { class: 'btn', href: '#/explore', style: 'display:inline-flex;align-items:center' }, 'Browse countries'))); }
  const sp = $('#splash'); if (sp) { sp.classList.add('out'); setTimeout(() => sp.remove(), 450); }
}
async function start() {
  document.body.classList.toggle('nofx', !S.set.fx);
  buildShell();
  try { await loadDir(); } catch (e) {
    $('#view').replaceChildren(h('div', { class: 'card' }, h('h2', null, 'Country list unavailable'), h('p', { class: 'err' }, errMsg(e)), h('button', { class: 'btn', onclick: () => location.reload() }, 'Retry')));
    const sp = $('#splash'); if (sp) sp.remove(); return;
  }
  addEventListener('hashchange', render); render();
}
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; const s = $('#inst'); if (s) s.replaceChildren(h('button', { class: 'btn ghost', onclick: () => { e.prompt(); installEvt = null; s.replaceChildren(); } }, 'Install')); });
const net = () => { $('#offline').hidden = navigator.onLine; }; addEventListener('online', net); addEventListener('offline', net); net();
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('/service-worker.js').catch(() => {}));
start();
})();
