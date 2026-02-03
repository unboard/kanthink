'use client';

import { useEffect, useCallback } from 'react';
import { useSettingsStore } from '@/lib/settingsStore';
import { signInWithGoogle } from '@/lib/actions/auth';
import { KanthinkIcon } from '../icons/KanthinkIcon';
import { SporeBackground } from '../ambient/SporeBackground';

export function SignUpOverlay() {
  const showSignUpOverlay = useSettingsStore((s) => s._showSignUpOverlay);
  const setShowSignUpOverlay = useSettingsStore((s) => s.setShowSignUpOverlay);

  const handleClose = useCallback(() => {
    setShowSignUpOverlay(false);
  }, [setShowSignUpOverlay]);

  // Handle escape key
  useEffect(() => {
    if (!showSignUpOverlay) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showSignUpOverlay, handleClose]);

  if (!showSignUpOverlay) return null;

  const handleSignIn = async () => {
    const formData = new FormData();
    formData.set('redirectTo', window.location.pathname);
    await signInWithGoogle(formData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Dark background */}
      <div
        className="absolute inset-0 bg-neutral-950"
        onClick={handleClose}
      />

      {/* Spore particles - positioned within this overlay's stacking context */}
      <SporeBackground
        className="absolute inset-0 z-[1] pointer-events-none overflow-hidden"
        id="signup-spores"
      />

      {/* Modal card - solid fill so spores don't show through */}
      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-neutral-900 border border-neutral-800 shadow-2xl overflow-hidden">
        <div className="flex flex-col items-center text-center px-8 py-10">
          <div className="w-14 h-14 mb-6 text-violet-500">
            <KanthinkIcon size={56} />
          </div>

          <h2 className="text-xl font-semibold text-white mb-3">
            Sign up to unlock Shrooms
          </h2>

          <p className="text-sm text-neutral-400 mb-8 max-w-xs leading-relaxed">
            Shrooms are AI-powered actions that generate cards, research topics, and help you get things done.
          </p>

          <button
            onClick={handleSignIn}
            className="flex items-center justify-center gap-3 px-8 py-3 bg-neutral-800 border border-neutral-700 rounded-full text-white font-medium hover:bg-neutral-700 hover:border-neutral-600 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </button>

          <button
            onClick={handleClose}
            className="mt-6 text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
