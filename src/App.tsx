import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import Hls from 'hls.js'
import { useMediaList, useSubtitleSegments } from './hooks/useMedia'
import SubtitleSidebar from './components/SubtitleSidebar'
import SubtitleOverlay from './components/SubtitleOverlay'
import NotebookView from './components/NotebookView'
import SettingsView from './components/SettingsView'
import LearningPanel from './components/LearningPanel'
import QuickReview from './components/QuickReview'
import VideoWordList from './components/VideoWordList'
import TitleBar from './components/TitleBar'
import LLMSetupReminder from './components/LLMSetupReminder'
import { BackendStatus } from './components/BackendStatus'
import { DepsSetup } from './components/DepsSetup'
import { LLMSettingsModal } from './components/Settings/LLMSettingsModal'
import { ToastProvider } from './contexts/ToastContext'
import { api } from './services/api'
import { llmConfigStorage } from './services/llmConfigStorage'
import appIcon from './assets/icon.png'
import './App.css'
import './i18n' // Initialize i18n

// Mock segments for Step 3.1 & 3.2 verification
import { MediaSource } from './services/api'
import LibraryGrid from './components/LibraryGrid'


import { PanelImperativeHandle } from "react-resizable-panels";
import { AuthModal } from './components/Auth/AuthModal'
import { getUser, signOut, supabase } from './services/supabase'
import { User } from '@supabase/supabase-js'

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: 'red', background: '#330000' }}>
          <h2>Something went wrong.</h2>
          <details style={{ whiteSpace: 'pre-wrap' }}>
            {this.state.error && this.state.error.toString()}
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}

type AppView = 'library' | 'player' | 'notebook' | 'settings';

function App() {
  const { t } = useTranslation();
  const [videoPath, setVideoPath] = useState<string | null>(null)
  const [currentMedia, setCurrentMedia] = useState<MediaSource | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [message, setMessage] = useState('')
  const [currentTime, setCurrentTime] = useState(0)
  const [isImporting, setIsImporting] = useState(false)
  // App State
  const [view, setView] = useState<AppView>('library');
  const [targetLanguage, setTargetLanguage] = useState<string>("Chinese"); // Default
  const [showTranslation, setShowTranslation] = useState<boolean>(false); // Dual subtitle toggle - default OFF
  const [isTranslating, setIsTranslating] = useState<boolean>(false); // Translation loading state
  const [isPaused, setIsPaused] = useState<boolean>(true); // Video pause state for learning panel
  const [showQuickReview, setShowQuickReview] = useState<boolean>(false); // Quick review modal
  const [showVideoWordList, setShowVideoWordList] = useState<boolean>(false); // Video word list modal
  const [vocabCount, setVocabCount] = useState<number>(0); // Current video vocab count
  const [reviewCount, setReviewCount] = useState<number>(0); // Words due for review
  const videoRef = useRef<HTMLVideoElement>(null)
  const playerWrapperRef = useRef<HTMLDivElement>(null)
  const sidebarPanelRef = useRef<PanelImperativeHandle>(null)

  // Layout mode: 'compact' when playing, 'expanded' when paused/interacting
  const [layoutMode, setLayoutMode] = useState<'compact' | 'expanded'>('expanded');

  // Sidebar width for resizable layout
  const [sidebarWidth, setSidebarWidth] = useState<number>(320);
  const isResizing = useRef<boolean>(false);

  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isLLMSettingsOpen, setIsLLMSettingsOpen] = useState(false);
  const [showLLMReminder, setShowLLMReminder] = useState(false);
  const [_depsReady, setDepsReady] = useState(false);
  const [backendReady, setBackendReady] = useState(false);
  const [isPlayerFullscreen, setIsPlayerFullscreen] = useState(false);

  const { refetch } = useMediaList()
  const { data: segments = [], refetch: refetchSegments } = useSubtitleSegments(currentMedia?.id || null)

  // Fetch review count on mount and when vocab is updated
  useEffect(() => {
    const fetchReviewCount = async () => {
      try {
        const count = await api.getReviewCount();
        setReviewCount(count);
      } catch (err) {
        console.error('Failed to fetch review count:', err);
      }
    };
    fetchReviewCount();

    // Listen for vocab updates
    const handleVocabUpdate = () => fetchReviewCount();
    window.addEventListener('vocab-updated', handleVocabUpdate);
    return () => window.removeEventListener('vocab-updated', handleVocabUpdate);
  }, []);

  // Set initial message after i18n is ready
  useEffect(() => {
    setMessage(t('status.selectVideo'));
  }, [t]);

  // Check LLM configuration on first load
  useEffect(() => {
    const checkLLMConfig = () => {
      const configs = llmConfigStorage.getAll();
      const dismissed = sessionStorage.getItem('llm_reminder_dismissed');
      const hasSeenReminder = localStorage.getItem('llm_reminder_seen');

      // Show reminder if: no configs, not dismissed this session, and hasn't seen before
      if (configs.length === 0 && !dismissed && !hasSeenReminder) {
        // Delay slightly to let the app load first
        setTimeout(() => {
          setShowLLMReminder(true);
          localStorage.setItem('llm_reminder_seen', 'true');
        }, 1000);
      }
    };
    checkLLMConfig();
  }, []);

  // Fetch video-specific vocab count when media changes
  useEffect(() => {
    const fetchVocabCount = async () => {
      if (currentMedia?.id) {
        try {
          const count = await api.getVideoVocabCount(currentMedia.id);
          setVocabCount(count);
        } catch (err) {
          console.error('Failed to fetch vocab count:', err);
        }
      } else {
        setVocabCount(0);
      }
    };
    fetchVocabCount();

    // Listen for vocab updates
    const handleVocabUpdate = () => fetchVocabCount();
    window.addEventListener('vocab-updated', handleVocabUpdate);
    return () => window.removeEventListener('vocab-updated', handleVocabUpdate);
  }, [currentMedia?.id]);

  // Intelligent layout: adjust sidebar based on play/pause state
  useEffect(() => {
    if (view !== 'player') return;

    const newMode = isPaused ? 'expanded' : 'compact';
    if (newMode !== layoutMode) {
      setLayoutMode(newMode);

      // Use imperative API to resize panels smoothly
      if (sidebarPanelRef.current) {
        const targetSize = isPaused ? 35 : 20; // 35% when paused, 20% when playing
        sidebarPanelRef.current.resize(targetSize);
      }
    }
  }, [isPaused, view]);

  // Handle translation toggle - trigger translation when enabled
  const handleShowTranslationChange = async (show: boolean) => {
    console.log('handleShowTranslationChange called:', { show, mediaId: currentMedia?.id, segmentsCount: segments.length });
    setShowTranslation(show);

    // If enabling translation and we have segments without translations
    if (show && currentMedia?.id && segments.length > 0) {
      // Check if any segments need translation
      const needsTranslation = segments.filter(s => !s.translation);
      console.log('Segments needing translation:', needsTranslation.length);
      if (needsTranslation.length > 0) {
        setIsTranslating(true);
        setMessage(t('status.translating', { count: needsTranslation.length }));

        try {
          await api.translateSegments(
            currentMedia.id,
            needsTranslation.map(s => s.id),
            targetLanguage
          );
          // Refetch segments to get translations - await to ensure data is refreshed
          await refetchSegments();
          setMessage(t('status.translationComplete'));
        } catch (error: any) {
          console.error('Translation error:', error);
          setMessage(t('status.translationFailed', { error: error.message }));
        } finally {
          setIsTranslating(false);
        }
      }
    }
  };

  // Re-translate when target language changes (if translation is enabled)
  const handleTargetLanguageChange = async (lang: string) => {
    setTargetLanguage(lang);

    // If translation is currently shown and we have segments, re-translate
    if (showTranslation && currentMedia?.id && segments.length > 0) {
      setIsTranslating(true);
      setMessage(t('status.translatingTo', { lang }));

      try {
        await api.translateSegments(
          currentMedia.id,
          segments.map(s => s.id),
          lang
        );
        // Await refetch to ensure UI updates with new translations
        await refetchSegments();
        setMessage(t('status.translationComplete'));
      } catch (error: any) {
        console.error('Translation error:', error);
        setMessage(t('status.translationFailed', { error: error.message }));
      } finally {
        setIsTranslating(false);
      }
    }
  };

  // Check auth status on mount
  useEffect(() => {
    // Check initial auth state
    getUser().then(u => {
      setUser(u);
      if (u) {
        localStorage.setItem('userRole', 'user');
        localStorage.setItem('userId', u.id);
      } else {
        localStorage.setItem('userRole', 'guest');
        localStorage.removeItem('userId'); // Ensure clean guest state
      }
    });

    const unsubscribe = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        localStorage.setItem('userRole', 'user');
        localStorage.setItem('userId', session.user.id);
      } else {
        localStorage.setItem('userRole', 'guest');
        localStorage.removeItem('userId');
      }
      refetch(); // Refetch whenever auth state changes to update the view
    });

    return () => unsubscribe.data?.subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await signOut();
    setUser(null);
    localStorage.setItem('userRole', 'guest');
    localStorage.removeItem('userId');
    setMessage(t('status.loggedOut'));
    setView('library'); // Reset view
    setVideoPath(null); // Stop playback
    setCurrentMedia(null);
    refetch(); // Refresh list to show guest data (or empty)
  };

  // Sync videoPath with View
  useEffect(() => {
    if (videoPath) {
      setView('player');
    } else if (view === 'player') {
      // If we are in player view but no video path, go back to library
      setView('library');
    }
  }, [videoPath]);

  // HLS.js integration for m3u8 streams
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoPath) return;

    // Check if this is an HLS stream (m3u8)
    const isHlsStream = videoPath.includes('.m3u8') || videoPath.includes('manifest');

    if (isHlsStream && Hls.isSupported()) {
      // Destroy previous HLS instance
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }

      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
      });
      hlsRef.current = hls;

      hls.loadSource(videoPath);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(e => console.log('Autoplay prevented:', e));
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          console.error('HLS fatal error:', data);
          setMessage(t('status.hlsError', { details: data.details }));
        }
      });

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      video.src = videoPath;
    }
    // For non-HLS streams, the video element handles it natively via src attribute
  }, [videoPath]);

  const handleSelectVideo = async () => {
    // @ts-ignore
    const path = await window.ipcRenderer.invoke('open-file-dialog')
    if (path) {
      const protocolPath = `local-video://${encodeURIComponent(path)}`
      setVideoPath(protocolPath)
      setMessage(t('status.playingLocal', { path }))
    }
  }

  const handleSelectLibraryVideo = (media: any) => {
    // If Cloud Only, trigger download
    if (media.status === 'cloud_only' && media.source_url) {
      setMessage(t('status.cloudVideoFound'));
      api.downloadMedia(media.source_url)
        .then(() => {
          setMessage(t('status.downloadStarted', { title: media.title }));
          // Optimistically update status to show feedback immediately?
          // refetch() will happen eventually via polling
        })
        .catch((e: any) => setMessage(t('status.downloadFailed', { error: e.message })));
      return;
    }

    // If ready, we can play.
    // Logic update: Since we only download audio now, we prefer streaming VIDEO from proxy.
    // If source_url exists, we prioritize proxy stream.
    // If no source_url (local import), we play local file (which might be audio only now, but that's expected for local).

    if (media.source_url) {
      // Fetch the direct stream URL from backend
      setMessage(t('status.resolvingStream', { title: media.title }));
      setCurrentMedia(media);

      // Check if it's a Bilibili video - needs proxy due to Referer requirements
      const isBilibili = media.source_url.includes('bilibili.com');

      if (isBilibili) {
        // Use real-time streaming endpoint for Bilibili (FFmpeg merges video+audio on-the-fly)
        setMessage(t('status.loadingBilibili'));
        const streamUrl = `http://localhost:8000/media/bilibili-stream?url=${encodeURIComponent(media.source_url)}`;
        setVideoPath(streamUrl);
        return;
      }

      // For YouTube and others, get direct stream URL
      fetch(`http://localhost:8000/media/stream-url?url=${encodeURIComponent(media.source_url)}`)
        .then(res => {
          if (!res.ok) {
            throw new Error(`Server error: ${res.status}`);
          }
          return res.json();
        })
        .then(data => {
          if (data.stream_url) {
            setVideoPath(data.stream_url);
            setMessage(t('status.streaming', { title: media.title }));
          } else {
            setMessage(t('status.streamResolveFailed'));
          }
        })
        .catch(err => {
          console.error('Failed to get stream URL:', err);
          setMessage(t('status.error', { error: err.message }));
        });
      return;
    }

    // Fallback: Local File (Audio Only likely)
    if (media.status === 'ready' && media.file_path) {
      let path = media.file_path;
      if (!path.startsWith('http') && !path.startsWith('local-video')) {
        path = path.replace(/\\/g, '/');
        // @ts-ignore
        const isElectron = window.ipcRenderer !== undefined;
        if (isElectron) {
          path = `local-video://${encodeURIComponent(path)}`;
        } else {
          const parts = path.split('/');
          const filename = parts[parts.length - 1];
          path = `http://localhost:8000/static/cache/${filename}`;
        }
      }
      setVideoPath(path);
      console.log("Playing Local Path:", path);
      setMessage(t('status.playingLocalAudio', { title: media.title }));
      setCurrentMedia(media);
      return;
    }

    // ERROR handling
    if (media.status === 'error') {
      setMessage(t('status.processingError', { error: media.error_message || 'Processing failed.' }));
      return;
    }

    // Processing check
    setMessage(t('status.videoProcessing', { status: media.status }));

    setCurrentMedia(media); // Set current media to fetch subtitles (might be empty initially)
  }

  const isValidUrl = (url: string) => {
    const trimmedUrl = url.trim();
    // Basic pattern matching for YouTube and Bilibili
    // YouTube: youtube.com/watch?v=VIDEO_ID or youtu.be/VIDEO_ID
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|m\.youtube\.com\/watch\?v=)[\w-]+/i;
    // Bilibili: bilibili.com/video/BV... (with optional query params)
    const bilibiliRegex = /^(https?:\/\/)?(www\.)?bilibili\.com\/video\/BV[\w]+/i;
    return youtubeRegex.test(trimmedUrl) || bilibiliRegex.test(trimmedUrl);
  };

  const handleImportUrl = async (directUrl?: string) => {
    const url = directUrl || urlInput;
    if (!url) return

    // Validate URL before proceeding
    if (!isValidUrl(url)) {
      setMessage(t('status.invalidUrl'));
      return;
    }

    setIsImporting(true)
    // Instant feedback: Start background process immediately
    setMessage(t('status.startingImport'))
    try {
      await api.downloadMedia(url)
      setMessage(t('status.videoQueued'))
      setUrlInput('')
      // Polling will handle the rest
      refetch()
    } catch (error: any) {
      console.error('Import Error:', error)
      setMessage(t('status.importFailed', { error: error.response?.data?.detail || error.message }))
    } finally {
      setIsImporting(false)
    }
  }

  const handleSeek = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time
      videoRef.current.play()
    }
  }

  // Resize handle mouse events
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = window.innerWidth - e.clientX;
      setSidebarWidth(Math.max(250, Math.min(600, newWidth)));
    };

    const handleMouseUp = () => {
      if (isResizing.current) {
        isResizing.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleDeleteVideo = async (mediaId: string) => {
    try {
      await api.deleteMedia(mediaId);
      setMessage(t('status.videoDeleted'));
      refetch(); // Refresh list to confirm sync
      // If the deleted video was playing, clear player
      if (currentMedia?.id === mediaId) {
        setVideoPath(null);
        setCurrentMedia(null);
      }
    } catch (error) {
      console.error('Delete error', error);
      setMessage(t('status.deleteFailed'));
    }
  }


  const activeSegment = useMemo(() => {
    return segments.find(s => currentTime >= s.start_time && currentTime <= s.end_time);
  }, [segments, currentTime]);

  const handleBackToLibrary = () => {
    setVideoPath(null);
    setCurrentMedia(null);
    setView('library'); // Explicitly go to library
  };

  // Learning Panel handlers
  const handleExplainSentence = useCallback(() => {
    if (activeSegment?.text) {
      // Trigger AI explanation - dispatch event for SubtitleSidebar to handle
      window.dispatchEvent(new CustomEvent('explain-sentence', { detail: activeSegment.text }));
    }
  }, [activeSegment]);

  const handleWordByWord = useCallback(() => {
    // Enable translation if not already
    if (!showTranslation) {
      handleShowTranslationChange(true);
    }
  }, [showTranslation]);

  const handleShowVocab = useCallback(() => {
    // Open video word list modal
    setShowVideoWordList(true);
  }, []);

  const handleQuickReview = useCallback(() => {
    setShowQuickReview(true);
  }, []);

  const handleQuickReviewClose = useCallback(() => {
    setShowQuickReview(false);
    // Refresh review count after closing
    api.getReviewCount().then(setReviewCount).catch(console.error);
  }, []);

  // Fullscreen toggle for player wrapper (to keep subtitles visible)
  const togglePlayerFullscreen = useCallback(() => {
    if (!playerWrapperRef.current) return;

    if (!document.fullscreenElement) {
      playerWrapperRef.current.requestFullscreen().catch(err => {
        console.error('Failed to enter fullscreen:', err);
      });
    } else {
      document.exitFullscreen();
    }
  }, []);

  // Listen for fullscreen changes to update state
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsPlayerFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  return (
    <ToastProvider>
    <div className="app-layout">
      <TitleBar title="LinguaMaster" />
      <div className="main-content">
        <header>
          <div className="header-left">
            {view === 'player' && (
              <button className="back-btn" onClick={handleBackToLibrary}>
                ← {t('nav.library')}
              </button>
            )}
            <h1><img src={appIcon} alt="" className="app-logo" />{t('app.name')}</h1>
            <nav className="main-nav">
              <button
                className={view === 'library' || view === 'player' ? 'active' : ''}
                onClick={() => {
                  if (view === 'player' && videoPath) {
                    handleBackToLibrary();
                  } else {
                    setView('library');
                  }
                }}
              >
                {t('nav.library')}
              </button>
              <button
                className={view === 'notebook' ? 'active' : ''}
                onClick={() => {
                  setVideoPath(null);
                  setView('notebook');
                }}
              >
                {t('nav.notebook')}
              </button>
            </nav>
          </div>

          <div className="header-center">
            <div className="url-import-group">
              <input
                type="text"
                placeholder={t('empty.urlPlaceholder')}
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                disabled={isImporting}
              />
              <button onClick={() => handleImportUrl()} disabled={isImporting || !urlInput}>
                {isImporting ? `⚡ ${t('empty.importing')}` : `📥 ${t('nav.import')}`}
              </button>
            </div>
            <button className="secondary-btn" onClick={handleSelectVideo}>📂 {t('nav.local')}</button>
          </div>

          <div className="header-right">
            {/* Settings Icon Button */}
            <button
              className="icon-btn settings-btn"
              onClick={() => {
                setVideoPath(null);
                setView('settings');
              }}
              title={t('nav.settings')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </button>

            {/* Auth Controls */}
            {user ? (
              <div className="auth-controls">
                <div className="user-badge">
                  {user.email}
                </div>
                <button
                  className="secondary-btn sync-btn"
                  onClick={async () => {
                    try {
                      setMessage(t('status.syncing'));
                      await import('./services/syncService').then(m => m.syncService.pullFromCloud().then(() => m.syncService.pushToCloud()));
                      setMessage(t('status.syncComplete'));
                      refetch();
                    } catch (e: any) {
                      console.error(e);
                      setMessage(t('status.syncFailed', { error: e.message }));
                    }
                  }}
                >
                  🔄 Sync
                </button>
                <button className="secondary-btn" onClick={handleLogout}>{t('nav.login') === 'Login' ? 'Logout' : '退出'}</button>
              </div>
            ) : (
              <button
                className="login-btn"
                onClick={() => setIsAuthModalOpen(true)}
              >
                {t('nav.login')}
              </button>
            )}
          </div>
        </header>
        <p className="status-msg-bar">{message}</p>

        {/* Resizable Layout Area */}
        <div className="main-layout">
          {/* Main Player / Library Area */}
          <div className="main-panel">
            {view === 'player' && videoPath ? (
              <div className="player-section">
                <div className={`player-wrapper ${isPlayerFullscreen ? 'fullscreen' : ''}`} ref={playerWrapperRef}>
                  <video
                    key={videoPath} // Force remount on video change
                    ref={videoRef}
                    src={videoPath.includes('.m3u8') || videoPath.includes('manifest') ? undefined : videoPath}
                    controls
                    autoPlay // Auto-play when loaded
                    onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                    onPlay={() => setIsPaused(false)}
                    onPause={() => setIsPaused(true)}
                    onError={(e) => {
                      const err = e.currentTarget.error;
                      console.error('Video Error:', err);
                      setMessage(t('status.videoError', { error: err?.message || 'Code ' + err?.code }));
                    }}
                    className="main-video"
                  />

                  {/* Custom fullscreen button - toggles wrapper fullscreen for subtitle visibility */}
                  <button
                    className="custom-fullscreen-btn"
                    onClick={togglePlayerFullscreen}
                    title={isPlayerFullscreen ? '退出全屏' : '全屏播放（带字幕）'}
                  >
                    {isPlayerFullscreen ? '⊠' : '⛶'}
                  </button>

                  <SubtitleOverlay
                    text={activeSegment?.text || null}
                    translation={showTranslation ? activeSegment?.translation : undefined}
                  />

                  {/* Learning Panel - appears when video is paused */}
                  <LearningPanel
                    isVisible={isPaused && view === 'player'}
                    currentSentence={activeSegment?.text}
                    onExplain={handleExplainSentence}
                    onWordByWord={handleWordByWord}
                    onShowVocab={handleShowVocab}
                    onQuickReview={handleQuickReview}
                    vocabCount={vocabCount}
                    reviewCount={reviewCount}
                    isTranslating={isTranslating}
                  />
                </div>
              </div>
            ) : view === 'notebook' ? (
              <NotebookView />
            ) : view === 'settings' ? (
              <SettingsView onOpenLLMSettings={() => setIsLLMSettingsOpen(true)} />
            ) : (
              <LibraryGrid
                onSelectVideo={handleSelectLibraryVideo}
                onDeleteVideo={handleDeleteVideo}
                onImportUrl={handleImportUrl}
                onSelectLocal={handleSelectVideo}
                isImporting={isImporting}
              />
            )}
          </div>

          {/* Resize Handle */}
          <div
            className="resize-handle"
            onMouseDown={handleResizeMouseDown}
          ></div>

          {/* Sidebar Area */}
          <div
            className={`sidebar-panel ${layoutMode}`}
            style={{ width: sidebarWidth }}
          >
            <ErrorBoundary>
              <SubtitleSidebar
                segments={segments || []}
                currentTime={currentTime}
                onSeek={handleSeek}
                targetLanguage={targetLanguage}
                onTargetLanguageChange={handleTargetLanguageChange}
                showTranslation={showTranslation}
                onShowTranslationChange={handleShowTranslationChange}
                isTranslating={isTranslating}
                mediaId={currentMedia?.id}
                sourceLanguage={currentMedia?.language}
                isCompact={layoutMode === 'compact'}
              />
            </ErrorBoundary>
          </div>
        </div>
      </div>

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onLoginSuccess={() => {
          getUser().then(setUser);
          setMessage(t('status.loggedIn'));
        }}
      />

      <QuickReview
        isOpen={showQuickReview}
        onClose={handleQuickReviewClose}
        mediaId={currentMedia?.id}
      />

      <VideoWordList
        isOpen={showVideoWordList}
        onClose={() => setShowVideoWordList(false)}
        mediaId={currentMedia?.id}
        onSeek={handleSeek}
      />

      <LLMSettingsModal
        isOpen={isLLMSettingsOpen}
        onClose={() => setIsLLMSettingsOpen(false)}
      />

      <LLMSetupReminder
        isOpen={showLLMReminder}
        onClose={() => setShowLLMReminder(false)}
        onGoToSettings={() => {
          setShowLLMReminder(false);
          setView('settings');
          // Open LLM settings modal after a short delay
          setTimeout(() => setIsLLMSettingsOpen(true), 300);
        }}
      />

      {/* Backend Status - shows loading screen until backend is ready */}
      {!backendReady && (
        <BackendStatus onReady={() => setBackendReady(true)} />
      )}

      {/* Dependency Setup Modal - shows on first run if deps are missing */}
      <DepsSetup onComplete={() => setDepsReady(true)} />
    </div>
    </ToastProvider>
  )
}

export default App
