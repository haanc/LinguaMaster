import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Rnd } from 'react-rnd';
import './SubtitleOverlay.css';

interface SubtitleOverlayProps {
    text: string | null;
    translation?: string;
}

const STORAGE_KEY = 'subtitleOverlaySettings';

interface SubtitleSettings {
    // Position as percentage of parent container (0-1)
    xPercent: number;  // 0.5 = centered horizontally
    yPercent: number;  // 0.85 = 85% from top (near bottom)
    widthPercent: number; // Width as percentage of container
    fontSize: number; // Base font size multiplier (1 = default)
}

const getInitialSettings = (): SubtitleSettings => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            // Check if it's new format (has xPercent) or old format (has x)
            if ('xPercent' in parsed) {
                return parsed;
            }
            // Migrate from old format - use defaults
        }
    } catch {
        // Ignore errors
    }
    // Default: centered at bottom 85%, 50% width
    return { xPercent: 0.5, yPercent: 0.85, widthPercent: 0.5, fontSize: 1 };
};

const SubtitleOverlay: React.FC<SubtitleOverlayProps> = ({ text, translation }) => {
    const [settings, setSettings] = useState<SubtitleSettings>(getInitialSettings);
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [fullscreenElement, setFullscreenElement] = useState<Element | null>(null);
    const [containerSize, setContainerSize] = useState({ width: window.innerWidth, height: window.innerHeight });
    const containerRef = useRef<HTMLDivElement>(null);

    // Update container size on mount and resize
    useEffect(() => {
        const updateContainerSize = () => {
            const parent = containerRef.current?.parentElement;
            if (parent) {
                setContainerSize({ width: parent.clientWidth, height: parent.clientHeight });
            } else {
                setContainerSize({ width: window.innerWidth, height: window.innerHeight });
            }
        };

        updateContainerSize();
        window.addEventListener('resize', updateContainerSize);
        return () => window.removeEventListener('resize', updateContainerSize);
    }, []);

    // Listen for fullscreen changes (including vendor-prefixed events)
    useEffect(() => {
        const handleFullscreenChange = () => {
            const fsElement = document.fullscreenElement ||
                              (document as any).webkitFullscreenElement ||
                              (document as any).mozFullScreenElement ||
                              (document as any).msFullscreenElement;
            setIsFullscreen(!!fsElement);
            setFullscreenElement(fsElement || null);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.addEventListener('mozfullscreenchange', handleFullscreenChange);
        document.addEventListener('MSFullscreenChange', handleFullscreenChange);

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
            document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
            document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
        };
    }, []);

    const saveSettings = useCallback((newSettings: SubtitleSettings) => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));
        } catch {
            // Ignore errors
        }
    }, []);

    // Convert pixel position to percentage when drag stops
    const handleDragStop = useCallback((_e: unknown, data: { x: number; y: number }) => {
        const width = containerSize.width;
        const height = containerSize.height;
        const subtitleWidth = width * settings.widthPercent;

        // Calculate center point of subtitle and convert to percentage
        const centerX = data.x + subtitleWidth / 2;
        const xPercent = Math.max(0.1, Math.min(0.9, centerX / width));
        const yPercent = Math.max(0.1, Math.min(0.95, data.y / height));

        const newSettings = { ...settings, xPercent, yPercent };
        setSettings(newSettings);
        setIsDragging(false);
        saveSettings(newSettings);
    }, [settings, saveSettings, containerSize]);

    // Convert pixel size to percentage when resize stops
    const handleResizeStop = useCallback((
        _e: unknown,
        _direction: unknown,
        ref: HTMLElement,
        _delta: unknown,
        position: { x: number; y: number }
    ) => {
        const width = containerSize.width;
        const height = containerSize.height;
        const newPixelWidth = parseInt(ref.style.width, 10);
        const widthPercent = Math.max(0.2, Math.min(0.9, newPixelWidth / width));

        // Calculate new font size based on width percentage
        const baseFontSize = Math.max(0.7, Math.min(1.5, widthPercent * 2));

        // Calculate center point and convert to percentage
        const centerX = position.x + newPixelWidth / 2;
        const xPercent = Math.max(0.1, Math.min(0.9, centerX / width));
        const yPercent = Math.max(0.1, Math.min(0.95, position.y / height));

        const newSettings = {
            ...settings,
            widthPercent,
            fontSize: baseFontSize,
            xPercent,
            yPercent,
        };
        setSettings(newSettings);
        setIsResizing(false);
        saveSettings(newSettings);
    }, [settings, saveSettings, containerSize]);

    if (!text) return null;

    // Calculate pixel values from percentage settings
    const pixelWidth = containerSize.width * settings.widthPercent;
    const pixelX = containerSize.width * settings.xPercent - pixelWidth / 2;
    const pixelY = containerSize.height * settings.yPercent;

    // In fullscreen mode, use Portal to render subtitle inside the fullscreen element
    // because only content inside the fullscreen element is visible
    if (isFullscreen && fullscreenElement) {
        const subtitleElement = (
            <div
                className="subtitle-fullscreen-overlay"
                style={{
                    '--subtitle-font-scale': settings.fontSize,
                } as React.CSSProperties}
            >
                <div className="subtitle-content">
                    <p className="subtitle-source">{text}</p>
                    {translation && (
                        <p className="subtitle-translation">{translation}</p>
                    )}
                </div>
            </div>
        );
        return createPortal(subtitleElement, fullscreenElement);
    }

    return (
        <div ref={containerRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            <Rnd
                className={`subtitle-rnd ${isDragging ? 'dragging' : ''} ${isResizing ? 'resizing' : ''}`}
                position={{ x: pixelX, y: pixelY }}
                size={{ width: pixelWidth, height: 'auto' }}
                minWidth={containerSize.width * 0.2}
                minHeight={40}
                maxWidth={containerSize.width * 0.9}
                bounds="parent"
                enableResizing={{
                    left: true,
                    right: true,
                    top: false,
                    bottom: false,
                    topLeft: false,
                    topRight: false,
                    bottomLeft: false,
                    bottomRight: false,
                }}
                onDragStart={() => setIsDragging(true)}
                onDragStop={handleDragStop}
                onResizeStart={() => setIsResizing(true)}
                onResizeStop={handleResizeStop}
                style={{ pointerEvents: 'auto' }}
            >
                <div
                    className="subtitle-overlay"
                    style={{
                        '--subtitle-font-scale': settings.fontSize,
                    } as React.CSSProperties}
                >
                <div className="subtitle-drag-hint">⋮⋮</div>
                <div className="subtitle-content">
                    <p className="subtitle-source">{text}</p>
                    {translation && (
                        <p className="subtitle-translation">{translation}</p>
                    )}
                </div>
                <div className="subtitle-resize-hint left">‹</div>
                <div className="subtitle-resize-hint right">›</div>
            </div>
        </Rnd>
        </div>
    );
};

export default SubtitleOverlay;
