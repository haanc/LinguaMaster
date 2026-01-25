/**
 * Supabase Edge Functions API Client
 * Handles all cloud API calls that require credit verification
 */

import { supabase, getSessionWithTimeout } from './supabase';

// Edge Functions base URL (from environment)
const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
  : '';

/**
 * Get current auth token - uses getSessionWithTimeout to avoid SDK hanging
 */
async function getAuthToken(): Promise<string | null> {
  // Use our timeout-protected version
  const { session, error } = await getSessionWithTimeout(3000);

  console.log('getAuthToken debug:', {
    error: error?.message,
    hasSession: !!session,
    tokenLength: session?.access_token?.length,
    expiresAt: session?.expires_at,
  });

  if (error) {
    console.error('Failed to get session:', error);
    return null;
  }

  if (!session) {
    console.log('No active session');
    return null;
  }

  // Check if token is about to expire (within 60 seconds)
  const expiresAt = session.expires_at;
  const now = Math.floor(Date.now() / 1000);

  if (expiresAt && expiresAt - now < 60) {
    console.log('Token expiring soon, refreshing...');
    // Use race with timeout for refresh too
    try {
      const { data: refreshData, error: refreshError } = await Promise.race([
        supabase.auth.refreshSession(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Refresh timeout')), 5000)
        )
      ]);
      if (refreshError) {
        console.error('Failed to refresh session:', refreshError);
        return session.access_token; // Try with existing token anyway
      }
      return refreshData.session?.access_token || null;
    } catch (timeoutErr) {
      console.warn('Token refresh timed out, using existing token');
      return session.access_token;
    }
  }

  return session.access_token;
}

/**
 * Make authenticated request to Edge Function
 */
async function callEdgeFunction<T>(
  functionName: string,
  body: Record<string, unknown>,
  method: 'GET' | 'POST' = 'POST'
): Promise<T> {
  const token = await getAuthToken();

  if (!token) {
    throw new Error('Not authenticated');
  }

  const url = `${EDGE_FUNCTIONS_URL}/${functionName}`;

  const response = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });

  const data = await response.json();

  console.log('Edge Function response:', {
    status: response.status,
    data,
    functionName,
    requestBody: body
  });

  if (!response.ok) {
    // Handle specific error types
    if (data.error === 'insufficient_credits') {
      throw new InsufficientCreditsError(data.balance, data.required);
    }
    // Extract error message from various response formats
    const errorMsg = data.error || data.message || data.msg || JSON.stringify(data);
    throw new EdgeFunctionError(errorMsg, response.status);
  }

  return data as T;
}

// Custom error classes
export class EdgeFunctionError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'EdgeFunctionError';
  }
}

export class InsufficientCreditsError extends Error {
  constructor(public balance: number, public required: number) {
    super(`Insufficient credits: ${balance} < ${required}`);
    this.name = 'InsufficientCreditsError';
  }
}

// API Types
export interface AIResponse {
  result: string;
  credits_remaining: number;
  credits_used: number;
}

export interface UserProfile {
  id: string;
  email: string;
  tier: 'guest' | 'free' | 'pro';
  credits_balance: number;
  credits_monthly_limit: number;
  credits_reset_at: string | null;
  referral_code: string | null;
  subscription: {
    plan: string;
    status: string;
    current_period_end: string;
  } | null;
}

export interface CreditDeductResult {
  success: boolean;
  new_balance: number;
  deducted: number;
}

// Edge Functions API
export const edgeApi = {
  /**
   * Get user profile from cloud
   */
  async getProfile(): Promise<UserProfile> {
    const token = await getAuthToken();
    if (!token) throw new Error('Not authenticated');

    const response = await fetch(`${EDGE_FUNCTIONS_URL}/user-profile`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new EdgeFunctionError('Failed to fetch profile', response.status);
    }

    return response.json();
  },

  /**
   * AI Word Lookup (uses cloud credits)
   */
  async lookupWord(
    word: string,
    context: string,
    language: string
  ): Promise<AIResponse> {
    return callEdgeFunction<AIResponse>('ai-proxy', {
      action: 'word_lookup',
      prompt: word,
      context,
      language,
    });
  },

  /**
   * AI Explain (uses cloud credits)
   */
  async explain(
    text: string,
    context: string,
    language: string
  ): Promise<AIResponse> {
    return callEdgeFunction<AIResponse>('ai-proxy', {
      action: 'ai_explain',
      prompt: text,
      context,
      language,
    });
  },

  /**
   * AI Tutor Chat (uses cloud credits)
   */
  async chat(
    messages: Array<{ role: string; content: string }>,
    userMessage: string,
    language?: string
  ): Promise<AIResponse> {
    return callEdgeFunction<AIResponse>('ai-proxy', {
      action: 'ai_tutor',
      prompt: userMessage,
      messages,
      language,
    });
  },

  /**
   * Deduct credits manually (for local operations like Whisper)
   */
  async deductCredits(
    action: string,
    metadata?: Record<string, unknown>
  ): Promise<CreditDeductResult> {
    return callEdgeFunction<CreditDeductResult>('credit-deduct', {
      action,
      metadata,
    });
  },

  /**
   * Batch translate texts (uses cloud credits)
   * Cost: 20 credits per 100 segments
   * Automatically batches large requests to avoid timeout
   */
  async translateBatch(
    texts: string[],
    targetLanguage: string,
    batchSize: number = 10,
    onProgress?: (completed: number, total: number) => void
  ): Promise<AIResponse & { translations: Record<number, string> }> {
    if (texts.length === 0) {
      return { result: '', credits_remaining: 0, credits_used: 0, translations: {} };
    }

    const allTranslations: Record<number, string> = {};
    let totalCreditsUsed = 0;
    let creditsRemaining = 0;
    const totalBatches = Math.ceil(texts.length / batchSize);

    console.log(`Translating ${texts.length} texts in ${totalBatches} batches`);

    for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
      const startIdx = batchNum * batchSize;
      const endIdx = Math.min(startIdx + batchSize, texts.length);
      const batchTexts = texts.slice(startIdx, endIdx);

      console.log(`Batch ${batchNum + 1}/${totalBatches}: translating ${batchTexts.length} texts (indices ${startIdx}-${endIdx - 1})`);

      const response = await callEdgeFunction<AIResponse>('ai-proxy', {
        action: 'batch_translate_100',
        prompt: '',
        texts: batchTexts,
        target_language: targetLanguage,
      });

      // Parse the result text to extract translations
      const pattern = /\[(\d+)\]\s*([^\[]+)/g;
      let match;
      while ((match = pattern.exec(response.result)) !== null) {
        const localIdx = parseInt(match[1], 10);
        const globalIdx = startIdx + localIdx; // Map back to global index
        const translation = match[2].trim().replace(/-+$/, '').trim();
        if (translation) {
          allTranslations[globalIdx] = translation;
        }
      }

      totalCreditsUsed += response.credits_used;
      creditsRemaining = response.credits_remaining;

      // Report progress
      if (onProgress) {
        onProgress(endIdx, texts.length);
      }
    }

    console.log(`Translation complete: ${Object.keys(allTranslations).length}/${texts.length} translated, ${totalCreditsUsed} credits used`);

    return {
      result: '',
      credits_remaining: creditsRemaining,
      credits_used: totalCreditsUsed,
      translations: allTranslations,
    };
  },
};

/**
 * Check if user is using their own API key (bypass cloud credits)
 */
export function isUsingOwnApiKey(): boolean {
  const configs = localStorage.getItem('llm_configs');
  if (!configs) return false;

  try {
    const parsed = JSON.parse(configs);
    return parsed.some((c: { isActive: boolean }) => c.isActive);
  } catch {
    return false;
  }
}

export default edgeApi;
