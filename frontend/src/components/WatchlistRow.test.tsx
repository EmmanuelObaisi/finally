import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FLASH_MS } from "@/hooks/useFlash";
import { WatchlistRow } from "./WatchlistRow";

vi.mock("@/components/LineChart", () => ({ LineChart: () => null }));

const row = (price: number) => (
  <ul>
    <WatchlistRow
      ticker="AAPL"
      price={price}
      dayChange={0.5}
      points={[]}
      selected={false}
      onSelect={() => {}}
      onRemove={() => {}}
    />
  </ul>
);

describe("WatchlistRow price flash", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const priceCell = () => screen.getByTestId("watchlist-price-AAPL");

  it("does not flash on first render", () => {
    render(row(190));
    expect(priceCell()).toHaveTextContent("190.00");
    expect(priceCell()).not.toHaveClass("flash-up");
    expect(priceCell()).not.toHaveClass("flash-down");
  });

  it("flashes green on an uptick, then clears", () => {
    const { rerender } = render(row(190));
    rerender(row(191));
    expect(priceCell()).toHaveClass("flash-up");
    act(() => vi.advanceTimersByTime(FLASH_MS));
    expect(priceCell()).not.toHaveClass("flash-up");
  });

  it("flashes red on a downtick", () => {
    const { rerender } = render(row(190));
    rerender(row(189));
    expect(priceCell()).toHaveClass("flash-down");
  });

  it("shows the day change percent", () => {
    render(row(190));
    expect(screen.getByText("+0.50%")).toBeInTheDocument();
  });
});
