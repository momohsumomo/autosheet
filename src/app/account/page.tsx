"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/collections";
import { useAuth } from "@/lib/auth-context";
import { appEnv } from "@/lib/env";

export default function AccountPage() {
  const router = useRouter();
  const { user, signOutUser, getToken } = useAuth();
  const [bookCount, setBookCount] = useState<number | null>(null);
  const [songCount, setSongCount] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const uid = user?.uid;
    if (!uid) return;
    const run = async () => {
      try {
        const [bookSnap, songSnap] = await Promise.all([
          getDocs(collection(db, COLLECTIONS.USERS, uid, COLLECTIONS.BOOKS)),
          getDocs(collection(db, COLLECTIONS.USERS, uid, COLLECTIONS.SONGS)),
        ]);
        setBookCount(bookSnap.size);
        setSongCount(songSnap.size);
      } catch {
        setBookCount(0);
        setSongCount(0);
      }
    };
    void run();
  }, [user?.uid]);

  const handleSignOut = async () => {
    await signOutUser();
    router.push("/");
  };

  const handleDelete = async () => {
    setError("");
    setDeleting(true);
    try {
      const token = await getToken();
      const response = await fetch(`${appEnv.apiBaseUrl}/account`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "刪除失敗。");
      }
      await signOutUser();
      router.push("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "刪除失敗。");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 bg-slate-100 px-4 py-6 md:px-8 md:py-10">
      <header className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">帳號</h1>
        <Link href="/" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
          回首頁
        </Link>
      </header>

      <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          {user?.photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.photoURL} alt="" className="h-16 w-16 rounded-full" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-200 text-xl font-semibold text-slate-500">
              {(user?.displayName ?? user?.email ?? "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-slate-900">
              {user?.displayName ?? "（未設定名稱）"}
            </p>
            <p className="truncate text-sm text-slate-500">{user?.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-slate-50 p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{bookCount ?? "…"}</p>
            <p className="text-xs text-slate-500">書本</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{songCount ?? "…"}</p>
            <p className="text-xs text-slate-500">曲目</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          className="min-h-12 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
        >
          登出
        </button>
      </section>

      <section className="grid gap-3 rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-rose-700">危險區域</h2>
        <p className="text-sm text-slate-600">
          刪除帳號會永久移除你所有的書本、曲目與樂譜圖片，無法復原。如要繼續，請在下方輸入
          <span className="font-semibold">「刪除」</span>。
        </p>
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="輸入「刪除」以確認"
          className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:ring-2 focus:ring-rose-300"
        />
        <button
          type="button"
          onClick={handleDelete}
          disabled={confirmText !== "刪除" || deleting}
          className="min-h-12 rounded-xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-rose-300"
        >
          {deleting ? "刪除中…" : "永久刪除我的帳號與所有資料"}
        </button>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </section>
    </main>
  );
}
