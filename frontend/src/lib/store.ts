import { create } from "zustand";
import type { ConnectionStatus, PriceFrame } from "./types";

export type MarketState = { prices: PriceFrame; status: ConnectionStatus };

export function initialMarketState(): MarketState {
  return { prices: {}, status: "reconnecting" };
}

/** Each frame replaces the price map, so a ticker missing from a frame disappears. */
export function applyFrame(state: MarketState, frame: PriceFrame): MarketState {
  return { ...state, prices: frame };
}

type Actions = {
  receiveFrame: (frame: PriceFrame) => void;
  setStatus: (status: ConnectionStatus) => void;
};

export const useMarketStore = create<MarketState & Actions>()((set) => ({
  ...initialMarketState(),
  receiveFrame: (frame) => set((s) => applyFrame(s, frame)),
  setStatus: (status) => set({ status }),
}));
