import React from 'react';
import './TitleBar.css';
import appIcon from '../assets/icon.png';

interface TitleBarProps {
    title: string;
}

const TitleBar: React.FC<TitleBarProps> = ({ title: _title }) => {
    // @ts-ignore
    const isElectron = window.ipcRenderer !== undefined;

    const handleMinimize = () => {
        // @ts-ignore
        window.ipcRenderer?.invoke('window-minimize');
    };

    const handleMaximize = () => {
        // @ts-ignore
        window.ipcRenderer?.invoke('window-maximize');
    };

    const handleClose = () => {
        // @ts-ignore
        window.ipcRenderer?.invoke('window-close');
    };

    if (!isElectron) {
        return null; // Don't render in browser mode
    }

    return (
        <div className="titlebar">
            <div className="titlebar-drag">
                <img src={appIcon} alt="LinguaMaster" className="titlebar-icon" />
            </div>
            <div className="titlebar-controls">
                <button
                    className="titlebar-btn minimize"
                    onClick={handleMinimize}
                    title="Minimize"
                >
                    <svg width="10" height="1" viewBox="0 0 10 1">
                        <rect width="10" height="1" fill="currentColor" />
                    </svg>
                </button>
                <button
                    className="titlebar-btn maximize"
                    onClick={handleMaximize}
                    title="Maximize"
                >
                    <svg width="10" height="10" viewBox="0 0 10 10">
                        <rect width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1" />
                    </svg>
                </button>
                <button
                    className="titlebar-btn close"
                    onClick={handleClose}
                    title="Close"
                >
                    <svg width="10" height="10" viewBox="0 0 10 10">
                        <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2" />
                        <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1.2" />
                    </svg>
                </button>
            </div>
        </div>
    );
};

export default TitleBar;
