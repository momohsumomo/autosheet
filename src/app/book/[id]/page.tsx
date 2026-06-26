"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { COLLECTIONS } from "@/lib/collections";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import type { BookDoc, PageDoc, SongDoc } from "@/types/library";

type Chapter = { id: string; title: string; startPage: number };

export default function BookReaderPage() {
  const params = useParams<{ id: string }>();
  const bookId = params?.id ?? "";
  const { user } = useAuth();

  const [title, setTitle] = useState("");
  const [pageUrls, setPageUrls] = useState<string[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [menuVisible, setMenuVisible] = useState(false);
  const [nightMode, setNightMode] = useState(false);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const uid = user?.uid;
    if (!uid) return;
    const run = async () => {
      if (!bookId) {
        setErrorMessage("無效的書本 ID。");
        setLoading(false);
        return;
      }
      try {
        const bookSnap = await getDoc(
          doc(db, COLLECTIONS.USERS, uid, COLLECTIONS.BOOKS, bookId)
        );
        if (!bookSnap.exists()) {
          setErrorMessage("找不到此書本資料。");
          setLoading(false);
          return;
        }
        setTitle((bookSnap.data() as Partial<BookDoc>).title ?? "未命名樂譜");

        const [pageSnap, songSnap] = await Promise.all([
          getDocs(
            query(
              collection(db, COLLECTIONS.USERS, uid, COLLECTIONS.PAGES),
              where("bookId", "==", bookId)
            )
          ),
          getDocs(
            query(
              collection(db, COLLECTIONS.USERS, uid, COLLECTIONS.SONGS),
              where("bookId", "==", bookId)
            )
          ),
        ]);

        const pages = pageSnap.docs
          .map((d) => d.data() as Partial<PageDoc>)
          .filter((p) => typeof p.pageNumber === "number" && p.imageUrl)
          .sort((a, b) => (a.pageNumber ?? 0) - (b.pageNumber ?? 0));
        setPageUrls(pages.map((p) => p.imageUrl as string));

        const songs = songSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Partial<SongDoc>) }))
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setChapters(
          songs.map((s) => ({
            id: s.id,
            title: s.title ?? "未知曲名",
            startPage: s.startPage ?? 1,
          }))
        );
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "讀取書本失敗。");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [bookId, user?.uid]);

  const totalPages = pageUrls.length;
  const currentUrl = useMemo(
    () => (totalPages > 0 ? pageUrls[Math.min(pageIndex, totalPages - 1)] : ""),
    [pageUrls, pageIndex, totalPages]
  );

  const goPrev = () => setPageIndex((i) => Math.max(0, i - 1));
  const goNext = () => setPageIndex((i) => Math.min(totalPages - 1, i + 1));
  const jumpToPage = (pageNumber: number) => {
    setPageIndex(Math.max(0, Math.min(totalPages - 1, pageNumber - 1)));
    setChaptersOpen(false);
    setMenuVisible(false);
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        載入書本中…
      </main>
    );
  }

  if (errorMessage || totalPages === 0) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 px-4 text-center text-slate-100">
        <p>{errorMessage || "此書本沒有可顯示的頁面。"}</p>
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
        <header className="absolute inset-x-0 top-0 z-40 flex items-center justify-between gap-3 bg-black/60 px-4 py-3 backdrop-blur">
          <h1 className="min-w-0 truncate text-sm font-semibold md:text-base">{title}</h1>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-lg bg-white/10 px-3 py-2 text-xs">
              {pageIndex + 1} / {totalPages}
            </span>
            {chapters.length > 0 && (
              <button
                type="button"
                onClick={() => setChaptersOpen((p) => !p)}
                className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white"
              >
                曲目
              </button>
            )}
            <Link href="/" className="rounded-lg bg-white/90 px-3 py-2 text-xs font-semibold text-slate-900">
              回首頁
            </Link>
            <button
              type="button"
              onClick={() => setNightMode((prev) => !prev)}
              className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white"
            >
              {nightMode ? "關閉夜間" : "夜間模式"}
            </button>
          </div>
        </header>
      )}

      {menuVisible && chaptersOpen && chapters.length > 0 && (
        <div className="absolute right-4 top-16 z-40 max-h-[60vh] w-64 overflow-y-auto rounded-xl bg-slate-900/95 p-2 shadow-xl">
          {chapters.map((chapter, i) => (
            <button
              key={chapter.id}
              type="button"
              onClick={() => jumpToPage(chapter.startPage)}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/10"
            >
              <span className="truncate">
                {i + 1}. {chapter.title}
              </span>
              <span className="shrink-0 text-xs text-slate-400">P{chapter.startPage}</span>
            </button>
          ))}
        </div>
      )}

      <div
        className="flex h-full w-full items-center justify-center"
        style={{ filter: nightMode ? "invert(1) hue-rotate(180deg)" : "none" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={currentUrl}
          alt={`第 ${pageIndex + 1} 頁`}
          className="max-h-full max-w-full object-contain"
          draggable={false}
        />
      </div>

      <div className="pointer-events-none absolute inset-0 z-30">
        <button
          type="button"
          aria-label="上一頁"
          className="pointer-events-auto absolute inset-y-0 left-0 w-[20%]"
          onClick={goPrev}
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
          onClick={goNext}
        />
      </div>
    </main>
  );
}
