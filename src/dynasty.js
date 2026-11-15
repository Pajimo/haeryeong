// Dynasty book (족보): a permanent record of everyone in your bloodline and those who married in,
// with small portraits, dates, titles and how each life ended — drawn as a family tree.
export function createDynastySystem(G) {
  const rec = new Map(); // id -> record
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function thumb(s) {
    try {
      const url = G.ui.portraits.get(s); const img = new Image(); img.src = url;
      const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
      return new Promise((res) => { img.onload = () => { x.drawImage(img, 0, 0, 64, 64); res(c.toDataURL('image/webp', 0.8)); }; img.onerror = () => res(null); });
    } catch { return Promise.resolve(null); }
  }
  function note(s, extra = {}) {
    if (!s) return null;
    let r = rec.get(s.id);
    if (!r) { r = { id: s.id, born: Math.max(1, Math.round(G.env.day - (s.ageDays || 0))), gen: s.generation || 1, blood: !!s.household && !extra.married }; rec.set(s.id, r); }
    Object.assign(r, { name: s.name.full, ko: s.name.hangul, given: s.name.given, sex: s.sex, title: s.title, parents: (s.parents || []).map((p) => p.id), spouse: s.spouse?.id ?? r.spouse ?? null, age: s.age }, extra);
    if (!r.face && !s.dead) thumb(s).then((u) => { if (u) r.face = u; });
    for (const p of s.parents || []) if (rec.has(p.id) || p.household) note(p); // keep the parents' cards too
    return r;
  }
  const S = {
    id: 'dynasty', rec,
    init() { G.ui?.addTopButton('🌳 Family', 'Dynasty book: your family tree', () => this.open()); },
    update() { if (!this.seeded && G.started) { this.seeded = true; setTimeout(() => { for (const s of G.household) note(s); }, 1500); } },
    onEvent(name, p) {
      if (!G.started) return;
      if (name === 'birth' && (p.mother?.household || p.father?.household)) { note(p.child); if (p.mother) note(p.mother); if (p.father) note(p.father); }
      if (name === 'wedding') for (const [a, b] of [[p.a, p.b], [p.b, p.a]]) if (a.household || rec.has(a.id)) { note(a); note(b, { married: true }); }
      if (name === 'cameOfAge' && rec.has(p.sim.id)) note(p.sim);
      if (name === 'crowned' && rec.has(p.sim.id)) note(p.sim, { crowned: G.env.day });
      if (name === 'death' && rec.has(p.sim.id)) {
        const s = p.sim, k = p.killer;
        note(s, { died: G.env.day, cause: s.naturalDeath ? 'old age' : k ? `slain by ${k.name.full}` : 'illness or misfortune' });
      }
      if (name === 'day') for (const s of G.household) if (!s.dead) note(s);
    },
    open() {
      for (const s of G.household) if (!s.dead) note(s);
      const all = [...rec.values()];
      const byId = (id) => rec.get(id);
      const kids = (r) => all.filter((c) => c.parents.includes(r.id)).sort((a, b) => a.born - b.born);
      const roots = all.filter((r) => !r.parents.some((id) => rec.has(id)) && !(r.spouse != null && rec.has(r.spouse) && byId(r.spouse).parents.some((id) => rec.has(id))));
      const seen = new Set();
      const card = (r) => r ? `<div class="dy-card ${r.died ? 'dead' : ''} ${r.blood ? 'blood' : ''}" title="${esc(r.name)}${r.cause ? ' — ' + esc(r.cause) : ''}">
          ${r.face ? `<img src="${r.face}">` : `<div class="dy-ph">${r.sex === 'f' ? '♀' : '♂'}</div>`}
          <b>${esc(r.given)}</b><span class="ko">${esc(r.ko)}</span>
          <small>${esc(r.title || '')}${r.crowned ? ' · 👑' : ''}</small>
          <small>Day ${r.born}${r.died ? ` – ${r.died} †` : ''}</small></div>` : '';
      const node = (r) => {
        if (!r || seen.has(r.id)) return ''; seen.add(r.id);
        const sp = r.spouse != null ? byId(r.spouse) : null; if (sp) seen.add(sp.id);
        const ch = [...new Set([...kids(r), ...(sp ? kids(sp) : [])])];
        return `<li><div class="dy-couple">${card(r)}${sp ? `<span class="dy-knot">❦</span>${card(sp)}` : ''}</div>${ch.length ? `<ul>${ch.map(node).join('')}</ul>` : ''}</li>`;
      };
      const tree = roots.sort((a, b) => b.blood - a.blood || a.born - b.born).map(node).join('');
      const living = all.filter((r) => !r.died).length, gens = Math.max(1, ...all.map((r) => r.gen || 1));
      const sur = G.household[0]?.name.surname || all.find((r) => r.blood)?.name.split(' ')[0] || '';
      G.ui.modal(`<h2>The ${esc(sur)} Family Book · 족보</h2>
        <p class="dy-sub">${all.length} names across ${gens} generation${gens > 1 ? 's' : ''} · ${living} living. Gold borders mark the bloodline; grey cards have passed on.</p>
        <div class="dy-tree"><ul>${tree || '<li>The book is still blank.</li>'}</ul></div>`);
    },
    serialize() { return [...rec.values()]; },
    restore(d) { for (const r of d || []) rec.set(r.id, r); },
  };
  return S;
}
