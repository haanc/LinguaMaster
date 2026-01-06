
import React, { useEffect, useState } from 'react';
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

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'ready': return 'READY';
            case 'error': return 'ERROR';
            case 'cloud_only': return 'CLOUD ☁️';
            default: return 'PROCESSING';
        }
    }

    const getStatusClass = (status: string) => {
        switch (status) {
            case 'ready': return 'status-ready';
            case 'error': return 'status-error';
            case 'cloud_only': return 'status-cloud-only';
            default: return 'status-processing';
        }
    }

    if (loading && mediaList.length === 0) {
        return <div className="text-white p-8">Loading Library...</div>;
    }

    return (
        <div className="library-container">
            <div className="library-header">
                <h2>My Library</h2>
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
                        No videos yet. Paste a URL above to import one!
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
                                <div className="card-actions">
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
                                                Confirm
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
                                        <button
                                            type="button"
                                            className="delete-btn"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setConfirmingId(media.id);
                                            }}
                                            title="Delete Video"
                                        >
                                            🗑️
                                        </button>
                                    )}
                                    <span className={`status-badge ${getStatusClass(media.status || 'ready')}`}>
                                        {getStatusLabel(media.status || 'ready')}
                                    </span>
                                </div>
                            </div>
                            <div className="card-content">
                                <h3 className="card-title" title={media.title}>{media.title}</h3>
                                <div className="card-meta">
                                    <span>{formatDuration(media.duration)}</span>
                                    <span>{new Date(media.created_at).toLocaleDateString()}</span>
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
