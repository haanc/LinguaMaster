import React from 'react';
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
    if (!isVisible) return null;

    return (
        <div className="learning-panel">
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
    );
};

export default LearningPanel;
