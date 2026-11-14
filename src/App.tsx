import { useEffect, useRef, useState, useCallback } from 'react'
import { AudioWaveform, ShieldCheck, Keyboard, Download } from 'lucide-react'
import {
  TransposeEngine,
  INITIAL_ENGINE_STATE,
  type TransposeEngineState,
} from './engine/TransposeEngine'
import {
  ExportPipeline,
  type ExportProgress,
} from './engine/ExportPipeline'
import { createDemoKaraokeFile } from './engine/demoTrack'
import { MediaDropzone } from './components/MediaDropzone'
import { VideoViewport } from './components/VideoViewport'
import { PitchControlDeck } from './components/PitchControlDeck'
import { ExportModal } from './components/ExportModal'
import './App.css'

export function App() {
  const [engine] = useState(() => new TransposeEngine())
  const [exportPipeline] = useState(() => new ExportPipeline())
  const [engineState, setEngineState] = useState<TransposeEngineState>(
    INITIAL_ENGINE_STATE,
  )

  const [currentFile, setCurrentFile] = useState<File | null>(null)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [isDemoTrack, setIsDemoTrack] = useState(false)

  // Export Modal & Pipeline state
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(
    null,
  )
  const exportAbortRef = useRef<AbortController | null>(null)

  // Subscribe to TransposeEngine state updates
  useEffect(() => {
    const unsubscribe = engine.subscribe((newState) => {
      setEngineState(newState)
    })
    return () => {
      unsubscribe()
      engine.dispose()
      exportPipeline.dispose()
    }
  }, [engine, exportPipeline])

  // Revoke object URL on change or unmount
  useEffect(() => {
    return () => {
      if (mediaUrl) {
        URL.revokeObjectURL(mediaUrl)
      }
    }
  }, [mediaUrl])

  const handleLoadFile = useCallback((file: File, demo = false) => {
    const nextUrl = URL.createObjectURL(file)
    setMediaUrl((prevUrl) => {
      if (prevUrl) URL.revokeObjectURL(prevUrl)
      return nextUrl
    })
    setCurrentFile(file)
    setFileName(file.name)
    setIsDemoTrack(demo)
    setExportProgress(null)
  }, [])

  const handleLoadDemo = useCallback(() => {
    const demoFile = createDemoKaraokeFile()
    handleLoadFile(demoFile, true)
  }, [handleLoadFile])

  const handleVideoElementMount = useCallback(
    async (videoElement: HTMLVideoElement) => {
      await engine.attachMediaElement(videoElement)
    },
    [engine],
  )

  const handleEnsureAudioResumed = useCallback(async () => {
    await engine.resume()
  }, [engine])

  const handleSemitonesChange = useCallback(
    (semitones: number) => {
      void engine.resume()
      engine.setSemitones(semitones)
    },
    [engine],
  )

  const handleStepSemitones = useCallback(
    (delta: number) => {
      void engine.resume()
      engine.stepSemitones(delta)
    },
    [engine],
  )

  const handleCentsChange = useCallback(
    (cents: number) => {
      void engine.resume()
      engine.setCents(cents)
    },
    [engine],
  )

  const handleResetPitch = useCallback(() => {
    void engine.resume()
    engine.resetPitch()
  }, [engine])

  const handleSetBypass = useCallback(
    (bypassed: boolean) => {
      void engine.resume()
      engine.setBypass(bypassed)
    },
    [engine],
  )

  const handleSetFormantCompensation = useCallback(
    (enabled: boolean) => {
      void engine.resume()
      engine.setFormantCompensation(enabled)
    },
    [engine],
  )

  const handleVolumeChange = useCallback(
    (volume: number) => {
      engine.setVolume(volume)
    },
    [engine],
  )

  const handleToggleMute = useCallback(() => {
    engine.toggleMute()
  }, [engine])

  const getFrequencyData = useCallback(
    (target: Uint8Array<ArrayBuffer>) => {
      return engine.getFrequencyData(target)
    },
    [engine],
  )

  const handleOpenExportModal = useCallback(() => {
    if (!currentFile) return
    setExportProgress(null)
    setIsExportModalOpen(true)
  }, [currentFile])

  const handleStartExport = useCallback(async () => {
    if (!currentFile || isExporting) return

    const abortController = new AbortController()
    exportAbortRef.current = abortController
    setIsExporting(true)

    try {
      await exportPipeline.exportTransposedMp4({
        file: currentFile,
        semitones: engineState.semitones,
        cents: engineState.cents,
        formantCompensation: engineState.formantCompensation,
        onProgress: (prog) => {
          setExportProgress(prog)
        },
        signal: abortController.signal,
      })
    } catch (err) {
      if (abortController.signal.aborted) {
        setExportProgress({
          stage: 'idle',
          stageLabel: 'Export annulé',
          overallPercent: 0,
          stagePercent: 0,
          detail: 'L’export a été annulé par l’utilisateur.',
        })
      } else {
        console.error('Erreur lors de l’export :', err)
      }
    } finally {
      setIsExporting(false)
      exportAbortRef.current = null
    }
  }, [
    currentFile,
    isExporting,
    exportPipeline,
    engineState.semitones,
    engineState.cents,
    engineState.formantCompensation,
  ])

  const handleCancelExport = useCallback(() => {
    if (exportAbortRef.current) {
      exportAbortRef.current.abort()
    }
  }, [])

  const handleCloseExportModal = useCallback(() => {
    if (isExporting) return
    setIsExportModalOpen(false)
  }, [isExporting])

  // Global Studio Keyboard Shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isExportModalOpen) {
        if (e.key === 'Escape' && !isExporting) {
          setIsExportModalOpen(false)
        }
        return
      }

      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }

      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault()
        engine.toggleBypass()
      } else if (e.key === '0') {
        e.preventDefault()
        engine.resetPitch()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        engine.stepSemitones(1)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        engine.stepSemitones(-1)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [engine, isExportModalOpen, isExporting])

  return (
    <div className="studio-shell min-w-0 w-full max-w-full">
      {/* Studio Top Bar */}
      <header className="studio-header min-w-0 w-full max-w-full">
        <div className="brand-cluster min-w-0">
          <div className="brand-logo shrink-0" aria-hidden="true">
            <AudioWaveform size={22} />
          </div>
          <div className="brand-titles min-w-0">
            <h1>VoxShift</h1>
            <span className="brand-subtitle">
              Changeur de Tonalité Karaoké en Temps Réel · DSP AudioWorklet + Export MP4
            </span>
          </div>
        </div>

        {mediaUrl && (
          <MediaDropzone
            compact
            currentFileName={fileName}
            onFileSelect={handleLoadFile}
            onLoadDemo={handleLoadDemo}
          />
        )}

        <div className="studio-telemetry">
          <span className="telemetry-chip">
            <ShieldCheck size={14} />
            <span>Horloge Maître &lt;video&gt; Zéro Décalage</span>
          </span>
          <span
            className="telemetry-chip keyboard-chip"
            title="Raccourcis : [Haut/Bas] +/-1 Demi-ton, [B] Basculer Original/Modifié, [0] Réinitialiser"
          >
            <Keyboard size={14} />
            <span>[↑/↓] Tonalité · [B] A/B · [0] Réinit.</span>
          </span>
          {currentFile && (
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={handleOpenExportModal}
            >
              <Download size={14} />
              <span>Exporter MP4</span>
            </button>
          )}
        </div>
      </header>

      {/* Engine Error Banner if any */}
      {engineState.error && (
        <div className="engine-error-banner" role="alert">
          Notification du moteur audio : {engineState.error}
        </div>
      )}

      {/* Main Studio Workspace */}
      <main className="studio-workspace min-w-0 w-full max-w-full">
        <div className="viewport-column min-w-0 w-full max-w-full">
          {!mediaUrl ? (
            <MediaDropzone
              onFileSelect={handleLoadFile}
              onLoadDemo={handleLoadDemo}
            />
          ) : (
            <VideoViewport
              mediaUrl={mediaUrl}
              fileName={fileName ?? 'Piste Karaoké'}
              isDemoTrack={isDemoTrack}
              engineState={engineState}
              onVideoElementMount={handleVideoElementMount}
              onEnsureAudioResumed={handleEnsureAudioResumed}
              onVolumeChange={handleVolumeChange}
              onToggleMute={handleToggleMute}
              getFrequencyData={getFrequencyData}
            />
          )}
        </div>

        <div className="deck-column min-w-0 w-full max-w-full">
          <PitchControlDeck
            engineState={engineState}
            canExport={Boolean(currentFile)}
            onSemitonesChange={handleSemitonesChange}
            onStepSemitones={handleStepSemitones}
            onCentsChange={handleCentsChange}
            onResetPitch={handleResetPitch}
            onSetBypass={handleSetBypass}
            onSetFormantCompensation={handleSetFormantCompensation}
            onOpenExport={handleOpenExportModal}
          />
        </div>
      </main>

      {/* Offline MP4 Export Modal */}
      {currentFile && (
        <ExportModal
          isOpen={isExportModalOpen}
          file={currentFile}
          semitones={engineState.semitones}
          cents={engineState.cents}
          formantCompensation={engineState.formantCompensation}
          progress={exportProgress}
          isExporting={isExporting}
          onStartExport={() => void handleStartExport()}
          onCancelExport={handleCancelExport}
          onClose={handleCloseExportModal}
        />
      )}
    </div>
  )
}

export default App
