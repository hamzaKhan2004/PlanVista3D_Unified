import cv2
import numpy as np
import math
import os

def preprocess_floor_plan(img_gray, morph_close_kernel=9, morph_open_kernel=3):
    """
    Cleans floor plan image, enhances contrast, reduces noise, and extracts a binary wall mask.
    """
    h, w = img_gray.shape[:2]

    # 1. Contrast Limited Adaptive Histogram Equalization (CLAHE)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(img_gray)

    # 2. Bilateral filter to smooth scanner noise and compression artifacts while preserving wall edges
    denoised = cv2.bilateralFilter(enhanced, d=7, sigmaColor=50, sigmaSpace=50)

    # 3. Adaptive thresholding to capture both thick and thin wall contours
    binary = cv2.adaptiveThreshold(
        denoised,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        blockSize=19,
        C=5,
    )

    # 4. Polarity check: ensure walls are foreground (white = 255) and background is black (0)
    # Check corner pixels (typically background)
    corners = [
        binary[0:20, 0:20],
        binary[0:20, w - 20:w],
        binary[h - 20:h, 0:20],
        binary[h - 20:h, w - 20:w],
    ]
    corner_mean = np.mean([np.mean(c) for c in corners if c.size > 0])
    if corner_mean > 127:  # Background was inverted
        binary = cv2.bitwise_not(binary)

    # 5. Morphological closing to fuse double-line wall boundaries & bridge small door/window gaps
    k_close = max(5, int(morph_close_kernel))
    if k_close % 2 == 0:
        k_close += 1
    kernel_close = cv2.getStructuringElement(cv2.MORPH_RECT, (k_close, k_close))
    closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel_close)

    # 6. Morphological opening to filter out small text characters, dimension tick marks, and noise
    k_open = max(2, int(morph_open_kernel))
    kernel_open = cv2.getStructuringElement(cv2.MORPH_RECT, (k_open, k_open))
    cleaned = cv2.morphologyEx(closed, cv2.MORPH_OPEN, kernel_open)

    return cleaned


def extract_morphological_skeleton(binary_mask):
    """
    Reduces solid wall strips to 1-pixel wide centerlines via morphological thinning.
    """
    skeleton = np.zeros_like(binary_mask)
    temp = binary_mask.copy()
    elem = cv2.getStructuringElement(cv2.MORPH_CROSS, (3, 3))

    max_iters = 200
    iters = 0
    while iters < max_iters:
        eroded = cv2.erode(temp, elem)
        opened = cv2.morphologyEx(eroded, cv2.MORPH_OPEN, elem)
        subset = cv2.subtract(eroded, opened)
        skeleton = cv2.bitwise_or(skeleton, subset)
        temp = eroded.copy()
        iters += 1
        if cv2.countNonZero(temp) == 0:
            break

    return skeleton


def detect_raw_segments(skeleton, min_length_px=25, max_gap_px=20):
    """
    Detects line segments along the skeleton with angle snapping for near-cardinal walls.
    """
    raw_lines = cv2.HoughLinesP(
        skeleton,
        rho=1,
        theta=np.pi / 180,
        threshold=18,
        minLineLength=int(min_length_px),
        maxLineGap=int(max_gap_px),
    )

    if raw_lines is None:
        return []

    segments = []
    for line in raw_lines:
        coords = np.asarray(line).ravel()
        if len(coords) < 4:
            continue
        x1, y1, x2, y2 = float(coords[0]), float(coords[1]), float(coords[2]), float(coords[3])
        dx, dy = x2 - x1, y2 - y1
        length = math.hypot(dx, dy)
        if length < min_length_px:
            continue

        # Angle snapping: snap to exact horizontal or vertical if within ~4 degrees
        angle = math.atan2(dy, dx) % math.pi
        if abs(angle) < 0.07 or abs(angle - math.pi) < 0.07:
            y_avg = (y1 + y2) / 2.0
            y1 = y2 = y_avg
        elif abs(angle - math.pi / 2.0) < 0.07:
            x_avg = (x1 + x2) / 2.0
            x1 = x2 = x_avg

        # Order endpoints canonical (x1 <= x2 or y1 <= y2)
        if x1 > x2 or (abs(x1 - x2) < 1e-4 and y1 > y2):
            x1, y1, x2, y2 = x2, y2, x1, y1

        segments.append([x1, y1, x2, y2])

    return segments


def merge_collinear_segments(segments, max_dist=14.0, max_angle_diff=0.08, max_gap=40.0):
    """
    Merges broken or collinear wall segments that run along the same trajectory.
    """
    if not segments:
        return []

    merged = True
    current = [list(s) for s in segments]

    while merged:
        merged = False
        new_list = []
        used = set()

        for i in range(len(current)):
            if i in used:
                continue
            s1 = current[i]
            x1, y1, x2, y2 = s1
            dx1, dy1 = x2 - x1, y2 - y1
            len1 = math.hypot(dx1, dy1)
            if len1 < 1e-4:
                continue

            ang1 = math.atan2(dy1, dx1) % math.pi
            ux, uy = dx1 / len1, dy1 / len1
            nx, ny = -uy, ux

            combined = s1

            for j in range(i + 1, len(current)):
                if j in used:
                    continue
                s2 = current[j]
                x3, y3, x4, y4 = s2
                dx2, dy2 = x4 - x3, y4 - y3
                len2 = math.hypot(dx2, dy2)
                if len2 < 1e-4:
                    continue

                ang2 = math.atan2(dy2, dx2) % math.pi
                ang_diff = abs(ang1 - ang2)
                if ang_diff > math.pi / 2.0:
                    ang_diff = abs(ang_diff - math.pi)

                if ang_diff > max_angle_diff:
                    continue

                # Perpendicular distance to line s1
                d3 = abs((x3 - x1) * nx + (y3 - y1) * ny)
                d4 = abs((x4 - x1) * nx + (y4 - y1) * ny)
                if max(d3, d4) > max_dist:
                    continue

                # Projections onto line s1
                proj1 = 0.0
                proj2 = len1
                proj3 = (x3 - x1) * ux + (y3 - y1) * uy
                proj4 = (x4 - x1) * ux + (y4 - y1) * uy

                span_a = (min(proj1, proj2), max(proj1, proj2))
                span_b = (min(proj3, proj4), max(proj3, proj4))

                gap = max(0.0, max(span_a[0], span_b[0]) - min(span_a[1], span_b[1]))
                if gap <= max_gap:
                    min_p = min(proj1, proj2, proj3, proj4)
                    max_p = max(proj1, proj2, proj3, proj4)
                    new_x1 = x1 + min_p * ux
                    new_y1 = y1 + min_p * uy
                    new_x2 = x1 + max_p * ux
                    new_y2 = y1 + max_p * uy
                    combined = [new_x1, new_y1, new_x2, new_y2]
                    used.add(j)
                    merged = True
                    break

            new_list.append(combined)
            used.add(i)

        current = new_list

    return current


def deduplicate_parallel_walls(segments, min_dist=4.0, max_dist=28.0, min_overlap_ratio=0.45):
    """
    Detects and merges parallel wall edge pairs (e.g. from thick wall inner/outer lines)
    into a single unified centerline segment.
    """
    if not segments:
        return []

    used = set()
    deduped = []

    for i in range(len(segments)):
        if i in used:
            continue
        s1 = segments[i]
        x1, y1, x2, y2 = s1
        dx1, dy1 = x2 - x1, y2 - y1
        len1 = math.hypot(dx1, dy1)
        if len1 < 1e-4:
            continue

        ux, uy = dx1 / len1, dy1 / len1
        nx, ny = -uy, ux
        ang1 = math.atan2(dy1, dx1) % math.pi

        merged_with = None

        for j in range(i + 1, len(segments)):
            if j in used:
                continue
            s2 = segments[j]
            x3, y3, x4, y4 = s2
            dx2, dy2 = x4 - x3, y4 - y3
            len2 = math.hypot(dx2, dy2)
            if len2 < 1e-4:
                continue

            ang2 = math.atan2(dy2, dx2) % math.pi
            ang_diff = abs(ang1 - ang2)
            if ang_diff > math.pi / 2.0:
                ang_diff = abs(ang_diff - math.pi)

            if ang_diff > 0.08:
                continue

            d3 = (x3 - x1) * nx + (y3 - y1) * ny
            d4 = (x4 - x1) * nx + (y4 - y1) * ny

            if not (min_dist <= abs(d3) <= max_dist and min_dist <= abs(d4) <= max_dist and (d3 * d4 > 0)):
                continue

            # Project onto s1 axis
            p3_t = (x3 - x1) * ux + (y3 - y1) * uy
            p4_t = (x4 - x1) * ux + (y4 - y1) * uy
            min_p2, max_p2 = min(p3_t, p4_t), max(p3_t, p4_t)

            overlap = max(0.0, min(len1, max_p2) - max(0.0, min_p2))
            min_span = min(len1, max_p2 - min_p2)

            if min_span > 0 and (overlap / min_span) >= min_overlap_ratio:
                # Merge into center axis
                avg_perp = (d3 + d4) / 4.0
                start_t = min(0.0, min_p2)
                end_t = max(len1, max_p2)
                cx1 = x1 + start_t * ux + avg_perp * nx
                cy1 = y1 + start_t * uy + avg_perp * ny
                cx2 = x1 + end_t * ux + avg_perp * nx
                cy2 = y1 + end_t * uy + avg_perp * ny
                merged_with = [cx1, cy1, cx2, cy2]
                used.add(j)
                break

        if merged_with:
            deduped.append(merged_with)
        else:
            deduped.append(s1)
        used.add(i)

    return deduped


def snap_wall_endpoints(segments, snap_radius=18.0):
    """
    Snaps nearby wall endpoints together at corners and T-junctions to guarantee wall continuity.
    """
    if not segments:
        return []

    new_segs = [list(s) for s in segments]

    # 1. Cluster nearby endpoints (L-corners)
    endpoints = []
    for i, s in enumerate(new_segs):
        endpoints.append((i, 0, s[0], s[1]))
        endpoints.append((i, 1, s[2], s[3]))

    clusters = []
    used_ep = set()
    for i in range(len(endpoints)):
        if i in used_ep:
            continue
        cluster = [endpoints[i]]
        used_ep.add(i)
        for j in range(i + 1, len(endpoints)):
            if j in used_ep:
                continue
            d = math.hypot(endpoints[i][2] - endpoints[j][2], endpoints[i][3] - endpoints[j][3])
            if d <= snap_radius:
                cluster.append(endpoints[j])
                used_ep.add(j)
        clusters.append(cluster)

    for cluster in clusters:
        if len(cluster) > 1:
            avg_x = sum(p[2] for p in cluster) / len(cluster)
            avg_y = sum(p[3] for p in cluster) / len(cluster)
            for seg_idx, pt_idx, _, _ in cluster:
                if pt_idx == 0:
                    new_segs[seg_idx][0] = avg_x
                    new_segs[seg_idx][1] = avg_y
                else:
                    new_segs[seg_idx][2] = avg_x
                    new_segs[seg_idx][3] = avg_y

    # 2. T-junction snapping (endpoint close to interior of another segment)
    for i, s in enumerate(new_segs):
        for pt_idx in (0, 1):
            px = s[0] if pt_idx == 0 else s[2]
            py = s[1] if pt_idx == 0 else s[3]
            for j, other in enumerate(new_segs):
                if i == j:
                    continue
                ox1, oy1, ox2, oy2 = other
                odx, ody = ox2 - ox1, oy2 - oy1
                olen = math.hypot(odx, ody)
                if olen < 1e-4:
                    continue
                t = ((px - ox1) * odx + (py - oy1) * ody) / (olen * olen)
                if 0.05 < t < 0.95:  # Strictly within segment interior
                    proj_x = ox1 + t * odx
                    proj_y = oy1 + t * ody
                    dist_to_line = math.hypot(px - proj_x, py - proj_y)
                    if dist_to_line <= snap_radius:
                        if pt_idx == 0:
                            s[0] = proj_x
                            s[1] = proj_y
                        else:
                            s[2] = proj_x
                            s[3] = proj_y
                        break

    return new_segs


def generate_svg_preview(segments, width, height, stroke_color="#FF7417", stroke_width=2.5):
    """
    Renders clean 2D vector wall paths as an SVG string for instant client-side inspection.
    """
    svg_lines = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'width="100%" height="100%" style="overflow: visible;">',
        f'  <defs>',
        f'    <filter id="vectorGlow" x="-20%" y="-20%" width="140%" height="140%">',
        f'      <feDropShadow dx="0" dy="0" stdDeviation="1.5" flood-color="{stroke_color}" flood-opacity="0.4"/>',
        f'    </filter>',
        f'  </defs>',
        f'  <g id="vector-walls" stroke="{stroke_color}" stroke-width="{stroke_width}" stroke-linecap="round" stroke-linejoin="round" filter="url(#vectorGlow)">',
    ]

    for s in segments:
        x1, y1, x2, y2 = s
        svg_lines.append(f'    <line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" />')

    # Add corner nodes
    svg_lines.append('  </g>')
    svg_lines.append(f'  <g id="vector-nodes" fill="#FFFFFF" stroke="{stroke_color}" stroke-width="1.2">')
    for s in segments:
        x1, y1, x2, y2 = s
        svg_lines.append(f'    <circle cx="{x1:.1f}" cy="{y1:.1f}" r="2.5" />')
        svg_lines.append(f'    <circle cx="{x2:.1f}" cy="{y2:.1f}" r="2.5" />')
    svg_lines.append('  </g>')
    svg_lines.append('</svg>')

    return "\n".join(svg_lines)


def extract_vector_walls(
    image_path,
    min_wall_length_px=25,
    morph_close_kernel=9,
    snap_radius=18.0,
    wall_height=3.0,
    wall_thickness=0.25,
    target_size=28.0,
):
    """
    High-level entry point for Vector-Assisted 2D Geometry Extraction.
    Returns cleaned line segments, normalized coordinates, SVG preview, and metrics.
    """
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Blueprint image not found: {image_path}")

    img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise ValueError(f"Failed to read image format for file: {image_path}")

    h, w = img.shape[:2]
    if w < 50 or h < 50:
        raise ValueError(f"Image resolution too small for architectural vectorization: {w}x{h}")

    # 1. Preprocessing & Binarization
    cleaned = preprocess_floor_plan(img, morph_close_kernel=morph_close_kernel)

    # 2. Skeletonization
    skeleton = extract_morphological_skeleton(cleaned)
    skeleton_pixel_count = cv2.countNonZero(skeleton)
    if skeleton_pixel_count < 100:
        raise ValueError("Could not extract reliable wall geometry from the uploaded image. Please ensure the floor plan has visible wall outlines.")

    # 3. Detect raw segments
    raw_segments = detect_raw_segments(skeleton, min_length_px=min_wall_length_px)
    if not raw_segments:
        raise ValueError("No distinct wall segments could be detected in the blueprint.")

    # 4. Collinear merging
    merged_segments = merge_collinear_segments(raw_segments, max_dist=14.0, max_gap=40.0)

    # 5. Parallel wall deduplication (fuse inner & outer wall edge duplicates)
    deduped_segments = deduplicate_parallel_walls(merged_segments, min_dist=4.0, max_dist=28.0)

    # 6. Secondary collinear merge to fuse segments unified by parallel deduplication
    refined_segments = merge_collinear_segments(deduped_segments, max_dist=12.0, max_gap=35.0)

    # 7. Endpoint & corner snapping (L-corners & T-junctions)
    snapped_segments = snap_wall_endpoints(refined_segments, snap_radius=snap_radius)

    # Filter out very short residual artifacts (< 15px)
    final_segments = []
    for s in snapped_segments:
        if math.hypot(s[2] - s[0], s[3] - s[1]) >= 15.0:
            final_segments.append(s)

    if not final_segments:
        raise ValueError("No structural walls remained after geometric filtering.")

    # Calculate bounding footprint
    all_x = [s[0] for s in final_segments] + [s[2] for s in final_segments]
    all_y = [s[1] for s in final_segments] + [s[3] for s in final_segments]
    min_x, max_x = min(all_x), max(all_x)
    min_y, max_y = min(all_y), max(all_y)
    footprint_w_px = max(1.0, max_x - min_x)
    footprint_h_px = max(1.0, max_y - min_y)

    # Convert to 2D line segments format for Blender (Cartesian: Y inverted from top-down image coords)
    blender_line_segments = []
    for s in final_segments:
        # Segment format: [[x1, y1], [x2, y2]] in image space
        blender_line_segments.append([
            [round(s[0], 2), round(h - s[1], 2)],
            [round(s[2], 2), round(h - s[3], 2)],
        ])

    # Normalized segments [0..1] for UI overlay
    normalized_segments = []
    for s in final_segments:
        normalized_segments.append([
            [round(s[0] / w, 4), round(s[1] / h, 4)],
            [round(s[2] / w, 4), round(s[3] / h, 4)],
        ])

    total_len_px = sum(math.hypot(s[2] - s[0], s[3] - s[1]) for s in final_segments)
    svg_preview = generate_svg_preview(final_segments, w, h)

    return {
        "success": True,
        "image_width": w,
        "image_height": h,
        "wall_count": len(final_segments),
        "total_length_px": round(total_len_px, 1),
        "bounds": {
            "min_x": round(min_x, 1),
            "max_x": round(max_x, 1),
            "min_y": round(min_y, 1),
            "max_y": round(max_y, 1),
            "footprint_w_px": round(footprint_w_px, 1),
            "footprint_h_px": round(footprint_h_px, 1),
        },
        "target_size": float(target_size),
        "wall_height": float(wall_height),
        "wall_thickness": float(wall_thickness),
        "line_segments": blender_line_segments,
        "normalized_segments": normalized_segments,
        "svg_preview": svg_preview,
    }
