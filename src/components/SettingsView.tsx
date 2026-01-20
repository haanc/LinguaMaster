import React from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '../i18n/languages';
import './SettingsView.css';

interface SettingsViewProps {
    onOpenLLMSettings: () => void;
}

const SettingsView: React.FC<SettingsViewProps> = ({ onOpenLLMSettings }) => {
    const { t, i18n } = useTranslation();

    const handleLanguageChange = (languageCode: string) => {
        i18n.changeLanguage(languageCode);
    };

    return (
        <div className="settings-container">
            <div className="settings-header">
                <h2>{t('settings.title')}</h2>
            </div>

            <div className="settings-content">
                {/* Display Language Section */}
                <div className="settings-section">
                    <h3>{t('settings.language')}</h3>
                    <p className="settings-description">{t('settings.languageDesc')}</p>

                    <div className="language-grid">
                        {SUPPORTED_LANGUAGES.map((lang) => (
                            <button
                                key={lang.code}
                                className={`language-option ${i18n.language === lang.code ? 'active' : ''}`}
                                onClick={() => handleLanguageChange(lang.code)}
                            >
                                <span className="language-native">{lang.nativeName}</span>
                                <span className="language-name">{lang.name}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* LLM Configuration Section */}
                <div className="settings-section">
                    <h3>{t('settings.llm')}</h3>
                    <p className="settings-description">{t('settings.llmDesc')}</p>

                    <button
                        className="settings-action-btn"
                        onClick={onOpenLLMSettings}
                    >
                        ⚙️ {t('settings.llm')}
                    </button>
                </div>
            </div>

            <div className="settings-footer">
                <span className="version-info">Version {__APP_VERSION__}</span>
            </div>
        </div>
    );
};

export default SettingsView;
