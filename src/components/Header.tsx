import { useRef, useState } from 'react';

interface HeaderProps {
  documentName?: string | null;
  onRename: (name: string) => void;
}

export function Header({ documentName, onRename }: HeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  // Escape unmounts the input, which can still fire a blur with the discarded
  // value — this flag makes that trailing blur a no-op.
  const cancelledRef = useRef(false);

  const startEditing = () => {
    cancelledRef.current = false;
    setIsEditing(true);
  };

  const commit = (value: string) => {
    setIsEditing(false);
    const trimmed = value.trim();
    if (trimmed && trimmed !== documentName) {
      onRename(trimmed);
    }
  };

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-yellow-light flex items-center justify-center text-primary font-serif font-bold text-xl">
            D
          </div>
          <div className="flex flex-nowrap items-end gap-1 leading-none font-serif">
            <div className="text-3xl">Demokratis</div>
            <div className="text-grey-mid text-3xl font-light">
              &nbsp;&rsaquo;&nbsp;&nbsp;StructEdit
            </div>
            {documentName && (
              <div className="text-grey-mid text-3xl font-light">
                &nbsp;&rsaquo;&nbsp;&nbsp;
                {isEditing ? (
                  <input
                    type="text"
                    defaultValue={documentName}
                    ref={(el) => {
                      el?.focus();
                      el?.select();
                    }}
                    aria-label="Document title"
                    className="font-serif text-3xl font-light text-grey-mid border border-blue-400 rounded px-1 outline-none bg-white"
                    onBlur={(e) => {
                      if (cancelledRef.current) return;
                      commit(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        // Delegate to blur so commit has a single entry point —
                        // a direct commit here would unmount the input and the
                        // trailing focusout would commit a second time.
                        (e.target as HTMLInputElement).blur();
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        cancelledRef.current = true;
                        setIsEditing(false);
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="cursor-pointer"
                    title="Double-click or press Enter to rename"
                    onDoubleClick={startEditing}
                    onKeyDown={(e) => {
                      // Explicit keyboard handling: a plain (single) click must
                      // NOT start editing, so we can't rely on the native
                      // Enter/Space → click activation.
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        startEditing();
                      }
                    }}
                  >
                    {documentName}
                  </button>
                )}
              </div>
            )}
          </div>
          <a
            href="https://github.com/Demokratis-ch/structedit"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-grey-mid transition-colors hover:text-gray-900"
            title="View source on GitHub"
          >
            <svg viewBox="0 0 16 16" width="24" height="24" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
            <span className="sr-only">View source on GitHub</span>
          </a>
        </div>
      </div>
    </header>
  );
}
