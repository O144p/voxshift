import { Capacitor } from '@capacitor/core'
import {
  Download,
  Share2,
  X,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Film,
  Cpu,
  Music,
} from 'lucide-react'
import {
  formatExportFileName,
  type ExportProgress,
  type ExportStage,
} from '../engine/ExportPipeline'

interface ExportModalProps {
  isOpen: boolean
  file: File
  semitones: number
  cents: number
  formantCompensation: boolean
  progress: ExportProgress | null
  isExporting: boolean
  onStartExport: () => void
  onCancelExport: () => void
  onClose: () => void
}

interface StepDef {
  id: ExportStage
  label: string
  sublabel: string
}

const PIPELINE_STEPS: StepDef[] = [
  {
    id: 'extracting-audio',
    label: '1. Extraction audio',
    sublabel: 'Démultiplexage FFmpeg en WAV PCM 16-bit',
  },
  {
    id: 'pitch-shifting',
    label: '2. Transposition',
    sublabel: 'Rendu hors-ligne Signalsmith Stretch',
  },
  {
    id: 'muxing-mp4',
    label: '3. Multiplexage MP4',
    sublabel: 'Copie vidéo (-c:v copy) + AAC 192k',
  },
]

const STAGE_ORDER: Record<ExportStage, number> = {
  idle: 0,
  'loading-core': 1,
  'extracting-audio': 2,
  'pitch-shifting': 3,
  'muxing-mp4': 4,
  completed: 5,
  error: -1,
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} Ko`
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`
}

export function ExportModal({
  isOpen,
  file,
  semitones,
  cents,
  formantCompensation,
  progress,
  isExporting,
  onStartExport,
  onCancelExport,
  onClose,
}: ExportModalProps) {
  if (!isOpen) return null

  const targetFileName = formatExportFileName(file.name, semitones, cents)
  const currentStage: ExportStage = progress?.stage ?? 'idle'
  const currentOrder = STAGE_ORDER[currentStage]
  const overallPercent = progress?.overallPercent ?? 0
  const isNative = Capacitor.isNativePlatform()

  const netSemitones = Number((semitones + cents / 100).toFixed(2))
  const formattedShift = `${netSemitones > 0 ? `+${netSemitones}` : netSemitones} dt (${semitones > 0 ? `+${semitones}` : semitones} dt, ${cents > 0 ? `+${cents}` : cents} ct)`

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
    >
      <div className="export-modal-card">
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title-row">
            <div className="modal-badge-icon">
              <Download size={18} />
            </div>
            <div>
              <h2 id="export-modal-title">Exporter le MP4 transposé</h2>
              <p className="modal-subtitle">
                Copie directe du flux vidéo sans perte avec audio polyphonique
                transposé hors-ligne
              </p>
            </div>
          </div>

          <button
            type="button"
            className="btn-modal-close"
            onClick={isExporting ? onCancelExport : onClose}
            aria-label="Fermer la fenêtre d'export"
          >
            <X size={18} />
          </button>
        </div>

        {/* Target Output File Summary */}
        <div className="export-spec-grid">
          <div className="spec-item spec-full">
            <span className="spec-label">NOM DU FICHIER DE SORTIE</span>
            <code className="spec-filename">{targetFileName}</code>
          </div>

          <div className="spec-item">
            <span className="spec-label">FICHIER SOURCE</span>
            <span className="spec-value">
              {file.name} ({formatFileSize(file.size)})
            </span>
          </div>

          <div className="spec-item">
            <span className="spec-label">TRANSPOSITION / TONALITÉ</span>
            <span className="spec-value spec-highlight">{formattedShift}</span>
          </div>

          <div className="spec-item">
            <span className="spec-label">PRÉSERVATION DES FORMANTS</span>
            <span className="spec-value">
              {formantCompensation ? 'Activée (Verrouillage vocal)' : 'Standard'}
            </span>
          </div>

          <div className="spec-item">
            <span className="spec-label">PROFIL DE MULTIPLEXAGE</span>
            <span className="spec-value">
              <code>-c:v copy -c:a aac -b:a 192k</code>
            </span>
          </div>
        </div>

        {/* 3-Step Pipeline Tracker */}
        <div className="pipeline-steps-list">
          {PIPELINE_STEPS.map((step, index) => {
            const stepOrder = index + 2 // extracting=2, pitch-shifting=3, muxing=4
            const isDone =
              currentStage === 'completed' || currentOrder > stepOrder
            const isActive = currentOrder === stepOrder

            return (
              <div
                key={step.id}
                className={`pipeline-step-card ${
                  isActive
                    ? 'step-active'
                    : isDone
                      ? 'step-done'
                      : 'step-pending'
                }`}
              >
                <div className="step-indicator">
                  {isDone ? (
                    <CheckCircle2 size={18} className="icon-done" />
                  ) : isActive ? (
                    <Loader2 size={18} className="icon-spin" />
                  ) : index === 0 ? (
                    <Music size={16} />
                  ) : index === 1 ? (
                    <Cpu size={16} />
                  ) : (
                    <Film size={16} />
                  )}
                </div>
                <div className="step-text">
                  <span className="step-title">{step.label}</span>
                  <span className="step-sub">{step.sublabel}</span>
                </div>
                {isActive && progress && (
                  <span className="step-pct">{progress.stagePercent}%</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Live Progress Bar & Status Readout */}
        {progress && (
          <div className="export-progress-section">
            <div className="progress-meta-row">
              <span className="progress-stage-name">{progress.stageLabel}</span>
              <span className="progress-overall-pct">{overallPercent}%</span>
            </div>

            <div
              className="progress-track"
              role="progressbar"
              aria-valuenow={overallPercent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={`progress-fill ${
                  currentStage === 'completed'
                    ? 'fill-success'
                    : currentStage === 'error'
                      ? 'fill-error'
                      : ''
                }`}
                style={{ width: `${overallPercent}%` }}
              />
            </div>

            <p className="progress-detail-text">{progress.detail}</p>
          </div>
        )}

        {/* Error Alert */}
        {currentStage === 'error' && progress?.error && (
          <div className="export-error-box" role="alert">
            <AlertTriangle size={18} />
            <span>{progress.error}</span>
          </div>
        )}

        {/* Success Notice */}
        {currentStage === 'completed' && (
          <div className="export-success-box" role="status">
            <CheckCircle2 size={18} />
            <span>
              {isNative ? (
                <>
                  Fichier <strong>{targetFileName}</strong> enregistré dans le
                  cache et prêt à être partagé ou sauvegardé.
                </>
              ) : (
                <>
                  Téléchargement lancé pour <strong>{targetFileName}</strong>.
                  Les fichiers temporaires FFmpeg ont été libérés de la mémoire.
                </>
              )}
            </span>
          </div>
        )}

        {/* Modal Footer Actions */}
        <div className="modal-footer">
          {isExporting ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={onCancelExport}
            >
              Annuler l’export
            </button>
          ) : (
            <>
              <button type="button" className="btn-ghost" onClick={onClose}>
                Fermer
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={onStartExport}
              >
                {isNative ? <Share2 size={16} /> : <Download size={16} />}
                <span>
                  {currentStage === 'completed'
                    ? 'Exporter à nouveau'
                    : isNative
                      ? 'Générer et partager le MP4'
                      : 'Générer et télécharger le MP4'}
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
