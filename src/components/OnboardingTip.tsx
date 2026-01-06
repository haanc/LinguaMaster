import React, { useState, useEffect } from 'react';
import './OnboardingTip.css';

interface OnboardingTipProps {
    tipId: string;
    title: string;
    description: string;
    position?: 'top' | 'bottom' | 'left' | 'right';
    targetRef?: React.RefObject<HTMLElement>;
    onDismiss?: () => void;
    showDelay?: number;
}

const DISMISSED_TIPS_KEY = 'fluent-learner-dismissed-tips';

const OnboardingTip: React.FC<OnboardingTipProps> = ({
    tipId,
    title,
    description,
    position = 'bottom',
    onDismiss,
    showDelay = 500
}) => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Check if tip was already dismissed
        const dismissedTips = JSON.parse(localStorage.getItem(DISMISSED_TIPS_KEY) || '[]');
        if (dismissedTips.includes(tipId)) {
            return;
        }

        // Show tip after delay
        const timer = setTimeout(() => {
            setIsVisible(true);
        }, showDelay);

        return () => clearTimeout(timer);
    }, [tipId, showDelay]);

    const handleDismiss = () => {
        // Save to localStorage
        const dismissedTips = JSON.parse(localStorage.getItem(DISMISSED_TIPS_KEY) || '[]');
        if (!dismissedTips.includes(tipId)) {
            dismissedTips.push(tipId);
            localStorage.setItem(DISMISSED_TIPS_KEY, JSON.stringify(dismissedTips));
        }

        setIsVisible(false);
        onDismiss?.();
    };

    if (!isVisible) return null;

    return (
        <div className={`onboarding-tip tip-${position}`}>
            <div className="tip-content">
                <div className="tip-icon">💡</div>
                <div className="tip-text">
                    <h4>{title}</h4>
                    <p>{description}</p>
                </div>
            </div>
            <button className="tip-dismiss" onClick={handleDismiss}>
                知道了
            </button>
            <div className="tip-arrow" />
        </div>
    );
};

// Helper to reset all tips (for testing or settings)
export const resetOnboardingTips = () => {
    localStorage.removeItem(DISMISSED_TIPS_KEY);
};

export default OnboardingTip;
