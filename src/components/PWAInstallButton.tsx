import React, { useState } from 'react';
import { Download, Smartphone, X, CheckCircle2, ExternalLink } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuideModal(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="px-3.5 py-1.5 text-xs font-semibold rounded-full bg-[#272727] hover:bg-[#3F3F3F] text-[#F1F1F1] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="w-3.5 h-3.5 text-[#FF0000]" />
        <span>{isIOS ? 'Install on iOS' : 'Install App'}</span>
      </button>

      {showGuideModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-[#212121] border border-[#3F3F3F] text-[#F1F1F1] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#3F3F3F]">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-full bg-white ring-1 ring-white/20 p-1 flex items-center justify-center shrink-0 overflow-hidden">
                  <img
                    src="./azadari-logo.png"
                    alt="Azadari Kopaganj Logo"
                    className="w-full h-full object-contain"
                  />
                </span>
                <h3 id="pwa-install-title" className="text-base font-bold">
                  Install Azadari Kopaganj App
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                aria-label="Close install dialog"
                className="p-1.5 rounded-full text-[#AAAAAA] hover:text-white hover:bg-[#3F3F3F] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs text-[#CCCCCC] leading-relaxed">
              <div className="p-3.5 rounded-xl bg-[#181818] border border-[#303030] space-y-1.5">
                <p className="font-semibold text-white flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Progressive Web App (PWA — Offline Ready)</span>
                </p>
                {isIOS ? (
                  <p>
                    1. Tap the <strong>Share</strong> icon in Safari toolbar.<br />
                    2. Scroll down and tap <strong>Add to Home Screen</strong>.
                  </p>
                ) : (
                  <p>
                    In Chrome, Edge, or Brave on Android/Desktop, click the{' '}
                    <strong>Install Azadari Kopaganj</strong> icon in the address bar or browser menu (⋮ →{' '}
                    <strong>Install app / Add to Home screen</strong>) to launch in standalone full-screen mode.
                  </p>
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-[#181818] border border-[#303030] space-y-2">
                <p className="font-semibold text-white flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-[#FF0000] shrink-0" />
                  <span>Native Android APK (Capacitor)</span>
                </p>
                <p>
                  Download the compiled <code className="font-mono text-white">app-debug.apk</code> artifact directly from GitHub Actions in your repository:
                </p>
                <a
                  href="https://github.com/DelightReza/AzadariKopaganj/actions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FF0000] text-white font-semibold hover:bg-[#CC0000] transition-colors"
                >
                  <span>Download APK on GitHub Actions</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            <div className="px-5 py-3 bg-[#181818] border-t border-[#3F3F3F] flex justify-end">
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="px-4 py-1.5 rounded-full bg-[#272727] hover:bg-[#3F3F3F] text-xs font-semibold text-white cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
