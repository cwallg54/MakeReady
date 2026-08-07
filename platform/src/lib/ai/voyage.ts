import "server-only";

/**
 * Voyage AI multimodal embeddings client (Anthropic's recommended embeddings
 * provider — there is no first-party Anthropic embeddings API). We use the
 * multimodal model for BOTH text and (future) artwork images so descriptions
 * and images share one vector space: once design images exist, a text query
 * will match them too. Reads VOYAGE_API_KEY; every call degrades to null when
 * it's unset so callers can fall back to keyword search.
 */
const API_URL = "https://api.voyageai.com/v1/multimodalembeddings";
export const VOYAGE_MODEL = "voyage-multimodal-3.5";

export function voyageConfigured(): boolean {
  return !!process.env.VOYAGE_API_KEY;
}

type Content =
  | { type: "text"; text: string }
  | { type: "image_base64"; image_base64: string };

async function embed(inputs: Content[][], inputType: "query" | "document"): Promise<number[][] | null> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model: VOYAGE_MODEL, input_type: inputType, inputs: inputs.map((content) => ({ content })) }),
    });
    if (!res.ok) {
      console.error("[voyage] request failed", res.status, (await res.text().catch(() => "")).slice(0, 300));
      return null;
    }
    const data = (await res.json()) as { data?: { embedding: number[] }[] };
    return (data.data ?? []).map((d) => d.embedding);
  } catch (e) {
    console.error("[voyage] error", e);
    return null;
  }
}

/** Embed a natural-language search query. Returns null if Voyage isn't configured or fails. */
export async function embedQuery(text: string): Promise<number[] | null> {
  const r = await embed([[{ type: "text", text }]], "query");
  return r?.[0] ?? null;
}

/** Embed a batch of catalogue-item texts (for the backfill / server use). */
export async function embedDocuments(texts: string[]): Promise<number[][] | null> {
  return embed(texts.map((t) => [{ type: "text", text: t }]), "document");
}

/** Format a JS number[] as a pgvector literal, e.g. "[0.1,0.2,...]". */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
