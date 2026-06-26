# 個人智慧樂譜圖書館 (iPad PWA)

把一疊照片或一本 PDF 丟進來，AI（Gemini）會自動「通讀整本」、切分成各首曲目、
建立可搜尋的中文標籤，並以三層架構整理成可在 iPad 上閱讀的電子曲庫。

## 架構：三層資料模型

- **Book（書/專輯）**：一次匯入的來源（一本 PDF 或一疊圖片）。
- **Song（曲目）**：搜尋與瀏覽的主體，綁定頁碼範圍與標籤；未來可掛 MIDI 試聽。
- **Page（頁面）**：實際顯示的樂譜頁圖（存於 Firebase Storage）。

### 匯入流程（Phase 1）

```
一疊圖片 / 一本 PDF / 混合
   → PyMuPDF/Pillow 統一轉「頁圖陣列」
   → 高解析版上傳 Storage（iPad 閱讀用）
   → 低解析縮圖丟 Gemini 切歌（省 token）
   → 回傳「提議結構」給前端確認/微調（可 +/- 調頁碼）
   → 確認後 write_batch 寫入 books / songs / pages
```

> OMR（拍照自動轉 MIDI）屬於難度極高的研究級題目，列為 Phase 3 實驗性選配，
> 不在 Phase 1 範圍。Song 的 `midiUrl` 欄位已預留。

## 技術棧

- 前端：Next.js 15 App Router + React 19 + TailwindCSS 4
- 後端：FastAPI + PyMuPDF + Pillow + google-generativeai
- 雲端：Firebase（Firestore + Storage）。後端以 Firebase Admin SDK 寫入。

## 快速開始

### 1. 前端

```bash
npm install
copy .env.example .env.local   # 填入 Firebase 設定與 NEXT_PUBLIC_API_BASE_URL
npm run dev                     # http://localhost:3500
```

> 註：開發埠改為 **3500**（本機 3000 落在 Windows 系統保留埠範圍而無法綁定）。

### 2. 後端

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env          # 填入 GEMINI_API_KEY、Firebase 設定
uvicorn main:app --reload --port 8000
```

需要的金鑰：

- `GEMINI_API_KEY`：Google AI Studio 取得。
- **Firebase 服務帳戶金鑰**：Firebase Console → 專案設定 → 服務帳戶 → 產生新的私密金鑰，
  下載 JSON 放到 `backend/serviceAccountKey.json`（已被 .gitignore 忽略），
  並在 `backend/.env` 設定 `FIREBASE_SERVICE_ACCOUNT_PATH` 與 `FIREBASE_STORAGE_BUCKET`。

## 主要 API

- `POST /import/analyze`：多檔上傳 → 轉頁圖、上傳 Storage、Gemini 切歌 → 回傳提議結構。
- `POST /import/save`：寫入確認後的 books / songs / pages。
- `GET /health`：健康檢查。

## 重要檔案

- `backend/main.py`：API 端點。
- `backend/rendering.py`：PDF/圖片轉頁圖（高解析 + 縮圖）。
- `backend/gemini_service.py`：Gemini 結構切分。
- `backend/firebase_client.py`：Admin SDK 與 Storage 上傳。
- `src/app/upload/page.tsx`：多檔匯入與可微調確認 UI。
- `src/app/page.tsx`：以 songs 為主體的搜尋首頁。
- `src/app/reader/[id]/page.tsx`：曲目頁圖閱讀器（觸控翻頁 + 夜間模式）。
- `src/types/library.ts`：三層資料模型型別。

## 下一步（Phase 2 / 3）

1. 書櫃視角（翻整本）與單曲播放器視角。
2. MIDI 直接匯入 + 瀏覽器端播放（Tone.js）。
3. （實驗）OMR 自動轉譜，明確標示準確率限制。
