import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { FakeEventSource } from "./src/test/fakeEventSource";

vi.stubGlobal("EventSource", FakeEventSource);

beforeEach(() => {
  FakeEventSource.instances.length = 0;
});

afterEach(() => {
  cleanup();
});
