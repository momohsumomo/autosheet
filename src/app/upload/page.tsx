"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { appEnv } from "@/lib/env";
import { COLLECTIONS, STORAGE_PATHS } from "@/lib/collections";
import { db, storage } from "@/lib/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

type ParsedPreview = {
  title: string;
  composer: string;
  tags: string[];
  tags_normalized?: string[];
};

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [preview, setPreview] = useState<ParsedPreview | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");

  const isApiConfigured = useMemo(
    () => Boolean(appEnv.apiBaseUrl && appEnv.apiBaseUrl.length > 0),
    []
  );

  const analyzePdf = async () => {
    if (!file) {
      setErrorMessage("請先選擇 PDF 檔案。");
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");
    setPreview(null);
    setIsAnalyzing(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${appEnv.apiBaseUrl}/analyze-score`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "AI 解析失敗。");
      }

      const data = (await response.json()) as ParsedPreview;
      setPreview({
        title: data.title || "未知曲名",
        composer: data.composer || "未知作曲家",
        tags: Array.isArray(data.tags) ? data.tags : [],
        tags_normalized: Array.isArray(data.tags_normalized) ? data.tags_normalized : [],
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "AI 解析失敗。");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const saveToFirebase = async () => {
    if (!file || !preview) {
      setErrorMessage("請先完成 AI 解析，再存入 Firebase。");
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");
    setIsSaving(true);

    try {
      const safeName = file.name.replace(/\s+/g, "_");
      const filePath = `${STORAGE_PATHS.SCORE_PDFS}/${Date.now()}-${safeName}`;
      const fileRef = ref(storage, filePath);

      await uploadBytes(fileRef, file, { contentType: "application/pdf" });
      const pdfUrl = await getDownloadURL(fileRef);

      const tagsNormalized = (preview.tags_normalized ?? preview.tags).map((tag) =>
        tag.toLowerCase()
      );

      const docRef = await addDoc(collection(db, COLLECTIONS.SCORES), {
        title: preview.title,
        composer: preview.composer,
        tags: preview.tags,
        tagsNormalized,
        pdfPath: filePath,
        pdfUrl,
        sourceFileName: file.name,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setSuccessMessage("已成功存入 Firebase（Firestore + Storage）。");
      router.push(`/reader/${docRef.id}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "存入 Firebase 失敗。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 bg-slate-100 px-4 py-6 md:px-8 md:py-10">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">AI 音樂館員匯入中心</h1>
        <p className="mt-2 text-sm text-slate-600 md:text-base">
          上傳樂譜 PDF 後，AI 會辨識曲名與作曲家，並建立可搜尋的語意標籤。
        </p>
      </header>

      <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="grid gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5">
          <span className="text-base font-semibold text-slate-800">選擇樂譜 PDF</span>
          <input
            type="file"
            accept="application/pdf"
            className="text-base"
            onChange={(event) => {
              const selected = event.target.files?.[0] ?? null;
              setFile(selected);
              setFileName(selected?.name ?? "");
              setPreview(null);
              setErrorMessage("");
              setSuccessMessage("");
            }}
          />
          <span className="text-sm text-slate-500">建議使用原始掃描清晰檔案，辨識效果最佳。</span>
        </label>

        <div className="flex flex-col gap-3 md:flex-row">
          <button
            type="button"
            onClick={analyzePdf}
            disabled={!file || isAnalyzing}
            className="min-h-14 flex-1 rounded-xl bg-slate-900 px-6 py-4 text-base font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isAnalyzing ? "AI 館員正在讀譜並聯想中..." : "開始 AI 解析"}
          </button>
          <button
            type="button"
            onClick={saveToFirebase}
            disabled={!preview || isSaving}
            className="min-h-14 flex-1 rounded-xl border border-slate-300 bg-white px-6 py-4 text-base font-semibold text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          >
            {isSaving ? "存檔中..." : "確認存入 Firebase"}
          </button>
        </div>

        {!fileName ? (
          <p className="text-sm text-slate-500">請先選擇 PDF。</p>
        ) : (
          <p className="text-sm text-slate-500">已選擇：{fileName}</p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-base font-semibold text-slate-900">AI 辨識預覽</h2>
        {!preview ? (
          <p className="text-sm text-slate-500">解析完成後，這裡會顯示曲目資料與搜尋標籤。</p>
        ) : (
          <article className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="grid gap-2">
              <p className="text-sm text-slate-500">曲名</p>
              <p className="text-lg font-semibold text-slate-900">{preview.title}</p>
            </div>
            <div className="grid gap-2">
              <p className="text-sm text-slate-500">作曲家</p>
              <p className="text-lg font-semibold text-slate-900">{preview.composer}</p>
            </div>
            <div className="grid gap-2">
              <p className="text-sm text-slate-500">搜尋關聯標籤（{preview.tags.length}）</p>
              <div className="flex flex-wrap gap-2">
                {preview.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </article>
        )}
      </section>

      {isAnalyzing && (
        <p className="rounded-xl bg-indigo-50 p-4 text-sm font-medium text-indigo-700">
          AI 館員正在讀譜並聯想中...
        </p>
      )}
      {errorMessage && <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{errorMessage}</p>}
      {successMessage && (
        <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">{successMessage}</p>
      )}
      {!isApiConfigured && (
        <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-700">
          尚未設定 NEXT_PUBLIC_API_BASE_URL，請先完成 `.env.local`。
        </p>
      )}
    </main>
  );
}
