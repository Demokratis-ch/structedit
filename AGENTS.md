# StructEdit
What this app is about: @README.md

## Standards
- Use TDD when adding features or fixing bugs.
- Tests live next to the code they cover as `*.test.ts(x)`.

## Architecture

### Two views
- **LoadDocument** — upload / paste view (PDF, DOCX, HTML, plaintext).
- **EditorInterface** — the main editor: the document tree alongside a preview of the original.

### Processing pipeline
File or pasted text → Mammoth (DOCX) / DOMParser (HTML) → a tree of `DocumentNode`s → Swiss-legal
transforms reconstruct semantic structure (headings, `Art.`/`§` articles, lists). Export
serializes the tree back out as JSON.

### The tree
- The document is an **immutable tree** rooted at a single `DocumentRootNode`. Every node has a
  `type` (HEADING, CONTENT, LIST, LIST_ITEM, …). `types/document.ts` is the canonical reference
  for node shapes, allowed children, and formatting rules — read it before touching the model.
- **Paths are index arrays** — `[0, 2, 1]` means root's 1st child → its 3rd child → its 2nd
  child. All edits are immutable and go through `utils/tree-utils.ts`.

### State & subsystems
- Editing flows through hooks in `hooks/`; **`useTreeEditor`** is the orchestrator and composes
  history/undo and the tree-mutation operations.
- Selection, editing, and drag state live in a **non-reactive store** (`stores/`), subscribed to
  outside the normal render path.
- Content is edited per node with a **formatting mode** (plain text → Markdown); see `NodeFormat`
  in the data model and the render/inline-mark utils.
- Documents **persist to IndexedDB** (recent documents + autosave), so work survives reloads.

## Repository

### Tech stack
React 19, TypeScript, Vite, TailwindCSS + DaisyUI, Vitest.

### Layout (`src/`)
- `components/` — editor UI (tree, content blocks, toolbars, preview, upload).
- `hooks/` — editor state & behavior; `useTreeEditor` is the entry point.
- `stores/` — non-reactive UI state (selection / editing / drag).
- `utils/` — pure logic: tree operations, parsing, formatting/rendering, export, persistence.
  - `legal-transforms/` — modular pipeline detecting Swiss legal patterns.
- `types/` — `document.ts` is the canonical data model; `editor.ts` holds editor/selection types.
- `test/` — fixtures (real DOCX/PDF/HTML) and integration tests.

### Where to start reading
- `types/document.ts` — the data model and its rules.
- `utils/tree-utils.ts` — immutable tree primitives (get / insert / remove / move at a path).
- `hooks/useTreeEditor.ts` — how the editor wires everything together.

### Commands
`npm run dev` (port 3000), `npm run build`, `npm run test`.

The app runs at http://localhost:3000/. You almost never need to start or stop the dev server
yourself — the human operator is usually already running it.
