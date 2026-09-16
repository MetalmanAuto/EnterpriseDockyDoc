'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/context/UserContext';
import { cn } from '@/lib/utils';

/**
 * Covers the app while the active workspace changes.
 *
 * Switching used to happen silently: the data underneath swapped with no
 * signal, so people could not tell whether the click had worked. This names
 * the workspace being opened and holds long enough to be read.
 */
export default function WorkspaceSwitchOverlay() {
  const { switchingTo } = useUser();
  // Keep the node mounted for the fade-out so it does not vanish mid-animation
  const [visible, setVisible] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => {
    if (switchingTo) {
      setName(switchingTo.workspaceName);
      setVisible(true);
      return;
    }
    const timer = setTimeout(() => setVisible(false), 180);
    return () => clearTimeout(timer);
  }, [switchingTo]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed inset-0 z-[100] flex items-center justify-center',
        'bg-canvas/80 backdrop-blur-sm transition-opacity duration-200',
        switchingTo ? 'opacity-100' : 'opacity-0',
      )}
    >
      <div className="flex flex-col items-center gap-4 animate-in">
        {/* A sweeping radar ring, the same motion as the brand mark */}
        <span aria-hidden className="relative w-14 h-14 rounded-full border border-stroke overflow-hidden bg-surface">
          <span className="absolute inset-[9px] rounded-full border border-stroke" />
          <span className="absolute inset-[18px] rounded-full border border-brand-400/60" />
          <span className="absolute inset-0 rounded-full animate-radar-sweep motion-reduce:animate-none [background:conic-gradient(from_0deg,rgba(45,212,191,0.55),transparent_80deg)]" />
        </span>

        <div className="text-center">
          <p className="label-mono">Switching workspace</p>
          <p className="mt-1.5 text-lg font-extrabold tracking-[-0.02em] text-ink max-w-xs truncate">
            {name}
          </p>
        </div>
      </div>
    </div>
  );
}
