// Auto-generated TypeScript types from Python models
// Generated at: 2026-01-06T11:05:12.112419
// Do not edit manually - regenerate with: python backend/scripts/generate_types.py

export type MediaStatus =
  | 'pending'
  | 'downloading'
  | 'processing_audio'
  | 'transcribing'
  | 'ready'
  | 'error'
  | 'cloud_only';

export interface MediaSource {
  id: string;
  title: string;
  source_url?: string;
  file_path?: string;
  duration: number;
  language: string;
  status: MediaStatus;
  error_message?: string;
  cover_image?: string;
  created_at: string;
  last_played_at: string;
  owner_id: string;
}

export interface SubtitleSegment {
  id: string;
  media_id: string;
  index: number;
  start_time: number;
  end_time: number;
  text: string;
  translation?: string;
  grammar_notes_json?: string;
}

export interface SavedWord {
  id: string;
  word: string;
  context_sentence?: string;
  translation?: string;
  media_id?: string;
  media_time?: number;
  created_at: string;
  language: string;
  next_review_at: string;
  interval: number;
  easiness_factor: number;
  repetitions: number;
  owner_id: string;
}
