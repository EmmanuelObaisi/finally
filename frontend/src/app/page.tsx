"use client";

import { useEffect, useState } from "react";
import { getHealth } from "../lib/api";

export default function Home() {
  const [api, setApi] = useState("checking");

  useEffect(() => {
    getHealth()
      .then((h) => setApi(h.status))
      .catch(() => setApi("down"));
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3">
      <h1 data-testid="app-title" className="text-3xl font-semibold text-accent">FinAlly</h1>
      <p className="text-sm text-slate-400">
        API: <span data-testid="api-status" className="text-primary">{api}</span>
      </p>
    </main>
  );
}
