import type { ChangeEvent } from 'react'
import {
  Minus,
  Plus,
  RotateCcw,
  Sliders,
  ArrowLeftRight,
  Mic2,
  Download,
} from 'lucide-react'
import type { TransposeEngineState } from '../engine/TransposeEngine'

interface PitchControlDeckProps {
  engineState: TransposeEngineState
  canExport: boolean
  onSemitonesChange: (semitones: number) => void
  onStepSemitones: (delta: number) => void
  onCentsChange: (cents: number) => void
  onResetPitch: () => void
  onSetBypass: (bypassed: boolean) => void
  onSetFormantCompensation: (enabled: boolean) => void
  onOpenExport: () => void
}

const INTERVAL_NAMES: Record<number, string> = {
  0: 'Diapason (Unisson)',
  1: 'Seconde mineure (Demi-ton)',
  2: 'Seconde majeure (Ton)',
  3: 'Tierce mineure',
  4: 'Tierce majeure',
  5: 'Quarte juste',
  6: 'Triton (Quarte aug. / Quinte dim.)',
  7: 'Quinte juste',
  8: 'Sixte mineure',
  9: 'Sixte majeure',
  10: 'Septième mineure',
  11: 'Septième majeure',
  12: 'Octave (12 demi-tons)',
}

const SEMITONE_TICKS = [-12, -9, -7, -5, -3, -2, -1, 0, 1, 2, 3, 5, 7, 9, 12]

function getIntervalDescription(semitones: number, bypassed: boolean): string {
  if (bypassed) return 'Signal original non modifié (Bypass direct)'
  const abs = Math.abs(semitones)
  const base = INTERVAL_NAMES[abs] ?? `${abs} demi-tons`
  if (semitones === 0) return base
  return `${base} ${semitones > 0 ? 'Haut ↑' : 'Bas ↓'}`
}

function formatSigned(value: number): string {
  if (value > 0) return `+${value}`
  return String(value)
}

export function PitchControlDeck({
  engineState,
  canExport,
  onSemitonesChange,
  onStepSemitones,
  onCentsChange,
  onResetPitch,
  onSetBypass,
  onSetFormantCompensation,
  onOpenExport,
}: PitchControlDeckProps) {
  const {
    semitones,
    cents,
    totalSemitones,
    bypassed,
    formantCompensation,
  } = engineState

  const isZero = semitones === 0 && cents === 0

  const handleSemitoneSlider = (e: ChangeEvent<HTMLInputElement>) => {
    onSemitonesChange(Number(e.target.value))
  }

  const handleCentsSlider = (e: ChangeEvent<HTMLInputElement>) => {
    onCentsChange(Number(e.target.value))
  }

  return (
    <aside
      className="pitch-deck-card min-w-0 w-full max-w-full"
      aria-label="Console de contrôle de tonalité"
    >
      {/* Deck Header */}
      <div className="deck-header min-w-0 w-full">
        <div className="deck-title-group min-w-0">
          <Sliders size={18} className="accent-icon shrink-0" />
          <h2>Contrôle de Tonalité</h2>
        </div>

        <button
          type="button"
          className="btn-reset"
          onClick={onResetPitch}
          disabled={isZero}
          title="Réinitialiser les demi-tons et les cents à 0"
        >
          <RotateCcw size={14} />
          <span>Réinitialiser (0)</span>
        </button>
      </div>

      {/* Instant Original / Modified A/B Toggle */}
      <div
        className="ab-switch-container min-w-0 w-full max-w-full"
        role="group"
        aria-label="Mode du signal audio"
      >
        <button
          type="button"
          className={`ab-option min-w-0 ${bypassed ? 'ab-active-original' : ''}`}
          onClick={() => onSetBypass(true)}
          aria-pressed={bypassed}
        >
          <span className="ab-dot" />
          <div className="ab-text min-w-0">
            <strong>Original</strong>
            <small>Bypass DSP</small>
          </div>
        </button>

        <button
          type="button"
          className={`ab-option min-w-0 ${!bypassed ? 'ab-active-modified' : ''}`}
          onClick={() => onSetBypass(false)}
          aria-pressed={!bypassed}
        >
          <span className="ab-dot" />
          <div className="ab-text min-w-0">
            <strong>Modifié</strong>
            <small>Tonalité transposée</small>
          </div>
        </button>
      </div>

      {/* Digital Pitch Readout Display */}
      <div
        className={`pitch-display-screen ${bypassed ? 'screen-bypassed' : ''}`}
      >
        <div className="pitch-main-figures">
          <div className="pitch-figure-block">
            <span className="figure-label">DEMI-TONS</span>
            <span className="figure-value">
              {bypassed ? '0' : formatSigned(semitones)}
            </span>
          </div>

          <div className="pitch-figure-divider" />

          <div className="pitch-figure-block">
            <span className="figure-label">CENTS FINS</span>
            <span className="figure-value figure-cents">
              {bypassed ? '0' : formatSigned(cents)}
              <small>ct</small>
            </span>
          </div>

          <div className="pitch-figure-divider" />

          <div className="pitch-figure-block">
            <span className="figure-label">DÉCALAGE NET</span>
            <span className="figure-value figure-net">
              {bypassed
                ? '0.00'
                : `${totalSemitones > 0 ? '+' : ''}${totalSemitones.toFixed(2)}`}
              <small>dt</small>
            </span>
          </div>
        </div>

        <div className="pitch-interval-caption">
          <span>{getIntervalDescription(semitones, bypassed)}</span>
          <button
            type="button"
            className="ab-quick-link"
            onClick={() => onSetBypass(!bypassed)}
            title="Comparaison rapide A/B (Touche : B)"
          >
            <ArrowLeftRight size={13} />
            <span>Comparer A/B</span>
          </button>
        </div>
      </div>

      {/* Coarse Semitone Control (-12 to +12) */}
      <div className="control-section">
        <div className="control-label-row">
          <label htmlFor="semitone-slider">Transposition (Demi-tons)</label>
          <div className="step-buttons-pair">
            <button
              type="button"
              className="btn-step"
              onClick={() => onStepSemitones(-1)}
              disabled={semitones <= -12}
              aria-label="Baisser d'un demi-ton"
            >
              <Minus size={15} />
              <span>-1 dt</span>
            </button>
            <button
              type="button"
              className="btn-step"
              onClick={() => onStepSemitones(1)}
              disabled={semitones >= 12}
              aria-label="Monter d'un demi-ton"
            >
              <Plus size={15} />
              <span>+1 dt</span>
            </button>
          </div>
        </div>

        <div className="bipolar-slider-wrap">
          <input
            id="semitone-slider"
            type="range"
            min={-12}
            max={12}
            step={1}
            value={semitones}
            onChange={handleSemitoneSlider}
            className="studio-slider"
          />
        </div>

        {/* Quick Semitone Jump Buttons */}
        <div
          className="semitone-Scale-pills"
          aria-label="Préréglages rapides de demi-tons"
        >
          {SEMITONE_TICKS.map((tick) => (
            <button
              key={tick}
              type="button"
              className={`scale-pill ${semitones === tick ? 'scale-pill-active' : ''} ${tick === 0 ? 'scale-pill-zero' : ''}`}
              onClick={() => onSemitonesChange(tick)}
            >
              {tick > 0 ? `+${tick}` : tick}
            </button>
          ))}
        </div>
      </div>

      {/* Fine-Tune Cents Control (-50 to +50) */}
      <div className="control-section">
        <div className="control-label-row">
          <label htmlFor="cents-slider">Accordage fin (-50 à +50 ct)</label>
          <div className="step-buttons-pair">
            <button
              type="button"
              className="btn-step btn-step-sm"
              onClick={() => onCentsChange(Math.max(-50, cents - 5))}
              disabled={cents <= -50}
              aria-label="Baisser de 5 cents"
            >
              <span>-5 ct</span>
            </button>
            <button
              type="button"
              className="btn-step btn-step-sm"
              onClick={() => onCentsChange(0)}
              disabled={cents === 0}
              aria-label="Centrer les cents à 0"
            >
              <span>0 ct</span>
            </button>
            <button
              type="button"
              className="btn-step btn-step-sm"
              onClick={() => onCentsChange(Math.min(50, cents + 5))}
              disabled={cents >= 50}
              aria-label="Monter de 5 cents"
            >
              <span>+5 ct</span>
            </button>
          </div>
        </div>

        <div className="bipolar-slider-wrap">
          <input
            id="cents-slider"
            type="range"
            min={-50}
            max={50}
            step={1}
            value={cents}
            onChange={handleCentsSlider}
            className="studio-slider slider-cents"
          />
          <div className="slider-scale-labels">
            <span>-50 ct</span>
            <span>0 ct</span>
            <span>+50 ct</span>
          </div>
        </div>
      </div>

      {/* Vocal Formant Compensation Option */}
      <div className="formant-row">
        <div className="formant-info">
          <Mic2 size={16} className="accent-icon" />
          <div>
            <span className="formant-title">
              Préservation des formants vocaux
            </span>
            <span className="formant-desc">
              Conserve le timbre naturel des chœurs
            </span>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={formantCompensation}
          aria-label="Préservation des formants vocaux"
          className={`toggle-pill ${formantCompensation ? 'toggle-on' : ''}`}
          onClick={() => onSetFormantCompensation(!formantCompensation)}
        >
          <span className="toggle-thumb" />
        </button>
      </div>

      {/* Offline MP4 Export CTA */}
      <button
        type="button"
        className="btn-export-mp4"
        onClick={onOpenExport}
        disabled={!canExport}
        title={
          canExport
            ? 'Exporter le MP4 avec audio transposé et copie directe du flux vidéo'
            : 'Chargez d’abord une vidéo karaoké ou une piste pour activer l’export MP4'
        }
      >
        <Download size={17} />
        <span>
          Exporter MP4 ({semitones > 0 ? `+${semitones}st` : `${semitones}st`}
          {cents !== 0 ? `${cents > 0 ? `+${cents}ct` : `${cents}ct`}` : ''})
        </span>
      </button>
    </aside>
  )
}
