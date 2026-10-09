import { beforeEach, describe, expect, it, vi } from "vitest";
import { initialHistoryState, isHistoryInFlight, resetHistoryStore, useHistoryStore } from "./historyStore";
import type { HistoryPoint } from "./types";

const point = (value: number): HistoryPoint => ({ total_value: value, recorded_at: "2026-10-09T10:00:00Z" });

/** A fetch whose responses are settled by hand, in the order the calls were made. */
function manualFetch() {
  const pending: { resolve: (h: HistoryPoint[]) => void; reject: () => void }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise((resolve, reject) => {
          pending.push({
            resolve: (history) => resolve({ ok: true, status: 200, json: async () => ({ history }) }),
            reject: () => reject(new Error("down")),
          });
        }),
    ),
  );
  return pending;
}

const settle = () => new Promise((r) => setTimeout(r, 0));
const state = () => useHistoryStore.getState();

beforeEach(() => resetHistoryStore());

describe("history store", () => {
  it("load applies the fetched history and clears failed", async () => {
    const calls = manualFetch();
    state().load();
    calls[0].resolve([point(10000)]);
    await settle();
    expect(state().history).toEqual([point(10000)]);
    expect(state().failed).toBe(false);
  });

  it("a rejected load with no history sets failed and keeps history null", async () => {
    const calls = manualFetch();
    state().load();
    calls[0].reject();
    await settle();
    expect(state().failed).toBe(true);
    expect(state().history).toBeNull();
  });

  it("a rejected load after history exists keeps it", async () => {
    const calls = manualFetch();
    state().load();
    calls[0].resolve([point(1)]);
    await settle();
    state().load();
    calls[1].reject();
    await settle();
    expect(state().history).toEqual([point(1)]);
  });

  it("failed reads false as soon as a load starts", async () => {
    const calls = manualFetch();
    state().load();
    calls[0].reject();
    await settle();
    expect(state().failed).toBe(true);
    state().load();
    expect(state().failed).toBe(false);
  });

  it("the later-started of two overlapping loads wins even when it resolves first", async () => {
    const calls = manualFetch();
    state().load();
    state().load();
    calls[1].resolve([point(2)]);
    await settle();
    calls[0].resolve([point(1)]);
    await settle();
    expect(state().history).toEqual([point(2)]);
  });

  it("isHistoryInFlight is true while a load is pending and false after resolve or reject", async () => {
    const calls = manualFetch();
    expect(isHistoryInFlight()).toBe(false);
    state().load();
    expect(isHistoryInFlight()).toBe(true);
    calls[0].resolve([point(1)]);
    await settle();
    expect(isHistoryInFlight()).toBe(false);
    state().load();
    expect(isHistoryInFlight()).toBe(true);
    calls[1].reject();
    await settle();
    expect(isHistoryInFlight()).toBe(false);
  });

  it("reset restores the initial state and the counters", async () => {
    const calls = manualFetch();
    state().load();
    calls[0].resolve([point(1)]);
    await settle();
    resetHistoryStore();
    expect(state().history).toBeNull();
    expect(state().failed).toBe(false);
    expect(initialHistoryState()).toEqual({ history: null, failed: false });
    state().load();
    calls[1].resolve([point(5)]);
    await settle();
    expect(state().history).toEqual([point(5)]);
  });
});
