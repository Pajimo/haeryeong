# Haeryeong head generator — run headless:
#   Blender -b --python charpipe/make_heads.py -- <out.glb> [faces_per_variant]
# Builds MakeHuman (MPFB2, CC0 assets) heads for every sex × age, each with several baked face shapes,
# plus fitted eyes, eyebrows and eyelashes. Cuts each head off at the neck and exports one GLB.
# Node names: head_<sex>_<age>_<n> with children ..._eyes, ..._brows, ..._lashes.
import bpy, sys, os, random, addon_utils, json, math
addon_utils.enable('bl_ext.user_default.mpfb', default_set=True, persistent=True)
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.targetservice import TargetService
from bl_ext.user_default.mpfb.services.locationservice import LocationService

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/heads.glb'
NFACES = int(args[1]) if len(args) > 1 else 6
DATA = LocationService.get_user_data()
AGES = {'child': 0.2, 'young': 0.45, 'adult': 0.62, 'elder': 0.9}
BROWS_M = ['eyebrow001', 'eyebrow003', 'eyebrow005', 'eyebrow007', 'eyebrow009', 'eyebrow011']
BROWS_F = ['eyebrow002', 'eyebrow004', 'eyebrow006', 'eyebrow008', 'eyebrow010', 'eyebrow012']
# a gentle stylisation for appeal (slightly larger eyes, softer jaw), then per-face variety
STYLE = [('l-eye-scale-incr', 0.35), ('r-eye-scale-incr', 0.35), ('head-age-decr', 0.15)]
VARY = [
    (['head-oval', 'head-round', 'head-square', 'head-triangular', 'head-diamond', 'head-invertedtriangular'], 0.25, 0.7, 1),
    (['nose-scale-horiz-incr', 'nose-scale-horiz-decr'], 0.1, 0.5, 1),
    (['nose-scale-vert-incr', 'nose-scale-vert-decr'], 0.1, 0.5, 1),
    (['nose-hump-incr', 'nose-hump-decr'], 0.0, 0.5, 1),
    (['mouth-scale-horiz-incr', 'mouth-scale-horiz-decr'], 0.1, 0.5, 1),
    (['mouth-lowerlip-volume-incr', 'mouth-lowerlip-volume-decr'], 0.1, 0.6, 1),
    (['chin-width-incr', 'chin-width-decr'], 0.1, 0.6, 1),
    (['chin-prominent-incr', 'chin-prominent-decr'], 0.0, 0.5, 1),
    (['l-cheek-bones-incr', 'l-cheek-bones-decr'], 0.0, 0.6, 2),
    (['eyebrows-angle-up', 'eyebrows-angle-down'], 0.0, 0.5, 1),
    (['l-eye-epicanthus-in', 'l-eye-epicanthus-out'], 0.0, 0.5, 2),
]

def clear():
    # remove everything except finished variants (tagged with a 'variant' property)
    for o in list(bpy.data.objects):
        if o.get('variant') is None: bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.meshes):
        if m.users == 0: bpy.data.meshes.remove(m)

def tpath(name):
    try: return TargetService.target_full_path(name)
    except Exception: return None

def apply_targets(h, pairs):
    for name, w in pairs:
        p = tpath(name)
        if p: TargetService.load_target(h, p, weight=w)
        else: print('missing target', name)

def bake(obj):
    if obj.data.shape_keys:
        obj.shape_key_add(name='mix', from_mix=True)
        keys = obj.data.shape_keys.key_blocks
        mix = keys['mix'].data
        co = [v.co.copy() for v in mix]
        for k in list(keys): obj.shape_key_remove(k)
        for v, c in zip(obj.data.vertices, co): v.co = c

def group_center(obj, name):
    g = obj.vertex_groups.get(name)
    if not g: return None
    pts = [obj.matrix_world @ v.co for v in obj.data.vertices if any(e.group == g.index and e.weight > 0.5 for e in v.groups)]
    if not pts: return None
    n = len(pts); return sum((p for p in pts), pts[0] * 0) / n

def keep_head(h):
    """delete helpers and everything below the neck; returns cut height"""
    body = h.vertex_groups.get('body')
    neck = group_center(h, 'joint-neck'); head = group_center(h, 'joint-head')
    cut = neck.z + (head.z - neck.z) * 0.15
    import bmesh
    bm = bmesh.new(); bm.from_mesh(h.data); bm.verts.ensure_lookup_table()
    dl = bm.verts.layers.deform.active
    kill = []
    for v in bm.verts:
        inbody = dl is not None and body.index in v[dl] and v[dl][body.index] > 0.5
        if not inbody or (h.matrix_world @ v.co).z < cut: kill.append(v)
    bmesh.ops.delete(bm, geom=kill, context='VERTS'); bm.to_mesh(h.data); bm.free()
    for m in list(h.modifiers): h.modifiers.remove(m)
    return cut, head, group_center

meta = {'variants': {}}
rng = random.Random(1337)
QUICK = len(args) > 2 and args[2] == 'quick'
for sex in (['m'] if QUICK else ['m', 'f']):
    for age, aval in (list(AGES.items())[2:3] if QUICK else AGES.items()):
        for n in range(NFACES):
            clear()
            macro = TargetService.get_default_macro_info_dict()
            macro.update({'gender': 1.0 if sex == 'm' else 0.0, 'age': aval, 'muscle': 0.5, 'weight': 0.45 + rng.random() * 0.15, 'proportions': 0.6})
            macro['race'] = {'asian': 0.92, 'caucasian': 0.08, 'african': 0.0}
            h = HumanService.create_human(macro_detail_dict=macro)
            pairs = list(STYLE)
            for names, lo, hi, sym in VARY:
                if rng.random() < 0.25: continue
                nm = rng.choice(names); w = round(lo + rng.random() * (hi - lo), 3)
                pairs.append((nm, w))
                if sym == 2: pairs.append((nm.replace('l-', 'r-', 1), w))
            apply_targets(h, pairs)
            bake(h)
            # proxies fitted to the final shape
            def add(path, kind):
                try: return HumanService.add_mhclo_asset(os.path.join(DATA, path), h, asset_type=kind, subdiv_levels=0)
                except TypeError: return HumanService.add_mhclo_asset(os.path.join(DATA, path), h, asset_type=kind)
            eyes = add('eyes/low-poly/low-poly.mhclo', 'Eyes')
            bname = rng.choice(BROWS_M if sex == 'm' else BROWS_F)
            brows = add(f'eyebrows/{bname}/{bname}.mhclo', 'Eyebrows')
            lashes = add('eyelashes/eyelashes01/eyelashes01.mhclo', 'Eyelashes')
            le, re = group_center(h, 'joint-l-eye'), group_center(h, 'joint-r-eye')
            cut, headj, _ = keep_head(h)
            key = f'head_{sex}_{age}_{n}'
            h.name = key; h.data.name = key
            for o, suf in ((eyes, 'eyes'), (brows, 'brows'), (lashes, 'lashes')):
                if not o: continue
                for m in list(o.modifiers):
                    try:
                        bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier=m.name)
                    except Exception: o.modifiers.remove(m)
                o.parent = None; o.name = f'{key}_{suf}'; o.data.name = o.name
                if o.data.shape_keys: bake(o)
            # bring everything into one place so variants don't overlap in the file, keep transforms identity
            meta['variants'][key] = {'sex': sex, 'age': age, 'brows': bname, 'eyeL': list(le), 'eyeR': list(re), 'headJoint': list(headj), 'cut': cut, 'verts': len(h.data.vertices)}
            # stash this variant into a collection that survives clear()
            col = bpy.data.collections.get('KEEP') or bpy.data.collections.new('KEEP')
            if col.name not in bpy.context.scene.collection.children: bpy.context.scene.collection.children.link(col)
            for o in [h, eyes, brows, lashes]:
                if not o: continue
                for c in list(o.users_collection): c.objects.unlink(o)
                col.objects.link(o)
                o['variant'] = key
            print('built', key, len(h.data.vertices), 'verts', pairs)

# export
for o in bpy.data.objects: o.select_set(o.get('variant') is not None)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True, export_texcoords=True, export_normals=True,
                          export_materials='NONE', export_morph=False, export_skins=False, export_animations=False, export_yup=True)
json.dump(meta, open(OUT.replace('.glb', '.json'), 'w'), indent=1, default=list)
print('EXPORTED', OUT, len(meta['variants']), 'variants')
