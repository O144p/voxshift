declare module 'signalsmith-stretch' {
  export interface StretchScheduleOptions {
    output?: number
    active?: boolean
    input?: number
    rate?: number
    semitones?: number
    tonalityHz?: number
    formantSemitones?: number
    formantCompensation?: boolean
    formantBaseHz?: number
    loopStart?: number
    loopEnd?: number
  }

  export interface StretchConfigureOptions {
    preset?: 'default' | 'cheaper'
    blockMs?: number | null
    intervalMs?: number
    splitComputation?: boolean
  }

  export interface StretchNode extends AudioWorkletNode {
    inputTime: number
    start(when?: number, offset?: number, duration?: number): Promise<unknown>
    stop(when?: number): Promise<unknown>
    schedule(options: StretchScheduleOptions, adjustPrevious?: boolean): Promise<unknown>
    configure(options: StretchConfigureOptions): Promise<unknown>
    latency(): Promise<number>
    addBuffers(buffers: Float32Array[]): Promise<number>
    dropBuffers(toSeconds?: number): Promise<{ start: number; end: number }>
    setUpdateInterval(seconds: number, callback?: (inputTime: number) => void): Promise<unknown>
  }

  export default function SignalsmithStretch(
    audioContext: BaseAudioContext,
    channelOptions?: AudioWorkletNodeOptions,
  ): Promise<StretchNode>
}

declare module '@ffmpeg/core?url' {
  const src: string
  export default src
}

declare module '@ffmpeg/core/wasm?url' {
  const src: string
  export default src
}

