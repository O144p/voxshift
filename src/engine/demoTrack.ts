export interface DemoLyricLine {
  startTime: number
  endTime: number
  text: string
  subtext: string
}

export const DEMO_LYRICS: DemoLyricLine[] = [
  {
    startTime: 0,
    endTime: 4,
    text: '♪ Testez votre tonalité avant d’entrer en scène ♪',
    subtext: 'Do Majeur — Progression Studio I – V – vi – IV',
  },
  {
    startTime: 4,
    endTime: 8,
    text: '♪ Ajustez les demi-tons vers le haut ou le bas en direct ♪',
    subtext: 'Horloge maître HTML5 <video> sans décalage',
  },
  {
    startTime: 8,
    endTime: 12,
    text: '♪ Basculez entre Original et Modifié pour comparer ♪',
    subtext: 'Fondu enchaîné Web Audio sans coupure',
  },
  {
    startTime: 12,
    endTime: 16,
    text: '♪ Affinez les cents pour un confort vocal parfait ♪',
    subtext: 'DSP AudioWorklet polyphonique Signalsmith Stretch',
  },
]

/**
 * Generates a 16-second stereo 44.1kHz 16-bit PCM WAV file containing a warm
 * polyphonic chord progression (C - G - Am - F) + bass + lead melody so the
 * singer can test real-time polyphonic pitch shifting even before selecting a local MP4.
 */
export function createDemoKaraokeFile(): File {
  const sampleRate = 44100
  const durationSeconds = 16
  const numSamples = sampleRate * durationSeconds
  const numChannels = 2
  const bytesPerSample = 2
  const dataSize = numSamples * numChannels * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i))
    }
  }

  // RIFF WAV Header
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true) // PCM chunk size
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true)
  view.setUint16(32, numChannels * bytesPerSample, true)
  view.setUint16(34, 16, true) // 16-bit
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)

  // Chords (2 seconds each, repeated twice for 16s): C maj, G maj, A min, F maj
  const chords = [
    { bass: 130.81, notes: [261.63, 329.63, 392.0, 493.88] }, // Cmaj7
    { bass: 98.0, notes: [246.94, 293.66, 392.0, 493.88] }, // G6
    { bass: 110.0, notes: [220.0, 261.63, 329.63, 392.0] }, // Am7
    { bass: 87.31, notes: [174.61, 261.63, 349.23, 440.0] }, // Fmaj7
  ]

  // Lead melody notes (1 second each across 8 seconds, repeated twice)
  const melody = [
    523.25, // C5
    659.25, // E5
    587.33, // D5
    493.88, // B4
    523.25, // C5
    440.0, // A4
    392.0, // G4
    349.23, // F4
  ]

  let offset = 44
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate
    const chordIdx = Math.floor(t / 2) % chords.length
    const chordTime = t % 2
    const chord = chords[chordIdx]

    const melodyIdx = Math.floor(t) % melody.length
    const noteTime = t % 1
    const leadFreq = melody[melodyIdx]

    // Smooth envelopes
    const chordEnv =
      Math.min(1, chordTime / 0.04) * Math.exp(-chordTime * 0.85)
    const noteEnv =
      Math.min(1, noteTime / 0.025) * Math.exp(-noteTime * 1.6)

    // Polyphonic pad + electric piano harmonics
    let padL = 0
    let padR = 0
    for (let n = 0; n < chord.notes.length; n++) {
      const f = chord.notes[n]
      const detune = n % 2 === 0 ? 1.0008 : 0.9992
      const sig =
        Math.sin(2 * Math.PI * f * t) * 0.65 +
        Math.sin(2 * Math.PI * f * 2 * t) * 0.2 * Math.exp(-chordTime * 2)
      const sigDetuned = Math.sin(2 * Math.PI * f * detune * t) * 0.55
      padL += (n % 2 === 0 ? sig : sigDetuned) * 0.14 * chordEnv
      padR += (n % 2 === 0 ? sigDetuned : sig) * 0.14 * chordEnv
    }

    // Warm sub/bass with gentle 2nd harmonic
    const bassSig =
      (Math.sin(2 * Math.PI * chord.bass * t) * 0.75 +
        Math.sin(2 * Math.PI * chord.bass * 2 * t) * 0.25) *
      0.22 *
      chordEnv

    // Vocal-like lead with gentle vibrato
    const vibrato = 1 + Math.sin(2 * Math.PI * 5.2 * t) * 0.0035
    const leadSig =
      (Math.sin(2 * Math.PI * leadFreq * vibrato * t) * 0.65 +
        Math.sin(2 * Math.PI * leadFreq * 2 * vibrato * t) * 0.22 +
        Math.sin(2 * Math.PI * leadFreq * 3 * vibrato * t) * 0.08) *
      0.2 *
      noteEnv

    const left = Math.max(-0.98, Math.min(0.98, padL + bassSig + leadSig * 0.95))
    const right = Math.max(-0.98, Math.min(0.98, padR + bassSig + leadSig * 1.05))

    view.setInt16(offset, Math.round(left * 32767), true)
    view.setInt16(offset + 2, Math.round(right * 32767), true)
    offset += 4
  }

  return new File([buffer], 'VoxShift-Karaoke-Check-C-Major.wav', {
    type: 'audio/wav',
  })
}
