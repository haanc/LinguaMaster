import React from 'react';
import { useTranslation } from 'react-i18next';
import './LLMSetupReminder.css';

interface LLMSetupReminderProps {
    isOpen: boolean;
    onClose: () => void;
    onGoToSettings: () => void;
}

const LLMSetupReminder: React.FC<LLMSetupReminderProps> = ({
    isOpen,
    onClose,
    onGoToSettings
}) => {
    const { t } = useTranslation();

    if (!isOpen) return null;

    const handleDismiss = () => {
        // Mark as dismissed so we don't show again this session
        sessionStorage.setItem('llm_reminder_dismissed', 'true');
        onClose();
    };

    const handleGoToSettings = () => {
        sessionStorage.setItem('llm_reminder_dismissed', 'true');
        onGoToSettings();
        onClose();
    };

    return (
        <div className="llm-reminder-overlay" onClick={handleDismiss}>
            <div className="llm-reminder-modal" onClick={(e) => e.stopPropagation()}>
                <div className="llm-reminder-icon">🤖✨</div>
                <h2>{t('llmReminder.title')}</h2>
                <p className="llm-reminder-message">
                    {t('llmReminder.message')}
                </p>
                <ul className="llm-reminder-features">
                    <li>🔍 {t('llmReminder.feature1')}</li>
                    <li>📝 {t('llmReminder.feature2')}</li>
                    <li>💬 {t('llmReminder.feature3')}</li>
                    <li>🌐 {t('llmReminder.feature4')}</li>
                </ul>
                <p className="llm-reminder-note">
                    {t('llmReminder.note')}
                </p>
                <div className="llm-reminder-actions">
                    <button className="llm-reminder-btn primary" onClick={handleGoToSettings}>
                        ⚙️ {t('llmReminder.goToSettings')}
                    </button>
                    <button className="llm-reminder-btn secondary" onClick={handleDismiss}>
                        {t('llmReminder.later')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LLMSetupReminder;
