import { aiComplete, aiConfigured } from "@/lib/ai/client";

/**
 * AI answer layer for a catalog search (products, designs). Given the shopper's
 * free-text query and the labels of the matching items, returns a short, plain
 * recommendation — or null when AI is off / the query is empty / it fails.
 */
export async function aiCatalogAnswer(query: string, kind: string, labels: string[]): Promise<string | null> {
  const q = (query ?? "").trim();
  if (!aiConfigured() || q.length < 2) return null;
  const list = labels.filter(Boolean).slice(0, 40);
  const res = await aiComplete({
    system: `You help someone search a ${kind}. Given their query and the matching items, reply in 1–2 short, friendly sentences: which items best fit and why, or — if nothing fits — suggest how to refine the search. Only reference items in the provided list; never invent items.`,
    prompt: `Search: "${q}"\n\nMatching items:\n${list.length ? list.join("\n") : "(none)"}`,
    maxTokens: 180,
    temperature: 0.4,
  });
  return res.ok ? res.text ?? null : null;
}
