// Family Album: big life moments become short cinematics + snapshots in a scrapbook.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KEY = 'haeryeong_album';
export function createAlbumSystem(G) {
  const A = {
    id: 'album', items: [],
    init() {
      try { this.items = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { this.items = []; }
      G.ui?.addTopButton('📖 Album', 'Family album', () => this.open());
    },
    moment(sim, title, sub) {
      if (!sim || sim.dead && !title.includes('Farewell')) { /* deaths still captured below */ }
      G.cinematic?.(sim, title, sub);
      setTimeout(() => G.capture?.((url) => {
        this.items.unshift({ url, title, sub, day: G.env.day, season: G.seasons?.current.en, who: sim.name.full });
        this.items = this.items.slice(0, 24);
        try { localStorage.setItem(KEY, JSON.stringify(this.items)); } catch { this.items = this.items.slice(0, 12); try { localStorage.setItem(KEY, JSON.stringify(this.items)); } catch { /* full */ } }
      }), 1800);
    },
    onEvent(name, p) {
      const fam = (s) => s && (s.household || G.household?.includes(s));
      if (name === 'birth' && (fam(p.mother) || fam(p.father) || fam(p.child))) this.moment(p.mother, 'A NEW LIFE', `${p.child.name.full} (${p.child.name.hangul}) is born`);
      if (name === 'wedding' && (fam(p.a) || fam(p.b))) this.moment(p.a, 'A WEDDING', `${p.a.name.given} & ${p.b.name.given}`);
      if (name === 'crowned' && fam(p.sim)) this.moment(p.sim, 'LONG LIVE THE KING', p.sim.name.full);
      if (name === 'cameOfAge' && fam(p.sim)) this.moment(p.sim, p.age === 'elder' ? 'SILVER YEARS' : p.age === 'young' ? 'COMING OF AGE' : 'GROWING UP', p.sim.name.full);
      if (name === 'promoted' && fam(p.sim) && p.sim.factions?.[p.fid]?.rank >= 2) this.moment(p.sim, 'PROMOTED', `${p.sim.name.given} — ${p.title}`);
      if (name === 'death' && p.sim && G.household?.includes(p.sim)) this.moment(p.sim, 'FAREWELL', `${p.sim.name.full}, generation ${p.sim.generation}`);
      if (name === 'mission' && p.ok && p.fame >= 40) this.moment(p.sim, 'LEGEND GROWS', p.title);
    },
    open() {
      const el = G.ui.modal(`<h2>Family Album · 가족 앨범</h2>${this.items.length ? `<div class="album">${this.items.map((it, i) => `<figure><img src="${it.url}"><figcaption><b>${esc(it.title)}</b><span>${esc(it.sub || '')}</span><small>${esc(it.season || '')} · day ${it.day}</small></figcaption></figure>`).join('')}</div><button class="aclear">Clear album</button>` : '<p class="muted">Life’s great moments — births, weddings, coronations, farewells — will be kept here.</p>'}`);
      const c = el.querySelector('.aclear'); if (c) c.onclick = () => { this.items = []; try { localStorage.removeItem(KEY); } catch {} el.classList.add('hidden'); };
    },
  };
  return A;
}
