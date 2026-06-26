# 個人智慧樂譜圖書館 (iPad PWA)

此專案為第一階段骨架，已完成：

- Next.js App Router + TypeScript + TailwindCSS
- Firebase 初始化（Firestore + Storage）
- 基礎頁面：首頁、上傳頁、閱讀器頁（占位）
- PWA `manifest.json` 基礎檔
- `.env.example` 設定範本

## 快速開始

1. 安裝依賴
   - `npm install`
2. 建立環境變數
   - 複製 `.env.example` 為 `.env.local`
3. 啟動開發
   - `npm run dev`

## 目前重要檔案

- `src/lib/firebase.ts`: Firebase App/Firestore/Storage 初始化
- `src/lib/env.ts`: 環境變數讀取與開發提醒
- `src/types/score.ts`: 樂譜 Metadata 型別
- `src/app/upload/page.tsx`: 智慧匯入 UI 骨架
- `src/app/reader/page.tsx`: iPad 閱讀器 UI 占位

## 下一步建議

1. 建立 FastAPI 上傳端點，回傳 Gemini 解析結果 JSON。
2. 在 `upload` 頁串接上傳流程，預覽 AI 標籤。
3. 將 PDF 上傳至 Firebase Storage，Metadata 寫入 Firestore。
4. 實作閱讀器觸控分區翻頁與夜間模式。
