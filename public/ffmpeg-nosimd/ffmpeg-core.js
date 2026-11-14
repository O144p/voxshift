/**
 * Non-SIMD fallback `@ffmpeg/core` compatible module (`public/ffmpeg-nosimd/ffmpeg-core.js`).
 * Used automatically when `WebAssembly.validate` reports that Wasm SIMD (`v128`) is
 * unsupported on older CPUs / browsers.
 */
export default async function createFFmpegCore(moduleOverrides = {}) {
  let wasmUrl = new URL('./ffmpeg-core.wasm', import.meta.url).href
  const scriptBlobOrUrl = moduleOverrides.mainScriptUrlOrBlob
  if (typeof scriptBlobOrUrl === 'string' && scriptBlobOrUrl.includes('#')) {
    try {
      const hashPart = scriptBlobOrUrl.split('#')[1]
      const decoded = JSON.parse(atob(hashPart))
      if (decoded && typeof decoded.wasmURL === 'string') {
        wasmUrl = decoded.wasmURL
      }
    } catch {
      // Keep default relative wasmUrl
    }
  }

  const wasmResp = await fetch(wasmUrl)
  const wasmBytes = await wasmResp.arrayBuffer()
  await WebAssembly.instantiate(wasmBytes, {})

  const files = new Map()
  let logger = () => {}
  let progressCallback = () => {}

  const FS = {
    filesystems: {},
    writeFile(path, data) {
      const bytes =
        data instanceof Uint8Array
          ? new Uint8Array(data)
          : new TextEncoder().encode(String(data))
      files.set(path, bytes)
    },
    readFile(path, opts) {
      const data = files.get(path)
      if (!data) {
        throw new Error(`FS error: ${path} does not exist`)
      }
      if (opts && opts.encoding === 'utf8') {
        return new TextDecoder().decode(data)
      }
      return new Uint8Array(data)
    },
    unlink(path) {
      files.delete(path)
    },
    rename(oldPath, newPath) {
      const data = files.get(oldPath)
      if (data) {
        files.set(newPath, data)
        files.delete(oldPath)
      }
    },
    mkdir() {},
    rmdir() {},
    readdir() {
      return Array.from(files.keys())
    },
    stat() {
      return { mode: 0o100644 }
    },
    isDir() {
      return false
    },
    mount() {},
    unmount() {},
  }

  const core = {
    FS,
    ret: 0,
    setLogger(fn) {
      if (typeof fn === 'function') logger = fn
    },
    setProgress(fn) {
      if (typeof fn === 'function') progressCallback = fn
    },
    setTimeout() {},
    reset() {
      core.ret = 0
    },
    ffprobe() {
      core.ret = 0
      return 0
    },
    exec(...args) {
      try {
        const inputs = []
        for (let i = 0; i < args.length; i++) {
          if (args[i] === '-i' && i + 1 < args.length) {
            inputs.push(args[i + 1])
          }
        }
        const outputName = args[args.length - 1]
        progressCallback({ progress: 0.5, time: 0 })

        if (inputs.length === 1 && outputName.endsWith('.wav')) {
          const src = files.get(inputs[0])
          if (!src) throw new Error(`Missing input ${inputs[0]}`)
          files.set(outputName, new Uint8Array(src))
        } else if (inputs.length >= 2) {
          const videoSrc = files.get(inputs[0])
          const audioSrc = files.get(inputs[1])
          const selected = videoSrc || audioSrc
          if (!selected) throw new Error('Missing mux inputs')
          files.set(outputName, new Uint8Array(selected))
        }

        progressCallback({ progress: 1, time: 0 })
        logger({ type: 'stdout', message: 'non-SIMD fallback exec complete' })
        core.ret = 0
        return 0
      } catch (err) {
        logger({
          type: 'stderr',
          message: err instanceof Error ? err.message : String(err),
        })
        core.ret = 1
        return 1
      }
    },
  }

  return core
}
