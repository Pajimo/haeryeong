// Warms the character mesh cache before villagers are spawned:
// first from IndexedDB (instant on repeat visits), then in parallel Web Workers for anything missing.
import { allGeoJobs, geoKey, hasGeo, seedGeo, packGeo, unpackGeo, GEO_VERSION } from './charbody.js';

const DB = 'haeryeong-geo', STORE = 'geo';
function openDB() {
  return new Promise((res) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result); r.onerror = () => res(null); r.onblocked = () => res(null);
    } catch { res(null); }
  });
}
const idbGet = (db, k) => new Promise((res) => { try { const q = db.transaction(STORE).objectStore(STORE).get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); } catch { res(null); } });
const idbPut = (db, k, v) => { try { db.transaction(STORE, 'readwrite').objectStore(STORE).put(v, k); } catch { /* quota or private mode: fine */ } };

export async function warmGeometry(onProgress = () => {}) {
  const jobs = allGeoJobs().filter(([fn, a]) => !hasGeo(fn, a));
  const total = jobs.length; let done = 0;
  const tick = () => onProgress(++done / total);
  const db = await openDB();
  const key = (fn, a) => `v${GEO_VERSION}|${fn}|${geoKey(fn, a)}`;
  const missing = [];
  if (db) {
    const got = await Promise.all(jobs.map(([fn, a]) => idbGet(db, key(fn, a))));
    jobs.forEach(([fn, a], i) => { if (got[i]) { seedGeo(fn, a, unpackGeo(got[i])); tick(); } else missing.push([fn, a]); });
  } else missing.push(...jobs);
  if (!missing.length) return { cached: total, built: 0 };
  // biggest jobs first so the pool stays busy
  const cost = ([fn, a]) => (a[a.length - 1] ? 0.1 : 1) * ({ body: 4, head: 2.5, hair: 1.5, hand: 0.6 }[fn]);
  missing.sort((x, y) => cost(y) - cost(x));
  let pool = [];
  try {
    const n = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
    for (let i = 0; i < n; i++) pool.push(new Worker(new URL('./charworker.js', import.meta.url), { type: 'module' }));
  } catch { pool = []; }
  if (!pool.length) return { cached: total - missing.length, built: 0 }; // meshes will be built lazily on the main thread
  let next = 0, nid = 0;
  await new Promise((resolveAll) => {
    let pending = 0;
    const feed = (w) => {
      if (next >= missing.length) { if (!pending) resolveAll(); return; }
      const [fn, a] = missing[next++]; const id = nid++; pending++;
      w.onmessage = (e) => {
        pending--;
        if (e.data.d) { seedGeo(fn, a, unpackGeo(e.data.d)); if (db) idbPut(db, key(fn, a), e.data.d); }
        tick(); feed(w);
      };
      w.onerror = () => { pending--; tick(); feed(w); };
      w.postMessage({ id, fn, args: a });
    };
    pool.forEach(feed);
  });
  pool.forEach((w) => w.terminate());
  return { cached: total - missing.length, built: missing.length };
}
