"""Pydantic 資料模型：定義匯入流程中前後端與 Gemini 之間的契約。

三層架構：Book（書/專輯） -> Song（曲目，搜尋主體） -> Page（頁面，顯示主體）。
"""

from __future__ import annotations

from pydantic import BaseModel, Field

# 每首歌固定產生的搜尋標籤數量
TAGS_PER_SONG = 12


class SongStructure(BaseModel):
    """Gemini 切分出的單一曲目（頁碼以整本圖片陣列的 1-based index 表示）。"""

    title: str = Field(default="未知曲名")
    composer: str = Field(default="未知作曲家")
    start_page: int = Field(ge=1, description="此曲第一頁（1-based，對應整本頁序）")
    end_page: int = Field(ge=1, description="此曲最後一頁（含）")
    tags: list[str] = Field(default_factory=list)


class BookAnalysis(BaseModel):
    """Gemini 對「整本書」的結構分析結果。"""

    book_title: str = Field(default="未命名樂譜")
    songs: list[SongStructure] = Field(default_factory=list)


class PageInfo(BaseModel):
    """一頁已上傳到 Storage 的頁面。"""

    page_number: int = Field(ge=1)
    image_url: str
    storage_path: str


class AnalyzeResponse(BaseModel):
    """/import/analyze 回傳給前端確認的內容（尚未寫入 Firestore）。"""

    book_id: str
    book_title: str
    source_type: str
    pages: list[PageInfo]
    songs: list[SongStructure]


# ---- /import/save 的請求/回應 ----


class SongInput(BaseModel):
    """前端確認/微調後送回來、準備寫入 Firestore 的曲目。"""

    title: str = Field(min_length=1)
    composer: str = Field(default="未知作曲家")
    start_page: int = Field(ge=1)
    end_page: int = Field(ge=1)
    tags: list[str] = Field(default_factory=list)


class SaveBookRequest(BaseModel):
    book_id: str = Field(min_length=1)
    book_title: str = Field(min_length=1)
    source_type: str = Field(default="images")
    cover_url: str = Field(default="")
    pages: list[PageInfo]
    songs: list[SongInput]


class SaveBookResponse(BaseModel):
    book_id: str
    song_ids: list[str]
    page_ids: list[str]
