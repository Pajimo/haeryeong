// Prepares downloaded animal GLBs: dedupes the Blender-exported duplicate clips,
// strips "Armature|" prefixes, drops unused clips, prunes. Meshopt is applied afterwards by the CLI.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, resample } from '@gltf-transform/functions';
const KEEP = new Set(['Idle', 'Idle_2', 'Idle_Headlow', 'Idle_2_HeadLow', 'Walk', 'Gallop', 'Run', 'Eating', 'Idle_Eating', 'Idle_Peck', 'Death', 'Attack', 'Attack_Headbutt', 'Headbutt', 'Bite_Front', 'Attack_Kick']);
const [, , inp, out] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inp);
const seen = new Set();
for (const a of doc.getRoot().listAnimations()) {
  const n = a.getName().split('|').pop();
  if (!KEEP.has(n) || seen.has(n)) { a.dispose(); continue; }
  seen.add(n); a.setName(n);
}
await doc.transform(resample(), prune(), dedup());
await io.write(out, doc);
console.log(out, [...seen].join(','));
