type Listener = () => void;

export class TreeUIStore {
  private _selectedIds = new Set<string>();
  private _editingId: string | null = null;
  private _editingNumberId: string | null = null;
  private _draggedNodeId: string | null = null;
  private _dropTarget: { id: string; position: 'top' | 'bottom' } | null = null;
  private _receivingParentId: string | null = null;
  private _hoveredHandleId: string | null = null;
  private _listeners = new Set<Listener>();
  private _batching = false;
  private _batchDirty = false;

  subscribe = (listener: Listener): (() => void) => {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  };

  private _notify(): void {
    if (this._batching) {
      this._batchDirty = true;
      return;
    }
    for (const l of this._listeners) l();
  }

  batch(fn: () => void): void {
    this._batching = true;
    this._batchDirty = false;
    fn();
    this._batching = false;
    if (this._batchDirty) {
      this._batchDirty = false;
      for (const l of this._listeners) l();
    }
  }

  // --- Selection ---
  isSelected(id: string): boolean {
    return this._selectedIds.has(id);
  }
  getSelectedIds(): Set<string> {
    return this._selectedIds;
  }
  getSelectedCount(): number {
    return this._selectedIds.size;
  }
  setSelection(ids: Set<string>): void {
    this._selectedIds = ids;
    this._notify();
  }

  // --- Editing ---
  isEditing(id: string): boolean {
    return this._editingId === id;
  }
  getEditingId(): string | null {
    return this._editingId;
  }
  setEditingId(id: string | null): void {
    this._editingId = id;
    this._notify();
  }

  // --- Editing number ---
  isEditingNumber(id: string): boolean {
    return this._editingNumberId === id;
  }
  getEditingNumberId(): string | null {
    return this._editingNumberId;
  }
  setEditingNumberId(id: string | null): void {
    this._editingNumberId = id;
    this._notify();
  }

  // --- Dragging ---
  isDragging(id: string): boolean {
    return this._draggedNodeId === id;
  }
  getDraggedNodeId(): string | null {
    return this._draggedNodeId;
  }
  setDraggedNodeId(id: string | null): void {
    this._draggedNodeId = id;
    this._notify();
  }

  // --- Drop target ---
  isDropTarget(id: string): boolean {
    return this._dropTarget?.id === id;
  }
  getDropPosition(id: string): 'top' | 'bottom' | null {
    return this._dropTarget?.id === id ? this._dropTarget.position : null;
  }
  getDropTarget(): { id: string; position: 'top' | 'bottom' } | null {
    return this._dropTarget;
  }
  setDropTarget(target: { id: string; position: 'top' | 'bottom' } | null): void {
    this._dropTarget = target;
    this._notify();
  }

  // --- Receiving parent ---
  isReceivingParent(id: string): boolean {
    return this._receivingParentId === id;
  }
  getReceivingParentId(): string | null {
    return this._receivingParentId;
  }
  setReceivingParentId(id: string | null): void {
    this._receivingParentId = id;
    this._notify();
  }

  // --- Hovered handle ---
  isHoveredHandle(id: string): boolean {
    return this._hoveredHandleId === id;
  }
  getHoveredHandleId(): string | null {
    return this._hoveredHandleId;
  }
  setHoveredHandleId(id: string | null): void {
    this._hoveredHandleId = id;
    this._notify();
  }

  // --- Derived ---
  isInvalidDrop(id: string): boolean {
    return (
      this._dropTarget?.id === id &&
      this._draggedNodeId !== null &&
      this._receivingParentId === null
    );
  }

  // --- Clear all ---
  clearAll(): void {
    this._selectedIds = new Set();
    this._editingId = null;
    this._editingNumberId = null;
    this._draggedNodeId = null;
    this._dropTarget = null;
    this._receivingParentId = null;
    this._hoveredHandleId = null;
    this._notify();
  }
}
