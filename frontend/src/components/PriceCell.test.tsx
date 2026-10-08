import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { initialMarketState, useMarketStore } from "../lib/store";
import type { PriceFrame, PriceUpdate } from "../lib/types";
import PriceCell from "./PriceCell";

function frame(timestamp: number, direction: PriceUpdate["direction"]): PriceFrame {
  return {
    AAPL: {
      ticker: "AAPL",
      price: 190,
      previous_price: 190,
      timestamp,
      change: 0,
      change_percent: 0,
      direction,
      session_start_price: 190,
    },
  };
}

function send(timestamp: number, direction: PriceUpdate["direction"]) {
  act(() => useMarketStore.getState().receiveFrame(frame(timestamp, direction)));
}

beforeEach(() => {
  useMarketStore.setState(initialMarketState());
});

describe("PriceCell flash", () => {
  it("is none before any move, including after the first frame", () => {
    render(<PriceCell ticker="AAPL" price={190} dim={false} />);
    send(1, "up");
    expect(screen.getByTestId("price-AAPL")).toHaveAttribute("data-flash", "none");
    expect(screen.getByTestId("price-AAPL")).not.toHaveClass("animate-flash-up");
  });

  it("flashes up on a newer up frame", () => {
    render(<PriceCell ticker="AAPL" price={190} dim={false} />);
    send(1, "up");
    send(2, "up");
    const cell = screen.getByTestId("price-AAPL");
    expect(cell).toHaveAttribute("data-flash", "up");
    expect(cell).toHaveClass("animate-flash-up");
  });

  it("flashes down on a newer down frame", () => {
    render(<PriceCell ticker="AAPL" price={190} dim={false} />);
    send(1, "up");
    send(2, "down");
    expect(screen.getByTestId("price-AAPL")).toHaveAttribute("data-flash", "down");
    expect(screen.getByTestId("price-AAPL")).toHaveClass("animate-flash-down");
  });

  it("remounts the span on another newer up frame to restart the animation", () => {
    render(<PriceCell ticker="AAPL" price={190} dim={false} />);
    send(1, "up");
    send(2, "up");
    const before = screen.getByTestId("price-AAPL");
    send(2.3, "up");
    const after = screen.getByTestId("price-AAPL");
    expect(after).not.toBe(before);
    expect(after).toHaveAttribute("data-flash", "up");
  });

  it("keeps the same node and class on a newer flat frame", () => {
    render(<PriceCell ticker="AAPL" price={190} dim={false} />);
    send(1, "up");
    send(2, "up");
    const before = screen.getByTestId("price-AAPL");
    send(3, "flat");
    const after = screen.getByTestId("price-AAPL");
    expect(after).toBe(before);
    expect(after).toHaveClass("animate-flash-up");
  });
});

describe("PriceCell dimming", () => {
  it("has opacity-60 only when dim", () => {
    const view = render(<PriceCell ticker="AAPL" price={190} dim={false} />);
    expect(screen.getByTestId("price-AAPL")).not.toHaveClass("opacity-60");
    view.rerender(<PriceCell ticker="AAPL" price={190} dim />);
    expect(screen.getByTestId("price-AAPL")).toHaveClass("opacity-60");
  });
});

describe("PriceCell text", () => {
  it("renders -- muted for a null price", () => {
    render(<PriceCell ticker="AAPL" price={null} dim={false} />);
    expect(screen.getByTestId("price-AAPL")).toHaveTextContent("--");
    expect(screen.getByTestId("price-AAPL")).toHaveClass("text-muted");
  });
});
