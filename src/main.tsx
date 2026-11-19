import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

if (Capacitor.isNativePlatform()) {
  // Capacitor APK bundles web assets locally; unregister any stale SW so APK updates apply immediately
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .catch(() => {});
  }
} else {
  registerSW({ immediate: true });
}

createRoot(document.getElementById('root')!).render(<App />);
