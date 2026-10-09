/** Attribution the lightweight-charts licence requires; the main chart shows the TradingView logo and the other charts hide it. */
export default function Footer() {
  return (
    <footer className="flex h-8 shrink-0 items-center border-t border-border bg-panel px-4 text-label text-muted">
      <p data-testid="footer-attribution">
        <a
          data-testid="tradingview-link"
          href="https://www.tradingview.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          TradingView
        </a>{" "}
        Lightweight Charts(TM) Copyright (c) 2025 TradingView, Inc. https://www.tradingview.com/
      </p>
    </footer>
  );
}
