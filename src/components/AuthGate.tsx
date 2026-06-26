"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, signInWithGoogle } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-600">
        載入中…
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-100 px-6 text-center">
        <div className="max-w-md">
          <h1 className="text-3xl font-bold text-slate-900">個人智慧樂譜圖書館</h1>
          <p className="mt-3 text-slate-600">
            登入後即可建立你「專屬」的樂譜曲庫，拍照匯入、AI 自動整理。
          </p>
        </div>
        <button
          type="button"
          onClick={async () => {
            setError("");
            setSigningIn(true);
            try {
              await signInWithGoogle();
            } catch (e) {
              setError(e instanceof Error ? e.message : "登入失敗。");
            } finally {
              setSigningIn(false);
            }
          }}
          disabled={signingIn}
          className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-800 shadow-sm disabled:opacity-60"
        >
          <span className="text-lg">G</span>
          {signingIn ? "登入中…" : "使用 Google 登入"}
        </button>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </main>
    );
  }

  return <>{children}</>;
}
