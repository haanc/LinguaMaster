import React, { useState, useCallback } from 'react';
import { Rnd } from 'react-rnd';
import './LearningPanel.css';

interface LearningPanelProps {
    isVisible: boolean;
    currentSentence?: string;
    onExplain: () => void;
    onWordByWord: () => void;
    onShowVocab: () => void;
    onQuickReview: () => void;
    vocabCount: number;
    reviewCount: number;
    isExplaining?: boolean;
    isTranslating?: boolean;
}

const STORAGE_KEY = 'learningPanelPosition';

const getInitialPosition = () => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            return JSON.parse(saved);
        }
    } catch {
        // Ignore errors
    }
    // Default position: top center area
    return { x: -1, y: 20 }; // x=-1 means center
};

const LearningPanel: React.FC<LearningPanelProps> = ({
    isVisible,
    currentSentence,
    onExplain,
    onWordByWord,
    onShowVocab,
    onQuickReview,
    vocabCount,
    reviewCount,
    isExplaining,
    isTranslating
}) => {
    const [position, setPosition] = useState(getInitialPosition);
    const [isDragging, setIsDragging] = useState(false);

    const handleDragStop = useCallback((_e: unknown, data: { x: number; y: number }) => {
        const newPosition = { x: data.x, y: data.y };
        setPosition(newPosition);
        setIsDragging(false);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newPosition));
        } catch {
            // Ignore errors
        }
    }, []);

    const handleDragStart = useCallback(() => {
        setIsDragging(true);
    }, []);

    if (!isVisible) return null;

    // Calculate initial x position (center if x=-1)
    const initialX = position.x === -1 ? window.innerWidth / 2 - 150 : position.x;

    return (
        <Rnd
            className={`learning-panel-rnd ${isDragging ? 'dragging' : ''}`}
            default={{
                x: initialX,
                y: position.y,
                width: 'auto',
                height: 'auto',
            }}
            position={position.x === -1 ? undefined : position}
            minWidth={100}
            minHeight={40}
            bounds="parent"
            enableResizing={false}
            onDragStart={handleDragStart}
            onDragStop={handleDragStop}
            dragHandleClassName="drag-handle"
        >
            <div className="learning-panel">
                <div className="drag-handle" title="拖动移动位置">
                    <span className="drag-icon">⋮⋮</span>
                </div>
                <div className="learning-panel-content">
                    <button
                        className={`learning-btn ${isExplaining ? 'loading' : ''}`}
                        onClick={onExplain}
                        disabled={isExplaining || !currentSentence}
                        title="AI 智能解析当前句子"
                    >
                        <span className="btn-icon">✨</span>
                        <span className="btn-text">AI解释</span>
                    </button>

                    <button
                        className={`learning-btn ${isTranslating ? 'loading' : ''}`}
                        onClick={onWordByWord}
                        disabled={isTranslating || !currentSentence}
                        title="显示逐词对照翻译"
                    >
                        <span className="btn-icon">🔤</span>
                        <span className="btn-text">逐词</span>
                    </button>

                    <button
                        className="learning-btn"
                        onClick={onShowVocab}
                        title="查看本视频收藏的生词"
                    >
                        <span className="btn-icon">📚</span>
                        <span className="btn-text">生词</span>
                        {vocabCount > 0 && (
                            <span className="btn-badge">{vocabCount}</span>
                        )}
                    </button>

                    <button
                        className={`learning-btn ${reviewCount > 0 ? 'has-review' : ''}`}
                        onClick={onQuickReview}
                        disabled={reviewCount === 0}
                        title={reviewCount > 0 ? `${reviewCount} 个单词待复习` : '暂无待复习单词'}
                    >
                        <span className="btn-icon">🔔</span>
                        <span className="btn-text">待复习</span>
                        {reviewCount > 0 && (
                            <span className="btn-badge review">{reviewCount}</span>
                        )}
                    </button>
                </div>
            </div>
        </Rnd>
    );
};

export default LearningPanel;
