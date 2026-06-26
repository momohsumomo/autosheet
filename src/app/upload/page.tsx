"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { appEnv } from "@/lib/env";
import { useAuth } from "@/lib/auth-context";
import CameraCapture from "./CameraCapture";
import type {
  AnalyzeResponse,
  ApiPageInfo,
  ApiSongStructure,
  SaveBookRequest,
} from "@/types/library";

type Step = "select" | "analyzing" | "confirm" | "saving";

export default function UploadPage() {
  const router = useRouter();
  const { getToken } = useAuth();
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [step, setStep] = useState<Step>("select");
  const [errorMessage, setErrorMessage] = useState("");

  // 照片掃描化選項（只影響圖片/拍照，PDF 不受影響）
  const [scanEnabled, setScanEnabled] = useState(true);
  const [scanMode, setScanMode] = useState<"gray" | "bw">("gray");

  // 為圖片檔產生本地縮圖預覽（PDF 則留空，用圖示代替）
  useEffect(() => {
    const urls = files.map((f) =>
      f.type.startsWith("image/") ? URL.createObjectURL(f) : ""
    );
    setPreviews(urls);
    return () => {
      urls.forEach((u) => u && URL.revokeObjectURL(u));
    };
  }, [files]);

  // AI 分析結果（可在確認頁微調）
  const [bookId, setBookId] = useState("");
  const [bookTitle, setBookTitle] = useState("");
  const [sourceType, setSourceType] = useState<AnalyzeResponse["source_type"]>("images");
  const [pages, setPages] = useState<ApiPageInfo[]>([]);
  const [songs, setSongs] = useState<ApiSongStructure[]>([]);

  const totalPages = pages.length;

  const isApiConfigured = useMemo(
    () => Boolean(appEnv.apiBaseUrl && appEnv.apiBaseUrl.length > 0),
    []
  );

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    setFiles((prev) => [...prev, ...Array.from(incoming)]);
    setErrorMessage("");
  };

  const addFile = (file: File) => {
    setFiles((prev) => [...prev, file]);
    setErrorMessage("");
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const moveFile = (index: number, dir: -1 | 1) => {
    setFiles((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const analyze = async () => {
    if (files.length === 0) {
      setErrorMessage("請先加入至少一個檔案（PDF 或圖片）。");
      return;
    }
    setErrorMessage("");
    setStep("analyzing");
    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append("files", file);
      }
      formData.append("scan", scanEnabled ? "true" : "false");
      formData.append("scan_mode", scanMode);
      const token = await getToken();
      const response = await fetch(`${appEnv.apiBaseUrl}/import/analyze`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "AI 分析失敗。");
      }
      const data = (await response.json()) as AnalyzeResponse;
      setBookId(data.book_id);
      setBookTitle(data.book_title);
      setSourceType(data.source_type);
      setPages(data.pages);
      setSongs(data.songs);
      setStep("confirm");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "AI 分析失敗。");
      setStep("select");
    }
  };

  // ---- 確認頁：曲目微調（維持頁碼連續） ----

  const updateSong = (index: number, patch: Partial<ApiSongStructure>) => {
    setSongs((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const adjustEnd = (index: number, delta: number) => {
    setSongs((prev) => {
      const next = prev.map((s) => ({ ...s }));
      const song = next[index];
      if (!song) return prev;
      const newEnd = Math.min(totalPages, Math.max(song.start_page, song.end_page + delta));
      song.end_page = newEnd;
      // 下一首接續
      const following = next[index + 1];
      if (following) {
        following.start_page = Math.min(totalPages, newEnd + 1);
        if (following.end_page < following.start_page) {
          following.end_page = following.start_page;
        }
      }
      return next;
    });
  };

  const addSong = () => {
    setSongs((prev) => {
      const last = prev[prev.length - 1];
      const start = last ? Math.min(totalPages, last.end_page + 1) : 1;
      return [
        ...prev,
        {
          title: "新曲目",
          composer: "未知作曲家",
          start_page: start,
          end_page: totalPages,
          tags: [],
        },
      ];
    });
  };

  const removeSong = (index: number) => {
    setSongs((prev) => prev.filter((_, i) => i !== index));
  };

  const save = async () => {
    if (songs.length === 0) {
      setErrorMessage("至少要保留一首曲目。");
      return;
    }
    setErrorMessage("");
    setStep("saving");
    try {
      const payload: SaveBookRequest = {
        book_id: bookId,
        book_title: bookTitle || "未命名樂譜",
        source_type: sourceType,
        cover_url: pages[0]?.image_url ?? "",
        pages,
        songs: songs.map((s) => ({
          ...s,
          title: s.title.trim() || "未知曲名",
          composer: s.composer.trim() || "未知作曲家",
          tags: s.tags.map((t) => t.trim()).filter(Boolean),
        })),
      };
      const token = await getToken();
      const response = await fetch(`${appEnv.apiBaseUrl}/import/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "儲存失敗。");
      }
      router.push("/");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "儲存失敗。");
      setStep("confirm");
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 bg-slate-100 px-4 py-6 md:px-8 md:py-10">
      <header className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">智慧匯入中心</h1>
          <p className="mt-2 text-sm text-slate-600 md:text-base">
            丟一疊圖片或一本 PDF，AI 會自動切分成各首曲目並建立可搜尋標籤。
          </p>
        </div>
        <Link href="/" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
          回首頁
        </Link>
      </header>

      {(step === "select" || step === "analyzing") && (
        <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <label
            className="grid cursor-pointer gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              addFiles(e.dataTransfer.files);
            }}
          >
            <span className="text-base font-semibold text-slate-800">點擊或拖曳檔案到這裡</span>
            <span className="text-sm text-slate-500">支援 PDF 與多張圖片（JPG/PNG）。可分多次加入，順序即頁面順序。</span>
            <input
              type="file"
              multiple
              accept="application/pdf,image/*"
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
          </label>

          <button
            type="button"
            onClick={() => setCameraOpen(true)}
            className="min-h-12 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700"
          >
            開相機拍照（連拍多張）
          </button>

          <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={scanEnabled}
                onChange={(e) => setScanEnabled(e.target.checked)}
                className="h-5 w-5 shrink-0"
              />
              <span className="text-sm font-semibold text-slate-800">
                照片掃描化（自動拉正、去陰影、增強對比）
              </span>
            </label>
            <p className="text-xs text-slate-500">
              只影響拍照／圖片，PDF 不受影響。建議開啟，能讓畫面更乾淨、也讓 AI 切歌更準。
            </p>
            {scanEnabled && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setScanMode("gray")}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold ${
                    scanMode === "gray"
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-600"
                  }`}
                >
                  灰階增強（推薦，保留細節）
                </button>
                <button
                  type="button"
                  onClick={() => setScanMode("bw")}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold ${
                    scanMode === "bw"
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-600"
                  }`}
                >
                  純黑白（掃描感最強）
                </button>
              </div>
            )}
          </div>

          {files.length > 0 && (
            <ul className="grid gap-2">
              {files.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {previews[index] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={previews[index]}
                        alt={file.name}
                        className="h-14 w-14 shrink-0 rounded-md border border-slate-200 bg-white object-cover"
                      />
                    ) : (
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-[10px] font-semibold text-slate-500">
                        PDF
                      </span>
                    )}
                    <span className="truncate text-sm text-slate-700">
                      {index + 1}. {file.name}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveFile(index, -1)}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 disabled:opacity-40"
                      disabled={index === 0}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveFile(index, 1)}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 disabled:opacity-40"
                      disabled={index === files.length - 1}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="rounded-lg border border-rose-300 px-2 py-1 text-xs text-rose-600"
                    >
                      移除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={analyze}
            disabled={files.length === 0 || step === "analyzing"}
            className="min-h-14 rounded-xl bg-slate-900 px-6 py-4 text-base font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {step === "analyzing" ? "AI 正在通讀整本並切分曲目中…（約 10–15 秒）" : "開始 AI 分析"}
          </button>
        </section>
      )}

      {(step === "confirm" || step === "saving") && (
        <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-2">
            <label className="text-sm font-semibold text-slate-700">書本 / 專輯名稱</label>
            <input
              value={bookTitle}
              onChange={(e) => setBookTitle(e.target.value)}
              className="min-h-12 rounded-xl border border-slate-300 px-4 text-base outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <p className="text-xs text-slate-500">
              共 {totalPages} 頁，AI 切出 {songs.length} 首曲目。頁碼切錯可用下方 +/- 微調，下一首會自動接續。
            </p>
          </div>

          <div className="grid gap-4">
            {songs.map((song, index) => (
              <article key={index} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-500">曲目 {index + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeSong(index)}
                    className="rounded-lg border border-rose-300 px-2 py-1 text-xs text-rose-600"
                  >
                    刪除此曲
                  </button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="grid gap-1">
                    <label className="text-xs text-slate-500">曲名</label>
                    <input
                      value={song.title}
                      onChange={(e) => updateSong(index, { title: e.target.value })}
                      className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                  <div className="grid gap-1">
                    <label className="text-xs text-slate-500">作曲家</label>
                    <input
                      value={song.composer}
                      onChange={(e) => updateSong(index, { composer: e.target.value })}
                      className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs text-slate-500">頁碼範圍</span>
                  <span className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-slate-800">
                    第 {song.start_page} ~ {song.end_page} 頁
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-400">調整結束頁</span>
                    <button
                      type="button"
                      onClick={() => adjustEnd(index, -1)}
                      className="h-9 w-9 rounded-lg border border-slate-300 text-lg text-slate-700"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustEnd(index, 1)}
                      className="h-9 w-9 rounded-lg border border-slate-300 text-lg text-slate-700"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1">
                  {pages
                    .filter((p) => p.page_number >= song.start_page && p.page_number <= song.end_page)
                    .map((p) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={p.page_number}
                        src={p.image_url}
                        alt={`第 ${p.page_number} 頁`}
                        className="h-28 w-auto shrink-0 rounded-md border border-slate-200 bg-white object-contain"
                      />
                    ))}
                </div>

                <div className="grid gap-1">
                  <label className="text-xs text-slate-500">搜尋標籤（以逗號分隔）</label>
                  <input
                    value={song.tags.join("、")}
                    onChange={(e) =>
                      updateSong(index, {
                        tags: e.target.value.split(/[,，、]/).map((t) => t.trim()).filter(Boolean),
                      })
                    }
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
              </article>
            ))}
          </div>

          <div className="flex flex-col gap-3 md:flex-row">
            <button
              type="button"
              onClick={addSong}
              className="min-h-12 flex-1 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700"
            >
              + 手動新增一首曲目
            </button>
            <button
              type="button"
              onClick={save}
              disabled={step === "saving"}
              className="min-h-12 flex-[2] rounded-xl bg-slate-900 px-5 py-3 text-base font-semibold text-white disabled:bg-slate-400"
            >
              {step === "saving" ? "儲存中…" : "確認並存入圖書館"}
            </button>
          </div>
        </section>
      )}

      {errorMessage && <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{errorMessage}</p>}
      {!isApiConfigured && (
        <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-700">
          尚未設定 NEXT_PUBLIC_API_BASE_URL，請先完成 .env.local。
        </p>
      )}

      {cameraOpen && (
        <CameraCapture onCapture={addFile} onClose={() => setCameraOpen(false)} />
      )}
    </main>
  );
}
