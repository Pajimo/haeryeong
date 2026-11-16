// "Previously in Haeryeong" (지난 이야기): when a saved dynasty is continued, a short recap of where
// things stood — who is in the house and what they are reaching for, who sits on the throne, whether
// the realm is at war, and the last things that truly mattered in the chronicle.
import { ASPIRATIONS } from './aspirations.js';

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// what counts as "news" worth reminding a returning player of. Anything touching your own family
// outranks everything else; strangers' weddings are the valley's background hum, not news.
const WEIGHT = { death: 3, decree: 3, tournament: 2, danger: 2, love: 1, festival: 1, story: 1 };

function ago(ms) {
  if (!(ms > 0)) return '';
  const m = Math.round(ms / 60000), h = Math.round(m / 60), d = Math.round(h / 24);
  return d >= 2 ? `${d} days` : h >= 2 ? `${h} hours` : m >= 2 ? `${m} minutes` : 'a moment';
}

export function showRecap(G, savedAt) {
  const env = G.env; const se = G.seasons?.current;
  const year = Math.floor((env.day - 1 + (G.seasons?.offset || 0) * 4) / 16) + 1;
  const hh = G.household.filter((s) => !s.dead);
  if (!hh.length) return;
  const A = G.systems.find((x) => x.id === 'aspirations');
  const goal = (s) => { const r = A?.data?.[s.id]; const a = r?.asp && ASPIRATIONS[r.asp]; if (!a) return 'no life goal chosen'; const st = a.steps[r.step]; return `${a.icon} ${a.name}${st ? ` — next: ${st.t}` : ' — fulfilled'}`; };
  const fam = hh.map((s) => {
    const [mood, col] = s.moodLabel;
    return `<div class="rc-p"><b>${esc(s.name.full)}</b> <small>${esc(s.age)} · ${esc(s.title)}</small>
      <div><span style="color:${col}">● ${mood}</span> · ${Math.floor(s.coins)} nyang${s.spouse && !s.spouse.dead ? ` · wed to ${esc(s.spouse.name.given)}` : ''}${s.pregnant ? ' · expecting' : ''}</div>
      <div class="rc-g">${esc(goal(s))}</div></div>`;
  }).join('');

  const k = G.king && !G.king.dead ? G.king : null;
  const war = G.systems.find((x) => x.id === 'war')?.st?.war;
  const realm = [k ? `👑 ${esc(k.name.full)} reigns${hh.includes(k) ? ' — that is you' : ''}.` : '👑 The throne stands empty.',
    war ? `⚔ The realm is at war${war.realm ? ` with ${esc(war.realm)}` : ''}.` : '',
    G.royalMourning ? '⚫ The court is in mourning.' : ''].filter(Boolean).join(' ');

  const M = G.systems.find((x) => x.id === 'missions')?.active;
  const task = M ? `<p>📜 Unfinished business: <b>${esc(M.def.title)}</b>.</p>` : '';

  // the most significant recent entries, kept in the order they happened
  const names = G.household.map((s) => s.name.full);
  const mine = (t) => names.some((n) => t.includes(n)) || /\byour\b/i.test(t);
  const recent = G.chronicle.slice(0, 80).map((e, i) => ({ e, i, w: (WEIGHT[e.kind] || 0) + (mine(e.text) ? 4 : 0) }))
    .filter((x) => x.w >= 2).sort((a, b) => b.w - a.w || a.i - b.i).slice(0, 7).sort((a, b) => b.i - a.i);
  const news = recent.length ? `<ul class="rc-n">${recent.map(({ e }) => `<li><small>Day ${e.day}</small> ${esc(e.text)}</li>`).join('')}</ul>` : '<p class="muted">A quiet season — little of note was written.</p>';

  const away = ago(Date.now() - (savedAt || 0));
  const el = G.ui.modal(`<h2>Previously in Haeryeong · 지난 이야기</h2>
    <p class="rc-when">${se ? `${se.icon} ${se.en} ${se.ko}` : ''} · Day ${env.day} · Year ${year}${away ? ` <small>— you were away ${away}</small>` : ''}</p>
    <h3>The ${esc(hh[0].name.surname)} household</h3><div class="rc-fam">${fam}</div>
    <p>${realm}</p>${task}
    <h3>Lately in the valley</h3>${news}`);
  el.classList.add('recap');
  const btn = el.querySelector('.mclose'); if (btn) btn.textContent = 'Back to the valley · 계속';
}
