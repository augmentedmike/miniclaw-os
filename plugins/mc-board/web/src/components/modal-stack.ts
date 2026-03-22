/**
 * Modal stack — ensures ESC closes only the topmost modal.
 *
 * Each modal registers its onClose callback on mount and unregisters on unmount.
 * A single document-level keydown listener calls the most-recently-registered
 * callback (i.e. the topmost modal) and stops the event from reaching anything else.
 */

let stack: (() => void)[] = [];
let listenerAttached = false;

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === "Escape" && stack.length > 0) {
    e.stopImmediatePropagation();
    e.preventDefault();
    e.stopPropagation();
    const topClose = stack[stack.length - 1];
    topClose();
  }
}

export function registerModal(onClose: () => void) {
  stack.push(onClose);
  if (!listenerAttached) {
    document.addEventListener("keydown", handleKeyDown, true); // capture phase
    listenerAttached = true;
  }
}

export function unregisterModal(onClose: () => void) {
  stack = stack.filter((fn) => fn !== onClose);
  if (stack.length === 0 && listenerAttached) {
    document.removeEventListener("keydown", handleKeyDown, true);
    listenerAttached = false;
  }
}
