import sys
import os
import site

# Dynamically locate user site-packages where ezdxf is installed
user_site = site.getusersitepackages()
if user_site and os.path.exists(user_site) and user_site not in sys.path:
    sys.path.append(user_site)

# Support explicit environment variable if provided
env_site = os.environ.get("PYTHON_SITE_PACKAGES")
if env_site and os.path.exists(env_site) and env_site not in sys.path:
    sys.path.append(env_site)

# Fallback path for Windows user roaming site-packages
fallback_site = r"C:\Users\Hamza Khan\AppData\Roaming\Python\Python311\site-packages"
if os.path.exists(fallback_site) and fallback_site not in sys.path:
    sys.path.append(fallback_site)

import bpy
import json
import bmesh
import ezdxf
from mathutils import Vector


# -------------------------------------------------
# SCENE CLEANUP
# -------------------------------------------------
def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for mesh in bpy.data.meshes:
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)


def intersect_lines_2d(p1, v1, p2, v2):
    denom = v1.x * v2.y - v1.y * v2.x
    if abs(denom) < 1e-6:
        return (p1 + p2) * 0.5
    dp = p2 - p1
    s = (dp.x * v2.y - dp.y * v2.x) / denom
    return Vector((p1.x + s * v1.x, p1.y + s * v1.y, 0))


def solve_wall_corners(all_segments_m, wall_thickness):
    """
    Computes corner-mitered quadrilateral boundaries for straight wall segments in meters.
    Ensures adjoining walls meet cleanly at corners and T-junctions without gaps,
    unintended overlaps, or duplicate faces, while preserving intentional openings.
    """
    half_t = wall_thickness / 2.0
    seg_data = []
    for i, (p1, p2) in enumerate(all_segments_m):
        d = p2 - p1
        length = d.length
        if length < 1e-5:
            d_norm = Vector((1, 0, 0))
        else:
            d_norm = d.normalized()
        n = Vector((-d_norm.y, d_norm.x, 0)) * half_t

        seg_data.append({
            "idx": i,
            "p1": p1,
            "p2": p2,
            "d": d_norm,
            "n": n,
            "length": length,
            "b1": p1 + n,
            "b2": p2 + n,
            "b3": p2 - n,
            "b4": p1 - n,
        })

    # Cluster shared endpoints with threshold 0.08m (8cm)
    # Intentional openings (doors >= 0.7m, windows) will NOT be clustered or closed.
    EPS = 0.08
    endpoints = []
    for i, s in enumerate(seg_data):
        endpoints.append({"seg": i, "end": 1, "pt": s["p1"]})
        endpoints.append({"seg": i, "end": 2, "pt": s["p2"]})

    junctions = []
    visited = set()
    for i in range(len(endpoints)):
        if i in visited:
            continue
        group = [endpoints[i]]
        visited.add(i)
        for j in range(i + 1, len(endpoints)):
            if j not in visited:
                if (endpoints[i]["pt"] - endpoints[j]["pt"]).length <= EPS:
                    visited.add(j)
                    group.append(endpoints[j])
        junctions.append(group)

    for group in junctions:
        if len(group) == 2:
            eA, eB = group[0], group[1]
            sA, sB = seg_data[eA["seg"]], seg_data[eB["seg"]]
            J = (eA["pt"] + eB["pt"]) * 0.5

            dA = (sA["p2"] - J).normalized() if eA["end"] == 1 else (sA["p1"] - J).normalized()
            dB = (sB["p2"] - J).normalized() if eB["end"] == 1 else (sB["p1"] - J).normalized()

            cross = dA.x * dB.y - dA.y * dB.x
            dot = dA.dot(dB)

            if abs(cross) > 0.05 and dot > -0.99:
                nA = Vector((-dA.y, dA.x, 0)) * half_t
                nB = Vector((-dB.y, dB.x, 0)) * half_t

                if cross > 0:
                    O = intersect_lines_2d(J - nA, dA, J + nB, dB)
                    I = intersect_lines_2d(J + nA, dA, J - nB, dB)
                    ptA_left, ptA_right = I, O
                    ptB_left, ptB_right = O, I
                else:
                    O = intersect_lines_2d(J + nA, dA, J - nB, dB)
                    I = intersect_lines_2d(J - nA, dA, J + nB, dB)
                    ptA_left, ptA_right = O, I
                    ptB_left, ptB_right = I, O

                max_miter = wall_thickness * 2.2
                if (O - J).length > max_miter:
                    O = J + (O - J).normalized() * max_miter
                if (I - J).length > max_miter:
                    I = J + (I - J).normalized() * max_miter

                if eA["end"] == 1:
                    sA["b1"] = ptA_left
                    sA["b4"] = ptA_right
                else:
                    sA["b2"] = ptA_right
                    sA["b3"] = ptA_left

                if eB["end"] == 1:
                    sB["b1"] = ptB_left
                    sB["b4"] = ptB_right
                else:
                    sB["b2"] = ptB_right
                    sB["b3"] = ptB_left

        elif len(group) >= 3:
            best_pair = None
            min_dot = 0
            for a in range(len(group)):
                for b in range(a + 1, len(group)):
                    sA = seg_data[group[a]["seg"]]
                    sB = seg_data[group[b]["seg"]]
                    dA = sA["d"] if group[a]["end"] == 1 else -sA["d"]
                    dB = sB["d"] if group[b]["end"] == 1 else -sB["d"]
                    d_dot = dA.dot(dB)
                    if d_dot < min_dot:
                        min_dot = d_dot
                        best_pair = (a, b)

            if best_pair and min_dot < -0.7:
                through_segs = {group[best_pair[0]]["seg"], group[best_pair[1]]["seg"]}
                for k, e in enumerate(group):
                    if e["seg"] not in through_segs:
                        sAbut = seg_data[e["seg"]]
                        abut_d = (sAbut["p2"] - sAbut["p1"]).normalized()
                        if e["end"] == 2:
                            abut_d = -abut_d
                        offset_vec = abut_d * half_t
                        if e["end"] == 1:
                            sAbut["b1"] = sAbut["b1"] + offset_vec
                            sAbut["b4"] = sAbut["b4"] + offset_vec
                        else:
                            sAbut["b2"] = sAbut["b2"] + offset_vec
                            sAbut["b3"] = sAbut["b3"] + offset_vec

    return seg_data


# -------------------------------------------------
# CORE DXF → BUILDING
# -------------------------------------------------
def generate_building_from_dxf(config):
    dxf_path = config.get("dxf_path")
    target_size = float(config.get("target_size", 30.0))
    wall_height = float(config.get("wall_height", 3.2))
    wall_thickness = float(config.get("wall_thickness", 0.25))
    floors = int(config.get("floors", 1 if "line_segments" in config else 3))
    floor_height = float(config.get("floor_height", 3.5))
    slab_thickness = float(config.get("slab_thickness", 0.3))

    minx = miny = 1e9
    maxx = maxy = -1e9
    line_count = 0

    all_segments = []

    # Branch 1: Direct 2D Vector Geometry from Vector-Assisted generation
    if "line_segments" in config and len(config["line_segments"]) > 0:
        print(f"Loading direct vector geometry: {len(config['line_segments'])} segments")
        for seg in config["line_segments"]:
            p1 = Vector((float(seg[0][0]), float(seg[0][1]), 0))
            p2 = Vector((float(seg[1][0]), float(seg[1][1]), 0))
            all_segments.append((p1, p2))

    # Branch 2: DXF File entity ingestion
    elif dxf_path:
        if not os.path.exists(dxf_path):
            raise RuntimeError(f"DXF file not found: {dxf_path}")

        print(f"Loading DXF: {dxf_path}")
        doc = ezdxf.readfile(dxf_path)
        msp = doc.modelspace()

        # Build wall faces from LINE and LWPOLYLINE entities
        for e in msp:
            dxftype = e.dxftype()

            if dxftype == "LINE":
                p1 = Vector((e.dxf.start.x, e.dxf.start.y, 0))
                p2 = Vector((e.dxf.end.x, e.dxf.end.y, 0))
                all_segments.append((p1, p2))
            elif dxftype == "LWPOLYLINE":
                try:
                    pts = [Vector((p[0], p[1], 0)) for p in e.get_points()]
                    if getattr(e, "is_closed", False) and len(pts) > 2:
                        pts.append(pts[0])
                    for idx in range(len(pts) - 1):
                        all_segments.append((pts[idx], pts[idx + 1]))
                except Exception:
                    pass
    else:
        raise RuntimeError("No DXF path or line_segments provided in config")

    curves_data = config.get("curves") or []
    all_curves = []

    for c in curves_data:
        p1_raw = c.get("p1")
        p2_raw = c.get("p2")
        ctrl_raw = c.get("control")
        if p1_raw and p2_raw and ctrl_raw:
            all_curves.append({
                "p1": Vector((float(p1_raw[0]), float(p1_raw[1]), 0)),
                "p2": Vector((float(p2_raw[0]), float(p2_raw[1]), 0)),
                "ctrl": Vector((float(ctrl_raw[0]), float(ctrl_raw[1]), 0)),
            })

    # 1. Compute global bounding box across all straight segments and curves
    for p1, p2 in all_segments:
        minx = min(minx, p1.x, p2.x)
        miny = min(miny, p1.y, p2.y)
        maxx = max(maxx, p1.x, p2.x)
        maxy = max(maxy, p1.y, p2.y)

    for c in all_curves:
        minx = min(minx, c["p1"].x, c["p2"].x, c["ctrl"].x)
        miny = min(miny, c["p1"].y, c["p2"].y, c["ctrl"].y)
        maxx = max(maxx, c["p1"].x, c["p2"].x, c["ctrl"].x)
        maxy = max(maxy, c["p1"].y, c["p2"].y, c["ctrl"].y)

    plan_size = max(maxx - minx, maxy - miny)
    if plan_size <= 0:
        plan_size = 1.0

    # Auto-scale factor to convert raw input units (pixels or CAD units) to real-world meters
    scale = target_size / plan_size
    center = Vector(((minx + maxx) / 2.0, (miny + maxy) / 2.0, 0))

    def to_meters(pt):
        return Vector(((pt.x - center.x) * scale, (pt.y - center.y) * scale, 0))

    # Material for walls
    mat = bpy.data.materials.new("WallDark")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.2, 0.2, 0.22, 1)
    bsdf.inputs["Roughness"].default_value = 0.7

    wall_objs = []
    wall_index = 0

    # Convert straight segments to real-world meters
    straight_segments_m = []
    for p1, p2 in all_segments:
        p1_m = to_meters(p1)
        p2_m = to_meters(p2)
        if (p2_m - p1_m).length >= 1e-5:
            straight_segments_m.append((p1_m, p2_m))

    # 2. Build straight wall quad prisms with clean miter corners
    solved_walls = solve_wall_corners(straight_segments_m, wall_thickness)
    up = Vector((0, 0, wall_height))

    for s in solved_walls:
        bm_wall = bmesh.new()
        b1 = bm_wall.verts.new(s["b1"])
        b2 = bm_wall.verts.new(s["b2"])
        b3 = bm_wall.verts.new(s["b3"])
        b4 = bm_wall.verts.new(s["b4"])

        t1 = bm_wall.verts.new(s["b1"] + up)
        t2 = bm_wall.verts.new(s["b2"] + up)
        t3 = bm_wall.verts.new(s["b3"] + up)
        t4 = bm_wall.verts.new(s["b4"] + up)

        # 6 watertight quad faces with outward-facing normals
        bm_wall.faces.new((b4, b3, b2, b1))
        bm_wall.faces.new((t1, t2, t3, t4))
        bm_wall.faces.new((b1, b2, t2, t1))
        bm_wall.faces.new((b2, b3, t3, t2))
        bm_wall.faces.new((b3, b4, t4, t3))
        bm_wall.faces.new((b4, b1, t1, t4))

        mesh = bpy.data.meshes.new(f"wall_{wall_index}")
        bm_wall.to_mesh(mesh)
        bm_wall.free()

        w_obj = bpy.data.objects.new(f"wall_{wall_index}", mesh)
        bpy.context.collection.objects.link(w_obj)
        w_obj.data.materials.append(mat)
        wall_objs.append(w_obj)
        wall_index += 1

    # 3. Build curved wall quad chains directly in real-world meters
    for c in all_curves:
        p1_m = to_meters(c["p1"])
        p2_m = to_meters(c["p2"])
        ctrl_m = to_meters(c["ctrl"])

        steps = 16
        pts_m = []
        for i in range(steps + 1):
            t = i / float(steps)
            x = (1.0 - t) ** 2 * p1_m.x + 2.0 * (1.0 - t) * t * ctrl_m.x + t ** 2 * p2_m.x
            y = (1.0 - t) ** 2 * p1_m.y + 2.0 * (1.0 - t) * t * ctrl_m.y + t ** 2 * p2_m.y
            pts_m.append(Vector((x, y, 0)))

        bm_curve = bmesh.new()
        up = Vector((0, 0, wall_height))
        left_bot = []
        right_bot = []
        left_top = []
        right_top = []

        for i in range(len(pts_m)):
            if i == 0:
                tan = (pts_m[1] - pts_m[0]).normalized()
            elif i == len(pts_m) - 1:
                tan = (pts_m[-1] - pts_m[-2]).normalized()
            else:
                tan = (pts_m[i + 1] - pts_m[i - 1]).normalized()

            norm = Vector((-tan.y, tan.x, 0)) * (wall_thickness / 2.0)
            lb = pts_m[i] + norm
            rb = pts_m[i] - norm
            left_bot.append(bm_curve.verts.new(lb))
            right_bot.append(bm_curve.verts.new(rb))
            left_top.append(bm_curve.verts.new(lb + up))
            right_top.append(bm_curve.verts.new(rb + up))

        for i in range(len(pts_m) - 1):
            try:
                bm_curve.faces.new((left_bot[i], right_bot[i], right_bot[i+1], left_bot[i+1]))
                bm_curve.faces.new((left_top[i], left_top[i+1], right_top[i+1], right_top[i]))
                bm_curve.faces.new((left_bot[i], left_bot[i+1], left_top[i+1], left_top[i]))
                bm_curve.faces.new((right_bot[i+1], right_bot[i], right_top[i], right_top[i+1]))
            except:
                pass

        try:
            bm_curve.faces.new((left_bot[0], right_bot[0], right_top[0], left_top[0]))
            bm_curve.faces.new((right_bot[-1], left_bot[-1], left_top[-1], right_top[-1]))
        except:
            pass

        mesh = bpy.data.meshes.new(f"wall_{wall_index}")
        bm_curve.to_mesh(mesh)
        bm_curve.free()

        w_obj = bpy.data.objects.new(f"wall_{wall_index}", mesh)
        bpy.context.collection.objects.link(w_obj)
        w_obj.data.materials.append(mat)
        wall_objs.append(w_obj)
        wall_index += 1

    if not wall_objs:
        raise RuntimeError("No usable vector lines or entities for walls in blueprint")

    # Floor slab (tight fit bounding all wall objects)
    minx = float("inf")
    maxx = float("-inf")
    miny = float("inf")
    maxy = float("-inf")
    for o in wall_objs:
        for c in o.bound_box:
            v = o.matrix_world @ Vector(c)
            minx = min(minx, v.x)
            maxx = max(maxx, v.x)
            miny = min(miny, v.y)
            maxy = max(maxy, v.y)

    sx = max(1.0, maxx - minx)
    sy = max(1.0, maxy - miny)
    cx = (minx + maxx) / 2.0
    cy = (miny + maxy) / 2.0

    bpy.ops.mesh.primitive_cube_add(location=(cx, cy, -slab_thickness / 2.0))
    slab = bpy.context.object
    slab.name = "FloorSlab"
    slab.scale = (sx / 2.0, sy / 2.0, slab_thickness / 2.0)

    # Multi-floor duplication
    if floors > 1:
        for f in range(1, floors):
            for o in wall_objs:
                w_f = o.copy()
                w_f.data = o.data.copy()
                w_f.location.z = f * floor_height
                w_f.name = f"floor_{f}_{o.name}"
                bpy.context.collection.objects.link(w_f)

            s_f = slab.copy()
            s_f.data = slab.data.copy()
            s_f.location.z = f * floor_height
            s_f.name = f"floor_{f}_FloorSlab"
            bpy.context.collection.objects.link(s_f)

    # Light & camera
    bpy.ops.object.light_add(type="SUN", location=(30, -30, 50))
    bpy.context.object.data.energy = 4

    bpy.ops.object.camera_add(
        location=(25, -25, 25),
        rotation=(1.1, 0, 0.9),
    )
    bpy.context.scene.camera = bpy.context.object


# -------------------------------------------------
# MAIN
# -------------------------------------------------
def main():
    # Blender passes its own args; read after "--"
    argv = sys.argv
    if "--" not in argv:
        raise RuntimeError("Missing '--' and config arguments")

    argv = argv[argv.index("--") + 1 :]
    if len(argv) < 2:
        raise RuntimeError("Usage: blender ... --python generate_model.py -- <config.json> <output.glb>")

    config_path, output_path = argv[0], argv[1]

    if not os.path.exists(config_path):
        raise RuntimeError(f"Config JSON not found: {config_path}")

    with open(config_path, "r") as f:
        config = json.load(f)

    clear_scene()
    generate_building_from_dxf(config)

    # Export GLB
    print(f"📦 Exporting GLB to: {output_path}")
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format="GLB",
        export_apply=True,
    )
    print("✅ Export done")


if __name__ == "__main__":
    main()
