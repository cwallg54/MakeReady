import "server-only";

/**
 * Minimal Anthropic (Claude) API client. Reads ANTHROPIC_API_KEY from the
 * environment; until that's set every AI feature degrades gracefully with a
 * clear "not set up" message rather than erroring. Pay-as-you-go — Haiku is the
 * default for these short, cheap generations.
 */
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const API_URL = "https://api.anthropic.com/v1/messages";

export function aiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export interface AiResult {
  ok: boolean;
  text?: string;
  error?: string;
}

export async function aiComplete(opts: {
  prompt: string;
  system?: string;
  maxTokens?: number;
  model?: string;
  temperature?: number;
}): Promise<AiResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: "AI isn’t set up yet — add your Anthropic API key (ANTHROPIC_API_KEY) to enable this." };

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: opts.model ?? DEFAULT_MODEL,
        max_tokens: opts.maxTokens ?? 1024,
        temperature: opts.temperature ?? 0.4,
        ...(opts.system ? { system: opts.system } : {}),
        messages: [{ role: "user", content: opts.prompt }],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[ai] request failed", res.status, body.slice(0, 500));
      if (res.status === 401) return { ok: false, error: "AI key was rejected — check the Anthropic API key." };
      if (res.status === 429) return { ok: false, error: "AI is busy / out of credit — try again shortly." };
      return { ok: false, error: `AI request failed (${res.status}).` };
    }

    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
    return text ? { ok: true, text } : { ok: false, error: "AI returned an empty response." };
  } catch (e) {
    console.error("[ai] error", e);
    return { ok: false, error: "Couldn’t reach the AI service." };
  }
}

/** Vision completion — send an image plus a prompt (e.g. OCR a business card). */
export async function aiVision(opts: {
  imageBase64: string;
  mediaType: string; // image/png | image/jpeg | image/webp | image/gif
  prompt: string;
  system?: string;
  maxTokens?: number;
  model?: string;
}): Promise<AiResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: "AI isn’t set up yet — add your Anthropic API key (ANTHROPIC_API_KEY) to enable this." };
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: opts.model ?? DEFAULT_MODEL,
        max_tokens: opts.maxTokens ?? 1024,
        temperature: 0,
        ...(opts.system ? { system: opts.system } : {}),
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: opts.mediaType, data: opts.imageBase64 } },
              { type: "text", text: opts.prompt },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[ai] vision failed", res.status, body.slice(0, 500));
      if (res.status === 401) return { ok: false, error: "AI key was rejected — check the Anthropic API key." };
      if (res.status === 429) return { ok: false, error: "AI is busy / out of credit — try again shortly." };
      return { ok: false, error: `AI request failed (${res.status}).` };
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
    return text ? { ok: true, text } : { ok: false, error: "AI returned an empty response." };
  } catch (e) {
    console.error("[ai] vision error", e);
    return { ok: false, error: "Couldn’t reach the AI service." };
  }
}
