// Carries no credentials or request data. Readers always reload the server projection.
const listeners = new Set<() => void>();

export function notifySensitiveActionsChanged() {
  for (const listener of listeners) listener();
}

export function subscribeSensitiveActions(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
