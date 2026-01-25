// Credit Deduction Edge Function
// Safely deducts credits from user balance with atomic operation

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  createServiceClient,
  getUserFromRequest,
  CREDIT_COSTS,
  CreditAction,
  errorResponse,
  successResponse,
  corsHeaders,
  handleCors,
} from "../_shared/utils.ts";

interface DeductRequest {
  action: CreditAction;
  metadata?: Record<string, unknown>;
}

serve(async (req) => {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Verify user
    const user = await getUserFromRequest(req);
    if (!user) {
      return errorResponse("Unauthorized", 401);
    }

    // Parse request body
    const body: DeductRequest = await req.json();
    const { action, metadata = {} } = body;

    // Validate action
    if (!action || !(action in CREDIT_COSTS)) {
      return errorResponse(`Invalid action: ${action}`);
    }

    const cost = CREDIT_COSTS[action];
    const supabase = createServiceClient();

    // Call the atomic deduct_credits function
    const { data, error } = await supabase.rpc("deduct_credits", {
      p_user_id: user.id,
      p_amount: cost,
      p_action: action,
      p_metadata: metadata,
    });

    if (error) {
      console.error("Deduct credits error:", error);
      return errorResponse("Failed to deduct credits", 500);
    }

    const result = data?.[0];
    if (!result?.success) {
      return new Response(
        JSON.stringify({
          error: "insufficient_credits",
          message: result?.error_message || "Insufficient credits",
          balance: result?.new_balance || 0,
          required: cost,
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        new_balance: result.new_balance,
        deducted: cost,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Credit deduct error:", err);
    return errorResponse("Internal server error", 500);
  }
});
