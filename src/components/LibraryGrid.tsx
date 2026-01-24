
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, MediaSource } from '../services/api';
import EmptyState from './EmptyState';
import './LibraryGrid.css';

interface LibraryGridProps {
    onSelectVideo: (media: MediaSource) => void;
    onDeleteVideo: (mediaId: string) => void;
    onImportUrl?: (url: string) => void;
    onSelectLocal?: () => void;
    isImporting?: boolean;
}

const LibraryGrid: React.FC<LibraryGridProps> = ({
    onSelectVideo,
    onDeleteVideo,
    onImportUrl,
    onSelectLocal,
    isImporting = false
}) => {
    const { t } = useTranslation();
    const [mediaList, setMediaList] = useState<MediaSource[]>([]);
    const [confirmingId, setConfirmingId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchMedia = async () => {
        try {
            const list = await api.listMedia();
            // Sort by created_at desc
            const sorted = list.sort((a, b) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
            setMediaList(sorted);
        } catch (error) {
            console.error("Failed to fetch media list", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMedia();
        // Poll every 5 seconds to update status
        const interval = setInterval(fetchMedia, 5000);
        return () => clearInterval(interval);
    }, []);

    const formatDuration = (seconds: number) => {
        const min = Math.floor(seconds / 60);
        const sec = Math.floor(seconds % 60);
        return `${min}:${sec.toString().padStart(2, '0')}`;
    };

    const getStatusLabel = (media: MediaSource) => {
        const status = media.status || 'ready';
        if (status === 'ready') return t('card.ready');
        if (status === 'error') return t('card.error');
        if (status === 'interrupted') return t('card.interrupted');
        if (status === 'cloud_only') return `${t('card.cloud')} ☁️`;
        // For processing states, parse progress_message and translate
        if (media.progress_message) {
            const msg = media.progress_message;
            // Parse structured messages: "chunking:N", "transcribing:X/Y", "merging", "downloading"
            if (msg === 'downloading') {
                return t('progress.downloading');
            }
            if (msg === 'merging') {
                return t('progress.merging');
            }
            if (msg.startsWith('chunking:')) {
                const chunks = msg.split(':')[1];
                return `${t('progress.chunking')} (${chunks})`;
            }
            if (msg.startsWith('transcribing:')) {
                const progress = msg.split(':')[1];
                return `${t('progress.transcribing')} (${progress})`;
            }
            // Legacy: if it's already translated text from old data, show as-is
            return msg;
        }
        return t('card.processing');
    }

    const isProcessing = (status: string) => {
        return status !== 'ready' && status !== 'error' && status !== 'cloud_only' && status !== 'interrupted';
    }

    const isRetryable = (status: string) => {
        return status === 'interrupted' || status === 'error';
    }

    const handleRetry = async (mediaId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await api.retryMedia(mediaId);
            // Refresh media list to show new status
            fetchMedia();
        } catch (error) {
            console.error("Failed to retry media", error);
        }
    }

    const getStatusClass = (status: string) => {
        switch (status) {
            case 'ready': return 'status-ready';
            case 'error': return 'status-error';
            case 'interrupted': return 'status-interrupted';
            case 'cloud_only': return 'status-cloud-only';
            default: return 'status-processing';
        }
    }

    if (loading && mediaList.length === 0) {
        return <div className="text-white p-8">{t('library.loading')}</div>;
    }

    return (
        <div className="library-container">
            <div className="library-header">
                <h2>{t('library.title')}</h2>
            </div>

            {mediaList.length === 0 ? (
                onImportUrl && onSelectLocal ? (
                    <EmptyState
                        onImportUrl={onImportUrl}
                        onSelectLocal={onSelectLocal}
                        isImporting={isImporting}
                    />
                ) : (
                    <div className="empty-placeholder">
                        {t('library.noVideos')}
                    </div>
                )
            ) : (
                <div className="library-grid">
                    {mediaList.map((media) => (
                        <div
                            key={media.id}
                            className="video-card"
                            onClick={() => onSelectVideo(media)}
                        >
                            <div className="card-thumbnail">
                                {media.cover_image ? (
                                    <img src={media.cover_image} alt={media.title} />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-600 bg-gray-800">
                                        No Cover
                                    </div>
                                )}
                                {/* Progress bar overlay for processing states */}
                                {isProcessing(media.status) && (
                                    <div className="progress-overlay">
                                        <div className="progress-bar-container">
                                            <div
                                                className="progress-bar-fill"
                                                style={{ width: `${media.progress || 0}%` }}
                                            />
                                        </div>
                                        <span className="progress-text">{media.progress || 0}%</span>
                                    </div>
                                )}
                            </div>
                            <div className="card-content">
                                <h3 className="card-title" title={media.title}>{media.title}</h3>
                                <div className="card-meta">
                                    <span>{formatDuration(media.duration)}</span>
                                    <div className="card-bottom-actions">
                                        <span className={`status-badge ${getStatusClass(media.status || 'ready')}`}>
                                            {getStatusLabel(media)}
                                        </span>
                                        {confirmingId === media.id ? (
                                            <div className="confirm-actions">
                                                <button
                                                    type="button"
                                                    className="confirm-btn"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onDeleteVideo(media.id);
                                                        setMediaList(prev => prev.filter(m => m.id !== media.id));
                                                        setConfirmingId(null);
                                                    }}
                                                >
                                                    {t('card.confirm')}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="cancel-btn"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setConfirmingId(null);
                                                    }}
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="action-buttons">
                                                {isRetryable(media.status) && (
                                                    <button
                                                        type="button"
                                                        className="retry-btn-small"
                                                        onClick={(e) => handleRetry(media.id, e)}
                                                        title={t('card.retry')}
                                                    >
                                                        🔄
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    className="delete-btn-small"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setConfirmingId(media.id);
                                                    }}
                                                    title={t('card.delete')}
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default LibraryGrid;
