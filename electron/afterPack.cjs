const { execFileSync } = require('node:child_process')

/**
 * Ensures Windows folders that inherit an AppContainer SID also include
 * ALL APPLICATION PACKAGES (*S-1-15-2-1) read/execute access so Electron 45's
 * `install_dir_access.cc` sandbox check succeeds on startup.
 */
exports.default = async function afterPack(context) {
  if (process.platform !== 'win32') {
    return
  }
  try {
    execFileSync(
      'icacls',
      [context.appOutDir, '/grant', '*S-1-15-2-1:(OI)(CI)(RX)', '/T', '/C', '/Q'],
      { stdio: 'ignore' },
    )
  } catch {
    // Ignore if icacls is unavailable
  }
}
