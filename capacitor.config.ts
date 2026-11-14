import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'io.github.o144p.voxshift',
  appName: 'VoxShift',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
}

export default config
