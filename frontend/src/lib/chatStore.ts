import { create } from "zustand";
import { getChatHistory, NETWORK_ERROR, postChat } from "./api";
import { usePortfolioStore } from "./portfolioStore";
import type { ChatMessage } from "./types";
import { useWatchlistStore } from "./watchlistStore";

export type ChatHistoryStatus = "loading" | "error" | "ready";

export type LocalError = { text: string; network: boolean };

export type ChatState = {
  open: boolean;
  focusSeq: number;
  messages: ChatMessage[];
  history: ChatHistoryStatus;
  sending: boolean;
  localError: LocalError | null;
};

export function initialChatState(): ChatState {
  return { open: false, focusSeq: 0, messages: [], history: "loading", sending: false, localError: null };
}

type Actions = {
  setOpen: (open: boolean) => void;
  toggle: () => void;
  loadHistory: () => Promise<void>;
  send: (text: string) => Promise<boolean>;
};

let localId = 0;

/** The conversation and the send lifecycle: one pending reply, one request per send, no automatic retry. */
export const useChatStore = create<ChatState & Actions>()((set, get) => ({
  ...initialChatState(),
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open, focusSeq: s.open ? s.focusSeq : s.focusSeq + 1 })),
  loadHistory: async () => {
    if (get().sending) return;
    set({ history: "loading" });
    try {
      const messages = await getChatHistory();
      set({ messages, history: "ready", localError: null });
    } catch {
      set({ history: "error" });
    }
  },
  send: async (text) => {
    if (get().sending) return false;
    const user: ChatMessage = {
      id: "local-" + ++localId,
      role: "user",
      content: text,
      actions: null,
      created_at: new Date().toISOString(),
    };
    set((s) => ({ messages: [...s.messages, user], sending: true, localError: null }));
    try {
      const reply = await postChat(text);
      usePortfolioStore.getState().applyTrade(reply.portfolio);
      useWatchlistStore.getState().publish(reply.watchlist);
      const assistant: ChatMessage = {
        id: "local-" + ++localId,
        role: "assistant",
        content: reply.message,
        actions: reply.actions,
        created_at: new Date().toISOString(),
      };
      set((s) => ({ messages: [...s.messages, assistant], sending: false }));
      return true;
    } catch (e) {
      const message = (e as Error).message;
      set({ sending: false, localError: { text: message, network: message === NETWORK_ERROR } });
      return false;
    }
  },
}));

export function resetChatStore() {
  localId = 0;
  useChatStore.setState(initialChatState());
}
