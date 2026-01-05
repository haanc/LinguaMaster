
import React from 'react';
import './SubtitleOverlay.css';

interface SubtitleOverlayProps {
    text: string | null;
    translation?: string;
}

const SubtitleOverlay: React.FC<SubtitleOverlayProps> = ({ text, translation }) => {
    if (!text) return null;

    return (
        <div className="subtitle-overlay">
            <p className="subtitle-source">{text}</p>
            {translation && (
                <p className="subtitle-translation">{translation}</p>
            )}
        </div>
    );
};

export default SubtitleOverlay;
