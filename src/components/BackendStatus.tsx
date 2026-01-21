import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import appIcon from '../assets/icon.png';
import './BackendStatus.css';

type BackendStatusType = 'not_started' | 'starting' | 'ready' | 'error';

interface BackendStatusProps {
  onReady?: () => void;
}

export function BackendStatus({ onReady }: BackendStatusProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<BackendStatusType>('starting');
  const [error, setError] = useState<string | null>(null);
  const [startTime] = useState(Date.now());
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    // @ts-ignore - ipcRenderer is exposed via preload
    const ipcRenderer = window.ipcRenderer;
    if (!ipcRenderer) {
      // Not in Electron, check backend via HTTP
      checkBackendHttp();
      return;
    }

    // Get initial status
    ipcRenderer.invoke('get-backend-status').then((result: { status: BackendStatusType; error: string | null }) => {
      setStatus(result.status);
      setError(result.error);
      if (result.status === 'ready') {
        onReady?.();
      }
    });

    // Listen for status changes
    const handleStatusChange = (_event: any, data: { status: BackendStatusType; error: string | null }) => {
      setStatus(data.status);
      setError(data.error);
      if (data.status === 'ready') {
        onReady?.();
      }
    };

    ipcRenderer.on('backend-status-change', handleStatusChange);

    return () => {
      ipcRenderer.off('backend-status-change', handleStatusChange);
    };
  }, [onReady]);

  // Update elapsed time while starting
  useEffect(() => {
    if (status !== 'starting') return;

    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [status, startTime]);

  // HTTP fallback for non-Electron environments
  const checkBackendHttp = async () => {
    const maxAttempts = 60; // 30 seconds
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const response = await fetch('http://localhost:8000/health', {
          method: 'GET',
          signal: AbortSignal.timeout(2000)
        });
        if (response.ok) {
          setStatus('ready');
          onReady?.();
          return;
        }
      } catch {
        // Continue waiting
      }
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setStatus('error');
    setError('Backend failed to start');
  };

  // Don't show anything if backend is ready
  if (status === 'ready') {
    return null;
  }

  return (
    <div className="backend-status-overlay">
      <div className="backend-status-card">
        <div className="app-logo-large">
          <img src={appIcon} alt="LinguaMaster" />
        </div>
        <h1>LinguaMaster</h1>

        {status === 'starting' && (
          <>
            <div className="spinner"></div>
            <p className="status-text">{t('backend.starting', 'Starting backend service...')}</p>
            <p className="elapsed-time">
              {t('backend.elapsed', 'Elapsed: {{seconds}}s', { seconds: elapsedTime })}
            </p>
            <p className="hint-text">
              {t('backend.firstRunHint', 'First launch may take longer as models are being initialized.')}
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="error-icon">!</div>
            <p className="status-text error">{t('backend.error', 'Failed to start backend')}</p>
            {error && <p className="error-detail">{error}</p>}
            <button
              className="retry-btn"
              onClick={() => window.location.reload()}
            >
              {t('backend.retry', 'Retry')}
            </button>
          </>
        )}

        {status === 'not_started' && (
          <>
            <div className="spinner"></div>
            <p className="status-text">{t('backend.initializing', 'Initializing...')}</p>
          </>
        )}
      </div>
    </div>
  );
}
