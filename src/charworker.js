// Builds sculpted character meshes off the main thread.
import { GEO_FNS, packGeo } from './charbody.js';

self.onmessage = (e) => {
  const { id, fn, args } = e.data;
  try {
    const g = GEO_FNS[fn](args);
    const { d, transfer } = packGeo(g);
    self.postMessage({ id, d }, transfer);
  } catch (err) { self.postMessage({ id, error: String(err) }); }
};
