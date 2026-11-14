import SignalsmithStretch, { type StretchNode } from 'signalsmith-stretch'

export interface TransposeEngineState {
  isReady: boolean
  isInitializing: boolean
  semitones: number
  cents: number
  totalSemitones: number
  bypassed: boolean
  formantCompensation: boolean
  volume: number
  muted: boolean
  latencyMs: number
  sampleRate: number
  error: string | null
}

type EngineListener = (state: TransposeEngineState) => void

interface CachedMediaSource {
  audioContext: AudioContext
  sourceNode: MediaElementAudioSourceNode
}

// Prevent InvalidStateError if the same HTMLMediaElement is re-attached (e.g. React StrictMode)
const mediaElementSourceCache = new WeakMap<HTMLMediaElement, CachedMediaSource>()

const CROSSFADE_TIME_CONSTANT = 0.015 // 15ms smooth exponential crossfade (~45ms to 95%)
const MIN_SEMITONES = -12
const MAX_SEMITONES = 12
const MIN_CENTS = -50
const MAX_CENTS = 50

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export const INITIAL_ENGINE_STATE: TransposeEngineState = {
  isReady: false,
  isInitializing: false,
  semitones: 0,
  cents: 0,
  totalSemitones: 0,
  bypassed: false,
  formantCompensation: false,
  volume: 0.9,
  muted: false,
  latencyMs: 0,
  sampleRate: 48000,
  error: null,
}

export class TransposeEngine {
  private audioContext: AudioContext | null = null
  private stretchNode: StretchNode | null = null
  private dryGainNode: GainNode | null = null
  private wetGainNode: GainNode | null = null
  private masterGainNode: GainNode | null = null
  private analyserNode: AnalyserNode | null = null
  private mediaElement: HTMLMediaElement | null = null

  private state: TransposeEngineState = { ...INITIAL_ENGINE_STATE }

  private listeners = new Set<EngineListener>()
  private initPromise: Promise<void> | null = null

  public getState(): TransposeEngineState {
    return { ...this.state }
  }

  public subscribe(listener: EngineListener): () => void {
    this.listeners.add(listener)
    listener(this.getState())
    return () => {
      this.listeners.delete(listener)
    }
  }

  private updateState(partial: Partial<TransposeEngineState>): void {
    this.state = {
      ...this.state,
      ...partial,
    }
    const snapshot = this.getState()
    for (const listener of this.listeners) {
      listener(snapshot)
    }
  }

  /**
   * Connects an HTML5 <video> (or <audio>) element to the Web Audio graph
   * and initializes the Signalsmith Stretch AudioWorklet processor.
   */
  public async attachMediaElement(element: HTMLMediaElement): Promise<void> {
    if (this.mediaElement === element && this.state.isReady) {
      return
    }
    if (this.initPromise && this.mediaElement === element) {
      return this.initPromise
    }

    this.mediaElement = element
    this.initPromise = this.initializeGraph(element)

    try {
      await this.initPromise
    } finally {
      this.initPromise = null
    }
  }

  private async initializeGraph(element: HTMLMediaElement): Promise<void> {
    this.disconnectNodesOnly()
    this.updateState({ isInitializing: true, error: null })

    try {
      let cached = mediaElementSourceCache.get(element)
      if (!cached || cached.audioContext.state === 'closed') {
        const audioContext = new AudioContext({ latencyHint: 'interactive' })
        // Ensure element native volume is unity so Web Audio masterGain controls level
        element.volume = 1
        element.muted = false
        const sourceNode = audioContext.createMediaElementSource(element)
        cached = { audioContext, sourceNode }
        mediaElementSourceCache.set(element, cached)
      }

      const { audioContext, sourceNode } = cached
      this.audioContext = audioContext

      // Create Dry / Wet crossfade and Master Gain nodes
      const dryGainNode = audioContext.createGain()
      const wetGainNode = audioContext.createGain()
      const masterGainNode = audioContext.createGain()
      const analyserNode = audioContext.createAnalyser()
      analyserNode.fftSize = 256
      analyserNode.smoothingTimeConstant = 0.78

      // Set initial gains according to current bypass & volume state
      const now = audioContext.currentTime
      dryGainNode.gain.setValueAtTime(this.state.bypassed ? 1 : 0, now)
      wetGainNode.gain.setValueAtTime(this.state.bypassed ? 0 : 1, now)
      masterGainNode.gain.setValueAtTime(
        this.state.muted ? 0 : this.state.volume,
        now,
      )

      // Instantiate Signalsmith Stretch AudioWorkletNode
      const stretchNode = await SignalsmithStretch(audioContext, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      })

      // Configure worklet for high-quality real-time polyphonic music + vocals
      await stretchNode.configure({
        preset: 'default',
        splitComputation: true,
      })

      const totalSemitones = this.computeTotalSemitones(
        this.state.semitones,
        this.state.cents,
      )

      // Activate live input processing and apply initial pitch settings
      await stretchNode.schedule({
        active: true,
        semitones: totalSemitones,
        tonalityHz: 8000,
        formantCompensation: this.state.formantCompensation,
        formantSemitones: 0,
      })

      const latencySeconds = await stretchNode.latency()

      // Wire Web Audio routing:
      // 1. Original (Dry) Path: sourceNode -> dryGainNode -> masterGainNode
      // 2. Transposed (Wet) Path: sourceNode -> stretchNode -> wetGainNode -> masterGainNode
      // 3. Output Path: masterGainNode -> analyserNode -> destination
      sourceNode.disconnect()
      sourceNode.connect(dryGainNode)
      sourceNode.connect(stretchNode)

      dryGainNode.connect(masterGainNode)
      stretchNode.connect(wetGainNode)
      wetGainNode.connect(masterGainNode)

      masterGainNode.connect(analyserNode)
      analyserNode.connect(audioContext.destination)

      this.stretchNode = stretchNode
      this.dryGainNode = dryGainNode
      this.wetGainNode = wetGainNode
      this.masterGainNode = masterGainNode
      this.analyserNode = analyserNode

      this.updateState({
        isReady: true,
        isInitializing: false,
        totalSemitones,
        latencyMs: Math.round(latencySeconds * 1000),
        sampleRate: audioContext.sampleRate,
        error: null,
      })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to initialize audio engine'
      this.updateState({
        isReady: false,
        isInitializing: false,
        error: message,
      })
      throw err
    }
  }

  /**
   * Ensures the AudioContext is running (must be called inside or after a user gesture).
   */
  public async resume(): Promise<void> {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume()
    }
  }

  private computeTotalSemitones(semitones: number, cents: number): number {
    return Number((semitones + cents / 100).toFixed(4))
  }

  private pushPitchToWorklet(
    totalSemitones: number,
    formantCompensation: boolean,
  ): void {
    if (!this.stretchNode) return
    void this.stretchNode.schedule({
      active: true,
      semitones: totalSemitones,
      tonalityHz: 8000,
      formantCompensation,
    })
  }

  public setSemitones(semitones: number): void {
    const clamped = clamp(Math.round(semitones), MIN_SEMITONES, MAX_SEMITONES)
    const totalSemitones = this.computeTotalSemitones(clamped, this.state.cents)
    this.pushPitchToWorklet(totalSemitones, this.state.formantCompensation)
    this.updateState({
      semitones: clamped,
      totalSemitones,
    })
  }

  public stepSemitones(delta: number): void {
    this.setSemitones(this.state.semitones + delta)
  }

  public setCents(cents: number): void {
    const clamped = clamp(Math.round(cents), MIN_CENTS, MAX_CENTS)
    const totalSemitones = this.computeTotalSemitones(
      this.state.semitones,
      clamped,
    )
    this.pushPitchToWorklet(totalSemitones, this.state.formantCompensation)
    this.updateState({
      cents: clamped,
      totalSemitones,
    })
  }

  public setPitch(semitones: number, cents: number): void {
    const clampedSemitones = clamp(
      Math.round(semitones),
      MIN_SEMITONES,
      MAX_SEMITONES,
    )
    const clampedCents = clamp(Math.round(cents), MIN_CENTS, MAX_CENTS)
    const totalSemitones = this.computeTotalSemitones(
      clampedSemitones,
      clampedCents,
    )
    this.pushPitchToWorklet(totalSemitones, this.state.formantCompensation)
    this.updateState({
      semitones: clampedSemitones,
      cents: clampedCents,
      totalSemitones,
    })
  }

  public resetPitch(): void {
    this.setPitch(0, 0)
  }

  /**
   * Glitch-free A/B switch between Original (dry) and Transposed/Modified (wet)
   * using smooth exponential Web Audio gain crossfading.
   */
  public setBypass(bypassed: boolean): void {
    if (this.audioContext && this.dryGainNode && this.wetGainNode) {
      const now = this.audioContext.currentTime
      const dryTarget = bypassed ? 1 : 0
      const wetTarget = bypassed ? 0 : 1

      this.dryGainNode.gain.cancelScheduledValues(now)
      this.wetGainNode.gain.cancelScheduledValues(now)

      this.dryGainNode.gain.setValueAtTime(this.dryGainNode.gain.value, now)
      this.wetGainNode.gain.setValueAtTime(this.wetGainNode.gain.value, now)

      this.dryGainNode.gain.setTargetAtTime(
        dryTarget,
        now,
        CROSSFADE_TIME_CONSTANT,
      )
      this.wetGainNode.gain.setTargetAtTime(
        wetTarget,
        now,
        CROSSFADE_TIME_CONSTANT,
      )
    }

    this.updateState({ bypassed })
  }

  public toggleBypass(): void {
    this.setBypass(!this.state.bypassed)
  }

  public setFormantCompensation(enabled: boolean): void {
    this.pushPitchToWorklet(this.state.totalSemitones, enabled)
    this.updateState({ formantCompensation: enabled })
  }

  public setVolume(volume: number): void {
    const clamped = clamp(volume, 0, 1)
    const isMuted = clamped === 0 ? true : false
    if (this.audioContext && this.masterGainNode) {
      const now = this.audioContext.currentTime
      this.masterGainNode.gain.cancelScheduledValues(now)
      this.masterGainNode.gain.setTargetAtTime(
        isMuted ? 0 : clamped,
        now,
        0.01,
      )
    }
    this.updateState({
      volume: clamped,
      muted: isMuted,
    })
  }

  public setMuted(muted: boolean): void {
    if (this.audioContext && this.masterGainNode) {
      const now = this.audioContext.currentTime
      const targetGain = muted ? 0 : this.state.volume
      this.masterGainNode.gain.cancelScheduledValues(now)
      this.masterGainNode.gain.setTargetAtTime(targetGain, now, 0.01)
    }
    this.updateState({ muted })
  }

  public toggleMute(): void {
    this.setMuted(!this.state.muted)
  }

  /**
   * Copies real-time frequency spectrum data into the provided Uint8Array.
   */
  public getFrequencyData(target: Uint8Array<ArrayBuffer>): boolean {
    if (!this.analyserNode || !this.state.isReady) {
      target.fill(0)
      return false
    }
    this.analyserNode.getByteFrequencyData(target)
    return true
  }

  private disconnectNodesOnly(): void {
    try {
      this.stretchNode?.disconnect()
      this.dryGainNode?.disconnect()
      this.wetGainNode?.disconnect()
      this.masterGainNode?.disconnect()
      this.analyserNode?.disconnect()
    } catch {
      // Ignore disconnect errors during teardown
    }
    this.stretchNode = null
    this.dryGainNode = null
    this.wetGainNode = null
    this.masterGainNode = null
    this.analyserNode = null
  }

  public dispose(): void {
    this.disconnectNodesOnly()
    this.mediaElement = null
    this.updateState({ isReady: false, isInitializing: false })
  }
}
