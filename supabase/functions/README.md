# Supabase Edge Functions

This directory contains server-side functions that run on Supabase infrastructure.

## ⚠️ Security Architecture

**Sensitive keys should ONLY be stored in Edge Functions secrets, NOT in the local app.**

```
┌─────────────────────────────────────────────────────────────┐
│                    LOCAL APP (Electron)                     │
│  ├── Frontend (React)                                       │
│  │   └── VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY ✓       │
│  └── Backend (FastAPI)                                      │
│      └── SUPABASE_URL, SUPABASE_ANON_KEY ✓                 │
│      └── NO SERVICE_ROLE_KEY ❌                             │
│      └── NO GEMINI_API_KEY ❌                               │
│      └── NO LEMONSQUEEZY keys ❌                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ JWT Token
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  SUPABASE EDGE FUNCTIONS                     │
│  ├── SUPABASE_SERVICE_ROLE_KEY ✓ (in secrets)               │
│  ├── GEMINI_API_KEY ✓ (in secrets)                          │
│  ├── LEMONSQUEEZY_* ✓ (in secrets)                          │
│  │                                                           │
│  ├── /ai-proxy - Validates credits, calls Gemini            │
│  ├── /credit-deduct - Atomic credit deduction               │
│  ├── /subscription-webhook - LemonSqueezy webhooks          │
│  └── /user-profile - Secure profile access                  │
└─────────────────────────────────────────────────────────────┘
```

## Functions

| Function | Purpose | Public? |
|----------|---------|---------|
| `ai-proxy` | Validates credits, proxies AI requests to Gemini | No (requires auth) |
| `credit-deduct` | Atomically deducts credits | No (requires auth) |
| `subscription-webhook` | Handles LemonSqueezy subscription events | Yes (webhook) |
| `user-profile` | Fetches secure user profile | No (requires auth) |

## Deployment

### 1. Install Supabase CLI

```bash
npm install -g supabase
```

### 2. Login to Supabase

```bash
supabase login
```

### 3. Link to your project

```bash
cd /path/to/fluent-learner-v2
supabase link --project-ref YOUR_PROJECT_REF
```

### 4. Set secrets

```bash
# Supabase (required)
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Gemini AI (required for AI features)
supabase secrets set GEMINI_API_KEY=your_gemini_api_key
supabase secrets set GEMINI_MODEL=gemini-2.0-flash

# LemonSqueezy (required for payments)
supabase secrets set LEMONSQUEEZY_WEBHOOK_SECRET=your_webhook_secret
supabase secrets set LEMONSQUEEZY_MONTHLY_VARIANT_ID=123456
supabase secrets set LEMONSQUEEZY_YEARLY_VARIANT_ID=123457
```

### 5. Deploy functions

```bash
# Deploy all functions
supabase functions deploy

# Or deploy individually
supabase functions deploy ai-proxy
supabase functions deploy credit-deduct
supabase functions deploy subscription-webhook
supabase functions deploy user-profile
```

### 6. Run database migrations

```bash
supabase db push
```

## Local Development

```bash
# Start local Supabase
supabase start

# Serve functions locally
supabase functions serve

# Test a function
curl -X POST http://localhost:54321/functions/v1/ai-proxy \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "word_lookup", "prompt": "hello", "language": "en"}'
```

## Environment Variables

### Secrets (set via `supabase secrets set`)

| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_SERVICE_ROLE_KEY` | Full database access | Yes |
| `GEMINI_API_KEY` | Google Gemini API key | Yes (for AI) |
| `GEMINI_MODEL` | Gemini model name | No (default: gemini-2.0-flash) |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | Webhook signature verification | Yes (for payments) |
| `LEMONSQUEEZY_MONTHLY_VARIANT_ID` | Monthly plan variant ID | Yes (for payments) |
| `LEMONSQUEEZY_YEARLY_VARIANT_ID` | Yearly plan variant ID | Yes (for payments) |

### Auto-provided by Supabase

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` | Public anon key |

## Webhook Configuration

### LemonSqueezy Webhook URL

```
https://YOUR_PROJECT.supabase.co/functions/v1/subscription-webhook
```

**Events to enable:**
- `subscription_created`
- `subscription_updated`
- `subscription_cancelled`
- `subscription_resumed`
- `subscription_expired`
- `subscription_payment_success`
- `subscription_payment_failed`
- `order_created` (for credit top-ups)

## Troubleshooting

### View function logs

```bash
supabase functions logs ai-proxy
```

### Test webhook locally

```bash
# Use ngrok to expose local functions
ngrok http 54321

# Update LemonSqueezy webhook URL to ngrok URL
```
