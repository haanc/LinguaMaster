import React, { useState, useCallback } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { api, VocabularyItem } from '../services/api';
import './WordPopover.css';

interface WordPopoverProps {
    word: string;
    context: string;
    targetLanguage: string;
    mediaId?: string;
    currentTime?: number;
    children: React.ReactNode;
    sourceLanguage?: string;
    segmentTranslation?: string;
}

const WordPopover: React.FC<WordPopoverProps> = ({
    word, context, targetLanguage, mediaId, currentTime, children, sourceLanguage, segmentTranslation
}) => {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<VocabularyItem | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isSaved, setIsSaved] = useState(false);
    const [showDetails, setShowDetails] = useState(false);

    // Clean the word (remove punctuation for display)
    const cleanWord = word.replace(/[.,!?;:'"()[\]{}]/g, '').trim();

    const handleLookup = async () => {
        if (!cleanWord) return;
        setLoading(true);
        setError(null);
        setData(null);
        setIsSaved(false);
        setShowDetails(false);
        try {
            const result = await api.lookupWord(cleanWord, context, targetLanguage, segmentTranslation);
            setData(result);
        } catch (err: any) {
            console.error("Lookup failed:", err);
            setError("Failed to load definition.");
        } finally {
            setLoading(false);
        }
    };

    const handleOpenChange = (newOpen: boolean) => {
        setOpen(newOpen);
        if (newOpen && !data && !loading) {
            handleLookup();
        }
        if (!newOpen) {
            setShowDetails(false);
        }
    };

    const handleSave = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!data || isSaving || isSaved) return;

        setIsSaving(true);
        try {
            await api.saveWord({
                word: data.word || cleanWord,
                context_sentence: context,
                translation: data.translation,
                media_id: mediaId,
                media_time: currentTime,
                language: sourceLanguage
            });
            setIsSaved(true);
            window.dispatchEvent(new Event('vocab-updated'));
        } catch (err: any) {
            console.error("Failed to save word:", err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleSpeak = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if ('speechSynthesis' in window && cleanWord) {
            const utterance = new SpeechSynthesisUtterance(cleanWord);
            utterance.lang = sourceLanguage === 'Chinese' ? 'zh-CN' : 'en-US';
            speechSynthesis.speak(utterance);
        }
    }, [cleanWord, sourceLanguage]);

    const handleShowDetails = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowDetails(true);
    };

    // Skip empty words
    if (!cleanWord) {
        return <span>{children}</span>;
    }

    return (
        <Popover.Root open={open} onOpenChange={handleOpenChange}>
            <Popover.Trigger asChild>
                <span className="interactive-word">{children}</span>
            </Popover.Trigger>

            <Popover.Portal>
                <Popover.Content
                    className={`word-popover-content ${showDetails ? 'expanded' : ''}`}
                    sideOffset={8}
                    avoidCollisions={true}
                    align="center"
                >
                    {/* Mini Card View (Default) */}
                    {!showDetails && (
                        <div className="word-mini-card">
                            <div className="mini-card-header">
                                <div className="word-info">
                                    <span className="word-text">{cleanWord}</span>
                                    {data?.pronunciation && (
                                        <span className="word-phonetic">/{data.pronunciation}/</span>
                                    )}
                                </div>
                                <button
                                    className="speak-btn"
                                    onClick={handleSpeak}
                                    title="Pronounce"
                                >
                                    🔊
                                </button>
                            </div>

                            {loading && (
                                <div className="mini-card-loading">
                                    <span className="loading-dot"></span>
                                    <span className="loading-dot"></span>
                                    <span className="loading-dot"></span>
                                </div>
                            )}

                            {error && <div className="mini-card-error">{error}</div>}

                            {data && !loading && (
                                <>
                                    <div className="mini-card-translation">
                                        {data.translation}
                                    </div>

                                    <div className="mini-card-actions">
                                        <button
                                            className={`action-btn save-btn ${isSaved ? 'saved' : ''}`}
                                            onClick={handleSave}
                                            disabled={isSaving || isSaved}
                                        >
                                            {isSaved ? '✓ 已收藏' : isSaving ? '...' : '+ 收藏'}
                                        </button>
                                        <button
                                            className="action-btn details-btn"
                                            onClick={handleShowDetails}
                                        >
                                            ✨ 详解
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* Expanded Details View */}
                    {showDetails && data && (
                        <div className="word-details-card">
                            <div className="details-header">
                                <div className="word-info">
                                    <span className="word-text">{cleanWord}</span>
                                    {data.pronunciation && (
                                        <span className="word-phonetic">/{data.pronunciation}/</span>
                                    )}
                                </div>
                                <div className="header-actions">
                                    <button className="speak-btn" onClick={handleSpeak}>🔊</button>
                                    <button
                                        className="back-btn"
                                        onClick={(e) => { e.stopPropagation(); setShowDetails(false); }}
                                    >
                                        ←
                                    </button>
                                </div>
                            </div>

                            <div className="details-content">
                                <div className="detail-section">
                                    <span className="detail-label">释义</span>
                                    <span className="detail-value translation">{data.translation}</span>
                                </div>

                                <div className="detail-section">
                                    <span className="detail-label">定义</span>
                                    <span className="detail-value">{data.definition}</span>
                                </div>

                                {data.example_sentence && (
                                    <div className="detail-section">
                                        <span className="detail-label">例句</span>
                                        <span className="detail-value example">{data.example_sentence}</span>
                                    </div>
                                )}
                            </div>

                            <div className="details-footer">
                                <button
                                    className={`action-btn save-btn full-width ${isSaved ? 'saved' : ''}`}
                                    onClick={handleSave}
                                    disabled={isSaving || isSaved}
                                >
                                    {isSaved ? '✓ 已加入词汇本' : isSaving ? '保存中...' : '💾 加入词汇本'}
                                </button>
                            </div>
                        </div>
                    )}

                    <Popover.Arrow className="word-popover-arrow" />
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
};

export default WordPopover;
