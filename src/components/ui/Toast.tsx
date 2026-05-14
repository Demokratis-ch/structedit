import * as ToastPrimitive from '@radix-ui/react-toast';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

const AUTO_DISMISS_MS = 5000;

interface ToastState {
  message: string;
  id: number;
}

type Listener = (toast: ToastState | null) => void;

const listeners = new Set<Listener>();
let currentToast: ToastState | null = null;
let nextId = 1;

function publish(toast: ToastState | null) {
  currentToast = toast;
  for (const l of listeners) l(toast);
}

function showToast(message: string): void {
  publish({ message, id: nextId++ });
}

function dismissToast(): void {
  publish(null);
}

export function useToast(): { showToast: (message: string) => void; dismissToast: () => void } {
  return { showToast, dismissToast };
}

/**
 * Single-slot toast. New `showToast` calls replace the active toast; auto-dismiss
 * after 5 s; close button on the toast itself. Radix handles `aria-live`,
 * pause-on-hover, focus management, and swipe-to-dismiss.
 *
 * Renders the `Provider` and `Viewport` internally so consumers don't need to
 * wrap their tree — drop a single `<Toast />` anywhere in the app shell.
 */
export function Toast() {
  const [toast, setToast] = useState<ToastState | null>(currentToast);

  useEffect(() => {
    listeners.add(setToast);
    return () => {
      listeners.delete(setToast);
    };
  }, []);

  return (
    <ToastPrimitive.Provider duration={AUTO_DISMISS_MS} swipeDirection="right">
      {toast && (
        <ToastPrimitive.Root
          // `key` forces a fresh mount on every `showToast`, which resets the
          // duration timer naturally and gives us single-slot replace semantics.
          key={toast.id}
          open={true}
          onOpenChange={(open) => {
            if (!open) dismissToast();
          }}
          className="rounded-lg bg-gray-900 text-white shadow-lg px-4 py-3 flex items-start gap-3 data-[state=closed]:opacity-0 data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)]"
        >
          <ToastPrimitive.Description className="flex-1 text-sm leading-relaxed">
            {toast.message}
          </ToastPrimitive.Description>
          <ToastPrimitive.Close
            aria-label="Close notification"
            className="text-gray-300 hover:text-white shrink-0"
          >
            <X className="w-4 h-4" />
          </ToastPrimitive.Close>
        </ToastPrimitive.Root>
      )}
      <ToastPrimitive.Viewport className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-md outline-none" />
    </ToastPrimitive.Provider>
  );
}
