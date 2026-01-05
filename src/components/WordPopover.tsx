
import React, { useState } from 'react';
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
    segmentTranslation?: string;  // If available, enables faster lookup
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

    const handleLookup = async () => {
        setLoading(true);
        setError(null);
        setData(null);
        setIsSaved(false); // Reset saved state on new lookup
        try {
            // Use API to lookup word context
            // Pass segmentTranslation if available for faster lookup
            const result = await api.lookupWord(word, context, targetLanguage, segmentTranslation);
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
    };

    const handleSave = async (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent popover from closing
        if (!data || isSaving || isSaved) return;

        setIsSaving(true);
        try {
            await api.saveWord({
                word: data.word || word,
                context_sentence: context,
                translation: data.translation,
                media_id: mediaId,
                media_time: currentTime,
                language: sourceLanguage // Save source language
            });
            setIsSaved(true);
            setTimeout(() => {
                setOpen(false); // Close popover after saving
            }, 1000);

            // Notify other components to refresh
            window.dispatchEvent(new Event('vocab-updated'));
        } catch (err: any) {
            console.error("Failed to save word:", err);
            if (err.response) {
                console.error("Server Error Data:", err.response.data);
                console.error("Server Error Status:", err.response.status);
                alert(`Failed: ${JSON.stringify(err.response.data)}`);
            } else {
                alert(`Failed to save: ${err.message || 'Unknown error'}`);
            }
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <Popover.Root open={open} onOpenChange={handleOpenChange}>
            <Popover.Trigger asChild>
                <span className="interactive-word">{children}</span>
            </Popover.Trigger>

            <Popover.Portal>
                <Popover.Content className="PopoverContent" sideOffset={5} avoidCollisions={true}>
                    <div className="popover-card">
                        <div className="popover-header">
                            <div>
                                <span className="word-title">{word}</span>
                                {data?.pronunciation && <span className="word-pronunciation">[{data.pronunciation}]</span>}
                            </div>
                            {data && !loading && (
                                <button
                                    className={`save-word-btn ${isSaved ? 'saved' : ''}`}
                                    onClick={handleSave}
                                    disabled={isSaving || isSaved}
                                    title="Save to Notebook"
                                >
                                    {isSaved ? '✅' : isSaving ? '⏳' : '💾'}
                                </button>
                            )}
                        </div>

                        {loading && <div className="popover-loading">Thinking... 🧠</div>}

                        {error && <div className="popover-error">❌ {error}</div>}

                        {data && !loading && (
                            <div className="popover-body">
                                <div className="definition-row">
                                    <span className="label">Definition:</span>
                                    <span className="value">{data.definition}</span>
                                </div>
                                <div className="translation-row">
                                    <span className="label">Translation:</span>
                                    <span className="value success-text">{data.translation}</span>
                                </div>
                                <div className="example-row">
                                    <div className="label">Example:</div>
                                    <div className="value italic">{data.example_sentence}</div>
                                </div>
                            </div>
                        )}

                        <Popover.Arrow className="PopoverArrow" />
                    </div>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
};

export default WordPopover;
