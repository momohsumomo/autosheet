"""Firebase Admin SDK 初始化與存取封裝（延遲載入）。

設計重點：
- 不在 import 階段就初始化，避免缺金鑰時整個 app 起不來。
- 第一次真正用到 Firestore / Storage 時才初始化並快取。
"""

from __future__ import annotations

import os
import uuid
from functools import lru_cache
from urllib.parse import quote

import firebase_admin
from firebase_admin import credentials, firestore, storage


def _service_account_path() -> str:
    path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH", "./serviceAccountKey.json")
    return os.path.abspath(path)


def _storage_bucket_name() -> str:
    bucket = os.getenv("FIREBASE_STORAGE_BUCKET", "").strip()
    if not bucket:
        raise RuntimeError("缺少環境變數 FIREBASE_STORAGE_BUCKET")
    # 允許使用者填成 gs://bucket 或帶尾斜線
    bucket = bucket.replace("gs://", "").strip("/")
    return bucket


@lru_cache(maxsize=1)
def _init_app() -> firebase_admin.App:
    options = {"storageBucket": _storage_bucket_name()}
    cred_path = _service_account_path()

    # 本地開發：有服務帳戶金鑰檔就用它
    if os.path.exists(cred_path):
        cred = credentials.Certificate(cred_path)
        return firebase_admin.initialize_app(cred, options)

    # 雲端（Cloud Run 等）：用執行身分的 Application Default Credentials
    try:
        return firebase_admin.initialize_app(options=options)
    except Exception as exc:
        raise RuntimeError(
            f"找不到 Firebase 服務帳戶金鑰（{cred_path}），"
            "且無法取得預設憑證（ADC）。本地請放置 serviceAccountKey.json，"
            "雲端請確認 Cloud Run 服務帳戶具備 Firestore/Storage 權限。"
        ) from exc


def get_firestore() -> firestore.Client:
    _init_app()
    return firestore.client()


def get_bucket():
    _init_app()
    return storage.bucket()


def upload_bytes(
    data: bytes, storage_path: str, content_type: str = "image/jpeg"
) -> str:
    """上傳位元組到 Storage，回傳可長期存取的 Firebase 下載 URL。

    透過 firebaseStorageDownloadTokens 產生與前端 SDK 相容的 ?alt=media&token=... URL，
    避免簽章 URL 過期問題。
    """
    bucket = get_bucket()
    blob = bucket.blob(storage_path)
    token = str(uuid.uuid4())
    blob.metadata = {"firebaseStorageDownloadTokens": token}
    blob.upload_from_string(data, content_type=content_type)

    encoded_path = quote(storage_path, safe="")
    return (
        f"https://firebasestorage.googleapis.com/v0/b/{bucket.name}/o/"
        f"{encoded_path}?alt=media&token={token}"
    )
