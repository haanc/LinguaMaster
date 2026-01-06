import React, { useRef, useEffect, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { SubtitleSegment, api, ChatMessage } from '../services/api'; // Import api and types
import './SubtitleSidebar.css';

import WordPopover from './WordPopover';
import SelectionMenu from './SelectionMenu';
import TutorPanel from './TutorPanel'; // Import TutorPanel

interface SubtitleSidebarProps {
    segments: SubtitleSegment[];
    currentTime: number;
    onSeek: (time: number) => void;
    targetLanguage: string;
    onTargetLanguageChange: (lang: string) => void;
    showTranslation: boolean;
    onShowTranslationChange: (show: boolean) => void;
    isTranslating?: boolean;
    mediaId?: string;
    sourceLanguage?: string;
    isCompact?: boolean; // Compact mode when video is playing
}

const LANGUAGES = ["Chinese", "English", "Spanish", "French", "Japanese", "German"];

const SubtitleSidebar: React.FC<SubtitleSidebarProps> = ({
    segments,
    currentTime,
    onSeek,
    targetLanguage,
    onTargetLanguageChange,
    showTranslation,
    onShowTranslationChange,
    isTranslating,
    mediaId,
    sourceLanguage,
    isCompact = false
}) => {
    const parentRef = useRef<HTMLDivElement>(null);

    // State
    const [selection, setSelection] = useState<{ text: string, context: string, x: number, y: number } | null>(null);
    const [activeTab, setActiveTab] = useState<'subtitles' | 'tutor'>('subtitles');

    // Tutor State
    const [tutorExplanation, setTutorExplanation] = useState<any>(null);
    const [tutorOriginalText, setTutorOriginalText] = useState<string | null>(null);
    const [tutorLoading, setTutorLoading] = useState(false);
    const [tutorError, setTutorError] = useState<string | null>(null);

    // Chat State
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [isChatLoading, setIsChatLoading] = useState(false);

    // Find the active segment index based on current time
    const activeIndex = segments.findIndex(
        (s) => currentTime >= s.start_time && currentTime <= s.end_time
    );

    const rowVirtualizer = useVirtualizer({
        count: segments.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 80,
        measureElement: (element) => element?.getBoundingClientRect().height,
        overscan: 5,
    });

    // Auto-scroll to active segment
    useEffect(() => {
        if (activeIndex !== -1 && activeTab === 'subtitles') {
            rowVirtualizer.scrollToIndex(activeIndex, { align: 'center' });
        }
    }, [activeIndex, rowVirtualizer, activeTab]);

    // Handle Text Selection
    const handleMouseUp = () => {
        const selectedObj = window.getSelection();
        if (selectedObj && selectedObj.toString().trim().length > 0) {
            const text = selectedObj.toString().trim();
            // Try to find context (heuristic: the text content of the parent div)
            // Ideally we get the full segment text.
            let context = "";
            if (selectedObj.anchorNode?.parentElement) {
                // Walk up to find the subtitle-row if possible to get full context
                const row = selectedObj.anchorNode.parentElement.closest('.subtitle-row');
                if (row) {
                    const textDiv = row.querySelector('.segment-text');
                    if (textDiv) context = textDiv.textContent || "";
                }
            }

            if (!context) context = text; // Fallback

            // Calculate position specifically for the selection menu
            // We use the event coordinate or the selection rect
            const rect = selectedObj.getRangeAt(0).getBoundingClientRect();

            setSelection({
                text,
                context: text, // Simplified
                x: rect.left + (rect.width / 2),
                y: rect.top
            });
        }
    };

    // Close menu when clicking elsewhere (handled by Popover usually, but strict clearing helps)
    const clearSelection = () => setSelection(null);

    // Simple tokenization for demo
    const renderTextWithPopovers = (text: string, context: string, startTime: number, translation?: string) => {
        return text.split(' ').map((word, i) => {
            // Clean punctuation for better matching?
            // For now, pass raw word, let backend handle or user selecting cleaner text usually better
            return (
                <WordPopover
                    key={i}
                    word={word}
                    context={context}
                    targetLanguage={targetLanguage}
                    mediaId={mediaId}
                    currentTime={startTime}
                    sourceLanguage={sourceLanguage}
                    segmentTranslation={translation}
                >
                    {word}{' '}
                </WordPopover>
            );
        });
    };

    const handleExplain = async (text: string) => {
        setActiveTab('tutor');
        setTutorLoading(true);
        setTutorOriginalText(text);
        setTutorError(null);
        setTutorExplanation(null);
        setChatMessages([]); // Reset chat on new explanation

        try {
            const result = await api.explainContext(text, targetLanguage);
            setTutorExplanation(result);
        } catch (err) {
            console.error(err);
            setTutorError("Failed to analyze context.");
        } finally {
            setTutorLoading(false);
        }
    };

    const handleSendMessage = async (message: string) => {
        const newMessage: ChatMessage = { role: 'user', content: message };
        const updatedMessages = [...chatMessages, newMessage];
        setChatMessages(updatedMessages);
        setIsChatLoading(true);

        try {
            // Pass the original text as context
            const response = await api.chatWithTutor(chatMessages, message, targetLanguage, tutorOriginalText || undefined);

            // Backend returns { content: string, role: string }
            const aiMessage: ChatMessage = { role: 'assistant', content: response.content };
            setChatMessages(prev => [...prev, aiMessage]);
        } catch (err) {
            console.error(err);
            setChatMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I encountered an error." }]);
        } finally {
            setIsChatLoading(false);
        }
    };

    // Auto-refresh explanation when target language changes while in Tutor mode
    useEffect(() => {
        if (activeTab === 'tutor' && tutorOriginalText) {
            // We should reload explanation, but maybe not chat history unless user wants?
            // For now, let's just re-run explanation to get new language context
            handleExplain(tutorOriginalText);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [targetLanguage]);

    return (
        <div className={`subtitle-sidebar ${isCompact ? 'compact' : ''}`}>
            <div className="sidebar-header">
                <div className="header-top">
                    <h3>Interactive Subtitles</h3>
                    <div className="tabs">
                        <button
                            className={`tab-btn ${activeTab === 'subtitles' ? 'active' : ''}`}
                            onClick={() => setActiveTab('subtitles')}
                        >
                            Transcript
                        </button>
                        <button
                            className={`tab-btn ${activeTab === 'tutor' ? 'active' : ''}`}
                            onClick={() => setActiveTab('tutor')}
                        >
                            AI Tutor
                        </button>
                    </div>
                </div>

                <div className="language-selector">
                    <label>Target:</label>
                    <select
                        value={targetLanguage}
                        onChange={(e) => onTargetLanguageChange(e.target.value)}
                        className="lang-select"
                    >
                        {LANGUAGES.map(lang => (
                            <option key={lang} value={lang}>{lang}</option>
                        ))}
                    </select>
                    <button
                        className={`translation-toggle ${showTranslation ? 'active' : ''} ${isTranslating ? 'loading' : ''}`}
                        onClick={() => onShowTranslationChange(!showTranslation)}
                        title={isTranslating ? 'Translating...' : (showTranslation ? 'Hide translation' : 'Show translation')}
                        disabled={isTranslating}
                    >
                        {isTranslating ? '⏳' : '🌐'}
                    </button>
                </div>
            </div>

            <div className="sidebar-content-area">
                {activeTab === 'subtitles' ? (
                    <div
                        ref={parentRef}
                        className="subtitle-list-container"
                        onMouseUp={handleMouseUp}
                    >
                        <div
                            style={{
                                height: `${rowVirtualizer.getTotalSize()}px`,
                                width: '100%',
                                position: 'relative',
                            }}
                        >
                            {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                                const segment = segments[virtualItem.index];
                                const isActive = virtualItem.index === activeIndex;

                                /* Use ref to measure dynamic height */
                                return (
                                    <div
                                        key={virtualItem.key}
                                        data-index={virtualItem.index}
                                        ref={rowVirtualizer.measureElement}
                                        className={`subtitle-row ${isActive ? 'active' : ''}`}
                                        style={{
                                            position: 'absolute',
                                            top: 0,
                                            left: 0,
                                            width: '100%',
                                            transform: `translateY(${virtualItem.start}px)`,
                                        }}
                                    >
                                        <div className="row-controls">
                                            <button
                                                className="ai-explain-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleExplain(segment.text);
                                                }}
                                                title="Ask AI to explain this sentence"
                                            >
                                                ✨
                                            </button>
                                        </div>
                                        <div className="segment-time" onClick={() => onSeek(segment.start_time)}>
                                            {formatTime(segment.start_time)}
                                        </div>
                                        <div className="segment-text">
                                            {renderTextWithPopovers(segment.text, segment.text, segment.start_time, segment.translation)}
                                        </div>
                                        {showTranslation && segment.translation && (
                                            <div className="segment-translation">
                                                {segment.translation}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <TutorPanel
                        explanation={tutorExplanation}
                        originalText={tutorOriginalText}
                        loading={tutorLoading}
                        error={tutorError}
                        onClose={() => setActiveTab('subtitles')}
                        chatMessages={chatMessages}
                        onSendMessage={handleSendMessage}
                        isChatLoading={isChatLoading}
                    />
                )}
            </div>

            {/* Render Selection Menu if active */}
            {selection && activeTab === 'subtitles' && (
                <SelectionMenu
                    selectedText={selection.text}
                    context={selection.context}
                    targetLanguage={targetLanguage}
                    position={{ x: selection.x, y: selection.y }}
                    onClose={clearSelection}
                />
            )}
        </div>
    );
};

// Helper to format seconds to MM:SS
const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export default SubtitleSidebar;
