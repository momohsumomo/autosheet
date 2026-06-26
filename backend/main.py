"""AI 音樂館員 API（Phase 1：整本樂譜結構切分匯入）。

流程：
  /import/analyze  上傳混合檔案 -> 轉頁圖 -> 高解析存 Storage -> 縮圖丟 Gemini 切歌
                   -> 回傳「提議結構」給前端確認（尚未寫 Firestore）。
  /import/save     前端確認/微調後 -> write_batch 寫入 books/songs/pages。
"""

from __future__ import annotations

import uuid

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from firebase_admin import firestore as admin_firestore

import firebase_client
import gemini_service
import rendering
from auth_dep import get_uid
from schemas import (
    AnalyzeResponse,
    PageInfo,
    SaveBookRequest,
    SaveBookResponse,
)

load_dotenv()

app = FastAPI(title="AI 音樂館員 API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/import/analyze", response_model=AnalyzeResponse)
async def analyze_import(
    files: list[UploadFile] = File(...),
    scan: bool = Form(True),
    scan_mode: str = Form("gray"),
    uid: str = Depends(get_uid),
) -> AnalyzeResponse:
    if not files:
        raise HTTPException(status_code=400, detail="請至少上傳一個檔案。")

    raw_files: list[tuple[str, bytes]] = []
    for f in files:
        data = await f.read()
        if data:
            raw_files.append((f.content_type or "", data))

    if not raw_files:
        raise HTTPException(status_code=400, detail="上傳的檔案內容為空。")

    scan_mode = scan_mode if scan_mode in ("gray", "bw") else "gray"

    try:
        pages, source_type = rendering.render_files(raw_files, scan, scan_mode)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"檔案解析失敗：{exc}") from exc

    if not pages:
        raise HTTPException(status_code=400, detail="沒有可處理的頁面。")

    book_id = uuid.uuid4().hex

    # 高解析頁圖存 Storage
    page_infos: list[PageInfo] = []
    try:
        for index, page in enumerate(pages, start=1):
            storage_path = f"users/{uid}/books/{book_id}/pages/{index:04d}.jpg"
            url = firebase_client.upload_bytes(
                page.full_jpeg, storage_path, content_type="image/jpeg"
            )
            page_infos.append(
                PageInfo(page_number=index, image_url=url, storage_path=storage_path)
            )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"頁圖上傳失敗：{exc}") from exc

    # 縮圖丟 Gemini 做結構切分
    try:
        analysis = gemini_service.analyze_book([p.thumb_jpeg for p in pages])
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Gemini 切分失敗：{exc}") from exc

    return AnalyzeResponse(
        book_id=book_id,
        book_title=analysis.book_title,
        source_type=source_type,
        pages=page_infos,
        songs=analysis.songs,
    )


@app.post("/import/save", response_model=SaveBookResponse)
def save_import(
    payload: SaveBookRequest, uid: str = Depends(get_uid)
) -> SaveBookResponse:
    if not payload.pages:
        raise HTTPException(status_code=400, detail="缺少頁面資料。")
    if not payload.songs:
        raise HTTPException(status_code=400, detail="缺少曲目資料。")

    try:
        db = firebase_client.get_firestore()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    batch = db.batch()
    now = admin_firestore.SERVER_TIMESTAMP

    cover_url = payload.cover_url or payload.pages[0].image_url

    # 所有資料寫入該使用者的子集合 users/{uid}/...
    user_root = db.collection("users").document(uid)

    book_ref = user_root.collection("books").document(payload.book_id)
    batch.set(
        book_ref,
        {
            "ownerId": uid,
            "title": payload.book_title,
            "coverUrl": cover_url,
            "sourceType": payload.source_type,
            "pageCount": len(payload.pages),
            "createdAt": now,
            "updatedAt": now,
        },
    )

    # 建立 page docs，並記錄 pageNumber -> pageId 對照
    page_id_by_number: dict[int, str] = {}
    page_ids: list[str] = []
    for page in payload.pages:
        page_ref = user_root.collection("pages").document()
        page_id_by_number[page.page_number] = page_ref.id
        page_ids.append(page_ref.id)
        batch.set(
            page_ref,
            {
                "ownerId": uid,
                "bookId": payload.book_id,
                "pageNumber": page.page_number,
                "imageUrl": page.image_url,
                "storagePath": page.storage_path,
                "createdAt": now,
            },
        )

    # 建立 song docs，pageIds 由起訖頁碼解析
    song_ids: list[str] = []
    for order, song in enumerate(payload.songs):
        start = max(1, song.start_page)
        end = max(start, song.end_page)
        song_page_ids = [
            page_id_by_number[n]
            for n in range(start, end + 1)
            if n in page_id_by_number
        ]
        tags = [t.strip() for t in song.tags if t and t.strip()]
        tags_normalized = list(dict.fromkeys(t.lower() for t in tags))

        song_ref = user_root.collection("songs").document()
        song_ids.append(song_ref.id)
        batch.set(
            song_ref,
            {
                "ownerId": uid,
                "bookId": payload.book_id,
                "bookTitle": payload.book_title,
                "title": song.title,
                "composer": song.composer,
                "tags": tags,
                "tagsNormalized": tags_normalized,
                "pageIds": song_page_ids,
                "startPage": start,
                "endPage": end,
                "order": order,
                "midiUrl": None,
                "createdAt": now,
                "updatedAt": now,
            },
        )

    try:
        batch.commit()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"寫入 Firestore 失敗：{exc}") from exc

    return SaveBookResponse(book_id=payload.book_id, song_ids=song_ids, page_ids=page_ids)


@app.delete("/account")
def delete_account(uid: str = Depends(get_uid)) -> dict[str, str]:
    """刪除使用者的所有資料：Firestore 子集合、Storage 檔案、以及 Auth 帳號。"""
    from firebase_admin import auth as fb_auth

    try:
        db = firebase_client.get_firestore()
        user_root = db.collection("users").document(uid)
        for sub in ("songs", "pages", "books"):
            for doc in user_root.collection(sub).stream():
                doc.reference.delete()
        user_root.delete()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"刪除 Firestore 資料失敗：{exc}") from exc

    try:
        bucket = firebase_client.get_bucket()
        blobs = list(bucket.list_blobs(prefix=f"users/{uid}/"))
        for blob in blobs:
            blob.delete()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"刪除 Storage 檔案失敗：{exc}") from exc

    try:
        fb_auth.delete_user(uid)
    except Exception:
        # 帳號可能已不存在，忽略
        pass

    return {"status": "deleted"}
