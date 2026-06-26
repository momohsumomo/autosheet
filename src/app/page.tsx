"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { COLLECTIONS } from "@/lib/collections";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { collection, getDocs } from "firebase/firestore";
import type { BookDoc, SongDoc } from "@/types/library";

type SongCard = Pick<
  SongDoc,
  "id" | "title" | "composer" | "tags" | "tagsNormalized" | "bookTitle" | "midiUrl" | "bookId"
>;

type BookCard = Pick<BookDoc, "id" | "title" | "coverUrl" | "pageCount"> & {
  songCount: number;
};

type ViewMode = "songs" | "books";

const defaultHotTags = [
  "爵士",
  "婚禮",
  "電影配樂",
  "催淚",
  "抒情",
  "動漫",
  "優雅",
  "周杰倫",
];

export default function HomePage() {
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>("songs");
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string>("");
  const [songs, setSongs] = useState<SongCard[]>([]);
  const [books, setBooks] = useState<BookCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const uid = user?.uid;
    if (!uid) return;
    const run = async () => {
      setLoading(true);
      setError("");
      try {
        const [songSnap, bookSnap] = await Promise.all([
          getDocs(collection(db, COLLECTIONS.USERS, uid, COLLECTIONS.SONGS)),
          getDocs(collection(db, COLLECTIONS.USERS, uid, COLLECTIONS.BOOKS)),
        ]);

        const mappedSongs = songSnap.docs.map((item) => {
          const data = item.data() as Partial<SongDoc>;
          return {
            id: item.id,
            bookId: data.bookId ?? "",
            title: data.title ?? "未知曲名",
            composer: data.composer ?? "未知作曲家",
            bookTitle: data.bookTitle ?? "",
            tags: Array.isArray(data.tags) ? data.tags : [],
            tagsNormalized: Array.isArray(data.tagsNormalized) ? data.tagsNormalized : [],
            midiUrl: data.midiUrl ?? null,
          };
        });
        setSongs(mappedSongs);

        const songCountByBook = new Map<string, number>();
        for (const song of mappedSongs) {
          if (!song.bookId) continue;
          songCountByBook.set(song.bookId, (songCountByBook.get(song.bookId) ?? 0) + 1);
        }

        const mappedBooks = bookSnap.docs.map((item) => {
          const data = item.data() as Partial<BookDoc>;
          return {
            id: item.id,
            title: data.title ?? "未命名樂譜",
            coverUrl: data.coverUrl ?? "",
            pageCount: data.pageCount ?? 0,
            songCount: songCountByBook.get(item.id) ?? 0,
          };
        });
        setBooks(mappedBooks);
      } catch (err) {
        setError(err instanceof Error ? err.message : "讀取資料失敗。");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [user?.uid]);

  const hotTags = useMemo(() => {
    if (!songs.length) return defaultHotTags;
    const counter = new Map<string, number>();
    for (const song of songs) {
      for (const tag of song.tags) {
        const normalized = tag.trim();
        if (!normalized) continue;
        counter.set(normalized, (counter.get(normalized) ?? 0) + 1);
      }
    }
    const ranked = [...counter.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag]) => tag);
    return ranked.length ? ranked : defaultHotTags;
  }, [songs]);

  const filteredSongs = useMemo(() => {
    const q = query.trim().toLowerCase();
    const normalizedActiveTag = activeTag.trim().toLowerCase();

    return songs.filter((song) => {
      const searchable = [
        song.title.toLowerCase(),
        song.composer.toLowerCase(),
        song.bookTitle.toLowerCase(),
        ...song.tags.map((tag) => tag.toLowerCase()),
        ...song.tagsNormalized.map((tag) => tag.toLowerCase()),
      ];

      const queryMatched = !q || searchable.some((field) => field.includes(q));
      const tagMatched =
        !normalizedActiveTag || searchable.some((field) => field.includes(normalizedActiveTag));

      return queryMatched && tagMatched;
    });
  }, [songs, query, activeTag]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 bg-slate-100 p-4 md:p-8">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
          個人智慧樂譜圖書館
        </h1>
        <p className="mt-2 text-slate-600">語意搜尋曲庫，一鍵進入 iPad 智慧閱讀模式。</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            href="/upload"
            className="min-h-12 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
          >
            匯入樂譜
          </Link>
          <Link
            href="/account"
            className="min-h-12 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700"
          >
            帳號
          </Link>
          <div className="inline-flex rounded-xl border border-slate-300 bg-white p-1">
            <button
              type="button"
              onClick={() => setViewMode("songs")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                viewMode === "songs" ? "bg-slate-900 text-white" : "text-slate-600"
              }`}
            >
              按曲目
            </button>
            <button
              type="button"
              onClick={() => setViewMode("books")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                viewMode === "books" ? "bg-slate-900 text-white" : "text-slate-600"
              }`}
            >
              書櫃
            </button>
          </div>
        </div>
      </header>

      {viewMode === "songs" && (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="block text-sm font-semibold text-slate-700">智慧搜尋</label>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="輸入曲名、作曲家、歌手、電影或氣氛（例如：周杰倫 / 催淚電影 / 婚禮）"
          className="mt-2 min-h-14 w-full rounded-xl border border-slate-300 px-4 text-base outline-none ring-indigo-300 focus:ring-2"
        />
        <div className="mt-4 flex flex-wrap gap-2">
          {hotTags.map((tag) => {
            const isActive = activeTag === tag;
            return (
              <button
                key={tag}
                type="button"
                onClick={() => setActiveTag(isActive ? "" : tag)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                  isActive
                    ? "bg-slate-900 text-white"
                    : "border border-slate-300 bg-white text-slate-700"
                }`}
              >
                #{tag}
              </button>
            );
            })}
        </div>
      </section>
      )}

      {viewMode === "books" && (
        <section className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {loading && <p className="text-sm text-slate-500">讀取書櫃中…</p>}
          {error && <p className="text-sm text-rose-600">{error}</p>}
          {!loading && !error && books.length === 0 && (
            <p className="text-sm text-slate-500">書櫃還是空的，先去匯入一本樂譜吧。</p>
          )}
          {books.map((book) => (
            <Link
              key={book.id}
              href={`/book/${book.id}`}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
            >
              <div className="aspect-[3/4] w-full bg-slate-100">
                {book.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={book.coverUrl}
                    alt={book.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">
                    無封面
                  </div>
                )}
              </div>
              <div className="p-4">
                <h2 className="truncate text-base font-semibold text-slate-900">{book.title}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {book.songCount} 首 · {book.pageCount} 頁
                </p>
              </div>
            </Link>
          ))}
        </section>
      )}

      {viewMode === "songs" && (
      <section className="grid gap-4 md:grid-cols-2">
        {loading && <p className="text-sm text-slate-500">讀取曲目列表中…</p>}
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {!loading && !error && filteredSongs.length === 0 && (
          <p className="text-sm text-slate-500">目前沒有符合條件的曲目，先去匯入一些樂譜吧。</p>
        )}
        {filteredSongs.map((song) => (
          <Link
            key={song.id}
            href={`/reader/${song.id}`}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-xl font-semibold text-slate-900">{song.title}</h2>
              {song.midiUrl && (
                <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                  ♪ 可試聽
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-600">{song.composer}</p>
            {song.bookTitle && (
              <p className="mt-0.5 text-xs text-slate-400">收錄於《{song.bookTitle}》</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {song.tags.slice(0, 3).map((tag) => (
                <span
                  key={`${song.id}-${tag}`}
                  className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white"
                >
                  {tag}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </section>
      )}
    </main>
  );
}
