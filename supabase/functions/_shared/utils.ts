// Supabase Edge Functions - Shared utilities
// This file is imported by all edge functions

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// Environment variables (set in Supabase Dashboard > Edge Functions > Secrets)
// Note: SUPABASE_URL and SUPABASE_ANON_KEY are auto-provided by Supabase
// SERVICE_ROLE_KEY must be set manually (cannot use SUPABASE_ prefix for custom secrets)
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

// Create Supabase client with service role (full access)
export function createServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Create Supabase client from user JWT token
export function createUserClient(token: string) {
  return createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

// Extract and verify JWT from request
export async function getUserFromRequest(req: Request): Promise<{
  id: string;
  email: string;
} | null> {
  const authHeader = req.headers.get("Authorization");
  console.log("Auth header present:", !!authHeader);

  if (!authHeader?.startsWith("Bearer ")) {
    console.log("No Bearer token found");
    return null;
  }

  const token = authHeader.replace("Bearer ", "");
  console.log("Token length:", token.length);

  // Decode JWT to check expiry (without verification)
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1]));
      const now = Math.floor(Date.now() / 1000);
      console.log("JWT payload:", {
        exp: payload.exp,
        iat: payload.iat,
        now,
        expired: payload.exp ? payload.exp < now : 'unknown',
        expiresIn: payload.exp ? payload.exp - now : 'unknown'
      });
    }
  } catch (e) {
    console.log("Failed to decode JWT:", e);
  }

  const supabase = createServiceClient();
  const serviceKeyLength = Deno.env.get("SERVICE_ROLE_KEY")?.length || 0;
  console.log("Service client created:", {
    SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
    SERVICE_ROLE_KEY_length: serviceKeyLength,
    hasServiceKey: serviceKeyLength > 0,
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error) {
    console.error("Auth error:", error.message, error);
    return null;
  }

  if (!user) {
    console.log("No user returned");
    return null;
  }

  console.log("User verified:", user.id);
  return {
    id: user.id,
    email: user.email || "",
  };
}

// Credit costs for AI operations
export const CREDIT_COSTS = {
  word_lookup: 1,
  ai_explain: 3,
  ai_tutor: 5,
  whisper_per_minute: 10,
  batch_translate_100: 20,
} as const;

export type CreditAction = keyof typeof CREDIT_COSTS;

// Standard error responses
export function errorResponse(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function successResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// CORS headers for all responses
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// Handle CORS preflight
export function handleCors(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}
