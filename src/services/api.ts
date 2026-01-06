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
