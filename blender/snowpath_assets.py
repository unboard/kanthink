# Snowpath asset generator — run headless:
#   blender --background --python blender/snowpath_assets.py
# Builds stylized low-poly GLBs into public/snowpath/.
# Conventions: Blender Z-up, vehicles face +Y (becomes -Z "forward" in three.js).
# Movable parts are parented under named empties so the game can rotate them.

import bpy
import math
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'snowpath')
os.makedirs(OUT, exist_ok=True)


# ---------- helpers ----------

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, color, rough=0.75, metal=0.0, emit=None, emit_strength=2.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if emit is not None:
        bsdf.inputs['Emission Color'].default_value = (*emit, 1.0)
        bsdf.inputs['Emission Strength'].default_value = emit_strength
    return m


def _finish(o, name, material, smooth=False, bevel=0.0):
    o.name = name
    bpy.ops.object.transform_apply(scale=True)
    if bevel > 0:
        b = o.modifiers.new('Bevel', 'BEVEL')
        b.width = bevel
        b.segments = 2
        b.limit_method = 'ANGLE'
    if smooth:
        bpy.ops.object.shade_smooth()
    else:
        bpy.ops.object.shade_flat()
    if material is not None:
        o.data.materials.append(material)
    return o


def box(name, size, loc, material, rot=(0, 0, 0), bevel=0.03):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    return _finish(o, name, material, smooth=False, bevel=bevel)


def cyl(name, r, depth, loc, material, rot=(0, 0, 0), verts=20, smooth=True, bevel=0.0, r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot)
    o = bpy.context.active_object
    return _finish(o, name, material, smooth=smooth, bevel=bevel)


def cone(name, r, depth, loc, material, rot=(0, 0, 0), verts=12, smooth=True):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=0, depth=depth, location=loc, rotation=rot)
    o = bpy.context.active_object
    return _finish(o, name, material, smooth=smooth)


def sphere(name, r, loc, material, scale=(1, 1, 1), smooth=True, seg=20, rings=14):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=r, location=loc)
    o = bpy.context.active_object
    o.scale = scale
    return _finish(o, name, material, smooth=smooth)


def prism(name, size, loc, material, rot=(0, 0, 0)):
    # triangular prism (gable roof): 3-vert cylinder laid on its side
    bpy.ops.mesh.primitive_cylinder_add(vertices=3, radius=1, depth=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    return _finish(o, name, material, smooth=False, bevel=0.02)


def empty(name, loc):
    bpy.ops.object.empty_add(location=loc)
    o = bpy.context.active_object
    o.name = name
    return o


def parent(child, par):
    child.parent = par
    child.matrix_parent_inverse = par.matrix_world.inverted()


def export(fname):
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT, fname),
        export_format='GLB',
        export_apply=True,
    )
    print('exported', fname)


# ---------- palette ----------

def P():
    return {
        'orange':   mat('orange', (0.92, 0.42, 0.08), rough=0.5),
        'orangeDk': mat('orangeDk', (0.65, 0.26, 0.04), rough=0.6),
        'red':      mat('red', (0.78, 0.12, 0.10), rough=0.5),
        'steel':    mat('steel', (0.55, 0.58, 0.62), rough=0.35, metal=0.8),
        'steelDk':  mat('steelDk', (0.22, 0.24, 0.27), rough=0.5, metal=0.6),
        'tire':     mat('tire', (0.09, 0.09, 0.10), rough=0.95),
        'hub':      mat('hub', (0.75, 0.75, 0.78), rough=0.3, metal=0.9),
        'glass':    mat('glass', (0.55, 0.75, 0.85), rough=0.1, metal=0.2),
        'paint':    mat('paint', (0.30, 0.55, 0.85), rough=0.45),
        'beacon':   mat('beacon', (1.0, 0.6, 0.1), emit=(1.0, 0.55, 0.1), emit_strength=4.0),
        'headlight': mat('headlight', (1.0, 0.95, 0.8), emit=(1.0, 0.92, 0.7), emit_strength=3.0),
        'wood':     mat('wood', (0.45, 0.30, 0.18), rough=0.85),
        'trunk':    mat('trunk', (0.32, 0.22, 0.14), rough=0.9),
        'pine':     mat('pine', (0.13, 0.38, 0.22), rough=0.85),
        'snow':     mat('snow', (0.94, 0.97, 1.0), rough=0.9),
        'wallA':    mat('wallA', (0.85, 0.72, 0.55), rough=0.85),
        'wallB':    mat('wallB', (0.62, 0.70, 0.78), rough=0.85),
        'wallC':    mat('wallC', (0.78, 0.55, 0.48), rough=0.85),
        'roofA':    mat('roofA', (0.45, 0.28, 0.25), rough=0.85),
        'roofB':    mat('roofB', (0.30, 0.34, 0.42), rough=0.85),
        'window':   mat('window', (1.0, 0.85, 0.5), emit=(1.0, 0.75, 0.35), emit_strength=2.5),
        'door':     mat('door', (0.55, 0.20, 0.15), rough=0.7),
        'brick':    mat('brick', (0.60, 0.30, 0.22), rough=0.9),
        'skin':     mat('skin', (0.98, 0.80, 0.66), rough=0.7),
        'coat':     mat('coat', (0.20, 0.45, 0.80), rough=0.8),
        'beanie':   mat('beanie', (0.85, 0.25, 0.30), rough=0.9),
        'pants':    mat('pants', (0.25, 0.28, 0.35), rough=0.85),
        'carrot':   mat('carrot', (0.95, 0.50, 0.10), rough=0.7),
        'coal':     mat('coal', (0.08, 0.08, 0.08), rough=0.9),
        'sign':     mat('sign', (0.95, 0.92, 0.85), rough=0.6),
        'awning':   mat('awning', (0.80, 0.20, 0.25), rough=0.8),
    }


def wheel(name, r, w, loc, p, rot=(math.pi / 2, 0, 0)):
    # wheel cylinder axis along X (rolls around X when rotated)
    t = cyl(name, r, w, loc, p['tire'], rot=(0, math.pi / 2, 0), verts=18)
    h = cyl(name + '_hub', r * 0.55, w + 0.02, loc, p['hub'], rot=(0, math.pi / 2, 0), verts=12)
    parent(h, t)
    return t


# ---------- assets ----------

def build_plow():
    reset()
    p = P()
    root = empty('root', (0, 0, 0))
    # chassis + bed
    body = box('body', (2.0, 3.4, 0.7), (0, -0.3, 0.95), p['orange'], bevel=0.05)
    bed = box('bed', (1.9, 1.7, 0.55), (0, -1.05, 1.45), p['orangeDk'], bevel=0.04)
    cab = box('cab', (1.85, 1.3, 1.0), (0, 0.75, 1.95), p['orange'], bevel=0.06)
    glass = box('glassF', (1.6, 0.1, 0.6), (0, 1.42, 2.05), p['glass'], bevel=0.02)
    glassS1 = box('glassS1', (0.1, 1.0, 0.55), (0.93, 0.75, 2.0), p['glass'], bevel=0.02)
    glassS2 = box('glassS2', (0.1, 1.0, 0.55), (-0.93, 0.75, 2.0), p['glass'], bevel=0.02)
    beacon = cyl('beacon', 0.12, 0.18, (0, 0.75, 2.56), p['beacon'], verts=10)
    hl1 = box('hl1', (0.28, 0.08, 0.18), (0.6, 1.42, 1.05), p['headlight'], bevel=0.01)
    hl2 = box('hl2', (0.28, 0.08, 0.18), (-0.6, 1.42, 1.05), p['headlight'], bevel=0.01)
    stack = cyl('stack', 0.07, 0.9, (0.8, 0.2, 2.3), p['steelDk'], verts=8)
    for o in (body, bed, cab, glass, glassS1, glassS2, beacon, hl1, hl2, stack):
        parent(o, root)
    # wheels — named for spin animation
    for i, (x, y) in enumerate([(0.95, 1.05), (-0.95, 1.05), (0.95, -1.15), (-0.95, -1.15)]):
        w = wheel('wheel%d' % i, 0.46, 0.34, (x, y, 0.46), p)
        parent(w, root)
    # blade on a pivot so the game can raise/lower it
    bladePivot = empty('blade', (0, 1.6, 0.55))
    parent(bladePivot, root)
    bl = box('bladeFace', (2.6, 0.18, 0.85), (0, 0.45, -0.05), p['steel'], rot=(-0.28, 0, 0), bevel=0.04)
    lip = box('bladeLip', (2.6, 0.22, 0.10), (0, 0.52, -0.42), p['steelDk'], bevel=0.02)
    arm1 = box('arm1', (0.12, 0.7, 0.12), (0.5, 0.05, 0.1), p['steelDk'], bevel=0.01)
    arm2 = box('arm2', (0.12, 0.7, 0.12), (-0.5, 0.05, 0.1), p['steelDk'], bevel=0.01)
    for o in (bl, lip, arm1, arm2):
        parent(o, bladePivot)
    export('plow.glb')


def build_blower():
    reset()
    p = P()
    root = empty('root', (0, 0, 0))
    body = box('body', (0.55, 0.75, 0.42), (0, -0.05, 0.55), p['red'], bevel=0.04)
    # auger housing: half-drum at front
    drum = cyl('drum', 0.28, 0.62, (0, 0.5, 0.28), p['red'], rot=(0, math.pi / 2, 0), verts=16)
    augur = cyl('augur', 0.20, 0.55, (0, 0.5, 0.28), p['steel'], rot=(0, math.pi / 2, 0), verts=10)
    scoopL = box('scoopL', (0.06, 0.5, 0.5), (0.33, 0.5, 0.3), p['red'], bevel=0.02)
    scoopR = box('scoopR', (0.06, 0.5, 0.5), (-0.33, 0.5, 0.3), p['red'], bevel=0.02)
    for o in (body, drum, augur, scoopL, scoopR):
        parent(o, root)
    # chute pivot — the game aims this and spawns spray from its tip
    chute = empty('chute', (0, 0.28, 0.85))
    parent(chute, root)
    c1 = cyl('chute1', 0.10, 0.5, (0, 0, 0.15), p['steelDk'], verts=10)
    c2 = cyl('chute2', 0.095, 0.34, (0, 0.13, 0.42), p['steelDk'], rot=(-0.9, 0, 0), verts=10)
    parent(c1, chute)
    parent(c2, chute)
    # wheels + handle
    for i, x in enumerate((0.30, -0.30)):
        w = wheel('wheel%d' % i, 0.17, 0.10, (x, -0.28, 0.17), p)
        parent(w, root)
    for x in (0.22, -0.22):
        h = cyl('handle_%s' % ('l' if x > 0 else 'r'), 0.035, 0.95, (x, -0.62, 0.85), p['steelDk'], rot=(0.55, 0, 0), verts=8)
        parent(h, root)
    grip = cyl('grip', 0.045, 0.5, (0, -0.88, 1.22), p['coal'], rot=(0, math.pi / 2, 0), verts=8)
    parent(grip, root)
    export('blower.glb')


def build_car():
    reset()
    p = P()
    root = empty('root', (0, 0, 0))
    body = box('bodyMain', (1.75, 3.9, 0.75), (0, 0, 0.75), p['paint'], bevel=0.16)
    cabin = box('bodyCabin', (1.6, 2.0, 0.72), (0, -0.25, 1.35), p['paint'], bevel=0.18)
    glassF = box('glassF', (1.45, 0.1, 0.5), (0, 0.78, 1.32), p['glass'], rot=(0.5, 0, 0), bevel=0.02)
    glassB = box('glassB', (1.45, 0.1, 0.5), (0, -1.28, 1.32), p['glass'], rot=(-0.5, 0, 0), bevel=0.02)
    glassS1 = box('glassS1', (0.1, 1.7, 0.42), (0.78, -0.25, 1.35), p['glass'], bevel=0.02)
    glassS2 = box('glassS2', (0.1, 1.7, 0.42), (-0.78, -0.25, 1.35), p['glass'], bevel=0.02)
    hl1 = box('hl1', (0.3, 0.08, 0.16), (0.55, 1.95, 0.85), p['headlight'], bevel=0.01)
    hl2 = box('hl2', (0.3, 0.08, 0.16), (-0.55, 1.95, 0.85), p['headlight'], bevel=0.01)
    for o in (body, cabin, glassF, glassB, glassS1, glassS2, hl1, hl2):
        parent(o, root)
    for i, (x, y) in enumerate([(0.82, 1.25), (-0.82, 1.25), (0.82, -1.25), (-0.82, -1.25)]):
        w = wheel('wheel%d' % i, 0.38, 0.26, (x, y, 0.38), p)
        parent(w, root)
    export('car.glb')


def _house(fname, wallM, roofM, w, d, h, chimney=True):
    reset()
    p = P()
    wall = p[wallM]
    roof = p[roofM]
    root = empty('root', (0, 0, 0))
    base = box('walls', (w, d, h), (0, 0, h / 2), wall, bevel=0.04)
    r = prism('roof', (d * 0.62, w / 2 + 0.45, 1.0), (0, 0, h + 0.62), roof, rot=(0, math.pi / 2, math.pi / 2))
    snowcap = prism('snowcap', (d * 0.60, w / 2 + 0.48, 1.0), (0, 0, h + 0.78), p['snow'], rot=(0, math.pi / 2, math.pi / 2))
    door = box('door', (0.9, 0.12, 1.7), (w * 0.18, d / 2 + 0.02, 0.85), p['door'], bevel=0.02)
    for o in (base, r, snowcap, door):
        parent(o, root)
    for x in (-w * 0.28, w * 0.02):
        win = box('win', (0.85, 0.12, 0.85), (x, d / 2 + 0.02, 1.55), p['window'], bevel=0.02)
        parent(win, root)
    winS = box('winS', (0.12, 1.0, 0.85), (-w / 2 - 0.02, 0, 1.55), p['window'], bevel=0.02)
    parent(winS, root)
    if chimney:
        ch = box('chimney', (0.5, 0.5, 1.4), (w * 0.25, -d * 0.2, h + 1.1), p['brick'], bevel=0.02)
        chs = box('chimsnow', (0.56, 0.56, 0.14), (w * 0.25, -d * 0.2, h + 1.82), p['snow'], bevel=0.02)
        parent(ch, root)
        parent(chs, root)
    export(fname)


def build_store():
    reset()
    p = P()
    root = empty('root', (0, 0, 0))
    base = box('walls', (7.5, 5.0, 3.2), (0, 0, 1.6), p['wallB'], bevel=0.04)
    roof = box('roof', (7.9, 5.4, 0.3), (0, 0, 3.35), p['roofB'], bevel=0.03)
    rs = box('roofsnow', (7.9, 5.4, 0.18), (0, 0, 3.55), p['snow'], bevel=0.03)
    sign = box('signbox', (5.0, 0.3, 0.8), (0, 2.65, 2.6), p['sign'], bevel=0.03)
    door = box('door', (1.4, 0.12, 2.0), (0, 2.52, 1.0), p['glass'], bevel=0.02)
    for o in (base, roof, rs, sign, door):
        parent(o, root)
    for i, x in enumerate((-2.4, 2.4)):
        win = box('bigwin', (1.8, 0.12, 1.4), (x, 2.52, 1.35), p['window'], bevel=0.02)
        parent(win, root)
    # striped awning
    for i in range(6):
        a = box('awn%d' % i, (0.85, 1.0, 0.1), (-2.1 + i * 0.85, 2.9, 2.15), p['awning' if i % 2 == 0 else 'sign'], rot=(0.35, 0, 0), bevel=0.01)
        parent(a, root)
    export('store.glb')


def build_school():
    reset()
    p = P()
    root = empty('root', (0, 0, 0))
    base = box('walls', (9.5, 6.0, 3.6), (0, 0, 1.8), p['wallC'], bevel=0.04)
    r = prism('roof', (6.0 * 0.62, 9.5 / 2 + 0.5, 1.1), (0, 0, 3.6 + 0.68), p['roofB'], rot=(0, math.pi / 2, math.pi / 2))
    snowcap = prism('snowcap', (6.0 * 0.60, 9.5 / 2 + 0.53, 1.1), (0, 0, 3.6 + 0.86), p['snow'], rot=(0, math.pi / 2, math.pi / 2))
    tower = box('tower', (1.6, 1.6, 2.2), (0, 0, 5.6), p['wallC'], bevel=0.03)
    towerRoof = cone('towerRoof', 1.35, 1.2, (0, 0, 7.25), p['roofB'], verts=4, smooth=False)
    bell = sphere('bell', 0.3, (0, 0, 6.35), p['beacon'], smooth=True, seg=10, rings=8)
    door = box('door', (1.8, 0.12, 2.2), (0, 3.02, 1.1), p['door'], bevel=0.02)
    for o in (base, r, snowcap, tower, towerRoof, bell, door):
        parent(o, root)
    for x in (-3.4, -1.7, 1.7, 3.4):
        win = box('win', (1.0, 0.12, 1.1), (x, 3.02, 2.0), p['window'], bevel=0.02)
        parent(win, root)
    export('school.glb')


def build_tree():
    reset()
    p = P()
    root = empty('root', (0, 0, 0))
    trunk = cyl('trunk', 0.18, 1.0, (0, 0, 0.5), p['trunk'], verts=8)
    parent(trunk, root)
    layers = [(1.15, 1.5, 1.2), (0.9, 1.3, 2.0), (0.6, 1.2, 2.85)]
    for i, (r, h, z) in enumerate(layers):
        c = cone('pine%d' % i, r, h, (0, 0, z), p['pine'], verts=9, smooth=False)
        s = cone('psnow%d' % i, r * 0.8, h * 0.55, (0, 0, z + h * 0.28), p['snow'], verts=9, smooth=False)
        parent(c, root)
        parent(s, root)
    export('tree.glb')


def build_lamp():
    reset()
    p = P()
    root = empty('root', (0, 0, 0))
    pole = cyl('pole', 0.07, 3.2, (0, 0, 1.6), p['steelDk'], verts=10)
    arm = cyl('arm', 0.05, 0.7, (0, 0.3, 3.15), p['steelDk'], rot=(math.pi / 2, 0, 0), verts=8)
    lampM = mat('lamp', (1.0, 0.9, 0.6), emit=(1.0, 0.82, 0.45), emit_strength=5.0)
    bulb = sphere('bulb', 0.16, (0, 0.62, 3.05), lampM, seg=12, rings=8)
    cap = cone('cap', 0.26, 0.2, (0, 0.62, 3.22), p['steelDk'], verts=10, smooth=False)
    snowTop = sphere('lsnow', 0.1, (0, 0, 3.26), p['snow'], scale=(1.6, 1.6, 0.6), seg=8, rings=6)
    for o in (pole, arm, bulb, cap, snowTop):
        parent(o, root)
    export('lamp.glb')


def _figure(fname, height, coatColor, beanieColor, has_pompom=True):
    # chibi figure with named pivots: head, armL, armR, legL, legR
    reset()
    p = P()
    coat = mat('coatX', coatColor, rough=0.8)
    beanie = mat('beanieX', beanieColor, rough=0.9)
    s = height  # scale factor: proportions on a ~1.0 template
    root = empty('root', (0, 0, 0))
    hipZ = 0.34 * s
    body = sphere('body', 0.26 * s, (0, 0, hipZ + 0.20 * s), coat, scale=(1.0, 0.85, 1.25))
    parent(body, root)
    # head pivot at neck
    headP = empty('head', (0, 0, hipZ + 0.52 * s))
    parent(headP, root)
    head = sphere('headMesh', 0.23 * s, (0, 0, hipZ + 0.68 * s), p['skin'])
    hat = sphere('hat', 0.235 * s, (0, 0, hipZ + 0.76 * s), beanie, scale=(1.0, 1.0, 0.75))
    brim = cyl('brim', 0.245 * s, 0.06 * s, (0, 0, hipZ + 0.72 * s), beanie, verts=14)
    eye1 = sphere('eye1', 0.032 * s, (0.09 * s, 0.20 * s, hipZ + 0.70 * s), p['coal'], seg=8, rings=6)
    eye2 = sphere('eye2', 0.032 * s, (-0.09 * s, 0.20 * s, hipZ + 0.70 * s), p['coal'], seg=8, rings=6)
    nose = sphere('nose', 0.035 * s, (0, 0.225 * s, hipZ + 0.64 * s), mat('noseX', (0.95, 0.55, 0.5), rough=0.7), seg=8, rings=6)
    for o in (head, hat, brim, eye1, eye2, nose):
        parent(o, headP)
    if has_pompom:
        pom = sphere('pompom', 0.07 * s, (0, 0, hipZ + 0.94 * s), p['snow'], seg=8, rings=6)
        parent(pom, headP)
    # arms: pivots at shoulders
    for side, sx in (('armL', 1), ('armR', -1)):
        ap = empty(side, (sx * 0.24 * s, 0, hipZ + 0.30 * s))
        parent(ap, root)
        a = cyl(side + 'Mesh', 0.06 * s, 0.30 * s, (sx * 0.26 * s, 0, hipZ + 0.15 * s), coat, rot=(0, sx * 0.25, 0), verts=8)
        mitt = sphere(side + 'Mitt', 0.075 * s, (sx * 0.30 * s, 0, hipZ + 0.00 * s), beanie, seg=8, rings=6)
        parent(a, ap)
        parent(mitt, ap)
    # legs: pivots at hips
    for side, sx in (('legL', 1), ('legR', -1)):
        lp = empty(side, (sx * 0.10 * s, 0, hipZ))
        parent(lp, root)
        l = cyl(side + 'Mesh', 0.075 * s, 0.30 * s, (sx * 0.10 * s, 0, hipZ - 0.16 * s), p['pants'], verts=8)
        boot = sphere(side + 'Boot', 0.085 * s, (sx * 0.10 * s, 0.03 * s, hipZ - 0.32 * s), p['coal'], scale=(1.0, 1.35, 0.8), seg=8, rings=6)
        parent(l, lp)
        parent(boot, lp)
    export(fname)


def build_snowman():
    reset()
    p = P()
    root = empty('root', (0, 0, 0))
    b1 = sphere('b1', 0.55, (0, 0, 0.45), p['snow'])
    b2 = sphere('b2', 0.40, (0, 0, 1.15), p['snow'])
    b3 = sphere('b3', 0.28, (0, 0, 1.70), p['snow'])
    nose = cone('nose', 0.06, 0.3, (0, 0.38, 1.72), p['carrot'], rot=(math.pi / 2, 0, 0), verts=8)
    hat1 = cyl('hat1', 0.30, 0.05, (0, 0, 1.92), p['coal'], verts=14)
    hat2 = cyl('hat2', 0.19, 0.3, (0, 0, 2.08), p['coal'], verts=14)
    for o in (b1, b2, b3, nose, hat1, hat2):
        parent(o, root)
    for i, (y, z) in enumerate([(0.26, 1.78), (-0.26, 1.78)]):
        e = sphere('e%d' % i, 0.035, (y, 0.245, z), p['coal'], seg=8, rings=6)
        parent(e, root)
    for i, z in enumerate((1.28, 1.12, 0.96)):
        c = sphere('c%d' % i, 0.035, (0, 0.38, z), p['coal'], seg=8, rings=6)
        parent(c, root)
    for side, sx in (('stickL', 1), ('stickR', -1)):
        st = cyl(side, 0.03, 0.6, (sx * 0.52, 0, 1.25), p['trunk'], rot=(0, sx * 1.1, 0), verts=6)
        parent(st, root)
    export('snowman.glb')


# ---------- run ----------

build_plow()
build_blower()
build_car()
_house('house_a.glb', 'wallA', 'roofA', 5.5, 4.5, 2.8)
_house('house_b.glb', 'wallB', 'roofB', 6.0, 4.8, 3.0)
_house('house_c.glb', 'wallC', 'roofA', 5.2, 4.2, 2.6, chimney=False)
build_store()
build_school()
build_tree()
build_lamp()
_figure('player.glb', 1.35, (0.90, 0.55, 0.15), (0.15, 0.35, 0.6))
_figure('kid_a.glb', 0.95, (0.20, 0.45, 0.80), (0.85, 0.25, 0.30))
_figure('kid_b.glb', 0.90, (0.55, 0.25, 0.65), (0.95, 0.75, 0.20))
_figure('kid_c.glb', 1.00, (0.15, 0.60, 0.45), (0.90, 0.45, 0.60))
build_snowman()

print('ALL ASSETS EXPORTED to', OUT)
