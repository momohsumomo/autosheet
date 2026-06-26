"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { COLLECTIONS } from "@/lib/collections";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";

type ScoreCard = {
  id: string;
  title: string;
  composer: string;
  tags: string[];
  tagsNormalized: string[];
};

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
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string>("");
  const [scores, setScores] = useState<ScoreCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError("");
      try {
        const snap = await getDocs(collection(db, COLLECTIONS.SCORES));
        const mapped = snap.docs.map((item) => {
          const data = item.data() as Partial<ScoreCard>;
          return {
            id: item.id,
            title: data.title ?? "未知曲名",
            composer: data.composer ?? "未知作曲家",
            tags: Array.isArray(data.tags) ? data.tags : [],
            tagsNormalized: Array.isArray(data.tagsNormalized) ? data.tagsNormalized : [],
          };
        });
        setScores(mapped);
      } catch (err) {
        setError(err instanceof Error ? err.message : "讀取樂譜列表失敗。");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  const hotTags = useMemo(() => {
    if (!scores.length) return defaultHotTags;
    const counter = new Map<string, number>();
    for (const score of scores) {
      for (const tag of score.tags) {
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
  }, [scores]);

  const filteredScores = useMemo(() => {
    const q = query.trim().toLowerCase();
    const normalizedActiveTag = activeTag.trim().toLowerCase();

    return scores.filter((score) => {
      const searchable = [
        score.title.toLowerCase(),
        score.composer.toLowerCase(),
        ...score.tags.map((tag) => tag.toLowerCase()),
        ...score.tagsNormalized.map((tag) => tag.toLowerCase()),
      ];

      const queryMatched = !q || searchable.some((field) => field.includes(q));
      const tagMatched =
        !normalizedActiveTag ||
        searchable.some((field) => field.includes(normalizedActiveTag));

      return queryMatched && tagMatched;
    });
  }, [scores, query, activeTag]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 bg-slate-100 p-4 md:p-8">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
          個人智慧樂譜圖書館
        </h1>
        <p className="mt-2 text-slate-600">語意搜尋曲庫，快速進入 iPad 智慧閱讀模式。</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/upload"
            className="min-h-12 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
          >
            新增樂譜
          </Link>
        </div>
      </header>

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

      <section className="grid gap-4 md:grid-cols-2">
        {loading && <p className="text-sm text-slate-500">讀取樂譜列表中...</p>}
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {!loading && !error && filteredScores.length === 0 && (
          <p className="text-sm text-slate-500">目前沒有符合條件的樂譜。</p>
        )}
        {filteredScores.map((score) => (
          <Link
            key={score.id}
            href={`/reader/${score.id}`}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
          >
            <h2 className="text-xl font-semibold text-slate-900">{score.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{score.composer}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {score.tags.slice(0, 3).map((tag) => (
                <span
                  key={`${score.id}-${tag}`}
                  className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white"
                >
                  {tag}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </section>
    </main>
  );
}
