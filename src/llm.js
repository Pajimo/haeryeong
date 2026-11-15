import Anthropic from '@anthropic-ai/sdk';
import { memoryPrompt } from './memories.js';

// Optional Claude-powered dialogue & annals. Uses the player's own API key, stored only in this browser.
const SYSTEM = `You voice characters in "Haeryeong", a living simulation of an original kingdom inspired by Korea's Joseon and Three Kingdoms eras (hanbok, gat hats, jumak taverns, swordsmen, bandits in the western woods).
Stay fully in character. Speak naturally, warmly or sharply as the personality dictates, in 1-3 short sentences, in English with an occasional Korean word (romanized, meaning clear from context).
Never mention being an AI or a game. Never use modern concepts.
Always answer with ONLY a JSON object: {"reply": "<what the character says, may include an action in *asterisks*>", "attitude": <integer -10..10, how this exchange changes their feelings toward the speaker>}`;

export class AIBrain {
  constructor() {
    this.key = safeGet('hr_api_key') || '';
    // Haiku is fast and inexpensive — plenty for short in-character replies. Older saves that
    // defaulted to Opus are moved over; anyone can still type another model in Settings.
    let m = safeGet('hr_model'); if (!m || m === 'claude-opus-5-5') { m = 'claude-haiku-5-5'; safeSet('hr_model', m); }
    this.model = m;
    this.client = null;
  }
  get enabled() { return !!this.key; }
  setKey(k, model) {
    this.key = (k || '').trim(); this.model = (model || '').trim() || 'claude-haiku-5-5';
    safeSet('hr_api_key', this.key); safeSet('hr_model', this.model); this.client = null;
  }
  getClient() {
    if (!this.client) this.client = new Anthropic({ apiKey: this.key, dangerouslyAllowBrowser: true });
    return this.client;
  }

  describe(s, G) {
    const needs = Object.entries(s.needs).map(([k, v]) => `${k} ${Math.round(v)}/100`).join(', ');
    const moodlets = s.moodlets.map((m) => m.label).join('; ') || 'none';
    return `${s.name.full} (${s.name.hangul}), ${s.sex === 'f' ? 'woman' : 'man'}, ${s.age}, ${s.title}. Traits: ${s.traits.join(', ')}. Mood: ${s.moodLabel[0]}. Needs: ${needs}. Recent feelings: ${moodlets}. Coins: ${Math.round(s.coins)} nyang.${s.spouse ? ' Married to ' + s.spouse.name.full + '.' : ''}${s.champion ? ' Tournament champion.' : ''}${s.outlaw ? ' Currently wanted by the guards.' : ''}`;
  }

  async converse(G, me, npc, history, playerLine) {
    const rel = npc.getRel(me);
    const recent = G.chronicle.slice(0, 6).map((c) => `- Day ${c.day} ${c.time}: ${c.text}`).join('\n');
    const ctx = `You are ${this.describe(npc, G)}
You are speaking with ${me.name.full}, a ${me.title.toLowerCase()} whom you regard as: ${npc.relLabel(me)[0]} (friendship ${Math.round(rel.f)}/100${rel.r > 10 ? ', romance ' + Math.round(rel.r) + '/100' : ''}).
It is day ${G.env.day} (${G.env.season || 'autumn'}), ${G.env.timeLabel}, weather: ${G.env.weather}. You are currently: ${npc.currentLabel}.
${memoryPrompt(npc, me)}
Recent events in the village:
${recent || '- nothing notable'}`;
    const messages = [{ role: 'user', content: ctx + '\n\nConversation so far:\n' + (history.map((h) => `${h.who}: ${h.text}`).join('\n') || '(just started)') + `\n\n${me.name.given} says: "${playerLine}"\n\nRespond as ${npc.name.given}.` }];
    const res = await this.getClient().messages.create({
      model: this.model, max_tokens: 2000, system: SYSTEM, messages,
      output_config: { effort: 'low' },
    });
    if (res.stop_reason === 'refusal') return { reply: '*looks away and says nothing*', attitude: 0 };
    const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    return parseJSON(text);
  }

  async annals(G) {
    const today = G.chronicle.slice(0, 25).reverse().map((c) => `Day ${c.day} ${c.time}: ${c.text}`).join('\n');
    const res = await this.getClient().messages.create({
      model: this.model, max_tokens: 3000,
      system: 'You are the royal historian of Haeryeong, an original Joseon-inspired kingdom. Write in the style of an old court annal: dignified, vivid, lightly poetic. 120 words maximum. Plain text only.',
      messages: [{ role: 'user', content: `Write the annal entry summarizing these recent happenings:\n${today}` }],
      output_config: { effort: 'low' },
    });
    return res.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  }
}

function parseJSON(t) {
  try { const m = t.match(/\{[\s\S]*\}/); if (m) { const j = JSON.parse(m[0]); return { reply: String(j.reply || '…'), attitude: Math.max(-10, Math.min(10, Number(j.attitude) || 0)) }; } } catch (e) { /* fallthrough */ }
  return { reply: t.slice(0, 400), attitude: 0 };
}
function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }
