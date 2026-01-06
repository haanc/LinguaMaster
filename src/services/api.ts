import axios from 'axios';

// Import generated types from Python models
import type { MediaSource, SubtitleSegment, SavedWord, MediaStatus } from '../types/generated';
export type { MediaSource, SubtitleSegment, SavedWord, MediaStatus };

const API_BASE_URL = 'http://127.0.0.1:8000';

// Add Interceptor to inject Owner ID
axios.interceptors.request.use((config) => {
    const userRole = localStorage.getItem('userRole') || 'guest';
    const userId = localStorage.getItem('userId');

    // Header format: "guest" or "user_UUID"
    const ownerId = (userRole === 'user' && userId) ? userId : 'guest';

    config.headers['X-Owner-Id'] = ownerId;
    return config;
});

// AI-specific types (not in database models)
export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

export interface VocabularyItem {
    word: string;
    definition: string;
    pronunciation: string;
    translation: string;
    example_sentence: string;
}

// Input type for saving words (backend fills defaults for SRS fields)
export interface SaveWordInput {
    word: string;
    context_sentence?: string;
    translation?: string;
    media_id?: string;
    media_time?: number;
    language?: string;
}

// Vocab word with SRS fields (from database)
export interface VocabWord {
    id: string;
    word: string;
    translation?: string;
    context_sentence?: string;
    media_id?: string;
    media_time?: number;
    language?: string;
    next_review?: string;
    ease_factor?: number;
    interval?: number;
    repetitions?: number;
}

export interface VocabListResponse {
    items: VocabWord[];
    total: number;
}

export interface VocabQueryParams {
    language?: string;
    due_for_review?: boolean;
    media_id?: string;
    limit?: number;
    offset?: number;
}

export const api = {
    listMedia: async (): Promise<MediaSource[]> => {
        const response = await axios.get(`${API_BASE_URL}/media`);
        return response.data;
    },

    getMedia: async (id: string): Promise<MediaSource> => {
        const response = await axios.get(`${API_BASE_URL}/media/${id}`);
        return response.data;
    },

    createSegments: async (mediaId: string, segments: Omit<SubtitleSegment, 'id' | 'media_id'>[]) => {
        const response = await axios.post(`${API_BASE_URL}/media/${mediaId}/segments`, segments);
        return response.data;
    },

    saveMedia: async (media: Partial<MediaSource>) => {
        const response = await axios.post(`${API_BASE_URL}/media`, media);
        return response.data;
    },

    deleteMedia: async (mediaId: string) => {
        const response = await axios.delete(`${API_BASE_URL}/media/${mediaId}`);
        return response.data;
    },

    listSegments: async (mediaId: string): Promise<SubtitleSegment[]> => {
        const response = await axios.get(`${API_BASE_URL}/media/${mediaId}/segments`);
        return response.data;
    },

    fetchMediaInfo: async (url: string) => {
        const response = await axios.post(`${API_BASE_URL}/media/fetch-info`, { url });
        return response.data;
    },

    downloadMedia: async (url: string) => {
        const response = await axios.post(`${API_BASE_URL}/media/download`, { url });
        return response.data;
    },

    // --- Saved Vocab ---

    listSavedWords: async (language?: string, dueOnly?: boolean): Promise<SavedWord[]> => {
        const params = new URLSearchParams();
        if (language && language !== 'All') params.append('language', language);
        if (dueOnly) params.append('due_only', 'true');

        const response = await axios.get(`${API_BASE_URL}/vocab`, { params });
        return response.data;
    },

    saveWord: async (word: SaveWordInput) => {
        const response = await axios.post(`${API_BASE_URL}/vocab`, word);
        return response.data;
    },

    deleteSavedWord: async (wordId: string) => {
        const response = await axios.delete(`${API_BASE_URL}/vocab/${wordId}`);
        return response.data;
    },

    reviewWord: async (wordId: string, quality: number) => {
        const response = await axios.post(`${API_BASE_URL}/vocab/${wordId}/review`, { quality });
        return response.data;
    },

    getVocabulary: async (params?: VocabQueryParams): Promise<VocabListResponse> => {
        const queryParams = new URLSearchParams();
        if (params?.language && params.language !== 'All') queryParams.append('language', params.language);
        if (params?.due_for_review) queryParams.append('due_only', 'true');
        if (params?.media_id) queryParams.append('media_id', params.media_id);
        if (params?.limit) queryParams.append('limit', params.limit.toString());
        if (params?.offset) queryParams.append('offset', params.offset.toString());

        const response = await axios.get(`${API_BASE_URL}/vocab`, { params: queryParams });
        // Backend returns array directly, wrap in response object
        const items = Array.isArray(response.data) ? response.data : response.data.items || [];
        return { items, total: items.length };
    },

    getReviewCount: async (): Promise<number> => {
        const response = await axios.get(`${API_BASE_URL}/vocab`, { params: { due_only: 'true' } });
        const items = Array.isArray(response.data) ? response.data : response.data.items || [];
        return items.length;
    },

    getVideoVocabCount: async (mediaId: string): Promise<number> => {
        const response = await axios.get(`${API_BASE_URL}/vocab`, { params: { media_id: mediaId } });
        const items = Array.isArray(response.data) ? response.data : response.data.items || [];
        return items.length;
    },

    // --- AI Features ---

    lookupWord: async (word: string, context: string, targetLanguage: string, sentenceTranslation?: string): Promise<VocabularyItem> => {
        const response = await axios.post(`${API_BASE_URL}/ai/lookup-word`, {
            word,
            context,
            target_language: targetLanguage,
            sentence_translation: sentenceTranslation  // Pass translation if available for faster lookup
        });
        return response.data;
    },

    explainContext: async (text: string, targetLanguage: string) => {
        const response = await axios.post(`${API_BASE_URL}/ai/explain`, {
            text,
            target_language: targetLanguage
        });
        return response.data;
    },

    chatWithTutor: async (messages: ChatMessage[], userMessage: string, targetLanguage: string, context?: string) => {
        // Construct the full message history including the new user message
        const fullHistory = [
            ...messages.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: userMessage }
        ];

        const response = await axios.post(`${API_BASE_URL}/ai/chat`, {
            messages: fullHistory,
            context: context,
            target_language: targetLanguage
        });
        return response.data;
    },

    translateSegments: async (mediaId: string, segmentIds: string[], targetLanguage: string): Promise<{id: string, translation: string}[]> => {
        const response = await axios.post(`${API_BASE_URL}/media/${mediaId}/translate`, {
            segment_ids: segmentIds,
            target_language: targetLanguage
        });
        return response.data;
    }
};
