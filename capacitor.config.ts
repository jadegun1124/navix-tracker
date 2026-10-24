import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'kr.co.umap.tracker',
  appName: 'Umap',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
  },
};

export default config;
