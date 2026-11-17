import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.azadari.kopaganj',
  appName: 'Azadari Kopaganj',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    allowNavigation: [
      '*.youtube.com',
      '*.youtube-nocookie.com',
      '*.ytimg.com',
      'raw.githubusercontent.com',
      'github.com',
    ],
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_azadari',
      iconColor: '#FF0000',
    },
  },
};

export default config;
