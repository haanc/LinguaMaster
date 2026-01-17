import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import './EmptyState.css';

interface EmptyStateProps {
    onImportUrl: (url: string) => void;
    onSelectLocal: () => void;
    isImporting?: boolean;
}

const EmptyState: React.FC<EmptyStateProps> = ({
    onImportUrl,
    onSelectLocal,
    isImporting = false
}) => {
    const { t } = useTranslation();
    const [urlInput, setUrlInput] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (urlInput.trim()) {
            onImportUrl(urlInput.trim());
            setUrlInput('');
        }
    };

    return (
        <div className="empty-state">
            <div className="empty-state-content">
                <div className="empty-icon">🎬</div>
                <h2>{t('empty.title')}</h2>
                <p className="empty-description">
                    {t('empty.description')}
                </p>

                <form className="import-form" onSubmit={handleSubmit}>
                    <div className="input-group">
                        <input
                            type="text"
                            placeholder={t('empty.urlPlaceholder')}
                            value={urlInput}
                            onChange={(e) => setUrlInput(e.target.value)}
                            disabled={isImporting}
                            className="url-input"
                        />
                        <button
                            type="submit"
                            disabled={isImporting || !urlInput.trim()}
                            className="import-btn"
                        >
                            {isImporting ? t('empty.importing') : t('empty.importBtn')}
                        </button>
                    </div>
                </form>

                <div className="divider">
                    <span>{t('empty.or')}</span>
                </div>

                <button
                    className="local-file-btn"
                    onClick={onSelectLocal}
                    disabled={isImporting}
                >
                    📁 {t('empty.selectLocal')}
                </button>

                <p className="supported-formats">
                    {t('empty.supported')}
                </p>
            </div>

            {/* Background decoration */}
            <div className="empty-state-bg">
                <div className="gradient-orb orb-1"></div>
                <div className="gradient-orb orb-2"></div>
            </div>
        </div>
    );
};

export default EmptyState;
