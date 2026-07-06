import type { ReactNode } from 'react';

/** A single keyboard-key hint, styled consistently wherever shortcuts are shown. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200 font-sans">
      {children}
    </kbd>
  );
}
