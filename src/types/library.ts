// 三層資料模型：Book（書/專輯） -> Song（曲目，搜尋主體） -> Page（頁面，顯示主體）

export type SourceType = "pdf" | "images" | "mixed" | "midi";

export type BookDoc = {
  id: string;
  title: string;
  coverUrl: string;
  sourceType: SourceType;
  pageCount: number;
};

export type PageDoc = {
  id: string;
  bookId: string;
  pageNumber: number;
  imageUrl: string;
  storagePath: string;
};

export type SongDoc = {
  id: string;
  bookId: string;
  bookTitle: string;
  title: string;
  composer: string;
  tags: string[];
  tagsNormalized: string[];
  pageIds: string[];
  startPage: number;
  endPage: number;
  order: number;
  midiUrl: string | null;
};

// ---- 後端 /import API 的傳輸型別 ----

export type ApiPageInfo = {
  page_number: number;
  image_url: string;
  storage_path: string;
};

export type ApiSongStructure = {
  title: string;
  composer: string;
  start_page: number;
  end_page: number;
  tags: string[];
};

export type AnalyzeResponse = {
  book_id: string;
  book_title: string;
  source_type: SourceType;
  pages: ApiPageInfo[];
  songs: ApiSongStructure[];
};

export type SaveBookRequest = {
  book_id: string;
  book_title: string;
  source_type: SourceType;
  cover_url: string;
  pages: ApiPageInfo[];
  songs: ApiSongStructure[];
};
