"""FastAPI 依賴：驗證前端帶來的 Firebase ID token，取出使用者 uid。

用於保護匯入端點，確保只有登入者能呼叫（同時防止匿名濫用 Gemini/Storage 成本）。
"""

from __future__ import annotations

from fastapi import Header, HTTPException
from firebase_admin import auth as fb_auth

import firebase_client


def get_uid(authorization: str = Header(default="")) -> str:
    # 確保 Firebase Admin 已初始化（verify_id_token 需要）
    firebase_client.get_firestore()

    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="缺少授權令牌（請先登入）。")

    token = authorization.split(" ", 1)[1].strip()
    try:
        decoded = fb_auth.verify_id_token(token)
    except Exception as exc:
        raise HTTPException(status_code=401, detail=f"令牌驗證失敗：{exc}") from exc

    uid = decoded.get("uid")
    if not uid:
        raise HTTPException(status_code=401, detail="令牌不含使用者識別。")
    return uid
