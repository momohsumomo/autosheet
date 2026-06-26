export const COLLECTIONS = {
  USERS: "users",
  BOOKS: "books",
  SONGS: "songs",
  PAGES: "pages",
  // 舊版扁平結構（保留以相容既有資料，可逐步淘汰）
  SCORES: "scores",
} as const;

export const STORAGE_PATHS = {
  BOOKS: "books",
  SCORE_PDFS: "scores",
} as const;
