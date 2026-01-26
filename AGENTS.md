# StructEdit
What this app is about: @README.md

## Standards
- Use TDD when adding features or fixing bugs.

## How the App Works

### Two views
- `LoadDocument` - Upload view for PDF/DOCX/HTML files
- `TreeEditor` - Main editor with tree on the right, original document preview on the left

### Document processing pipeline
```
File upload/pasted text → Mammoth/DOMParser → document tree (DocumentNode)
```

### State management (immutable tree + hooks)
- `useTreeEditor` - Main orchestrator: selection, drag-drop, keyboard navigation
- `useTreeHistory` - Undo/redo stack
- `useTreeOperations` - Mutations (add, remove, move, indent, change type) that commit to history

### Tree navigation
Paths are index arrays (e.g., `[0, 2, 1]` = root's first child → its third child → its second child). All updates are immutable via `tree-utils.ts`.

## Repository Structure

### Tech stack
React 19, TypeScript, Vite, TailwindCSS + DaisyUI, Vitest

### Source directories (`src/`)
- `components/` - UI: TreeEditor, TreeNodeItem, LoadDocument, FloatingToolbar, ui/
- `hooks/` - useTreeEditor, useTreeHistory, useTreeOperations (all have tests)
- `types/` - document.ts (tree types), editor.ts (selection/state)
- `utils/` - tree-utils.ts (immutable ops), document-utils.ts (parsing)
- `test/` - Fixtures and integration tests

### Key files
- `src/types/document.ts` - Core tree types: DocumentNode, ContainerDocumentNode, LeafDocumentNode
- `src/utils/tree-utils.ts` - getNodeAtPath, updateNodeAtPath, insertNodeAtPath, removeNodeAtPath
- `src/hooks/useTreeEditor.ts` - Main editor hook integrating all state

### Commands
`npm run dev` (port 3000), `npm run build`, `npm run test`
