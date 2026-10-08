import { create } from "zustand";
import type { ConnectionStatus, PriceFrame } from "./types";

/** Last non-flat move of a ticker since page load; seq restarts the CSS flash. */
export type Flash = { dir: "up" | "down" | "none"; seq: number };

/** One sparkline sample: arrival second (strictly ascending) and price. */
export type SparkPoint = { time: number; value: number };

export const SPARK_CAP = 300;

export type MarketState = {
  prices: PriceFrame;
  status: ConnectionStatus;
  flash: Record<string, Flash>;
  spark: Record<string, SparkPoint[]>;
};

export function initialMarketState(): MarketState {
  return { prices: {}, status: "reconnecting", flash: {}, spark: {} };
}

function nextFlash(state: MarketState, frame: PriceFrame): Record<string, Flash> {
  const flash = { ...state.flash };
  for (const [ticker, update] of Object.entries(frame)) {
    const before = state.prices[ticker];
    const moved = update.direction === "up" || update.direction === "down";
    if (before && update.timestamp > before.timestamp && moved) {
      flash[ticker] = { dir: update.direction as "up" | "down", seq: (flash[ticker]?.seq ?? 0) + 1 };
    }
  }
  return flash;
}

function nextSpark(state: MarketState, frame: PriceFrame, nowSeconds: number): Record<string, SparkPoint[]> {
  const time = Math.floor(nowSeconds);
  const spark = { ...state.spark };
  for (const [ticker, update] of Object.entries(frame)) {
    const buffer = spark[ticker] ?? [];
    const last = buffer.at(-1);
    if (last && time < last.time) continue;
    const kept = last && time === last.time ? buffer.slice(0, -1) : buffer;
    spark[ticker] = [...kept, { time, value: update.price }].slice(-SPARK_CAP);
  }
  return spark;
}

/** Each frame replaces the price map, so a ticker missing from a frame disappears. */
export function applyFrame(state: MarketState, frame: PriceFrame, nowSeconds: number): MarketState {
  return {
    ...state,
    prices: frame,
    flash: nextFlash(state, frame),
    spark: nextSpark(state, frame, nowSeconds),
  };
}

type Actions = {
  receiveFrame: (frame: PriceFrame) => void;
  setStatus: (status: ConnectionStatus) => void;
};

export const useMarketStore = create<MarketState & Actions>()((set) => ({
  ...initialMarketState(),
  receiveFrame: (frame) => set((s) => applyFrame(s, frame, Date.now() / 1000)),
  setStatus: (status) => set({ status }),
}));
