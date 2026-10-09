import { beforeEach, describe, expect, it } from "vitest";
import { initialSelectionState, resetSelectionStore, useSelectionStore } from "./selectionStore";

const state = () => useSelectionStore.getState();

beforeEach(resetSelectionStore);

describe("selectionStore", () => {
  it("starts loading with nothing selected", () => {
    expect(state()).toMatchObject({ status: "loading", selected: null });
  });

  it("selects the first ticker when the list is ready", () => {
    state().sync("ready", ["AAPL", "MSFT"]);
    expect(state()).toMatchObject({ status: "ready", selected: "AAPL" });
  });

  it("keeps the selection while it stays in the list", () => {
    state().sync("ready", ["AAPL", "MSFT"]);
    state().select("MSFT");
    state().sync("ready", ["AAPL", "MSFT", "PYPL"]);
    expect(state().selected).toBe("MSFT");
  });

  it("falls back to the first ticker when the selection leaves the list", () => {
    state().sync("ready", ["AAPL", "MSFT"]);
    state().select("MSFT");
    state().sync("ready", ["AAPL", "GOOGL"]);
    expect(state().selected).toBe("AAPL");
  });

  it("selects nothing for an empty list", () => {
    state().sync("ready", ["AAPL"]);
    state().sync("ready", []);
    expect(state()).toMatchObject({ status: "ready", selected: null });
  });

  it.each(["loading", "error"] as const)("keeps the selection and sets the status on %s", (status) => {
    state().sync("ready", ["AAPL", "MSFT"]);
    state().select("MSFT");
    state().sync(status, []);
    expect(state()).toMatchObject({ status, selected: "MSFT" });
  });

  it("resets to the initial state", () => {
    state().sync("ready", ["AAPL"]);
    resetSelectionStore();
    expect(state()).toMatchObject(initialSelectionState());
  });
});
