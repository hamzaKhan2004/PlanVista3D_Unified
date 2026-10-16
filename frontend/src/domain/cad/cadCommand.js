/**
 * Command Pattern implementation for Undo / Redo architectural editing operations.
 */

export class Command {
  constructor(name = "Operation") {
    this.name = name;
    this.timestamp = Date.now();
  }
  execute() {}
  undo() {}
}

export class ColorChangeCommand extends Command {
  constructor({ objectId, prevColor, newColor, onApply }) {
    super(`Change Color of ${objectId}`);
    this.objectId = objectId;
    this.prevColor = prevColor;
    this.newColor = newColor;
    this.onApply = onApply;
  }

  execute() {
    this.onApply(this.objectId, this.newColor);
  }

  undo() {
    this.onApply(this.objectId, this.prevColor);
  }
}

export class MaterialPropertyCommand extends Command {
  constructor({ objectId, property, prevValue, newValue, onApply }) {
    super(`Update ${property} on ${objectId}`);
    this.objectId = objectId;
    this.property = property;
    this.prevValue = prevValue;
    this.newValue = newValue;
    this.onApply = onApply;
  }

  execute() {
    this.onApply(this.objectId, this.property, this.newValue);
  }

  undo() {
    this.onApply(this.objectId, this.property, this.prevValue);
  }
}

export class TransformChangeCommand extends Command {
  constructor({ objectId, prevTransform, newTransform, onApply }) {
    super(`Transform ${objectId}`);
    this.objectId = objectId;
    this.prevTransform = JSON.parse(JSON.stringify(prevTransform));
    this.newTransform = JSON.parse(JSON.stringify(newTransform));
    this.onApply = onApply;
  }

  execute() {
    this.onApply(this.objectId, this.newTransform);
  }

  undo() {
    this.onApply(this.objectId, this.prevTransform);
  }
}

export class VisibilityChangeCommand extends Command {
  constructor({ objectId, prevVisible, newVisible, onApply }) {
    super(`${newVisible ? "Show" : "Hide"} ${objectId}`);
    this.objectId = objectId;
    this.prevVisible = prevVisible;
    this.newVisible = newVisible;
    this.onApply = onApply;
  }

  execute() {
    this.onApply(this.objectId, this.newVisible);
  }

  undo() {
    this.onApply(this.objectId, this.prevVisible);
  }
}

export class AddElementCommand extends Command {
  constructor({ element, onAdd, onRemove }) {
    super(`Add ${element.name || element.id}`);
    this.element = JSON.parse(JSON.stringify(element));
    this.onAdd = onAdd;
    this.onRemove = onRemove;
  }

  execute() {
    this.onAdd(this.element);
  }

  undo() {
    this.onRemove(this.element.id);
  }
}

export class DeleteElementCommand extends Command {
  constructor({ element, onAdd, onRemove }) {
    super(`Delete ${element.name || element.id}`);
    this.element = JSON.parse(JSON.stringify(element));
    this.onAdd = onAdd;
    this.onRemove = onRemove;
  }

  execute() {
    this.onRemove(this.element.id);
  }

  undo() {
    this.onAdd(this.element);
  }
}

export class BatchColorChangeCommand extends Command {
  constructor({ objectChanges, onApply }) {
    super(`Change Color of ${objectChanges.length} elements`);
    this.objectChanges = objectChanges; // [{ objectId, prevColor, newColor }]
    this.onApply = onApply;
  }

  execute() {
    this.onApply(this.objectChanges.map((c) => ({ id: c.objectId, color: c.newColor })));
  }

  undo() {
    this.onApply(this.objectChanges.map((c) => ({ id: c.objectId, color: c.prevColor })));
  }
}

export class BatchMaterialPropertyCommand extends Command {
  constructor({ property, objectChanges, onApply }) {
    super(`Update ${property} on ${objectChanges.length} elements`);
    this.property = property;
    this.objectChanges = objectChanges; // [{ objectId, prevValue, newValue }]
    this.onApply = onApply;
  }

  execute() {
    this.onApply(
      this.property,
      this.objectChanges.map((c) => ({ id: c.objectId, value: c.newValue }))
    );
  }

  undo() {
    this.onApply(
      this.property,
      this.objectChanges.map((c) => ({ id: c.objectId, value: c.prevValue }))
    );
  }
}

export class BatchVisibilityChangeCommand extends Command {
  constructor({ objectChanges, onApply }) {
    super(`Toggle Visibility of ${objectChanges.length} elements`);
    this.objectChanges = objectChanges; // [{ objectId, prevVisible, newVisible }]
    this.onApply = onApply;
  }

  execute() {
    this.onApply(this.objectChanges.map((c) => ({ id: c.objectId, visible: c.newVisible })));
  }

  undo() {
    this.onApply(this.objectChanges.map((c) => ({ id: c.objectId, visible: c.prevVisible })));
  }
}

export class BatchDeleteElementsCommand extends Command {
  constructor({ elements, onBatchAdd, onBatchRemove }) {
    super(`Delete ${elements.length} elements`);
    this.elements = JSON.parse(JSON.stringify(elements));
    this.onBatchAdd = onBatchAdd;
    this.onBatchRemove = onBatchRemove;
  }

  execute() {
    this.onBatchRemove(this.elements.map((e) => e.id));
  }

  undo() {
    this.onBatchAdd(this.elements);
  }
}

export class CommandManager {
  constructor(maxHistory = 50) {
    this.undoStack = [];
    this.redoStack = [];
    this.maxHistory = maxHistory;
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    this.listeners.forEach((fn) => fn(this.getState()));
  }

  execute(command) {
    command.execute();
    this.undoStack.push(command);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.redoStack = []; // Clear redo stack on new command
    this.notify();
  }

  undo() {
    if (!this.canUndo()) return;
    const command = this.undoStack.pop();
    command.undo();
    this.redoStack.push(command);
    this.notify();
  }

  redo() {
    if (!this.canRedo()) return;
    const command = this.redoStack.pop();
    command.execute();
    this.undoStack.push(command);
    this.notify();
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  }

  getState() {
    return {
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
      lastCommand: this.undoStack[this.undoStack.length - 1]?.name || null,
      history: this.undoStack.map((c) => ({ name: c.name, timestamp: c.timestamp })),
    };
  }
}
