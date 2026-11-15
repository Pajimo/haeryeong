# Haeryeong body generator — run headless:
#   Blender -b --python charpipe/make_bodies.py -- <out.glb>
# Builds MakeHuman (MPFB2, CC0) bodies, poses them into the game's bind pose (arms hanging 0.32 rad out
# from vertical, legs 0.03 rad), merges MPFB's game_engine skin weights onto the game's 17-bone rig,
# and exports one GLB with a skinned mesh per variant: body_<sex>_<age>, plus joint positions in JSON.
import bpy, sys, os, json, math, addon_utils
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dress import dress, split_regions
from mathutils import Vector, Matrix
addon_utils.enable('bl_ext.user_default.mpfb', default_set=True, persistent=True)
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.targetservice import TargetService

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else '/tmp/bodies.glb'
ONLY = args[1].split(',') if len(args) > 1 else None
ARM_A, LEG_A = 0.32, 0.03
VARIANTS = {
    'm_adult': dict(gender=1.0, age=0.55, weight=0.5, muscle=0.55),
    'f_adult': dict(gender=0.0, age=0.5, weight=0.5, muscle=0.45),
    'm_elder': dict(gender=1.0, age=0.9, weight=0.45, muscle=0.4),
    'f_elder': dict(gender=0.0, age=0.9, weight=0.5, muscle=0.35),
    'm_child': dict(gender=1.0, age=0.2, weight=0.5, muscle=0.5),
    'f_child': dict(gender=0.0, age=0.2, weight=0.5, muscle=0.5),
}
# MPFB game_engine bone -> game bone
MAP = {'Root': 'hips', 'pelvis': 'hips', 'spine_01': 'spine', 'spine_02': 'chest', 'spine_03': 'chest', 'neck_01': 'neck', 'head': 'head',
       'clavicle_l': 'chest', 'clavicle_r': 'chest', 'upperarm_l': 'lShoulder', 'upperarm_r': 'rShoulder', 'lowerarm_l': 'lElbow', 'lowerarm_r': 'rElbow',
       'hand_l': 'lHand', 'hand_r': 'rHand', 'thigh_l': 'lHip', 'thigh_r': 'rHip', 'calf_l': 'lKnee', 'calf_r': 'rKnee', 'foot_l': 'lFoot', 'foot_r': 'rFoot', 'ball_l': 'lFoot', 'ball_r': 'rFoot'}
for side in 'lr':
    for f in ['thumb', 'index', 'middle', 'ring', 'pinky']:
        for i in (1, 2, 3): MAP[f'{f}_0{i}_{side}'] = ('l' if side == 'l' else 'r') + 'Hand'
BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'lShoulder', 'lElbow', 'lHand', 'rShoulder', 'rElbow', 'rHand', 'lHip', 'lKnee', 'lFoot', 'rHip', 'rKnee', 'rFoot']
PARENT = {'spine': 'hips', 'chest': 'spine', 'neck': 'chest', 'head': 'neck', 'lShoulder': 'chest', 'lElbow': 'lShoulder', 'lHand': 'lElbow', 'rShoulder': 'chest', 'rElbow': 'rShoulder', 'rHand': 'rElbow', 'lHip': 'hips', 'lKnee': 'lHip', 'lFoot': 'lKnee', 'rHip': 'hips', 'rKnee': 'rHip', 'rFoot': 'rKnee'}
SRC_JOINT = {'hips': 'pelvis', 'spine': 'spine_01', 'chest': 'spine_03', 'neck': 'neck_01', 'head': 'head', 'lShoulder': 'upperarm_l', 'lElbow': 'lowerarm_l', 'lHand': 'hand_l',
             'rShoulder': 'upperarm_r', 'rElbow': 'lowerarm_r', 'rHand': 'hand_r', 'lHip': 'thigh_l', 'lKnee': 'calf_l', 'lFoot': 'foot_l', 'rHip': 'thigh_r', 'rKnee': 'calf_r', 'rFoot': 'foot_r'}

def clear(keep=()):
    for o in list(bpy.data.objects):
        if o.get('variant') is None: bpy.data.objects.remove(o, do_unlink=True)

def bake(obj):
    if obj.data.shape_keys:
        obj.shape_key_add(name='mix', from_mix=True); co = [v.co.copy() for v in obj.data.shape_keys.key_blocks['mix'].data]
        for k in list(obj.data.shape_keys.key_blocks): obj.shape_key_remove(k)
        for v, c in zip(obj.data.vertices, co): v.co = c

def point(rig, chain, direction):
    """rotate each pose bone in chain so it points along direction (world, Blender Z-up)"""
    for name in chain:
        pb = rig.pose.bones[name]
        bpy.context.view_layer.update()
        head = rig.matrix_world @ pb.head; tail = rig.matrix_world @ pb.tail
        q = (tail - head).normalized().rotation_difference(direction.normalized())
        M = rig.matrix_world.inverted() @ Matrix.Translation(head) @ q.to_matrix().to_4x4() @ Matrix.Translation(-head) @ rig.matrix_world
        pb.matrix = M @ pb.matrix
    bpy.context.view_layer.update()

meta = {'variants': {}, 'bones': BONES, 'parent': PARENT, 'armA': ARM_A, 'legA': LEG_A}
for key, mac in VARIANTS.items():
    if ONLY and key not in ONLY: continue
    clear()
    macro = TargetService.get_default_macro_info_dict(); macro.update(mac); macro['proportions'] = 0.6
    macro['race'] = {'asian': 0.92, 'caucasian': 0.08, 'african': 0.0}
    h = HumanService.create_human(macro_detail_dict=macro)
    bake(h)
    def gc(name):
        g = h.vertex_groups.get(name); pts = [h.matrix_world @ v.co for v in h.data.vertices if any(e.group == g.index and e.weight > 0.5 for e in v.groups)]
        return sum(pts, Vector()) / len(pts)
    nj, hj = gc('joint-neck'), gc('joint-head'); CUT = nj.z + (hj.z - nj.z) * 0.15 + 0.008
    rig = HumanService.add_builtin_rig(h, 'game_engine', import_weights=True)
    bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='POSE')
    for s, sx in (('l', 1), ('r', -1)):
        # Blender: x is the character's left, -y is forward, z is up
        point(rig, [f'upperarm_{s}', f'lowerarm_{s}', f'hand_{s}'], Vector((sx * math.sin(ARM_A), 0, -math.cos(ARM_A))))
        point(rig, [f'thigh_{s}', f'calf_{s}'], Vector((sx * math.sin(LEG_A), 0, -math.cos(LEG_A))))
    bpy.ops.object.mode_set(mode='OBJECT')
    joints = {b: list(rig.matrix_world @ rig.pose.bones[SRC_JOINT[b]].head) for b in BONES}
    # bake the pose into the mesh
    for m in list(h.modifiers):
        if m.type == 'ARMATURE': bpy.context.view_layer.objects.active = h; bpy.ops.object.modifier_apply(modifier=m.name)
        elif m.type == 'MASK': bpy.context.view_layer.objects.active = h; bpy.ops.object.modifier_apply(modifier=m.name)
    # drop the head (a separate MakeHuman head is fitted in the game) and the helper geometry
    import bmesh
    bm = bmesh.new(); bm.from_mesh(h.data); dl = bm.verts.layers.deform.active; bodyg = h.vertex_groups.get('body')
    kill = [v for v in bm.verts if (h.matrix_world @ v.co).z > CUT or (bodyg and dl and (bodyg.index not in v[dl] or v[dl][bodyg.index] < 0.5))]
    bmesh.ops.delete(bm, geom=kill, context='VERTS'); bm.to_mesh(h.data); bm.free()
    # merge weights onto the game bones
    src = {g.index: g.name for g in h.vertex_groups}
    acc = [dict() for _ in h.data.vertices]
    for v in h.data.vertices:
        for e in v.groups:
            dst = MAP.get(src.get(e.group))
            if dst and e.weight > 0: acc[v.index][dst] = acc[v.index].get(dst, 0) + e.weight
    for g in list(h.vertex_groups): h.vertex_groups.remove(g)
    groups = {b: h.vertex_groups.new(name=b) for b in BONES}
    for vi, d in enumerate(acc):
        if not d: d = {'hips': 1.0}
        top = sorted(d.items(), key=lambda kv: -kv[1])[:4]; s = sum(w for _, w in top) or 1
        for b, w in top: groups[b].add([vi], w / s, 'REPLACE')
    bpy.data.objects.remove(rig, do_unlink=True)
    # the game's armature at these joints
    arm = bpy.data.armatures.new(f'rig_{key}'); ao = bpy.data.objects.new(f'rig_{key}', arm); bpy.context.scene.collection.objects.link(ao)
    bpy.context.view_layer.objects.active = ao; bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    for b in BONES:
        e = arm.edit_bones.new(b); e.head = Vector(joints[b]); e.tail = e.head + Vector((0, 0, 0.05)); eb[b] = e
    for b, p in PARENT.items(): eb[b].parent = eb[p]
    bpy.ops.object.mode_set(mode='OBJECT')
    ao['variant'] = key  # the armature must be exported with its meshes
    SILS = {'m_adult': ['pants', 'robe', 'armor'], 'm_elder': ['pants', 'robe'], 'f_adult': ['chima', 'pants'], 'f_elder': ['chima'], 'm_child': ['pants'], 'f_child': ['chima']}[key]
    sex = key[0]; child = key.endswith('child')
    def bind(o, name):
        o.name = name; o.data.name = name; o.parent = ao
        for m in list(o.modifiers): o.modifiers.remove(m)
        mod = o.modifiers.new('rig', 'ARMATURE'); mod.object = ao; o['variant'] = key
    def lod(o, ratio):
        lo = o.copy(); lo.data = o.data.copy(); bpy.context.scene.collection.objects.link(lo)
        for m in list(lo.modifiers): lo.modifiers.remove(m)
        dec = lo.modifiers.new('dec', 'DECIMATE'); dec.ratio = ratio; bpy.context.view_layer.objects.active = lo; bpy.ops.object.modifier_apply(modifier='dec')
        return lo
    counts = {}
    for sil in SILS:
        b = h.copy(); b.data = h.data.copy(); bpy.context.scene.collection.objects.link(b)
        for m in list(b.modifiers): b.modifiers.remove(m)
        skin, clothes = dress(b, joints, sil, sex, child)
        bpy.ops.object.select_all(action='DESELECT')
        for c in clothes: c.select_set(True)
        bpy.context.view_layer.objects.active = clothes[0]; bpy.ops.object.join(); cloth = bpy.context.view_layer.objects.active
        split_regions(cloth)
        base = f'body_{key}_{sil}'
        skin_lo, cloth_lo = lod(skin, 0.3), lod(cloth, 0.3)
        for o, n in ((skin, base + '_skin'), (cloth, base + '_cloth'), (skin_lo, base + '_skin_lo'), (cloth_lo, base + '_cloth_lo')): bind(o, n)
        counts[sil] = len(skin.data.vertices) + len(cloth.data.vertices)
    bpy.data.objects.remove(h, do_unlink=True)
    meta['variants'][key] = {'cut': CUT, 'joints': joints, 'sils': SILS, 'verts': counts}
    print('built', key, counts)

for o in bpy.data.objects: o.select_set(o.get('variant') is not None)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=False, export_texcoords=True, export_normals=True,
                          export_materials='NONE', export_attributes=True, export_skins=True, export_animations=False, export_morph=False, export_yup=True, export_def_bones=False)
json.dump(meta, open(OUT.replace('.glb', '.json'), 'w'), indent=1)
print('EXPORTED', OUT, list(meta['variants']))
