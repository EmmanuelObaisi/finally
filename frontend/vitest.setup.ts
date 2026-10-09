import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { FakeEventSource } from "./src/test/fakeEventSource";
import { FakeResizeObserver } from "./src/test/fakeResizeObserver";

vi.stubGlobal("EventSource", FakeEventSource);
vi.stubGlobal("ResizeObserver", FakeResizeObserver);

beforeEach(() => {
  FakeEventSource.instances.length = 0;
  FakeResizeObserver.instances.length = 0;
});

afterEach(() => {
  cleanup();
});
