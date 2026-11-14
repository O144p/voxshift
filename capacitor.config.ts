import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.voxshift.app',
  appName: 'VoxShift',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
}

export default config
