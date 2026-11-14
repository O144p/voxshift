import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type ChangeEvent,
} from 'react'
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize2,
  Repeat,
  Radio,
  Disc3,
} from 'lucide-react'
import { DEMO_LYRICS } from '../engine/demoTrack'
import type { TransposeEngineState } from '../engine/TransposeEngine'

interface VideoViewportProps {
  mediaUrl: string
  fileName: string
  isDemoTrack: boolean
  engineState: TransposeEngineState
  onVideoElementMount: (element: HTMLVideoElement) => Promise<void>
  onEnsureAudioResumed: () => Promise<void>
  onVolumeChange: (volume: number) => void
  onToggleMute: () => void
  getFrequencyData: (target: Uint8Array<ArrayBuffer>) => boolean
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00.0'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const tenths = Math.floor((seconds % 1) * 10)
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`
}

function formatPitchBadge(state: TransposeEngineState): string {
  if (state.bypassed) return 'ORIGINAL (BYPASS)'
  const { semitones, cents } = state
  if (semitones === 0 && cents === 0) return '0 DT (DIAPASON)'
  const stSign = semitones > 0 ? '+' : ''
  const ctPart =
    cents !== 0 ? ` ${cents > 0 ? `+${cents}` : cents}ct` : ''
  return `${stSign}${semitones} DT${ctPart}`
}

export function VideoViewport({
  mediaUrl,
  fileName,
  isDemoTrack,
  engineState,
  onVideoElementMount,
  onEnsureAudioResumed,
  onVolumeChange,
  onToggleMute,
  getFrequencyData,
}: VideoViewportProps) {
  const viewportContainerRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isLooping, setIsLooping] = useState(true)
  const [hasVideoFrames, setHasVideoFrames] = useState(true)

  // Connect <video> element to TransposeEngine on mount
  useEffect(() => {
    const videoEl = videoRef.current
    if (!videoEl) return
    void onVideoElementMount(videoEl)
  }, [onVideoElementMount])

  // Screen Wake Lock during active playback so mobile screens stay awake while reading lyrics
  useEffect(() => {
    if (!isPlaying) return

    let wakeLockSentinel: WakeLockSentinel | null = null
    let isCancelled = false

    const requestWakeLock = async () => {
      if (isCancelled || !('wakeLock' in navigator) || !navigator.wakeLock) {
        return
      }
      try {
        wakeLockSentinel = await navigator.wakeLock.request('screen')
      } catch {
        // Safe fallback if Wake Lock is unsupported or denied by battery saver
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isPlaying) {
        void requestWakeLock()
      }
    }

    void requestWakeLock()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      isCancelled = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (wakeLockSentinel) {
        void wakeLockSentinel.release().catch(() => {})
      }
    }
  }, [isPlaying])

  // High-precision animation loop for scrubber & spectrum canvas
  useEffect(() => {
    let rafId = 0
    const freqBuffer = new Uint8Array(new ArrayBuffer(64))

    const tick = () => {
      const videoEl = videoRef.current
      if (videoEl && !videoEl.paused) {
        setCurrentTime(videoEl.currentTime)
      }

      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          const width = canvas.width
          const height = canvas.height
          ctx.clearRect(0, 0, width, height)

          const hasData = getFrequencyData(freqBuffer)
          const barCount = 32
          const gap = 4
          const barWidth = (width - gap * (barCount - 1)) / barCount

          for (let i = 0; i < barCount; i++) {
            const raw = hasData ? freqBuffer[i] / 255 : 0.05
            const barHeight = Math.max(4, raw * (height - 8))
            const x = i * (barWidth + gap)
            const y = height - barHeight

            ctx.fillStyle = engineState.bypassed
              ? 'rgba(148, 163, 184, 0.55)'
              : 'rgba(56, 189, 248, 0.8)'
            ctx.beginPath()
            ctx.roundRect(x, y, barWidth, barHeight, 3)
            ctx.fill()
          }
        }
      }

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [getFrequencyData, engineState.bypassed])

  const togglePlayPause = useCallback(async () => {
    const videoEl = videoRef.current
    if (!videoEl) return

    await onEnsureAudioResumed()

    if (videoEl.paused) {
      try {
        await videoEl.play()
      } catch (err) {
        console.error('Erreur de lecture :', err)
      }
    } else {
      videoEl.pause()
    }
  }, [onEnsureAudioResumed])

  const seekBy = useCallback((deltaSeconds: number) => {
    const videoEl = videoRef.current
    if (!videoEl || !Number.isFinite(videoEl.duration)) return
    const nextTime = Math.max(
      0,
      Math.min(videoEl.duration, videoEl.currentTime + deltaSeconds),
    )
    videoEl.currentTime = nextTime
    setCurrentTime(nextTime)
  }, [])

  const handleScrub = (e: ChangeEvent<HTMLInputElement>) => {
    const videoEl = videoRef.current
    if (!videoEl) return
    const nextTime = Number(e.target.value)
    videoEl.currentTime = nextTime
    setCurrentTime(nextTime)
  }

  const handleVolumeInput = (e: ChangeEvent<HTMLInputElement>) => {
    onVolumeChange(Number(e.target.value))
  }

  const handleFullscreen = () => {
    const container = viewportContainerRef.current
    if (!container) return
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void container.requestFullscreen()
    }
  }

  const progressPercent =
    duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0

  const activeDemoLyric = isDemoTrack
    ? DEMO_LYRICS.find(
        (line) =>
          currentTime >= line.startTime && currentTime < line.endTime,
      ) ?? DEMO_LYRICS[0]
    : null

  const effectiveVolume = engineState.muted ? 0 : engineState.volume

  return (
    <section
      ref={viewportContainerRef}
      className="video-viewport-card"
      aria-label="Lecteur vidéo karaoké"
    >
      {/* Top Status Overlay Bar */}
      <div className="viewport-hud-top">
        <div className="hud-track-badge">
          <Radio
            size={14}
            className={isPlaying ? 'pulse-live' : 'muted-icon'}
          />
          <span className="hud-filename">{fileName}</span>
        </div>

        <div className="hud-status-pills">
          <span
            className={`hud-pill ${
              engineState.bypassed
                ? 'pill-bypass'
                : engineState.totalSemitones !== 0
                  ? 'pill-active'
                  : 'pill-neutral'
            }`}
          >
            {formatPitchBadge(engineState)}
          </span>
          {engineState.isReady && (
            <span
              className="hud-pill pill-dsp"
              title="Latence et fréquence d'échantillonnage de l'AudioWorklet Signalsmith Stretch"
            >
              DSP {engineState.sampleRate / 1000}kHz · ~{engineState.latencyMs}ms
            </span>
          )}
        </div>
      </div>

      {/* Main Video Stage */}
      <div className="video-stage" onClick={() => void togglePlayPause()}>
        <video
          ref={videoRef}
          src={mediaUrl}
          className={`native-video-element ${hasVideoFrames ? 'video-visible' : 'video-audio-only'}`}
          playsInline
          loop={isLooping}
          preload="metadata"
          onLoadStart={() => {
            setIsPlaying(false)
            setCurrentTime(0)
            setDuration(0)
          }}
          onLoadedMetadata={(e) => {
            const el = e.currentTarget
            setDuration(el.duration || 0)
            setHasVideoFrames(el.videoWidth > 0 && el.videoHeight > 0)
          }}
          onTimeUpdate={(e) => {
            setCurrentTime(e.currentTarget.currentTime)
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
        />

        {/* Audio-Only / Demo Track Karaoke Stage Overlay */}
        {!hasVideoFrames && (
          <div className="audio-stage-overlay">
            <div className="audio-stage-header">
              <Disc3
                size={34}
                className={isPlaying ? 'spin-disc' : 'idle-disc'}
              />
              <span className="stage-mode-tag">
                {isDemoTrack
                  ? 'SCÈNE KARAOKÉ DÉMO VOXSHIFT'
                  : 'HORLOGE MAÎTRE PISTE AUDIO'}
              </span>
            </div>

            {activeDemoLyric ? (
              <div className="karaoke-lyric-box">
                <p className="karaoke-lyric-main">{activeDemoLyric.text}</p>
                <p className="karaoke-lyric-sub">{activeDemoLyric.subtext}</p>
              </div>
            ) : (
              <div className="karaoke-lyric-box">
                <p className="karaoke-lyric-main">{fileName}</p>
                <p className="karaoke-lyric-sub">
                  Verrouillé sur l’horloge maître HTML5 &lt;video&gt; ·
                  Transposition polyphonique en temps réel
                </p>
              </div>
            )}

            <canvas
              ref={canvasRef}
              width={420}
              height={68}
              className="spectrum-canvas"
            />
          </div>
        )}

        {/* Center Play Overlay when Paused */}
        {!isPlaying && (
          <button
            type="button"
            className="stage-play-overlay"
            aria-label="Lire la piste"
            onClick={(e) => {
              e.stopPropagation()
              void togglePlayPause()
            }}
          >
            <Play size={32} fill="currentColor" />
          </button>
        )}
      </div>

      {/* Transport & Scrubber Bar */}
      <div className="transport-bar">
        <div className="scrubber-row">
          <span className="time-readout">{formatTime(currentTime)}</span>

          <div className="timeline-slider-wrap">
            <input
              type="range"
              min={0}
              max={duration > 0 ? duration : 100}
              step={0.01}
              value={currentTime}
              onChange={handleScrub}
              className="timeline-scrubber"
              aria-label="Barre de progression de lecture"
              style={{
                background: `linear-gradient(to right, #38bdf8 ${progressPercent}%, #1e293b ${progressPercent}%)`,
              }}
            />
          </div>

          <span className="time-readout time-total">
            {formatTime(duration)}
          </span>
        </div>

        <div className="transport-controls-row">
          <div className="transport-left">
            <button
              type="button"
              className="btn-transport-play"
              onClick={() => void togglePlayPause()}
              aria-label={isPlaying ? 'Pause' : 'Lecture'}
              title="Lecture / Pause (Espace)"
            >
              {isPlaying ? (
                <Pause size={18} fill="currentColor" />
              ) : (
                <Play size={18} fill="currentColor" />
              )}
              <span>{isPlaying ? 'Pause' : 'Lecture'}</span>
            </button>

            <button
              type="button"
              className="btn-icon"
              onClick={() => seekBy(-5)}
              title="Reculer de 5 secondes"
              aria-label="Reculer de 5 secondes"
            >
              <RotateCcw size={16} />
              <span className="btn-icon-label">-5s</span>
            </button>

            <button
              type="button"
              className="btn-icon"
              onClick={() => seekBy(5)}
              title="Avancer de 5 secondes"
              aria-label="Avancer de 5 secondes"
            >
              <RotateCw size={16} />
              <span className="btn-icon-label">+5s</span>
            </button>

            <button
              type="button"
              className={`btn-icon ${isLooping ? 'btn-icon-active' : ''}`}
              onClick={() => setIsLooping((prev) => !prev)}
              title="Activer / Désactiver la boucle"
              aria-label="Activer / Désactiver la boucle"
              aria-pressed={isLooping}
            >
              <Repeat size={16} />
            </button>
          </div>

          <div className="transport-right">
            <div className="volume-control-group">
              <button
                type="button"
                className="btn-icon"
                onClick={onToggleMute}
                aria-label={engineState.muted ? 'Réactiver le son' : 'Couper le son'}
                title={engineState.muted ? 'Réactiver le son' : 'Couper le son'}
              >
                {effectiveVolume === 0 ? (
                  <VolumeX size={17} />
                ) : (
                  <Volume2 size={17} />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={effectiveVolume}
                onChange={handleVolumeInput}
                className="volume-slider"
                aria-label="Volume principal"
                style={{
                  background: `linear-gradient(to right, #38bdf8 ${effectiveVolume * 100}%, #1e293b ${effectiveVolume * 100}%)`,
                }}
              />
              <span className="volume-pct">
                {Math.round(effectiveVolume * 100)}%
              </span>
            </div>

            <button
              type="button"
              className="btn-icon"
              onClick={handleFullscreen}
              aria-label="Plein écran"
              title="Scène karaoké en plein écran"
            >
              <Maximize2 size={16} />
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
