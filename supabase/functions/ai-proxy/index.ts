// AI Proxy Edge Function
// Validates credits, deducts, and proxies AI requests to Gemini API
// This ensures users can't bypass credit system

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  createServiceClient,
  getUserFromRequest,
  CREDIT_COSTS,
  CreditAction,
  corsHeaders,
  handleCors,
} from "../_shared/utils.ts";

// Gemini API configuration (set in Edge Functions Secrets)
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

interface AIRequest {
  action: CreditAction;
  prompt: string;
  context?: string;
  language?: string;
  messages?: Array<{ role: string; content: string }>;
  // For batch translation
  texts?: string[];
  target_language?: string;
}

serve(async (req) => {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Verify user
    const user = await getUserFromRequest(req);
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request
    const body: AIRequest = await req.json();
    const { action, prompt, context, language, messages, texts, target_language } = body;

    // Validate action
    if (!action || !(action in CREDIT_COSTS)) {
      return new Response(
        JSON.stringify({ error: `Invalid action: ${action}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate cost - batch_translate_100 is priced per 100 segments (20 credits)
    // For smaller batches, charge proportionally (minimum 1 credit)
    let cost = CREDIT_COSTS[action];
    if (action === "batch_translate_100" && texts) {
      // 20 credits per 100 segments, minimum 1 credit
      cost = Math.max(1, Math.ceil(texts.length * 20 / 100));
      console.log(`Batch translate: ${texts.length} segments, cost: ${cost} credits`);
    }

    const supabase = createServiceClient();

    // Check and deduct credits atomically
    const { data: creditResult, error: creditError } = await supabase.rpc("deduct_credits", {
      p_user_id: user.id,
      p_amount: cost,
      p_action: action,
      p_metadata: { prompt: prompt?.substring(0, 100) },
    });

    if (creditError) {
      console.error("Credit deduction error:", creditError);
      return new Response(
        JSON.stringify({ error: "Failed to process credits" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const credit = creditResult?.[0];
    if (!credit?.success) {
      return new Response(
        JSON.stringify({
          error: "insufficient_credits",
          message: credit?.error_message || "Insufficient credits",
          balance: credit?.new_balance || 0,
          required: cost,
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build Gemini request based on action
    let geminiPrompt = "";

    switch (action) {
      case "word_lookup":
        geminiPrompt = buildWordLookupPrompt(prompt, context || "", language || "en");
        break;
      case "ai_explain":
        geminiPrompt = buildExplainPrompt(prompt, context || "", language || "en");
        break;
      case "ai_tutor":
        geminiPrompt = buildTutorPrompt(messages || [], prompt, language);
        break;
      case "batch_translate_100":
        geminiPrompt = buildBatchTranslatePrompt(texts || [], target_language || "Chinese");
        break;
      default:
        geminiPrompt = prompt;
    }

    // Call Gemini API
    const geminiResponse = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: geminiPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 8192,
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Gemini API error:", errorText);

      // Refund credits on API failure
      await supabase.rpc("add_credits", {
        p_user_id: user.id,
        p_amount: cost,
        p_action: "admin_adjustment",
        p_metadata: { reason: "api_failure_refund", original_action: action },
      });

      return new Response(
        JSON.stringify({ error: "AI service temporarily unavailable" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiData = await geminiResponse.json();
    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return new Response(
      JSON.stringify({
        result: responseText,
        credits_remaining: credit.new_balance,
        credits_used: cost,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("AI proxy error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Prompt builders
function buildWordLookupPrompt(word: string, context: string, language: string): string {
  return `You are a language learning assistant. Look up the word "${word}" in the context: "${context}".

User's native language: ${language}

Respond ONLY with a JSON object (no markdown, no code blocks).
ALL content must be written in ${language}:
{
  "translation": "translation in ${language}",
  "definition": "definition written in ${language}",
  "pronunciation": "pronunciation/phonetic notation",
  "example": "example sentence in ${language}"
}

IMPORTANT:
- Output ONLY the JSON object, no other text.
- ALL explanations must be in ${language}, not English.`;
}

function buildExplainPrompt(text: string, context: string, language: string): string {
  return `You are an expert language teacher helping a student learn from video subtitles.

Analyze this text: "${text}"
Student's native language: ${language}

Respond ONLY with a JSON object (no markdown, no code blocks).
ALL content must be written in ${language}:
{
  "summary": "Explain what this sentence means and when/how it would be used in real conversation",
  "grammar_notes": "Identify key grammar patterns, sentence structure, verb forms, or word order. Explain in a way that helps learners understand the rules.",
  "cultural_notes": "Explain any cultural context, slang, idioms, formality level, or situational usage. If this is everyday language, explain the social context where it would be appropriate."
}

IMPORTANT:
- Output ONLY the JSON object, no other text.
- ALL explanations must be in ${language}.
- For cultural_notes: Always provide useful context - even simple sentences have cultural/social aspects (formality, typical speakers, situations). Never write just "N/A".`;
}

function buildTutorPrompt(
  messages: Array<{ role: string; content: string }>,
  currentMessage: string,
  language?: string
): string {
  const langInstruction = language
    ? `IMPORTANT: Always respond in ${language}. Match the user's language.\n\n`
    : `IMPORTANT: Always respond in the same language the user uses.\n\n`;

  let conversation = `You are an AI language tutor. Help the user learn languages through conversation.
${langInstruction}`;

  for (const msg of messages.slice(-10)) { // Last 10 messages for context
    const role = msg.role === "user" ? "User" : "Tutor";
    conversation += `${role}: ${msg.content}\n`;
  }

  conversation += `User: ${currentMessage}\nTutor:`;
  return conversation;
}

function buildBatchTranslatePrompt(texts: string[], targetLanguage: string): string {
  const numberedTexts = texts.map((t, i) => `[${i}] ${t}`).join("\n---\n");
  return `You are a translator. Translate each numbered subtitle segment to ${targetLanguage}.
Keep the [number] prefix in your response. Output one translation per line in format: [number] translation

${numberedTexts}`;
}
