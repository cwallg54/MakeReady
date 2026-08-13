"use server";

import { redirect } from "next/navigation";
import { aiVision, aiConfigured } from "@/lib/ai/client";
import { getCurrentUser } from "@/lib/auth/service";
import { canEdit, canView } from "@/lib/rbac";
import { consumeRateLimit, clientIp, retryMessage } from "@/lib/security/rate-limit";

export interface OcrFields {
  companyName?: string;
  primaryContactName?: string;
  primaryContactEmail?: string;
  phone?: string;
  addressStreet?: string;
  addressCity?: string;
  addressState?: string;
  addressZip?: string;
  website?: string;
}
export interface OcrState {
  fields?: OcrFields;
  error?: string;
  nonce?: number; // bump so the form remounts with new defaults
}

const ALLOWED = /^image\/(png|jpe?g|webp|gif|heic|heif)$/i;
const MAX = 12 * 1024 * 1024;

/** OCR a business-card photo into structured CRM fields (Claude vision). */
export async function ocrBusinessCardAction(_prev: OcrState, formData: FormData): Promise<OcrState> {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "crm") || !canEdit(user.roles, "crm")) redirect("/403");
  if (!aiConfigured()) return { error: "Card scanning needs the Anthropic API key (ANTHROPIC_API_KEY) — enter details manually for now." };

  const rl = await consumeRateLimit("ocr-card", await clientIp(), 20, 600);
  if (!rl.ok) return { error: `Too many scans. ${retryMessage(rl.retryAfterSec)}` };

  const file = formData.get("card");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a photo of the business card." };
  if (file.size > MAX) return { error: "That image is too large (12 MB max)." };
  // Anthropic vision expects a normalized media type; HEIC isn't accepted, so guide the user.
  let mediaType = file.type.toLowerCase();
  if (!ALLOWED.test(mediaType)) return { error: "Upload a JPG, PNG, WebP or GIF image." };
  if (mediaType === "image/jpg") mediaType = "image/jpeg";
  if (mediaType.startsWith("image/hei")) return { error: "Please use a JPG or PNG (HEIC isn’t supported)." };

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const res = await aiVision({
    imageBase64: base64,
    mediaType,
    maxTokens: 500,
    system:
      "You extract contact details from a business-card photo. Respond with ONLY a JSON object, no prose, no markdown fences. " +
      "Keys: companyName, primaryContactName, primaryContactEmail, phone, addressStreet, addressCity, addressState, addressZip, website. " +
      "Use a best single value per key; omit keys you can't read. Phone digits/format as printed. State as the 2-letter code if shown.",
    prompt: "Extract the contact details from this business card as JSON.",
  });
  if (!res.ok) return { error: res.error ?? "Couldn’t read the card." };

  try {
    const jsonText = (res.text ?? "").replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const pick = (k: string) => {
      const v = parsed[k];
      return typeof v === "string" && v.trim() ? v.trim() : undefined;
    };
    const fields: OcrFields = {
      companyName: pick("companyName"),
      primaryContactName: pick("primaryContactName"),
      primaryContactEmail: pick("primaryContactEmail"),
      phone: pick("phone"),
      addressStreet: pick("addressStreet"),
      addressCity: pick("addressCity"),
      addressState: pick("addressState"),
      addressZip: pick("addressZip"),
      website: pick("website"),
    };
    if (!Object.values(fields).some(Boolean)) return { error: "Couldn’t read any details — try a sharper, straight-on photo." };
    return { fields, nonce: Date.now() };
  } catch {
    return { error: "Couldn’t parse the card details — enter them manually." };
  }
}
