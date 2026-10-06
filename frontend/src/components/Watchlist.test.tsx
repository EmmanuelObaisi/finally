import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { WatchItem } from "@/lib/types";
import { Watchlist } from "./Watchlist";

vi.mock("@/components/LineChart", () => ({ LineChart: () => null }));

const item = (ticker: string): WatchItem => ({
  ticker,
  price: 100,
  previous_price: 100,
  change: 0,
  direction: "flat",
  day_change_percent: 0,
});

function setup(overrides: Partial<Parameters<typeof Watchlist>[0]> = {}) {
  const props = {
    items: [item("AAPL"), item("MSFT")],
    prices: {},
    history: {},
    selected: null,
    onSelect: vi.fn(),
    onAdd: vi.fn().mockResolvedValue(undefined),
    onRemove: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<Watchlist {...props} />);
  return props;
}

describe("Watchlist", () => {
  it("renders a row per ticker", () => {
    setup();
    expect(screen.getByTestId("watchlist-row-AAPL")).toBeInTheDocument();
    expect(screen.getByTestId("watchlist-row-MSFT")).toBeInTheDocument();
  });

  it("adds an upper-cased ticker and clears the input", async () => {
    const props = setup();
    await userEvent.type(screen.getByTestId("watchlist-add-input"), "pypl");
    await userEvent.click(screen.getByTestId("watchlist-add-button"));
    expect(props.onAdd).toHaveBeenCalledWith("PYPL");
    await waitFor(() => expect(screen.getByTestId("watchlist-add-input")).toHaveValue(""));
  });

  it("shows the server error when adding fails", async () => {
    setup({ onAdd: vi.fn().mockRejectedValue(new Error("Unknown ticker: ZZZZ")) });
    await userEvent.type(screen.getByTestId("watchlist-add-input"), "zzzz");
    await userEvent.click(screen.getByTestId("watchlist-add-button"));
    expect(await screen.findByText("Unknown ticker: ZZZZ")).toBeInTheDocument();
  });

  it("removes a ticker without selecting it", async () => {
    const props = setup();
    await userEvent.click(screen.getByTestId("watchlist-remove-MSFT"));
    expect(props.onRemove).toHaveBeenCalledWith("MSFT");
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it("selects a ticker on row click", async () => {
    const props = setup();
    await userEvent.click(screen.getByTestId("watchlist-row-AAPL"));
    expect(props.onSelect).toHaveBeenCalledWith("AAPL");
  });
});
