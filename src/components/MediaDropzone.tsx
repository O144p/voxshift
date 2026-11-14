import { useRef, useState, type DragEvent, type ChangeEvent } from 'react'
import { Upload, Film, Music, Sparkles, FolderOpen } from 'lucide-react'

interface MediaDropzoneProps {
  onFileSelect: (file: File, isDemo?: boolean) => void
  onLoadDemo: () => void
  compact?: boolean
  currentFileName?: string | null
}

const ACCEPTED_EXTENSIONS = '.mp4,.m4v,.webm,.mov,.mp3,.wav,.m4a,.aac,.ogg,.flac'
const SUPPORTED_MIME_PREFIXES = ['video/', 'audio/']

function isSupportedMediaFile(file: File): boolean {
  if (
    SUPPORTED_MIME_PREFIXES.some((prefix) => file.type.startsWith(prefix))
  ) {
    return true
  }
  const lower = file.name.toLowerCase()
  return /\.(mp4|m4v|webm|mov|mp3|wav|m4a|aac|ogg|flac)$/.test(lower)
}

export function MediaDropzone({
  onFileSelect,
  onLoadDemo,
  compact = false,
  currentFileName,
}: MediaDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleFile = (file: File | undefined) => {
    if (!file) return
    if (!isSupportedMediaFile(file)) {
      setErrorMessage(
        'Format de fichier non pris en charge. Veuillez sélectionner une vidéo karaoké MP4 ou un fichier audio MP3/WAV/M4A.',
      )
      return
    }
    setErrorMessage(null)
    onFileSelect(file, false)
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isDragging) setIsDragging(true)
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    handleFile(file)
  }

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    handleFile(file)
    e.target.value = ''
  }

  if (compact) {
    return (
      <div
        className={`compact-loader min-w-0 max-w-full ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          onChange={handleInputChange}
          className="sr-only-input"
          aria-label="Charger un fichier média karaoké"
        />
        <div
          className="compact-file-meta min-w-0 flex-1"
          title={currentFileName ?? undefined}
        >
          <Film size={15} className="accent-icon shrink-0" />
          <span className="compact-file-name truncate">
            {currentFileName || 'Aucune piste chargée'}
          </span>
        </div>
        <div className="compact-actions">
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => inputRef.current?.click()}
          >
            <FolderOpen size={14} />
            <span>Charger MP4 / Audio</span>
          </button>
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={onLoadDemo}
            title="Charger la piste karaoké polyphonique de démonstration"
          >
            <Sparkles size={14} />
            <span>Piste démo</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`dropzone-card ${isDragging ? 'dropzone-active' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        onChange={handleInputChange}
        className="sr-only-input"
        aria-label="Sélectionner une vidéo karaoké MP4 ou un fichier audio"
      />

      <div className="dropzone-icon-ring">
        <Upload size={28} />
      </div>

      <div className="dropzone-copy">
        <h2>Charger une vidéo karaoké ou une bande-son</h2>
        <p>
          Glissez-déposez une <strong>vidéo karaoké MP4</strong> ici, ou
          parcourez vos fichiers. L’horloge maître est verrouillée sur
          l’élément natif HTML5 <code>&lt;video&gt;</code> pour une
          synchronisation parfaite des paroles.
        </p>
      </div>

      <div className="format-badges">
        <span className="format-pill primary-pill">
          <Film size={13} /> Vidéo Karaoké MP4
        </span>
        <span className="format-pill">
          <Music size={13} /> MP3
        </span>
        <span className="format-pill">
          <Music size={13} /> WAV
        </span>
        <span className="format-pill">
          <Music size={13} /> M4A
        </span>
      </div>

      <div className="dropzone-cta-row">
        <button
          type="button"
          className="btn-primary"
          onClick={() => inputRef.current?.click()}
        >
          <FolderOpen size={17} />
          <span>Choisir un fichier karaoké</span>
        </button>

        <button
          type="button"
          className="btn-secondary"
          onClick={onLoadDemo}
        >
          <Sparkles size={17} />
          <span>Charger la piste démo</span>
        </button>
      </div>

      {errorMessage && (
        <div className="dropzone-error" role="alert">
          {errorMessage}
        </div>
      )}
    </div>
  )
}
