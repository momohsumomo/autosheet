"use client";

import "@react-pdf-viewer/core/lib/styles/index.css";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { COLLECTIONS } from "@/lib/collections";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { SpecialZoomLevel, Viewer, Worker } from "@react-pdf-viewer/core";
import { pageNavigationPlugin } from "@react-pdf-viewer/page-navigation";

type ScoreRecord = {
  title: string;
  composer: string;
  pdfUrl: string;
  tags?: string[];
};

export default function ReaderByIdPage() {
  const params = useParams<{ id: string }>();
  const scoreId = params?.id ?? "";
  const [score, setScore] = useState<ScoreRecord | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [nightMode, setNightMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [pdfLoadError, setPdfLoadError] = useState("");

  const pagePluginInstance = pageNavigationPlugin();
  const { jumpToNextPage, jumpToPreviousPage } = pagePluginInstance;

  useEffect(() => {
    const run = async () => {
      if (!scoreId) {
        setErrorMessage("無效的樂譜 ID。");
        setLoading(false);
        return;
      }
      try {
        const ref = doc(db, COLLECTIONS.SCORES, scoreId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          setErrorMessage("找不到此樂譜資料。");
          setLoading(false);
          return;
        }
        const data = snap.data() as Partial<ScoreRecord>;
        setScore({
          title: data.title ?? "未知曲名",
          composer: data.composer ?? "未知作曲家",
          pdfUrl: data.pdfUrl ?? "",
          tags: Array.isArray(data.tags) ? data.tags : [],
        });
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "讀取樂譜失敗。");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [scoreId]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        載入樂譜中...
      </main>
    );
  }

  if (errorMessage || !score?.pdfUrl) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 px-4 text-center text-slate-100">
        <p>{errorMessage || "此樂譜尚未有可讀取的 PDF 連結。"}</p>
        <Link href="/" className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900">
          回首頁
        </Link>
      </main>
    );
  }

  return (
    <main
      className="fixed inset-0 z-50 overflow-hidden bg-black text-white"
      style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {menuVisible && (
        <header className="absolute inset-x-0 top-0 z-40 flex items-center justify-between bg-black/60 px-4 py-3 backdrop-blur">
          <div>
            <h1 className="text-sm font-semibold md:text-base">{score.title}</h1>
            <p className="text-xs text-slate-300 md:text-sm">{score.composer}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/" className="rounded-lg bg-white/90 px-3 py-2 text-xs font-semibold text-slate-900">
              回首頁
            </Link>
            <a
              href={score.pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white"
            >
              直接開啟 PDF
            </a>
            <button
              type="button"
              onClick={() => setNightMode((prev) => !prev)}
              className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white"
            >
              {nightMode ? "關閉夜間模式" : "夜間模式"}
            </button>
          </div>
        </header>
      )}

      <div
        className="h-full w-full touch-manipulation"
        style={{ filter: nightMode ? "invert(1) hue-rotate(180deg)" : "none" }}
      >
        <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
          <Viewer
            fileUrl={score.pdfUrl}
            plugins={[pagePluginInstance]}
            defaultScale={SpecialZoomLevel.PageWidth}
            renderError={(error) => {
              const message = typeof error === "string" ? error : "PDF 載入失敗，請檢查 Storage 權限/CORS。";
              if (!pdfLoadError) {
                setPdfLoadError(message);
              }
              return (
                <div className="mx-auto mt-20 max-w-xl rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800">
                  <p className="font-semibold">Load Failed</p>
                  <p className="mt-2 break-all">{message}</p>
                </div>
              );
            }}
          />
        </Worker>
      </div>
      {pdfLoadError && (
        <div className="absolute bottom-4 left-4 right-4 z-40 rounded-lg bg-black/70 p-3 text-xs text-amber-200">
          錯誤詳情：{pdfLoadError}
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 z-30">
        <button
          type="button"
          aria-label="上一頁"
          className="pointer-events-auto absolute inset-y-0 left-0 w-[20%]"
          onClick={() => jumpToPreviousPage()}
        />
        <button
          type="button"
          aria-label="切換選單"
          className="pointer-events-auto absolute inset-y-0 left-[20%] w-[60%]"
          onClick={() => setMenuVisible((prev) => !prev)}
        />
        <button
          type="button"
          aria-label="下一頁"
          className="pointer-events-auto absolute inset-y-0 right-0 w-[20%]"
          onClick={() => jumpToNextPage()}
        />
      </div>
    </main>
  );
}
