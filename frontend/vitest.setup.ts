import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { FakeEventSource } from "./src/test/fakeEventSource";
import { FakeResizeObserver } from "./src/test/fakeResizeObserver";

/** jsdom has no matchMedia; by default no media query matches, so the chat panel starts closed. */
const defaultMatchMedia = (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
});

vi.stubGlobal("EventSource", FakeEventSource);
vi.stubGlobal("ResizeObserver", FakeResizeObserver);
vi.stubGlobal("matchMedia", defaultMatchMedia);

beforeEach(() => {
  vi.stubGlobal("matchMedia", defaultMatchMedia);
  FakeEventSource.instances.length = 0;
  FakeResizeObserver.instances.length = 0;
});

afterEach(() => {
  cleanup();
});
