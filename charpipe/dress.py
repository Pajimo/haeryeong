# Joseon clothing built from a posed MakeHuman body (imported by make_bodies.py).
# Each garment is a shell grown from the body (so it is skinned exactly like the body), or a lathed
# skirt with hand-set weights. A per-vertex _REGION attribute selects the palette colour in the game:
# 0 skin, 1 top (jeogori), 2 bottom (baji/chima), 3 robe, 4 belt, 5 collar, 6 shoe, 7 leg wrap, 8 ribbon, 9 armour.
import bpy, bmesh, math
from mathutils import Vector

SKIN, TOP, BOTTOM, ROBE, BELT, COLLAR, SHOE, WRAP, RIBBON, ARMOR = range(10)
ARMS = {'lShoulder', 'rShoulder', 'lElbow', 'rElbow'}
TORSO = {'spine', 'chest', 'neck'}
LEGS = {'lHip', 'rHip', 'lKnee', 'rKnee'}
FEET = {'lFoot', 'rFoot'}
HANDS = {'lHand', 'rHand'}

def weights_of(obj):
    names = {g.index: g.name for g in obj.vertex_groups}
    out = []
    for v in obj.data.vertices:
        d = {}
        for e in v.groups: d[names[e.group]] = d.get(names[e.group], 0) + e.weight
        out.append(d)
    return out

def dominant(d): return max(d.items(), key=lambda kv: kv[1])[0] if d else 'hips'

def arm_param(p, J, s):
    """0 at shoulder .. 1 at wrist along the arm chain"""
    a, b, c = Vector(J[s + 'Shoulder']), Vector(J[s + 'Elbow']), Vector(J[s + 'Hand'])
    L1, L2 = (b - a).length, (c - b).length
    t1 = max(0, min(1, (p - a).dot((b - a).normalized()) / L1))
    if t1 < 1: return t1 * L1 / (L1 + L2)
    t2 = max(0, (p - b).dot((c - b).normalized()) / L2)
    return (L1 + t2 * L2) / (L1 + L2)

def shell(body, W, J, keep, offset, region, name):
    """copy the body, keep vertices for which keep(i, co, dom) is true, push them out along their normals"""
    me = body.data.copy(); ob = body.copy(); ob.data = me; ob.name = name; me.name = name
    bpy.context.scene.collection.objects.link(ob)
    for m in list(ob.modifiers): ob.modifiers.remove(m)
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table(); bm.normal_update()
    keepset = set()
    for v in bm.verts:
        co = body.matrix_world @ v.co
        if keep(v.index, co, dominant(W[v.index])): keepset.add(v.index)
    # keep a face only if all its verts are kept
    dead_faces = [f for f in bm.faces if any(v.index not in keepset for v in f.verts)]
    bmesh.ops.delete(bm, geom=dead_faces, context='FACES_ONLY')
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.verts.ensure_lookup_table(); bm.normal_update()
    regions = []
    orig = {}
    for v in bm.verts:
        co = body.matrix_world @ v.co
        off = offset(co)
        v.co = v.co + v.normal * off
        regions.append(region(co))
    bm.to_mesh(me); bm.free()
    attr = me.attributes.new('_REGION', 'FLOAT', 'POINT')
    for i, r in enumerate(regions): attr.data[i].value = r
    return ob, keepset

def lathe(name, rings, segs, profile, weight_fn, region_fn, J):
    """profile(t) -> (z, rx, ry, cy); returns a skinned skirt object"""
    me = bpy.data.meshes.new(name); ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    verts, faces, ws, regs = [], [], [], []
    for i in range(rings + 1):
        t = i / rings; z, rx, ry, cy = profile(t)
        for j in range(segs):
            a = j / segs * math.tau
            x, y = math.sin(a) * rx, cy - math.cos(a) * ry  # -y is forward in Blender
            verts.append((x, y, z)); ws.append(weight_fn(t, x / max(rx, 1e-4), a)); regs.append(region_fn(t, a))
    for i in range(rings):
        for j in range(segs):
            a, b = i * segs + j, i * segs + (j + 1) % segs
            faces.append((a, b, b + segs, a + segs))
    me.from_pydata(verts, [], faces); me.update()
    for f in me.polygons: f.use_smooth = True
    groups = {}
    for vi, d in enumerate(ws):
        for bname, w in d.items():
            if w <= 0: continue
            g = groups.get(bname) or ob.vertex_groups.new(name=bname); groups[bname] = g
            g.add([vi], w, 'REPLACE')
    attr = me.attributes.new('_REGION', 'FLOAT', 'POINT')
    for i, r in enumerate(regs): attr.data[i].value = r
    return ob

def girth(body, z, xmax=0.2):
    """half-width and half-depth of the torso at height z (ignoring the arms)"""
    xs, ys = [], []
    for v in body.data.vertices:
        co = body.matrix_world @ v.co
        if abs(co.z - z) < 0.02 and abs(co.x) < xmax: xs.append(abs(co.x)); ys.append(co.y)
    if not xs: return 0.15, 0.11, 0.0
    return max(xs), (max(ys) - min(ys)) / 2, (max(ys) + min(ys)) / 2

def skirt_weights(t, xn, top_bone='hips', leg=0.45):
    wl, wr = leg * t * max(0, xn), leg * t * max(0, -xn)
    if t < 0.08: return {top_bone: 1.0}
    return {'hips': 1 - wl - wr, 'lHip': wl, 'rHip': wr}

def dress(body, J, sil, sex, child=False):
    """returns (skin_obj, [cloth objs]) — body remnants that stay visible, and the garments"""
    W = weights_of(body)
    Jv = {k: Vector(v) for k, v in J.items()}
    neckZ = Jv['neck'].z - 0.015; shZ = Jv['lShoulder'].z; waist = Jv['spine'].z + 0.02; hipZ = Jv['hips'].z
    ankle = Jv['lFoot'].z + 0.045; knee = Jv['lKnee'].z
    f = sex == 'f'
    long_robe = sil == 'robe'
    jacket_bottom = (shZ - 0.2) if (f and sil == 'chima') else (hipZ - 0.04)
    covered = set()
    clothes = []

    # ----- jeogori (or the upper robe): torso and arms to the wrist -----
    def jk(i, co, dom):
        if dom in HANDS or dom in FEET or dom in LEGS: return False
        if co.z > neckZ: return False
        if dom in ARMS: s = 'l' if co.x > 0 else 'r'; return arm_param(co, Jv, s) < (0.93 if long_robe else 0.95)
        return co.z > jacket_bottom - (0.0 if not long_robe else 0.0)
    flare = 0.075 if long_robe else 0.02
    def jk_off(co):
        if abs(co.x) > 0.17 and co.z < shZ + 0.02 and co.z > Jv['lHand'].z - 0.05:
            s = 'l' if co.x > 0 else 'r'; t = arm_param(co, Jv, s); return 0.014 + flare * max(0, t - 0.35) ** 1.5 * 2.2
        return 0.016 if not long_robe else 0.02
    up_region = ROBE if long_robe else (ARMOR if sil == 'armor' else TOP)
    def jk_reg(co):
        # white collar band (동정) running from the neck down across the chest to the opposite side
        if co.y < 0 and co.z > neckZ - 0.12 and abs(co.x) < 0.11:
            line = -0.06 + (neckZ - co.z) * 0.55
            if abs(co.x - line) < 0.018 or (co.z > neckZ - 0.03): return COLLAR
        return up_region
    jacket, kept = shell(body, W, J, jk, jk_off, jk_reg, 'jacket'); covered |= kept; clothes.append(jacket)

    # ----- legs: baji (trousers) — under a skirt they are simply hidden and removed -----
    if sil != 'chima':
        def lg(i, co, dom):
            if dom in FEET or dom in HANDS: return False
            if co.z < ankle: return False
            if dom in ARMS: return False
            return dom in LEGS or (dom in ('hips', 'spine') and co.z < jacket_bottom + 0.06)
        def lg_off(co):
            if co.z < knee - 0.16: return 0.008  # gathered into leg wraps
            t = max(0, min(1, (co.z - (knee - 0.16)) / (hipZ - knee + 0.16)))
            return 0.012 + 0.05 * math.sin(math.pi * min(1, t * 1.1)) * (0.6 if f else 1)
        wraps = not f and sil in ('pants', 'robe')
        pants, kept = shell(body, W, J, lg, lg_off, lambda co: WRAP if (wraps and co.z < knee - 0.16) else BOTTOM, 'pants'); covered |= kept; clothes.append(pants)
        # sash at the waist
        bz = (waist + jacket_bottom) / 2 if not long_robe else waist
        gx, gy, cy = girth(body, bz)
        belt = lathe('belt', 2, 28, lambda t: (bz + 0.025 - t * 0.05, gx + 0.03 + (0.02 if long_robe else 0.0), gy + 0.03 + (0.02 if long_robe else 0.0), cy), lambda t, xn, a: {'hips': 0.5, 'spine': 0.5}, lambda t, a: BELT, J)
        clothes.append(belt)
    # ----- chima: a high-waisted bell skirt from the bust to the floor -----
    if sil == 'chima':
        top = shZ - 0.17; gx, gy, cy = girth(body, top, 0.17)
        hem_rx, hem_ry = (0.3, 0.26) if child else (0.38, 0.32)
        def prof(t):
            k = t ** 0.75
            return (top - t * (top - 0.035), gx + 0.012 + (hem_rx - gx) * k, gy + 0.02 + (hem_ry - gy) * k, cy + 0.01 * t)
        skirt = lathe('chima', 20, 40, prof, lambda t, xn, a: skirt_weights(t, xn, 'chest', 0.4), lambda t, a: BOTTOM, J)
        clothes.append(skirt)
        # the body under the skirt is never seen
        for i, d in enumerate(W):
            co = body.matrix_world @ body.data.vertices[i].co
            if co.z < top + 0.01 and dominant(d) not in HANDS and abs(co.x) < 0.26: covered.add(i)
        # goreum: the long ribbon tied at the chest
        rz = jacket_bottom + 0.02
        rib = lathe('goreum', 6, 4, lambda t: (rz - t * 0.32, 0.025 - t * 0.01, 0.006, -gy - 0.04), lambda t, xn, a: {'chest': 1.0}, lambda t, a: RIBBON, J)
        for v in rib.data.vertices: v.co.x += 0.03
        clothes.append(rib)
    # ----- dopo: the long skirt of a scholar's robe, open over the trousers -----
    if long_robe or sil == 'armor':
        top = waist; gx, gy, cy = girth(body, top)
        hemz = 0.3 if long_robe else hipZ - 0.28
        def prof(t):
            return (top - t * (top - hemz), gx + 0.035 + t * 0.12, gy + 0.04 + t * 0.09, cy)
        lower = lathe('robe', 12, 36, prof, lambda t, xn, a: skirt_weights(t, xn, 'hips', 0.5), lambda t, a: ARMOR if sil == 'armor' else ROBE, J)
        clothes.append(lower)
    # ----- shoes -----
    shoes, kept = shell(body, W, J, lambda i, co, dom: dom in FEET or (dom in ('lKnee', 'rKnee') and co.z < ankle + 0.01), lambda co: 0.009, lambda co: SHOE, 'shoes')
    covered |= kept; clothes.append(shoes)

    # ----- what is left of the body: neck and hands -----
    me = body.data
    bm = bmesh.new(); bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    dead = [bm.verts[i] for i in covered if i < len(bm.verts)]
    # never delete the hands or the neck
    dead = [v for v in dead if dominant(W[v.index]) not in HANDS and (body.matrix_world @ v.co).z < neckZ - 0.005]
    bmesh.ops.delete(bm, geom=dead, context='VERTS'); bm.to_mesh(me); bm.free()

    # garments take the body's skin weights (shells were copied from it); lathed pieces already have theirs
    for c in clothes:
        if not c.vertex_groups: pass
    return body, clothes

def split_regions(ob):
    """make every face a single palette region: each face takes the most common region of its corners,
    and edges between faces of different regions are split so no triangle blends two colours"""
    me = ob.data; attr = me.attributes.get('_REGION')
    if not attr: return
    vreg = [d.value for d in attr.data]
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
    freg = {}
    for f in bm.faces:
        rs = [round(vreg[v.index]) for v in f.verts]
        freg[f.index] = max(set(rs), key=rs.count)
    lay = bm.faces.layers.int.new('freg')
    for f in bm.faces: f[lay] = freg[f.index]
    border = [e for e in bm.edges if len(e.link_faces) == 2 and e.link_faces[0][lay] != e.link_faces[1][lay]]
    if border: bmesh.ops.split_edges(bm, edges=border)
    bm.verts.ensure_lookup_table()
    out = [0.0] * len(bm.verts)
    for f in bm.faces:
        for v in f.verts: out[v.index] = float(f[lay])
    bm.faces.layers.int.remove(lay)
    bm.to_mesh(me); bm.free()
    attr = me.attributes.get('_REGION') or me.attributes.new('_REGION', 'FLOAT', 'POINT')
    for i, r in enumerate(out): attr.data[i].value = r
