import { AlertTriangle, Loader2 } from 'lucide-react';
import { REMOTE_LOAD_MESSAGES, type RemoteLoadErrorReason } from '../utils/remote-document';
import { Button } from './ui/button';

/** Shown while a `loadFile` document is being fetched — never a blank editor. */
export function RemoteLoadingView() {
  return (
    <output className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-gray-600">
      <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      <p className="text-base font-medium">Loading document from demokratis.ch…</p>
    </output>
  );
}

interface RemoteLoadErrorViewProps {
  reason: RemoteLoadErrorReason;
  onGoToUpload: () => void;
}

/**
 * Shown when a `loadFile` load fails. Renders the per-reason message (410 expiry and 404
 * invalid-link are distinct) and an action back to the normal upload screen.
 */
export function RemoteLoadErrorView({ reason, onGoToUpload }: RemoteLoadErrorViewProps) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div
        role="alert"
        className="max-w-md w-full flex flex-col items-start gap-4 rounded-lg border border-amber-300 bg-amber-50 px-5 py-4 text-amber-900"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
          <span className="text-sm">{REMOTE_LOAD_MESSAGES[reason]}</span>
        </div>
        <Button
          variant="outline"
          className="btn rounded-lg hover:opacity-90"
          onClick={onGoToUpload}
        >
          Go to upload
        </Button>
      </div>
    </div>
  );
}
