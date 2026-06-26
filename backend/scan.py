"""把手機拍的照片「掃描化」：透視矯正 + 去陰影 + 增強對比。

設計原則：
- 全程包在 try/except，任何一步失敗都退回前一步的結果，
  絕不因為矯正失敗而讓整個上傳壞掉。
- 預設輸出灰階增強（最安全，保留五線譜與音符細節）。
- 另提供純黑白（adaptive threshold）模式給偏好「掃描感」的人。
"""

from __future__ import annotations

import cv2
import numpy as np
from PIL import Image

# 偵測到的紙張四邊形面積至少要佔整張的比例，才採用透視矯正（保守避免誤裁）
_MIN_QUAD_AREA_RATIO = 0.40


def _pil_to_cv(img: Image.Image) -> np.ndarray:
    if img.mode != "RGB":
        img = img.convert("RGB")
    arr = np.array(img)
    return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)


def _cv_to_pil(arr: np.ndarray) -> Image.Image:
    if arr.ndim == 2:
        return Image.fromarray(arr, mode="L")
    return Image.fromarray(cv2.cvtColor(arr, cv2.COLOR_BGR2RGB))


def _order_points(pts: np.ndarray) -> np.ndarray:
    """把 4 個點排成 [左上, 右上, 右下, 左下]。"""
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]  # 左上：x+y 最小
    rect[2] = pts[np.argmax(s)]  # 右下：x+y 最大
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]  # 右上：x-y 最小
    rect[3] = pts[np.argmax(diff)]  # 左下：x-y 最大
    return rect


def _find_document_quad(bgr: np.ndarray) -> np.ndarray | None:
    """嘗試找出畫面中紙張的四個角；找不到或不可靠就回傳 None。"""
    h, w = bgr.shape[:2]
    img_area = float(h * w)

    # 縮小加速邊緣偵測
    scale = 1000.0 / max(h, w) if max(h, w) > 1000 else 1.0
    small = cv2.resize(bgr, (int(w * scale), int(h * scale))) if scale != 1.0 else bgr

    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(gray, 50, 150)
    edges = cv2.dilate(edges, np.ones((5, 5), np.uint8), iterations=1)

    contours, _ = cv2.findContours(
        edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )
    if not contours:
        return None

    small_area = float(small.shape[0] * small.shape[1])
    for cnt in sorted(contours, key=cv2.contourArea, reverse=True)[:5]:
        area = cv2.contourArea(cnt)
        if area < _MIN_QUAD_AREA_RATIO * small_area:
            continue
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
        if len(approx) == 4 and cv2.isContourConvex(approx):
            quad = approx.reshape(4, 2).astype("float32") / scale
            # 再次確認還原到原圖後面積夠大
            if cv2.contourArea(quad.astype("float32")) >= _MIN_QUAD_AREA_RATIO * img_area:
                return quad
    return None


def _warp(bgr: np.ndarray, quad: np.ndarray) -> np.ndarray:
    rect = _order_points(quad)
    (tl, tr, br, bl) = rect
    width_a = np.linalg.norm(br - bl)
    width_b = np.linalg.norm(tr - tl)
    height_a = np.linalg.norm(tr - br)
    height_b = np.linalg.norm(tl - bl)
    max_w = int(max(width_a, width_b))
    max_h = int(max(height_a, height_b))
    if max_w < 10 or max_h < 10:
        return bgr
    dst = np.array(
        [[0, 0], [max_w - 1, 0], [max_w - 1, max_h - 1], [0, max_h - 1]],
        dtype="float32",
    )
    matrix = cv2.getPerspectiveTransform(rect, dst)
    return cv2.warpPerspective(bgr, matrix, (max_w, max_h))


def _remove_shadow(bgr: np.ndarray) -> np.ndarray:
    """以「除背景」手法去陰影、打亮紙面。回傳 BGR。"""
    planes = cv2.split(bgr)
    result = []
    for plane in planes:
        dilated = cv2.dilate(plane, np.ones((7, 7), np.uint8))
        bg = cv2.medianBlur(dilated, 21)
        diff = 255 - cv2.absdiff(plane, bg)
        norm = cv2.normalize(
            diff, None, alpha=0, beta=255, norm_type=cv2.NORM_MINMAX
        )
        result.append(norm)
    return cv2.merge(result)


def _to_scan_gray(bgr: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    gray = clahe.apply(gray)
    return gray


def _to_scan_bw(gray: np.ndarray) -> np.ndarray:
    return cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 25, 15
    )


def enhance_photo(
    img: Image.Image, mode: str = "gray", auto_crop: bool = True
) -> Image.Image:
    """把一張照片掃描化。任何失敗都安全退回原圖。

    mode: "gray"（灰階增強，預設）或 "bw"（純黑白）。
    auto_crop: 是否嘗試偵測紙張並透視矯正。
    """
    try:
        bgr = _pil_to_cv(img)
    except Exception:
        return img

    if auto_crop:
        try:
            quad = _find_document_quad(bgr)
            if quad is not None:
                bgr = _warp(bgr, quad)
        except Exception:
            pass

    try:
        bgr = _remove_shadow(bgr)
    except Exception:
        pass

    try:
        gray = _to_scan_gray(bgr)
        if mode == "bw":
            return _cv_to_pil(_to_scan_bw(gray))
        return _cv_to_pil(gray)
    except Exception:
        return img
