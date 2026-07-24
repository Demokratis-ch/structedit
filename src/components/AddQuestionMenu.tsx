import { ListChecks } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';

type QuestionFlavour = 'text' | 'single' | 'multiple';

const FLAVOURS: ReadonlyArray<{ flavour: QuestionFlavour; label: string; testid: string }> = [
  { flavour: 'single', label: 'Single choice', testid: 'add-question-single' },
  { flavour: 'multiple', label: 'Multiple choice', testid: 'add-question-multiple' },
  { flavour: 'text', label: 'Free text', testid: 'add-question-text' },
];

interface AddQuestionMenuProps {
  /** Insert a new question of the chosen flavour. */
  onInsert: (flavour: QuestionFlavour) => void;
}

/**
 * A small dropdown in the top toolbar for creating a questionnaire question. Mirrors Demokratis's
 * three flavours (single / multiple choice / free text). Self-contained (button + panel with
 * outside-click / Escape dismissal); no new dependencies.
 */
export function AddQuestionMenu({ onInsert }: AddQuestionMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const pick = (flavour: QuestionFlavour) => {
    onInsert(flavour);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <Button
        variant="ghost"
        data-testid="add-question-toggle"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
        className="text-gray-500 hover:text-gray-900"
      >
        <ListChecks className="w-4 h-4 mr-2" />
        Add question
      </Button>
      {open && (
        <div
          data-testid="add-question-panel"
          className="absolute right-0 z-30 mt-2 w-52 rounded-lg border border-gray-200 bg-white p-1 shadow-xl"
        >
          {FLAVOURS.map(({ flavour, label, testid }) => (
            <button
              key={testid}
              type="button"
              data-testid={testid}
              onClick={() => pick(flavour)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
