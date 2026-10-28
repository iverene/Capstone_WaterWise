const createClientId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

// Intentionally memory-only: every open tab gets its own origin identifier.
// It is used only to avoid refreshing the tab that already applied a write
// locally; it is not an authentication or authorization credential.
const dataChangeClientId = createClientId();

export const getDataChangeClientId = () => dataChangeClientId;

export const withDataChangeClient = (options = {}) => ({
  ...options,
  headers: {
    ...options.headers,
    "X-Data-Change-Client": dataChangeClientId,
  },
});
