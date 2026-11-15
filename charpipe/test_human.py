# Quick look: generate an MPFB human headless and render a face close-up.
import bpy, sys, os, math, addon_utils
addon_utils.enable('bl_ext.user_default.mpfb', default_set=True, persistent=True)
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.targetservice import TargetService

out = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '/tmp/face.png'
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)

macro = TargetService.get_default_macro_info_dict()
macro.update({'gender': 1.0, 'age': 0.5, 'muscle': 0.5, 'weight': 0.5})
macro['race'] = {'asian': 1.0, 'caucasian': 0.0, 'african': 0.0}
h = HumanService.create_human(macro_detail_dict=macro)
print('verts', len(h.data.vertices), 'groups', len(h.vertex_groups), 'shapekeys', len(h.data.shape_keys.key_blocks) if h.data.shape_keys else 0)
print('groups sample', [g.name for g in h.vertex_groups][:60])

# camera on the face
import mathutils
zs = [ (h.matrix_world @ v.co).z for v in h.data.vertices ]
top = max(zs)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.scene.collection.objects.link(cam)
cam.data.lens = 85
cam.location = (0, -1.2, top - 0.12); cam.rotation_euler = (math.radians(90), 0, 0)
bpy.context.scene.camera = cam
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3; sun.rotation_euler = (math.radians(60), 0, math.radians(20)); bpy.context.scene.collection.objects.link(sun)
sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'; sc.render.resolution_x = 600; sc.render.resolution_y = 600
sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'SINGLE'
sc.render.filepath = out; bpy.ops.render.render(write_still=True)
print('rendered', out, 'top', top)
