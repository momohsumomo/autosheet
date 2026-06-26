export type ScoreMetadata = {
  title: string;
  composer: string;
  aliases: string[];
  relatedWorks: string[];
  famousCovers: string[];
  moods: string[];
  occasions: string[];
  tags: string[];
  createdAt?: string;
  updatedAt?: string;
};

export type ScoreDocument = {
  id: string;
  pdfPath: string;
  pdfUrl?: string;
  metadata: ScoreMetadata;
};
