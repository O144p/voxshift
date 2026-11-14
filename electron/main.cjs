const fs = require('node:fs')
const path = require('node:path')
const { app, BrowserWindow, protocol, session } = require('electron')

// Enable SharedArrayBuffer and high-precision audio timers in Chromium
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer')

// Enable SSSE3 Wasm SIMD codegen on older CPUs, and fall back to V8's Wasm interpreter if hardware SIMD is unavailable
const WASM_SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1,
  8, 0, 65, 0, 253, 15, 253, 98, 11,
])
const hasHardwareSimd =
  typeof WebAssembly === 'object' && WebAssembly.validate(WASM_SIMD_PROBE)
app.commandLine.appendSwitch(
  'js-flags',
  hasHardwareSimd
    ? '--wasm-simd-ssse3-codegen'
    : '--wasm-simd-ssse3-codegen --wasm-jitless',
)

// Register custom 'app://' scheme as standard, secure, and Fetch/WASM/Worker capable
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      codeCache: true,
      stream: true,
    },
  },
])

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.cjs': 'application/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  return MIME_TYPES[ext] || 'application/octet-stream'
}

function buildCrossOriginHeaders(contentType, extraHeaders = {}) {
  return {
    'Content-Type': contentType,
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Resource-Policy': 'same-origin',
    ...extraHeaders,
  }
}

/**
 * Resolves the local application icon (`icon.png` or `icon.ico`),
 * falling back gracefully if missing during development.
 */
function resolveAppIcon() {
  const candidates = [
    path.join(__dirname, 'icon.png'),
    path.join(__dirname, 'icon.ico'),
    path.join(__dirname, '..', 'icon.png'),
    path.join(__dirname, '..', 'icon.ico'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }
  return undefined
}

function registerAppProtocol() {
  const distDir = path.resolve(__dirname, '..', 'dist')

  protocol.handle('app', async (request) => {
    try {
      const parsedUrl = new URL(request.url)
      let reqPathname = decodeURIComponent(parsedUrl.pathname || '/')
      if (reqPathname === '/' || reqPathname === '') {
        reqPathname = '/index.html'
      }

      const relativeTarget = reqPathname.replace(/^\/+/, '')
      let filePath = path.resolve(distDir, relativeTarget)

      // Prevent directory traversal outside dist/ (case-insensitive safe on Windows)
      const relToDist = path.relative(distDir, filePath)
      if (relToDist.startsWith('..') || path.isAbsolute(relToDist)) {
        return new Response('Forbidden', {
          status: 403,
          headers: buildCrossOriginHeaders('text/plain; charset=utf-8'),
        })
      }

      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        if (!path.extname(filePath)) {
          filePath = path.join(distDir, 'index.html')
        } else {
          return new Response('Not Found', {
            status: 404,
            headers: buildCrossOriginHeaders('text/plain; charset=utf-8'),
          })
        }
      }

      const data = await fs.promises.readFile(filePath)
      const contentType = getMimeType(filePath)

      return new Response(data, {
        status: 200,
        headers: buildCrossOriginHeaders(contentType, {
          'Content-Length': String(data.byteLength),
        }),
      })
    } catch (err) {
      return new Response(
        `Protocol Error: ${err instanceof Error ? err.message : String(err)}`,
        {
          status: 500,
          headers: buildCrossOriginHeaders('text/plain; charset=utf-8'),
        },
      )
    }
  })
}

function createMainWindow() {
  // Ensure COOP / COEP / CORP headers are set without case-insensitive duplicates
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders }
    for (const key of Object.keys(responseHeaders)) {
      const lower = key.toLowerCase()
      if (
        lower === 'cross-origin-opener-policy' ||
        lower === 'cross-origin-embedder-policy' ||
        lower === 'cross-origin-resource-policy'
      ) {
        delete responseHeaders[key]
      }
    }
    responseHeaders['Cross-Origin-Opener-Policy'] = ['same-origin']
    responseHeaders['Cross-Origin-Embedder-Policy'] = ['require-corp']
    responseHeaders['Cross-Origin-Resource-Policy'] = ['same-origin']
    callback({ responseHeaders })
  })

  const iconPath = resolveAppIcon()

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'VoxShift',
    icon: iconPath || path.join(__dirname, 'icon.png'),
    backgroundColor: '#07090e',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.setMenuBarVisibility(false)

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  const devServerUrl = process.env.VITE_DEV_SERVER_URL
  const isDev = Boolean(devServerUrl) || process.argv.includes('--dev')

  if (isDev) {
    mainWindow.loadURL(devServerUrl || 'http://localhost:5173')
  } else {
    mainWindow.loadURL('app://bundle/index.html')
  }
}

app.whenReady().then(() => {
  registerAppProtocol()
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
