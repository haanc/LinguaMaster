// User Profile Edge Function
// Securely fetches and updates user profile

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  createServiceClient,
  getUserFromRequest,
  corsHeaders,
  handleCors,
} from "../_shared/utils.ts";

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

    const supabase = createServiceClient();

    if (req.method === "GET") {
      // Fetch user profile
      const { data: profile, error } = await supabase
        .from("user_profiles")
        .select(`
          id,
          tier,
          credits_balance,
          credits_monthly_limit,
          credits_reset_at,
          referral_code,
          referred_by,
          created_at
        `)
        .eq("id", user.id)
        .single();

      if (error) {
        console.error("Profile fetch error:", error);
        return new Response(
          JSON.stringify({ error: "Failed to fetch profile" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get active subscription if any
      const { data: subscription } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "active")
        .single();

      return new Response(
        JSON.stringify({
          ...profile,
          email: user.email,
          subscription: subscription || null,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Profile error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
