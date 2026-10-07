// Typed calls to the FinAlly API. Shapes: planning/API_CONTRACT.md.
export type Health = { status: string };

export async function getHealth(): Promise<Health> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(`health ${res.status}`);
  return (await res.json()) as Health;
}
