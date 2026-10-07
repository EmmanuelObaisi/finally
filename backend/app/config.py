"""Settings read from the environment. Local dev also loads the project-root .env."""
import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = BACKEND_DIR.parent        # "/" inside Docker: the Dockerfile must set DB_PATH


@dataclass(frozen=True)
class Settings:
    openrouter_api_key: str
    massive_api_key: str
    llm_mock: bool
    db_path: Path
    sim_seed: int | None
    sim_event_probability: float
    static_dir: Path

    @classmethod
    def from_env(cls) -> "Settings":
        """Load the root .env (real env vars win) and read every setting."""
        load_dotenv(ROOT_DIR / ".env", override=False)
        seed = os.environ.get("SIM_SEED", "").strip()
        return cls(
            openrouter_api_key=os.environ.get("OPENROUTER_API_KEY", "").strip(),
            massive_api_key=os.environ.get("MASSIVE_API_KEY", "").strip(),
            llm_mock=os.environ.get("LLM_MOCK", "false").strip().lower() == "true",
            db_path=Path(os.environ.get("DB_PATH") or ROOT_DIR / "db" / "finally.db"),
            sim_seed=int(seed) if seed else None,
            sim_event_probability=float(os.environ.get("SIM_EVENT_PROBABILITY", "0.001")),
            static_dir=Path(os.environ.get("STATIC_DIR") or BACKEND_DIR / "static"),
        )
