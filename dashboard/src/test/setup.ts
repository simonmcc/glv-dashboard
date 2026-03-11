import '@testing-library/jest-dom/vitest';

// Node.js 25 exposes a native (non-functional) `localStorage` global that
// overrides jsdom's implementation. Replace it with a simple in-memory mock
// so tests can use getItem/setItem/removeItem/clear as expected.
const _store: Record<string, string> = {};
const localStorageMock: Storage = {
  getItem: (key: string) => _store[key] ?? null,
  setItem: (key: string, value: string) => { _store[key] = value; },
  removeItem: (key: string) => { delete _store[key]; },
  clear: () => { Object.keys(_store).forEach(k => delete _store[k]); },
  key: (index: number) => Object.keys(_store)[index] ?? null,
  get length() { return Object.keys(_store).length; },
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });
