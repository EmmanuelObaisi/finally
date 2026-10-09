"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { addTicker, getWatchlist, removeTicker } from "../lib/api";
import { useSelectionStore } from "../lib/selectionStore";
import { useMarketStore } from "../lib/store";
import type { WatchlistItem } from "../lib/types";
import FormMessage, { type MessageKind } from "./FormMessage";
import WatchlistRow from "./WatchlistRow";

type View = { kind: "loading" } | { kind: "error" } | { kind: "ready"; items: WatchlistItem[] };
type Message = { kind: MessageKind; text: string };

const IDLE: Message = { kind: "idle", text: "" };
const FOCUS = " focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const INPUT =
  "h-8 min-w-0 flex-1 rounded-sm border border-border bg-surface px-2 text-body text-fg placeholder:text-muted disabled:opacity-50 uppercase" +
  FOCUS;
const BUTTON =
  "h-8 w-20 rounded-sm bg-secondary px-4 text-body font-semibold text-fg hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50" +
  FOCUS;

/** Watchlist membership and order come from GET /api/watchlist, never from SSE keys. */
export default function WatchlistPanel() {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(IDLE);
  const inputRef = useRef<HTMLInputElement>(null);
  const refocus = useRef(false);

  function load() {
    setView({ kind: "loading" });
    getWatchlist()
      .then((items) => setView({ kind: "ready", items }))
      .catch(() => setView({ kind: "error" }));
  }

  useEffect(load, []);

  const status = useMarketStore((s) => s.status);
  useEffect(() => {
    if (status === "connected" && view.kind === "error") load();
  }, [status]);

  const selected = useSelectionStore((s) => s.selected);
  const select = useSelectionStore((s) => s.select);
  useEffect(() => {
    useSelectionStore.getState().sync(view.kind, view.kind === "ready" ? view.items.map((i) => i.ticker) : []);
  }, [view]);

  // A disabled input cannot take focus inside the handler, so focus returns once busy clears.
  useEffect(() => {
    if (!busy && refocus.current) {
      refocus.current = false;
      inputRef.current?.focus();
    }
  }, [busy]);

  /**
   * Runs one add or remove; the response list replaces the table, so load() is never re-run.
   * onFail is awaited while the panel is still busy, so no later mutation can race it.
   */
  async function mutate(
    pending: string,
    run: () => Promise<WatchlistItem[]>,
    onFail?: () => Promise<void>,
  ): Promise<boolean> {
    setBusy(true);
    setMessage({ kind: "pending", text: pending });
    try {
      setView({ kind: "ready", items: await run() });
      setMessage(IDLE);
      return true;
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
      await onFail?.();
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const ticker = input.trim();
    if (!ticker) {
      setMessage({ kind: "error", text: "Enter a ticker symbol" });
      return;
    }
    refocus.current = true;
    if (await mutate("Adding " + ticker.toUpperCase() + "...", () => addTicker(ticker))) setInput("");
  }

  /** A failed remove may mean the list is stale (removed elsewhere): refresh it, keep the message. */
  async function remove(ticker: string) {
    if (busy) return;
    await mutate("Removing " + ticker + "...", () => removeTicker(ticker), refresh);
  }

  async function refresh() {
    try {
      setView({ kind: "ready", items: await getWatchlist() });
    } catch {
      // Keep the current list; the error message from the failed remove stays visible.
    }
  }

  const locked = busy || view.kind !== "ready";

  return (
    <section data-testid="watchlist-panel" className="flex lg:h-full min-h-0 flex-col bg-panel lg:border-r lg:border-border">
      <div className="flex h-10 items-center border-b border-border px-4">
        <h2 className="text-heading font-semibold">Watchlist</h2>
      </div>
      <form
        aria-label="Add ticker to watchlist"
        data-testid="watchlist-add-form"
        aria-busy={busy ? "true" : undefined}
        onSubmit={add}
        className="h-18 shrink-0 border-b border-border"
      >
        <div className="flex h-12 items-center gap-2 px-4">
          <input
            ref={inputRef}
            data-testid="watchlist-add-input"
            type="text"
            placeholder="Add ticker (for example PYPL)"
            aria-label="Ticker to add"
            autoComplete="off"
            spellCheck={false}
            disabled={locked}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setMessage(IDLE);
            }}
            className={INPUT}
          />
          <button data-testid="watchlist-add-button" type="submit" disabled={locked} className={BUTTON}>
            Add
          </button>
        </div>
        <FormMessage testId="watchlist-message" kind={message.kind} text={message.text} />
      </form>
      <div className="min-h-0 flex-1 lg:overflow-y-auto">
        {view.kind === "loading" && <Skeleton />}
        {view.kind === "error" && <ErrorState onRetry={load} />}
        {view.kind === "ready" && view.items.length === 0 && <EmptyState />}
        {view.kind === "ready" && view.items.length > 0 && (
          <table className="w-full table-fixed">
            <thead className="sticky top-0 bg-panel">
              <tr className="h-8 border-b border-border text-label text-muted">
                <th className="w-24 px-4 text-left font-normal">Ticker</th>
                <th className="w-24 px-2 text-right font-normal">Price</th>
                <th className="w-22 px-2 text-right font-normal" title="Change since session start">
                  Chg %
                </th>
                <th className="px-2 text-left font-normal hidden sm:table-cell">Since load</th>
                <th className="w-10 p-0">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {view.items.map((item) => (
                <WatchlistRow
                  key={item.ticker}
                  item={item}
                  busy={busy}
                  selected={item.ticker === selected}
                  onSelect={select}
                  onRemove={remove}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function Skeleton() {
  return (
    <div data-testid="watchlist-loading" aria-busy="true" aria-label="Loading watchlist">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="h-10 border-b border-border px-4">
          <div className="h-2 rounded-sm bg-raised motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div data-testid="watchlist-error" className="p-6">
      <h3 className="text-heading font-semibold">Watchlist unavailable</h3>
      <p className="text-body">
        The server did not return your watchlist. Check that FinAlly is running, then retry.
      </p>
      <button
        data-testid="watchlist-retry"
        onClick={onRetry}
        className="mt-4 h-8 rounded-sm border border-border px-4 hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Retry
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div data-testid="watchlist-empty" className="p-6">
      <h3 className="text-heading font-semibold">Watchlist is empty</h3>
      <p className="text-body">Add a ticker to start watching live prices.</p>
    </div>
  );
}
