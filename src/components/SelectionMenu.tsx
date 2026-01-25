
import React, { useState, useEffect } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { api, VocabularyItem } from '../services/api';
import { edgeApi, isUsingOwnApiKey } from '../services/edgeApi';
import { useUser } from '../contexts/UserContext';
import './SelectionMenu.css';

interface SelectionMenuProps {
    selectedText: string;
    context: string;
    targetLanguage: string;
    position: { x: number; y: number } | null;
    onClose: () => void;
}

const SelectionMenu: React.FC<SelectionMenuProps> = ({ selectedText, context, targetLanguage, position, onClose }) => {
    const { isAuthenticated } = useUser();
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<VocabularyItem | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Reset state when selection changes
    useEffect(() => {
        setData(null);
        setError(null);
        setLoading(false);
    }, [selectedText]);

    const handleLookup = async () => {
        setLoading(true);
        setError(null);
        try {
            let result: VocabularyItem;

            // Check if user has configured their own LLM
            if (isUsingOwnApiKey()) {
                // Use local backend (free, no credits)
                result = await api.lookupWord(selectedText, context, targetLanguage);
            } else if (isAuthenticated) {
                // Use Edge Function with credits
                const response = await edgeApi.lookupWord(selectedText, context, targetLanguage);
                // Parse Edge response - it returns JSON as a string in response.result
                try {
                    const resultText = response.result || '';
                    // Remove markdown code blocks if present
                    const cleanJson = resultText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
                    const parsed = JSON.parse(cleanJson);
                    result = {
                        word: selectedText,
                        translation: parsed.translation || '',
                        definition: parsed.definition || '',
                        pronunciation: parsed.pronunciation || '',
                        example_sentence: parsed.example || '',
                        context_sentence: context,
                    };
                } catch (parseError) {
                    console.error('Failed to parse word lookup response:', parseError);
                    // Fallback: use the raw text as translation
                    result = {
                        word: selectedText,
                        translation: response.result || 'No translation available',
                        definition: '',
                        pronunciation: '',
                        example_sentence: '',
                        context_sentence: context,
                    };
                }
            } else {
                throw new Error('Please sign in or configure local LLM');
            }

            setData(result);
        } catch (err: any) {
            console.error(err);
            if (err.message?.includes('sign in') || err.message?.includes('authenticate')) {
                setError("请登录或配置本地 LLM");
            } else {
                setError("查询失败");
            }
        } finally {
            setLoading(false);
        }
    };

    if (!position) return null;

    return (
        <Popover.Root open={true} onOpenChange={(open) => !open && onClose()}>
            <Popover.Anchor
                style={{
                    position: 'fixed',
                    top: position.y,
                    left: position.x,
                    width: 1,
                    height: 1,
                    visibility: 'hidden'
                }}
            />

            <Popover.Portal>
                <Popover.Content
                    className="SelectionMenuContent"
                    side="top"
                    align="center"
                    sideOffset={5}
                    onInteractOutside={onClose}
                >
                    <div className="selection-card">
                        {!data && !loading && !error && (
                            <button className="lookup-btn" onClick={handleLookup}>
                                🔍 Look up "{selectedText}"
                            </button>
                        )}

                        {loading && <div className="menu-loading">Thinking... 🧠</div>}

                        {error && <div className="menu-error">❌ {error}</div>}

                        {data && (
                            <div className="menu-result">
                                <div className="menu-header">
                                    <span className="word-title">{data.word}</span>
                                    {data.pronunciation && <span className="word-pronunciation">[{data.pronunciation}]</span>}
                                </div>
                                <div className="definition-row">
                                    <span className="value">{data.definition}</span>
                                </div>
                                <div className="translation-row">
                                    <span className="value success-text">{data.translation}</span>
                                </div>
                            </div>
                        )}
                        <Popover.Arrow className="SelectionMenuArrow" />
                    </div>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
};

export default SelectionMenu;
