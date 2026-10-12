import os

def create_analysis_from_dxf(
    dxf_path,
    target_size=30.0,
    wall_height=3.2,
    wall_thickness=0.25,
    floors=3,
    floor_height=3.5,
    slab_thickness=0.3,
):
    """
    Creates the JSON configuration payload for DXF extrusion in Blender.
    """
    return {
        "dxf_path": os.path.abspath(dxf_path),
        "target_size": float(target_size),
        "wall_height": float(wall_height),
        "wall_thickness": float(wall_thickness),
        "floors": int(floors),
        "floor_height": float(floor_height),
        "slab_thickness": float(slab_thickness),
    }
