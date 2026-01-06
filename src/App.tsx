import React, { useState, useRef, useMemo, useEffect } from 'react'
import Hls from 'hls.js'
import { useMediaList, useSubtitleSegments } from './hooks/useMedia'
import SubtitleSidebar from './components/SubtitleSidebar'
import SubtitleOverlay from './components/SubtitleOverlay'
import NotebookView from './components/NotebookView'
import { api } from './services/api'
import './App.css'

// Mock segments for Step 3.1 & 3.2 verification
import { MediaSource } from './services/api'
import LibraryGrid from './components/LibraryGrid'


import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from "react-resizable-panels";
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

type AppView = 'library' | 'player' | 'notebook';

function App() {
  const [videoPath, setVideoPath] = useState<string | null>(null)
  const [currentMedia, setCurrentMedia] = useState<MediaSource | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [message, setMessage] = useState('Select a video or paste a URL to start')
  const [currentTime, setCurrentTime] = useState(0)
  const [isImporting, setIsImporting] = useState(false)
  // App State
  const [view, setView] = useState<AppView>('library');
  const [targetLanguage, setTargetLanguage] = useState<string>("Chinese"); // Default
  const [showTranslation, setShowTranslation] = useState<boolean>(false); // Dual subtitle toggle - default OFF
  const [isTranslating, setIsTranslating] = useState<boolean>(false); // Translation loading state
  const videoRef = useRef<HTMLVideoElement>(null)

  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const { data: mediaList, isLoading, refetch } = useMediaList()
  const { data: segments = [], refetch: refetchSegments } = useSubtitleSegments(currentMedia?.id || null)

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
        setMessage(`🌐 翻译中... (${needsTranslation.length} 条字幕)`);

        try {
          await api.translateSegments(
            currentMedia.id,
            needsTranslation.map(s => s.id),
            targetLanguage
          );
          // Refetch segments to get translations
          refetchSegments();
          setMessage(`✅ 翻译完成`);
        } catch (error: any) {
          console.error('Translation error:', error);
          setMessage(`❌ 翻译失败: ${error.message}`);
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
      setMessage(`🌐 正在翻译为 ${lang}...`);

      try {
        await api.translateSegments(
          currentMedia.id,
          segments.map(s => s.id),
          lang
        );
        refetchSegments();
        setMessage(`✅ 翻译完成`);
      } catch (error: any) {
        console.error('Translation error:', error);
        setMessage(`❌ 翻译失败: ${error.message}`);
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
    setMessage('Logged out successfully.');
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
          setMessage(`HLS Error: ${data.details}`);
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
      setMessage(`Playing local: ${path}`)
    }
  }

  const handleSelectLibraryVideo = (media: any) => {
    // If Cloud Only, trigger download
    if (media.status === 'cloud_only' && media.source_url) {
      setMessage(`☁️ Found cloud video. Starting download...`);
      api.downloadMedia(media.source_url)
        .then(() => {
          setMessage(`🚀 Download started for ${media.title}`);
          // Optimistically update status to show feedback immediately?
          // refetch() will happen eventually via polling
        })
        .catch((e: any) => setMessage(`❌ Download failed: ${e.message}`));
      return;
    }

    // If ready, we can play.
    // Logic update: Since we only download audio now, we prefer streaming VIDEO from proxy.
    // If source_url exists, we prioritize proxy stream.
    // If no source_url (local import), we play local file (which might be audio only now, but that's expected for local).

    if (media.source_url) {
      // Fetch the direct stream URL from backend
      setMessage(`Resolving stream URL for: ${media.title}...`);
      setCurrentMedia(media);

      fetch(`http://localhost:8000/media/stream-url?url=${encodeURIComponent(media.source_url)}`)
        .then(res => res.json())
        .then(data => {
          if (data.stream_url) {
            setVideoPath(data.stream_url);
            setMessage(`Streaming: ${media.title}`);
          } else {
            setMessage(`Failed to resolve stream URL`);
          }
        })
        .catch(err => {
          console.error('Failed to get stream URL:', err);
          setMessage(`Error: ${err.message}`);
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
      setMessage(`Playing Local (Audio): ${media.title}`);
      setCurrentMedia(media);
      return;
    }

    // ERROR handling
    if (media.status === 'error') {
      setMessage(`❌ Error: ${media.error_message || 'Processing failed.'} Please delete and try again.`);
      return;
    }

    // Processing check
    setMessage(`⏳ Video is ${media.status}... Please wait.`);

    setCurrentMedia(media); // Set current media to fetch subtitles (might be empty initially)
  }

  const isValidUrl = (url: string) => {
    // Basic pattern matching for YouTube and Bilibili
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{11}/;
    const bilibiliRegex = /^(https?:\/\/)?(www\.)?bilibili\.com\/video\/BV[\w]+/;
    return youtubeRegex.test(url) || bilibiliRegex.test(url);
  };

  const handleImportUrl = async () => {
    if (!urlInput) return

    // Validate URL before proceeding
    if (!isValidUrl(urlInput)) {
      setMessage('❌ Invalid URL: Please enter a valid YouTube or Bilibili video link (e.g., youtube.com/watch?v=...)');
      return;
    }

    setIsImporting(true)
    // Instant feedback: Start background process immediately
    setMessage('🚀 Starting background import...')
    try {
      await api.downloadMedia(urlInput)
      setMessage(`Video queued! It will appear in your Library momentarily.`)
      setUrlInput('')
      // Polling will handle the rest
      refetch()
    } catch (error: any) {
      console.error('Import Error:', error)
      setMessage(`Import Failed: ${error.response?.data?.detail || error.message}`)
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

  const handleDeleteVideo = async (mediaId: string) => {
    try {
      await api.deleteMedia(mediaId);
      setMessage('Video deleted successfully.');
      refetch(); // Refresh list to confirm sync
      // If the deleted video was playing, clear player
      if (currentMedia?.id === mediaId) {
        setVideoPath(null);
        setCurrentMedia(null);
      }
    } catch (error) {
      console.error('Delete error', error);
      setMessage('Failed to delete video.');
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

  return (
    <div className="app-layout">
      <div className="main-content">
        <header>
          <div className="header-left">
            {view === 'player' && (
              <button className="back-btn" onClick={handleBackToLibrary}>
                ← Back
              </button>
            )}
            <h1>Fluent Learner v2</h1>
            <nav className="main-nav">
              <button
                className={view === 'library' || view === 'player' ? 'active' : ''}
                onClick={() => {
                  if (view === 'player' && videoPath) {
                    // keep player active if we click Library? No, expectation is usually to go to library list
                    handleBackToLibrary();
                  } else {
                    setView('library');
                  }
                }}
              >
                Library
              </button>
              <button
                className={view === 'notebook' ? 'active' : ''}
                onClick={() => {
                  setVideoPath(null); // Stop video if playing
                  setView('notebook');
                }}
              >
                Notebook
              </button>
            </nav>
          </div>

          <div className="controls">
            <div className="url-import-group">
              <input
                type="text"
                placeholder="Paste YouTube/Bilibili URL..."
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                disabled={isImporting}
              />
              <button onClick={handleImportUrl} disabled={isImporting || !urlInput}>
                {isImporting ? '⚡ Importing...' : '📥 Import'}
              </button>
            </div>
            <button className="secondary-btn" onClick={handleSelectVideo}>📂 Local</button>

            {/* Auth Controls */}
            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: '10px' }}>
                <div className="user-badge" style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                  {user.email}
                </div>
                <button
                  className="secondary-btn"
                  onClick={async () => {
                    try {
                      setMessage('🔄 Syncing...');
                      await import('./services/syncService').then(m => m.syncService.pullFromCloud().then(() => m.syncService.pushToCloud()));
                      setMessage('✅ Sync Complete!');
                      refetch(); // Refresh UI
                    } catch (e: any) {
                      console.error(e);
                      setMessage(`❌ Sync Failed: ${e.message}`);
                    }
                  }}
                  style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', border: '1px solid rgba(99, 102, 241, 0.3)' }}
                >
                  🔄 Sync
                </button>
                <button className="secondary-btn" onClick={handleLogout}>Logout</button>
              </div>
            ) : (
              <button
                className="secondary-btn"
                onClick={() => setIsAuthModalOpen(true)}
                style={{ marginLeft: '10px', background: '#6366f1', color: 'white', border: 'none' }}
              >
                Login
              </button>
            )}
          </div>
        </header>
        <p className="status-msg-bar">{message}</p>

        {/* Resizable Layout Area */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <PanelGroup orientation="horizontal" style={{ width: '100%', height: '100%' }}>
            {/* Main Player / Library Area */}
            <Panel defaultSize={75} minSize={30}>
              <div className="player-section" style={{ height: '100%', overflowY: 'auto' }}>
                <div className="player-wrapper">
                  {view === 'player' && videoPath ? (
                    <>
                      <video
                        key={videoPath} // Force remount on video change
                        ref={videoRef}
                        src={videoPath.includes('.m3u8') || videoPath.includes('manifest') ? undefined : videoPath}
                        controls
                        autoPlay // Auto-play when loaded
                        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                        onError={(e) => {
                          const err = e.currentTarget.error;
                          console.error('Video Error:', err);
                          setMessage(`Video Error: ${err?.message || 'Code ' + err?.code}.`);
                        }}
                        className="main-video"
                      />

                      <SubtitleOverlay
                        text={activeSegment?.text || null}
                        translation={showTranslation ? activeSegment?.translation : undefined}
                      />
                    </>
                  ) : view === 'notebook' ? (
                    <NotebookView />
                  ) : (
                    <LibraryGrid
                      onSelectVideo={handleSelectLibraryVideo}
                      onDeleteVideo={handleDeleteVideo}
                    />
                  )}
                </div>
              </div>
            </Panel>

            <PanelResizeHandle className="ResizeHandleOuter">
              <div className="ResizeHandleInner" />
            </PanelResizeHandle>

            {/* Sidebar Area */}
            <Panel defaultSize={25} minSize={20}>
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
                />
              </ErrorBoundary>
            </Panel>
          </PanelGroup>
        </div>

        <footer>
          <p>Backend: http://localhost:8000/health | Total Media: {isLoading ? '...' : mediaList?.length || 0}</p>
        </footer>
      </div>

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onLoginSuccess={() => {
          getUser().then(setUser);
          setMessage('Logged in successfully!');
        }}
      />
    </div>
  )
}

export default App
