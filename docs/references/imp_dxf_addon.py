bl_info = {
    "name": "DXF Blueprint → Multi-Floor 3D Building (Robust)",
    "author": "Major Project",
    "version": (2, 1),
    "blender": (3, 0, 0),
    "location": "View3D > Sidebar > Blueprint Generator",
    "category": "3D View",
}

import bpy
import ezdxf
import bmesh
from mathutils import Vector
import os

# =================================================
# CORE
# =================================================
def generate_building(context):
    p = context.scene.bp_props

    if not os.path.exists(p.dxf_path):
        raise RuntimeError("DXF file not found")

    # ---------------- CLEAN ----------------
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)

    # ---------------- LOAD DXF ----------------
    doc = ezdxf.readfile(p.dxf_path)
    msp = doc.modelspace()

    bm = bmesh.new()

    minx = miny = 1e9
    maxx = maxy = -1e9
    line_count = 0

    # ---------------- BUILD WALLS (ROBUST) ----------------
    for e in msp:
        if e.dxftype() != "LINE":
            continue

        p1 = Vector((e.dxf.start.x, e.dxf.start.y, 0))
        p2 = Vector((e.dxf.end.x, e.dxf.end.y, 0))

        d = p2 - p1
        if d.length < 1e-6:
            continue

        line_count += 1

        minx = min(minx, p1.x, p2.x)
        miny = min(miny, p1.y, p2.y)
        maxx = max(maxx, p1.x, p2.x)
        maxy = max(maxy, p1.y, p2.y)

        d.normalize()
        n = Vector((-d.y, d.x, 0)) * (p.wall_thickness / 2)

        try:
            v1 = bm.verts.new(p1 + n)
            v2 = bm.verts.new(p2 + n)
            v3 = bm.verts.new(p2 - n)
            v4 = bm.verts.new(p1 - n)
            bm.faces.new((v1, v2, v3, v4))
        except:
            pass

    if line_count == 0 or not bm.faces:
        bm.free()
        raise RuntimeError("No usable wall lines found in DXF")

    # ---------------- CENTER ----------------
    center = Vector(((minx + maxx)/2, (miny + maxy)/2, 0))
    for v in bm.verts:
        v.co -= center

    # ---------------- CREATE OBJECT ----------------
    mesh = bpy.data.meshes.new("Walls")
    bm.to_mesh(mesh)
    bm.free()

    wall_obj = bpy.data.objects.new("Walls", mesh)
    bpy.context.collection.objects.link(wall_obj)

    # ---------------- AUTO SCALE ----------------
    plan_size = max(maxx - minx, maxy - miny)
    scale = p.target_size / plan_size
    wall_obj.scale = (scale, scale, scale)

    bpy.context.view_layer.objects.active = wall_obj
    wall_obj.select_set(True)
    bpy.ops.object.transform_apply(scale=True)

    # ---------------- EXTRUDE WALL HEIGHT ----------------
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.extrude_region_move(
        TRANSFORM_OT_translate={"value": (0, 0, p.wall_height)}
    )
    bpy.ops.object.mode_set(mode='OBJECT')

    # ---------------- FLOOR SLAB (TIGHT FIT) ----------------
    bbox = [wall_obj.matrix_world @ Vector(c) for c in wall_obj.bound_box]
    minx = min(v.x for v in bbox)
    maxx = max(v.x for v in bbox)
    miny = min(v.y for v in bbox)
    maxy = max(v.y for v in bbox)

    sx = maxx - minx
    sy = maxy - miny

    bpy.ops.mesh.primitive_cube_add(
        location=(0, 0, -p.slab_thickness/2)
    )
    slab = bpy.context.object
    slab.scale = (sx/2, sy/2, p.slab_thickness/2)

    # ---------------- MULTI FLOOR ----------------
    floors = []
    for i in range(p.floors):
        w = wall_obj.copy()
        w.data = wall_obj.data.copy()
        w.location.z = i * p.floor_height
        bpy.context.collection.objects.link(w)
        floors.append(w)

        s = slab.copy()
        s.data = slab.data.copy()
        s.location.z = i * p.floor_height
        bpy.context.collection.objects.link(s)

    bpy.data.objects.remove(wall_obj)
    bpy.data.objects.remove(slab)

    # ---------------- MATERIAL ----------------
    mat = bpy.data.materials.new("WallDark")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.1,0.1,0.1,1)
    bsdf.inputs["Roughness"].default_value = 0.7

    for o in floors:
        o.data.materials.append(mat)

    # ---------------- LIGHT & CAMERA ----------------
    bpy.ops.object.light_add(type='SUN', location=(30,-30,50))
    bpy.context.object.data.energy = 4

    bpy.ops.object.camera_add(
        location=(25,-25,25),
        rotation=(1.1,0,0.9)
    )
    bpy.context.scene.camera = bpy.context.object


# =================================================
# PROPERTIES
# =================================================
class BP_Properties(bpy.types.PropertyGroup):
    dxf_path: bpy.props.StringProperty(subtype='FILE_PATH')
    target_size: bpy.props.FloatProperty(default=30.0)
    wall_height: bpy.props.FloatProperty(default=3.2)
    wall_thickness: bpy.props.FloatProperty(default=0.25)
    floors: bpy.props.IntProperty(default=3, min=1)
    floor_height: bpy.props.FloatProperty(default=3.5)
    slab_thickness: bpy.props.FloatProperty(default=0.3)


# =================================================
# OPERATOR
# =================================================
class BP_OT_Generate(bpy.types.Operator):
    bl_idname = "bp.generate_building"
    bl_label = "Generate Building"
    bl_options = {'REGISTER','UNDO'}

    def execute(self, context):
        generate_building(context)
        return {'FINISHED'}


# =================================================
# PANEL
# =================================================
class BP_PT_Panel(bpy.types.Panel):
    bl_label = "Blueprint Generator"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Blueprint Generator"

    def draw(self, context):
        p = context.scene.bp_props
        l = self.layout
        l.prop(p, "dxf_path")
        l.prop(p, "target_size")
        l.prop(p, "wall_height")
        l.prop(p, "wall_thickness")
        l.prop(p, "floors")
        l.prop(p, "floor_height")
        l.prop(p, "slab_thickness")
        l.operator("bp.generate_building", icon='MOD_BUILD')


# =================================================
# REGISTER
# =================================================
classes = (BP_Properties, BP_OT_Generate, BP_PT_Panel)

def register():
    for c in classes:
        bpy.utils.register_class(c)
    bpy.types.Scene.bp_props = bpy.props.PointerProperty(type=BP_Properties)

def unregister():
    for c in reversed(classes):
        bpy.utils.unregister_class(c)
    del bpy.types.Scene.bp_props

if __name__ == "__main__":
    register()