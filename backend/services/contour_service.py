import cv2
import numpy as np

def create_analysis_from_blueprint(
    image_path,
    wall_height=2.0,
    scale_factor=0.015,
    min_wall_area=400,
    morph_kernel_size=5,
):
    """
    OpenCV-based blueprint analysis for raster images.
    Extracts walls, doors, windows, and bounding rooms via adaptive thresholding and contour analysis.
    """
    print(f"[ANALYSIS] Analyzing blueprint: {image_path}")
    img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise FileNotFoundError(f"Failed to load image for analysis: {image_path}")

    h, w = img.shape[:2]

    blur = cv2.GaussianBlur(img, (5, 5), 0)
    thresh = cv2.adaptiveThreshold(
        blur,
        255,
        cv2.ADAPTIVE_THRESH_MEAN_C,
        cv2.THRESH_BINARY_INV,
        15,
        5,
    )

    kernel = np.ones((morph_kernel_size, morph_kernel_size), np.uint8)
    morph = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel, iterations=2)
    morph = cv2.morphologyEx(morph, cv2.MORPH_OPEN, kernel, iterations=1)

    contours, hierarchy = cv2.findContours(
        morph, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )
    print(f"[CONTOURS] Found {len(contours)} raw contours")

    walls = []
    doors = []
    windows = []
    all_wall_points = []

    def norm_pt(pt):
        x, y = pt
        return [float(x) / w, float(y) / h]

    for i, cnt in enumerate(contours):
        area = cv2.contourArea(cnt)
        if area < min_wall_area:
            continue

        peri = cv2.arcLength(cnt, True)
        eps = max(2.0, 0.01 * peri)
        approx = cv2.approxPolyDP(cnt, eps, True)
        pts = [tuple(p[0]) for p in approx]

        x, y, w_rect, h_rect = cv2.boundingRect(approx)
        rect_area = w_rect * h_rect

        if (
            len(pts) == 4
            and rect_area < area * 0.6
            and rect_area < 5000
            and (min(w_rect, h_rect) < max(w_rect, h_rect) * 0.35)
        ):
            if max(w_rect, h_rect) / float(min(w_rect, h_rect) + 1e-6) > 1.5:
                center = (x + w_rect / 2.0, y + h_rect / 2.0)
                doors.append(
                    {
                        "id": f"door_{len(doors)}",
                        "center": [center[0] / w, center[1] / h],
                        "width": w_rect / float(w),
                        "height": h_rect / float(h),
                        "area_px": rect_area,
                    }
                )
                continue
            else:
                center = (x + w_rect / 2.0, y + h_rect / 2.0)
                windows.append(
                    {
                        "id": f"window_{len(windows)}",
                        "center": [center[0] / w, center[1] / h],
                        "width": w_rect / float(w),
                        "height": h_rect / float(h),
                        "area_px": rect_area,
                    }
                )
                continue

        norm_poly = [norm_pt(p) for p in pts]
        walls.append(
            {
                "id": f"wall_{len(walls)}",
                "vertices": norm_poly,
                "thickness": 0.01,
            }
        )
        all_wall_points.extend(pts)

    if len(all_wall_points) > 0:
        all_pts_arr = np.array(all_wall_points)
        min_x, min_y = np.min(all_pts_arr, axis=0)
        max_x, max_y = np.max(all_pts_arr, axis=0)
        room_bounds = {
            "id": "room_0",
            "bounds": {
                "x": float(min_x) / w,
                "y": float(min_y) / h,
                "width": float(max_x - min_x) / w,
                "height": float(max_y - min_y) / h,
            },
            "center": [
                (min_x + max_x) / (2.0 * w),
                (min_y + max_y) / (2.0 * h),
            ],
        }
        rooms = [room_bounds]
    else:
        rooms = []

    analysis = {
        "image_width": w,
        "image_height": h,
        "scale_factor": scale_factor,
        "wall_height": wall_height,
        "walls": walls,
        "doors": doors,
        "windows": windows,
        "rooms": rooms,
    }

    print(
        f"[ANALYSIS_OK] walls={len(walls)}, doors={len(doors)}, "
        f"windows={len(windows)}, rooms={len(rooms)}"
    )
    return analysis
