"""Seed prices, per-ticker GBM parameters and sector groups for the simulator."""

SEED_PRICES: dict[str, float] = {
    "AAPL": 190.0,
    "GOOGL": 175.0,
    "MSFT": 420.0,
    "AMZN": 185.0,
    "TSLA": 250.0,
    "NVDA": 800.0,
    "META": 500.0,
    "JPM": 195.0,
    "V": 280.0,
    "NFLX": 600.0,
}

# Annualized (drift mu, volatility sigma).
TICKER_PARAMS: dict[str, tuple[float, float]] = {
    "AAPL": (0.05, 0.22),
    "GOOGL": (0.05, 0.25),
    "MSFT": (0.05, 0.20),
    "AMZN": (0.05, 0.28),
    "TSLA": (0.03, 0.50),
    "NVDA": (0.08, 0.40),
    "META": (0.05, 0.30),
    "JPM": (0.04, 0.18),
    "V": (0.04, 0.17),
    "NFLX": (0.05, 0.35),
}

DEFAULT_PARAMS: tuple[float, float] = (0.05, 0.25)

SECTORS: dict[str, set[str]] = {
    "tech": {"AAPL", "GOOGL", "MSFT", "AMZN", "META", "NVDA", "NFLX"},
    "finance": {"JPM", "V"},
}

INTRA_SECTOR_CORR: dict[str, float] = {"tech": 0.6, "finance": 0.5}
CROSS_SECTOR_CORR = 0.3
TSLA_CORR = 0.3
