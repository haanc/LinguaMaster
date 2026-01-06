import React, { useState, useEffect, useCallback } from 'react';
import { api, VocabWord } from '../services/api';
import './QuickReview.css';

interface QuickReviewProps {
    isOpen: boolean;
    onClose: () => void;
    mediaId?: string;
}

type Difficulty = 'forgot' | 'hard' | 'good' | 'easy';

const QuickReview: React.FC<QuickReviewProps> = ({ isOpen, onClose, mediaId }) => {
    const [words, setWords] = useState<VocabWord[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [showAnswer, setShowAnswer] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isComplete, setIsComplete] = useState(false);

    // Fetch words due for review
    useEffect(() => {
        if (isOpen) {
            fetchReviewWords();
        }
    }, [isOpen]);

    const fetchReviewWords = async () => {
        setIsLoading(true);
        try {
            const result = await api.getVocabulary({ due_for_review: true, limit: 10 });
            setWords(result.items || []);
            setCurrentIndex(0);
            setShowAnswer(false);
            setIsComplete(false);
        } catch (err) {
            console.error('Failed to fetch review words:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const currentWord = words[currentIndex];

    const handleReveal = () => {
        setShowAnswer(true);
    };

    const handleRate = useCallback(async (difficulty: Difficulty) => {
        if (!currentWord) return;

        // Map difficulty to quality score (0-5 for SM-2 algorithm)
        const qualityMap: Record<Difficulty, number> = {
            forgot: 0,
            hard: 2,
            good: 4,
            easy: 5
        };

        try {
            await api.reviewWord(currentWord.id, qualityMap[difficulty]);
        } catch (err) {
            console.error('Failed to update review:', err);
        }

        // Move to next word
        if (currentIndex < words.length - 1) {
            setCurrentIndex(prev => prev + 1);
            setShowAnswer(false);
        } else {
            setIsComplete(true);
        }
    }, [currentWord, currentIndex, words.length]);

    const handleClose = () => {
        onClose();
        // Reset state
        setWords([]);
        setCurrentIndex(0);
        setShowAnswer(false);
        setIsComplete(false);
    };

    if (!isOpen) return null;

    return (
        <div className="quick-review-overlay" onClick={handleClose}>
            <div className="quick-review-modal" onClick={e => e.stopPropagation()}>
                <div className="review-header">
                    <h3>快速复习</h3>
                    <button className="close-btn" onClick={handleClose}>✕</button>
                </div>

                {isLoading ? (
                    <div className="review-loading">
                        <div className="loading-spinner"></div>
                        <p>加载中...</p>
                    </div>
                ) : words.length === 0 ? (
                    <div className="review-empty">
                        <span className="empty-icon">🎉</span>
                        <h4>暂无待复习单词</h4>
                        <p>继续学习，收藏更多生词吧！</p>
                        <button className="primary-btn" onClick={handleClose}>好的</button>
                    </div>
                ) : isComplete ? (
                    <div className="review-complete">
                        <span className="complete-icon">🎉</span>
                        <h4>复习完成！</h4>
                        <p>太棒了！你复习了 {words.length} 个单词</p>
                        <button className="primary-btn" onClick={handleClose}>关闭</button>
                    </div>
                ) : currentWord ? (
                    <>
                        <div className="review-card">
                            <div className="word-display">
                                <span className="review-word">{currentWord.word}</span>
                            </div>

                            {!showAnswer ? (
                                <button className="reveal-btn" onClick={handleReveal}>
                                    点击显示释义
                                </button>
                            ) : (
                                <div className="answer-section">
                                    <div className="translation">{currentWord.translation}</div>
                                    {currentWord.context_sentence && (
                                        <div className="context">
                                            <span className="context-label">语境</span>
                                            <span className="context-text">{currentWord.context_sentence}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {showAnswer && (
                            <div className="difficulty-buttons">
                                <button
                                    className="difficulty-btn forgot"
                                    onClick={() => handleRate('forgot')}
                                >
                                    忘了
                                </button>
                                <button
                                    className="difficulty-btn hard"
                                    onClick={() => handleRate('hard')}
                                >
                                    困难
                                </button>
                                <button
                                    className="difficulty-btn good"
                                    onClick={() => handleRate('good')}
                                >
                                    记得
                                </button>
                                <button
                                    className="difficulty-btn easy"
                                    onClick={() => handleRate('easy')}
                                >
                                    简单
                                </button>
                            </div>
                        )}

                        <div className="review-progress">
                            <div className="progress-text">
                                {currentIndex + 1} / {words.length}
                            </div>
                            <div className="progress-bar">
                                <div
                                    className="progress-fill"
                                    style={{ width: `${((currentIndex + 1) / words.length) * 100}%` }}
                                />
                            </div>
                        </div>
                    </>
                ) : null}

                <button className="skip-btn" onClick={handleClose}>
                    ✕ 稍后
                </button>
            </div>
        </div>
    );
};

export default QuickReview;
