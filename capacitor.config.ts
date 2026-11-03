import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.zevra.app',
  appName: 'ZEVRA',
  webDir: 'dist',
  backgroundColor: '#0E0E10',
  android: { allowMixedContent: false },
};

export default config;
