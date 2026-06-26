"""Gemini 結構切分：把整本樂譜的縮圖丟給 Gemini，判斷有哪幾首歌、各自頁碼範圍與標籤。

只用低解析縮圖（省 token），且整本一次呼叫（拿到全書大局觀，切得最準）。
"""

from __future__ import annotations

import json
import os
import re
from functools import lru_cache
from typing import Any

import google.generativeai as genai

from schemas import TAGS_PER_SONG, BookAnalysis, SongStructure

_configured = False


def _ensure_configured() -> str:
    global _configured
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("缺少環境變數 GEMINI_API_KEY")
    if not _configured:
        genai.configure(api_key=api_key)
        _configured = True
    return os.getenv("GEMINI_MODEL", "gemini-flash-latest").replace("models/", "")


@lru_cache(maxsize=1)
def _system_prompt() -> str:
    return (
        "你是一位精通樂譜排版與音樂史的 AI 助理。"
        "現在會收到一組『按順序排列』的樂譜頁面縮圖，第 1 張圖是第 1 頁，依此類推。\n\n"
        "任務：找出這本樂譜包含『哪幾首獨立的曲子』，並精準判斷每首曲子的起訖頁碼。\n"
        "判斷新曲子開頭的線索：大字曲名、作曲家/作詞者姓名、向右縮排的新譜表、"
        "重新出現的調號與拍號、頁面頂部的曲目編號。\n"
        "請忽略歌曲內部的歌詞、練習註解與頁碼裝飾。\n"
        "若整本其實只有一首歌，就回傳一首，涵蓋全部頁面。\n\n"
        f"另外，為每首歌產生剛好 {TAGS_PER_SONG} 個『可搜尋』的中文標籤：可包含中文俗名、"
        "相關影視/動漫、知名翻唱者、適用氛圍、適用場合。嚴禁輸出任何樂理技術細節"
        "（調性、拍號、和聲、速度術語等）。\n\n"
        "只能輸出乾淨 JSON，不要 markdown code fence、不要前後說明。格式：\n"
        "{\n"
        '  "book_title": "整本書/專輯名稱（看不出來就用第一首曲名）",\n'
        '  "songs": [\n'
        '    {"title": "曲名", "composer": "作曲家", "start_page": 1, "end_page": 3,'
        f' "tags": ["標籤1", "...共{TAGS_PER_SONG}個"]}}\n'
        "  ]\n"
        "}"
    )


def _parse_clean_json(text: str) -> dict[str, Any]:
    cleaned = (text or "").strip()
    cleaned = re.sub(r"^```json\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"^```\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    return json.loads(cleaned or "{}")


def _normalize(analysis: BookAnalysis, total_pages: int) -> BookAnalysis:
    """夾住頁碼範圍、處理重疊與空缺，保證輸出可用。"""
    songs: list[SongStructure] = []
    for song in analysis.songs:
        start = max(1, min(song.start_page, total_pages))
        end = max(start, min(song.end_page, total_pages))
        song.start_page = start
        song.end_page = end
        # 補滿/裁切標籤數量
        tags = [t.strip() for t in song.tags if t and t.strip()]
        song.tags = list(dict.fromkeys(tags))[:TAGS_PER_SONG]
        songs.append(song)

    songs.sort(key=lambda s: s.start_page)

    # 沒切出任何歌：整本當一首
    if not songs:
        songs = [
            SongStructure(
                title=analysis.book_title or "未知曲名",
                composer="未知作曲家",
                start_page=1,
                end_page=total_pages,
                tags=[],
            )
        ]

    analysis.songs = songs
    if not analysis.book_title.strip():
        analysis.book_title = songs[0].title or "未命名樂譜"
    return analysis


def analyze_book(thumb_jpegs: list[bytes]) -> BookAnalysis:
    model_name = _ensure_configured()
    model = genai.GenerativeModel(model_name)

    parts: list[Any] = [_system_prompt()]
    for jpeg in thumb_jpegs:
        parts.append({"mime_type": "image/jpeg", "data": jpeg})

    response = model.generate_content(
        parts,
        generation_config={"response_mime_type": "application/json"},
    )
    parsed = _parse_clean_json(response.text or "{}")
    analysis = BookAnalysis.model_validate(parsed)
    return _normalize(analysis, total_pages=len(thumb_jpegs))
