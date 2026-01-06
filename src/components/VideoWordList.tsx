import React, { useState, useEffect } from 'react';
import { api, VocabWord } from '../services/api';
import './VideoWordList.css';

interface VideoWordListProps {
    isOpen: boolean;
    onClose: () => void;
    mediaId?: string;
    onSeek?: (time: number) => void;
}

const VideoWordList: React.FC<VideoWordListProps> = ({
    isOpen,
    onClose,
    mediaId,
    onSeek
}) => {
    const [words, setWords] = useState<VocabWord[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (isOpen && mediaId) {
            fetchVideoWords();
        }
    }, [isOpen, mediaId]);

    // Listen for vocab updates
    useEffect(() => {
        const handleVocabUpdate = () => {
            if (isOpen && mediaId) {
                fetchVideoWords();
            }
        };
        window.addEventListener('vocab-updated', handleVocabUpdate);
        return () => window.removeEventListener('vocab-updated', handleVocabUpdate);
    }, [isOpen, mediaId]);

    const fetchVideoWords = async () => {
        if (!mediaId) return;
        setIsLoading(true);
        try {
            const result = await api.getVocabulary({ media_id: mediaId });
            setWords(result.items || []);
        } catch (err) {
            console.error('Failed to fetch video words:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSeekToWord = (time?: number) => {
        if (time !== undefined && onSeek) {
            onSeek(time);
            onClose();
        }
    };

    const formatTime = (seconds?: number) => {
        if (seconds === undefined) return '--:--';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    if (!isOpen) return null;

    return (
        <div className="video-wordlist-overlay" onClick={onClose}>
            <div className="video-wordlist-modal" onClick={e => e.stopPropagation()}>
                <div className="wordlist-header">
                    <h3>📚 本视频生词</h3>
                    <button className="close-btn" onClick={onClose}>✕</button>
                </div>

                <div className="wordlist-content">
                    {isLoading ? (
                        <div className="wordlist-loading">
                            <div className="loading-spinner"></div>
                            <p>加载中...</p>
                        </div>
                    ) : words.length === 0 ? (
                        <div className="wordlist-empty">
                            <span className="empty-icon">📖</span>
                            <h4>还没有收藏生词</h4>
                            <p>点击字幕中的单词可以查看释义并收藏</p>
                        </div>
                    ) : (
                        <div className="wordlist-items">
                            {words.map((word) => (
                                <div key={word.id} className="wordlist-item">
                                    <div className="word-main">
                                        <span className="word-text">{word.word}</span>
                                        <span className="word-translation">{word.translation}</span>
                                    </div>
                                    {word.media_time !== undefined && (
                                        <button
                                            className="seek-btn"
                                            onClick={() => handleSeekToWord(word.media_time)}
                                            title="跳转到该单词出现的位置"
                                        >
                                            {formatTime(word.media_time)} ▶
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="wordlist-footer">
                    <span className="word-count">共 {words.length} 个生词</span>
                </div>
            </div>
        </div>
    );
};

export default VideoWordList;
