import React, { useState } from 'react';
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
                <h2>开始你的语言学习之旅</h2>
                <p className="empty-description">
                    粘贴 YouTube 链接，或拖拽本地视频文件
                </p>

                <form className="import-form" onSubmit={handleSubmit}>
                    <div className="input-group">
                        <input
                            type="text"
                            placeholder="粘贴视频链接..."
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
                            {isImporting ? '导入中...' : '导入'}
                        </button>
                    </div>
                </form>

                <div className="divider">
                    <span>或</span>
                </div>

                <button
                    className="local-file-btn"
                    onClick={onSelectLocal}
                    disabled={isImporting}
                >
                    📁 选择本地文件
                </button>

                <p className="supported-formats">
                    支持: YouTube, Bilibili, MP4, MKV, WebM
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
