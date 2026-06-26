"""把使用者上傳的混合檔案（PDF / 圖片）統一轉成「頁面圖片陣列」。

每一頁產生兩種版本：
- full：高解析，存到 Storage 給 iPad 閱讀用。
- thumb：低解析縮圖，只丟給 Gemini 做結構切分（省 token）。
"""

from __future__ import annotations

import io
import os
from dataclasses import dataclass

import fitz  # PyMuPDF
from PIL import Image

import scan

PDF_MIME = "application/pdf"
IMAGE_MIMES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}


@dataclass
class RenderedPage:
    """單一頁面的兩種版本。"""

    full_jpeg: bytes
    thumb_jpeg: bytes


def _thumb_max_px() -> int:
    try:
        return int(os.getenv("GEMINI_THUMB_MAX_PX", "1024"))
    except ValueError:
        return 1024


def _render_zoom() -> float:
    try:
        return float(os.getenv("STORAGE_RENDER_ZOOM", "2.0"))
    except ValueError:
        return 2.0


def _to_jpeg(img: Image.Image, quality: int = 85) -> bytes:
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality, optimize=True)
    return buf.getvalue()


def _make_thumb(img: Image.Image) -> bytes:
    max_px = _thumb_max_px()
    clone = img.copy()
    clone.thumbnail((max_px, max_px), Image.LANCZOS)
    return _to_jpeg(clone, quality=70)


def _pixmap_to_image(pix: "fitz.Pixmap") -> Image.Image:
    mode = "RGBA" if pix.alpha else "RGB"
    return Image.frombytes(mode, (pix.width, pix.height), pix.samples)


def render_pdf(pdf_bytes: bytes) -> list[RenderedPage]:
    pages: list[RenderedPage] = []
    zoom = _render_zoom()
    matrix = fitz.Matrix(zoom, zoom)
    with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
        for page in doc:
            pix = page.get_pixmap(matrix=matrix)
            img = _pixmap_to_image(pix)
            pages.append(
                RenderedPage(full_jpeg=_to_jpeg(img), thumb_jpeg=_make_thumb(img))
            )
    return pages


def render_image(
    image_bytes: bytes, scan_enabled: bool = True, scan_mode: str = "gray"
) -> RenderedPage:
    img = Image.open(io.BytesIO(image_bytes))
    img.load()
    # 手機照片走掃描化前處理（PDF 不經過這裡，本來就乾淨）
    if scan_enabled:
        img = scan.enhance_photo(img, mode=scan_mode, auto_crop=True)
    return RenderedPage(full_jpeg=_to_jpeg(img), thumb_jpeg=_make_thumb(img))


def render_files(
    files: list[tuple[str, bytes]],
    scan_enabled: bool = True,
    scan_mode: str = "gray",
) -> tuple[list[RenderedPage], str]:
    """依序處理多個檔案，攤平成頁面陣列。

    files: [(content_type, raw_bytes), ...]，順序即為頁面順序。
    scan_enabled / scan_mode 只影響圖片（照片）的掃描化前處理。
    回傳 (pages, source_type)。source_type 用於標記書本來源（pdf/images/mixed）。
    """
    pages: list[RenderedPage] = []
    seen_pdf = False
    seen_image = False

    for content_type, raw in files:
        ctype = (content_type or "").lower()
        if ctype == PDF_MIME:
            seen_pdf = True
            pages.extend(render_pdf(raw))
        elif ctype in IMAGE_MIMES:
            seen_image = True
            pages.append(render_image(raw, scan_enabled, scan_mode))
        else:
            # 盡力猜測：嘗試當圖片開，失敗就跳過
            try:
                pages.append(render_image(raw, scan_enabled, scan_mode))
                seen_image = True
            except Exception:
                continue

    if seen_pdf and seen_image:
        source_type = "mixed"
    elif seen_pdf:
        source_type = "pdf"
    else:
        source_type = "images"

    return pages, source_type
