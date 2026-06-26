import json
import os
import re
from typing import Any

import fitz
import google.generativeai as genai
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
if not GEMINI_API_KEY:
    raise RuntimeError("Missing GEMINI_API_KEY in backend/.env")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-flash-latest")

genai.configure(api_key=GEMINI_API_KEY)

app = FastAPI(title="AI 音樂館員 API")
app.add_middleware(
    CORSMiddleware,
    # 開發期允許 iPad 以區網 IP 存取前端
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def extract_pdf_text(pdf_bytes: bytes) -> str:
    """Extract text from PDF for fallback/context."""
    with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
        pages = [page.get_text("text") for page in doc]
    return "\n".join(pages).strip()


def parse_clean_json(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    cleaned = re.sub(r"^```json\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"^```\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    return json.loads(cleaned)


class ScoreResponse(BaseModel):
    title: str = Field(min_length=1)
    composer: str = Field(min_length=1)
    tags: list[str] = Field(min_length=15, max_length=15)
    tags_normalized: list[str] = Field(min_length=15, max_length=15)


def build_prompt(extracted_text: str) -> str:
    return f"""
你是一位博學的音樂館員，請分析使用者上傳的「樂譜 PDF」。

任務要求：
1) 辨識曲名（title）與作曲家（composer）。
2) 產出 15 個搜尋關聯標籤 tags（陣列，剛好 15 個，不可重複）。
3) 標籤必須涵蓋：中文俗名、相關影視或動漫、知名翻唱者、適用演奏氛圍、適用場合。
4) 嚴禁分析或輸出任何樂理技術細節（例如調性、拍號、和聲分析、速度術語等）。
5) 若資訊不足，請以合理推測補足，但仍需維持可搜尋性。

你只能輸出乾淨 JSON，不要輸出任何前後文、註解或 markdown code fence。

JSON 格式必須如下：
{{
  "title": "字串",
  "composer": "字串",
  "tags": ["標籤1", "標籤2", "...共15個"]
}}

以下是從 PDF 抽出的文字（可能不完整）：
{extracted_text[:14000]}
""".strip()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def normalize_tags(raw_tags: list[Any]) -> tuple[list[str], list[str]]:
    cleaned_tags = [str(tag).strip() for tag in raw_tags if str(tag).strip()]
    cleaned_tags = list(dict.fromkeys(cleaned_tags))
    normalized = [tag.lower() for tag in cleaned_tags]
    normalized = list(dict.fromkeys(normalized))

    fallback = [
        "鋼琴獨奏",
        "抒情",
        "舞台演出",
        "比賽選曲",
        "音樂會",
        "經典旋律",
        "療癒",
        "懷舊",
        "電影配樂",
        "動漫",
        "婚禮",
        "周杰倫",
        "經典翻唱",
        "優雅",
        "催淚",
    ]

    for tag in fallback:
        if len(cleaned_tags) >= 15:
            break
        if tag not in cleaned_tags:
            cleaned_tags.append(tag)

    normalized = [tag.lower() for tag in cleaned_tags]
    normalized = list(dict.fromkeys(normalized))
    if len(normalized) < 15:
        for tag in fallback:
            lowered = tag.lower()
            if lowered not in normalized:
                normalized.append(lowered)
            if len(normalized) >= 15:
                break

    return cleaned_tags[:15], normalized[:15]


@app.post("/analyze-score")
async def analyze_score(file: UploadFile = File(...)) -> ScoreResponse:
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="請上傳 PDF 檔案。")

    pdf_bytes = await file.read()
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="PDF 檔案內容為空。")

    extracted_text = extract_pdf_text(pdf_bytes)
    prompt = build_prompt(extracted_text)

    model_name = GEMINI_MODEL.replace("models/", "")
    model = genai.GenerativeModel(model_name)
    try:
        response = model.generate_content(
            [
                {
                    "mime_type": "application/pdf",
                    "data": pdf_bytes,
                },
                prompt,
            ],
            generation_config={"response_mime_type": "application/json"},
        )
        parsed = parse_clean_json(response.text or "{}")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Gemini 解析失敗: {exc}") from exc

    title = str(parsed.get("title", "")).strip()
    composer = str(parsed.get("composer", "")).strip()
    tags = parsed.get("tags", [])
    if not isinstance(tags, list):
        tags = []
    final_tags, tags_normalized = normalize_tags(tags)

    return ScoreResponse(
        title=title or "未知曲名",
        composer=composer or "未知作曲家",
        tags=final_tags,
        tags_normalized=tags_normalized,
    )
