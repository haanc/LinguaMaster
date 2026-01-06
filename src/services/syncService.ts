
import { supabase, getUser } from './supabase';
import { api } from './api';

// Interface for Supabase User Vocab Table
interface RemoteVocab {
    id: string; // UUID
    user_id: string;
    word: string;
    translation?: string;
    context_sentence?: string;
    source_video?: string;
    language?: string;
    created_at: string;
    next_review_at?: string;
    interval?: number;
    easiness_factor?: number;
    repetitions?: number;
}

export const syncService = {
    /**
     * Pulls data from Supabase and merges into Local DB.
     * Strategy:
     * 1. Fetch all rows from Supabase 'user_vocab'.
     * 2. For each row, check if it exists locally.
     * 3. If missing, INSERT local.
     * 4. If present, UPDATE local if remote is newer (TODO: Add updated_at check, currently simpler overwrite).
     */
    async pullFromCloud() {
        const user = await getUser();
        if (!user) throw new Error("Not logged in");

        console.log("☁️ Pulling from cloud...");

        // 1. Pull Vocab
        const { data: remoteData, error } = await supabase
            .from('user_vocab')
            .select('*') as { data: RemoteVocab[] | null, error: any };

        if (error) {
            console.error("Supabase Pull Error:", error);
            throw new Error(`Supabase Pull: ${error.message}`);
        }

        // 2. Pull Media
        const { data: remoteMedia, error: mediaError } = await supabase
            .from('user_media')
            .select('*');

        if (mediaError) {
            console.error("Supabase Media Pull Error:", mediaError);
            // We don't throw here, to allow partial sync if media table missing
        }

        // --- Process Vocab ---
        let addedCount = 0;
        if (remoteData) {
            console.log(`☁️ Found ${remoteData.length} words in cloud.`);
            try {
                const localWords = await api.listSavedWords("All");
                const localWordMap = new Map(localWords.map(w => [w.word, w]));

                for (const remoteWord of remoteData) {
                    if (!localWordMap.has(remoteWord.word)) {
                        await api.saveWord({
                            word: remoteWord.word,
                            translation: remoteWord.translation || '',
                            context_sentence: remoteWord.context_sentence,
                            media_id: undefined,
                            language: remoteWord.language,
                            // Attempt to pass owner_id explicitly? No, API intercepts header. 
                            // But wait, the interceptor reads from localStorage.
                            // Ensure localStorage is set correctly before this runs! (It is in App.tsx)
                        });
                        addedCount++;
                    }
                }
                console.log(`✅ Pulled ${addedCount} new words.`);
            } catch (localError: any) {
                console.error("Local API Error during Pull:", localError);
                throw new Error(`Local API Pull: ${localError.message || 'Network Error'}`);
            }
        }

        // --- Process Media ---
        let addedMedia = 0;
        if (remoteMedia && remoteMedia.length > 0) {
            console.log(`☁️ Found ${remoteMedia.length} videos in cloud.`);
            try {
                const localMediaList = await api.listMedia();
                const localUrlMap = new Set(localMediaList.filter(m => m.source_url).map(m => m.source_url));

                for (const rMedia of remoteMedia) {
                    if (rMedia.source_url && !localUrlMap.has(rMedia.source_url)) {
                        await api.saveMedia({
                            title: rMedia.title || 'Synced Video',
                            source_url: rMedia.source_url,
                            cover_image: rMedia.cover_image,
                            duration: rMedia.duration || 0,
                            status: 'cloud_only',
                            file_path: '',
                            language: 'en'
                        });
                        addedMedia++;
                    }
                }
                console.log(`✅ Pulled ${addedMedia} new videos.`);
            } catch (e) {
                console.error("Media Sync Error", e);
            }
        }

        return addedCount + addedMedia;
    },

    async pushToCloud() {
        const user = await getUser();
        if (!user) throw new Error("Not logged in");

        console.log("☁️ Pushing to cloud...");
        try {
            // 1. Push Vocab
            const localWords = await api.listSavedWords("All");
            const updates = localWords.map(w => ({
                user_id: user.id,
                word: w.word,
                translation: w.translation,
                context_sentence: w.context_sentence,
                language: w.language,
                next_review_at: w.next_review_at,
                interval: w.interval,
                easiness_factor: w.easiness_factor,
                repetitions: w.repetitions
            }));

            // Deduplicate vocab
            const uniqueUpdatesMap = new Map();
            updates.forEach(item => { uniqueUpdatesMap.set(item.word, item); });
            const uniqueUpdates = Array.from(uniqueUpdatesMap.values());

            if (uniqueUpdates.length > 0) {
                const { error } = await supabase
                    .from('user_vocab')
                    .upsert(uniqueUpdates, { onConflict: 'user_id, word' });

                if (error) {
                    console.error("Supabase Push Vocab Error:", error);
                    throw new Error(`Supabase Push Vocab: ${error.message}`);
                }
            }
            console.log(`✅ Pushed ${uniqueUpdates.length} words.`);

            // 2. Push Media
            const localMedia = await api.listMedia();
            const mediaUpdates = localMedia
                .filter(m => m.source_url && m.source_url.startsWith('http')) // Only sync online videos
                .map(m => ({
                    user_id: user.id,
                    source_url: m.source_url,
                    title: m.title,
                    cover_image: m.cover_image,
                    duration: m.duration
                }));

            // Deduplicate media
            const uniqueMediaMap = new Map();
            mediaUpdates.forEach(item => { uniqueMediaMap.set(item.source_url, item); });
            const uniqueMediaUpdates = Array.from(uniqueMediaMap.values());

            if (uniqueMediaUpdates.length > 0) {
                const { error } = await supabase
                    .from('user_media')
                    .upsert(uniqueMediaUpdates, { onConflict: 'user_id, source_url' });

                if (error) {
                    // Check if table exists error?
                    if (error.code === '42P01') { // undefined_table
                        console.warn("Skipping Media Sync: 'user_media' table not found.");
                    } else {
                        console.error("Supabase Push Media Error:", error);
                    }
                } else {
                    console.log(`✅ Pushed ${uniqueMediaUpdates.length} videos.`);
                }
            }

        } catch (localError: any) {
            if (localError.message && localError.message.startsWith('Supabase')) throw localError;
            console.error("Local API Error during Push:", localError);
            throw new Error(`Local API Push: ${localError.message || 'Network Error'}`);
        }
    }
};
