interface CapacitorConfigShape {
  appId: string;
  appName: string;
  webDir: string;
  bundledWebRuntime?: boolean;
  server?: {
    url?: string;
    androidScheme?: 'http' | 'https';
    cleartext?: boolean;
  };
  plugins?: Record<string, Record<string, unknown>>;
}

const config: CapacitorConfigShape = {
  appId: 'com.almizan.workpulse.ess',
  appName: 'WorkPulse ESS',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#0F6E52',
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
