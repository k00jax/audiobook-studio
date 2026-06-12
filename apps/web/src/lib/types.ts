export type PartRow = {
  id: string;
  label: string;
  part_index: number;
  status: string;
  estimated_seconds: number;
  audio_url: string | null;
  audio_path?: string | null;
  error_message: string | null;
  body?: string;
};

export type BookProjectStats = {
  chapterCount: number;
  currentAudioCount: number;
  totalAudioSeconds: number;
};

export type CompiledAudioEntry = {
  id: string;
  name: string;
  filename: string;
  relativePath: string;
  audioUrl: string;
  chapterIds: string[];
  chapterTitles: string[];
  durationSec: number;
  createdAt: string;
};

export type ChapterRow = {
  id: string;
  title: string;
  source_path: string | null;
  part_count: number;
  section_count?: number;
  sort_order?: number | null;
  content_hash?: string | null;
  dictated_content_hash?: string | null;
  source_modified_at?: string | null;
  file_modified_at?: string | null;
  file_modified_label?: string | null;
  needs_sync?: boolean;
  missing_on_disk?: boolean;
  parts: PartRow[];
};
