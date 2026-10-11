import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Use browser storage rather than Node's experimental localStorage global.
const storedValues = new Map<string, string>();
const localStorage: Storage = {
  get length() { return storedValues.size; },
  clear: () => storedValues.clear(),
  getItem: (key) => storedValues.get(String(key)) ?? null,
  key: (index) => [...storedValues.keys()][index] ?? null,
  removeItem: (key) => { storedValues.delete(String(key)); },
  setItem: (key, value) => { storedValues.set(String(key), String(value)); },
};
vi.stubGlobal('localStorage', localStorage);
