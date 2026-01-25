#!/bin/bash

# ==============================================
# Configure Supabase Edge Functions Secrets
# ==============================================
# Run this script after getting your keys from:
# - Supabase Dashboard → Project Settings → API → service_role key
# - Google AI Studio → API Keys → Gemini API Key
# - LemonSqueezy Dashboard → Webhooks → Signing Secret

set -e

echo "================================================"
echo "  Supabase Edge Functions Secret Configuration  "
echo "================================================"
echo ""

# Check if Supabase CLI is available
if ! command -v npx &> /dev/null; then
    echo "Error: npx not found. Please install Node.js first."
    exit 1
fi

# Prompt for project selection
echo "Select environment to configure:"
echo "  1) Development (ggmgzozsqqjmehlrkkxq)"
echo "  2) Production (flghyjbqpalhxjznfxcn)"
echo "  3) Both"
read -p "Enter choice [1-3]: " env_choice

configure_project() {
    local project_ref=$1
    local project_name=$2

    echo ""
    echo "Configuring $project_name ($project_ref)..."
    echo ""

    # Link to project
    npx supabase link --project-ref $project_ref

    # Required secrets
    read -sp "Enter SUPABASE_SERVICE_ROLE_KEY: " service_role_key
    echo ""
    npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY="$service_role_key"

    read -sp "Enter GEMINI_API_KEY: " gemini_key
    echo ""
    npx supabase secrets set GEMINI_API_KEY="$gemini_key"
    npx supabase secrets set GEMINI_MODEL="gemini-2.0-flash"

    # Optional LemonSqueezy secrets
    read -p "Configure LemonSqueezy? [y/N]: " configure_ls
    if [[ $configure_ls =~ ^[Yy]$ ]]; then
        read -sp "Enter LEMONSQUEEZY_WEBHOOK_SECRET: " ls_secret
        echo ""
        npx supabase secrets set LEMONSQUEEZY_WEBHOOK_SECRET="$ls_secret"

        read -p "Enter LEMONSQUEEZY_MONTHLY_VARIANT_ID: " monthly_id
        npx supabase secrets set LEMONSQUEEZY_MONTHLY_VARIANT_ID="$monthly_id"

        read -p "Enter LEMONSQUEEZY_YEARLY_VARIANT_ID: " yearly_id
        npx supabase secrets set LEMONSQUEEZY_YEARLY_VARIANT_ID="$yearly_id"
    fi

    echo ""
    echo "Secrets configured for $project_name!"
    echo ""

    # Deploy functions
    read -p "Deploy Edge Functions now? [Y/n]: " deploy_now
    if [[ ! $deploy_now =~ ^[Nn]$ ]]; then
        echo "Deploying Edge Functions..."
        npx supabase functions deploy
        echo "Deployment complete!"
    fi
}

case $env_choice in
    1)
        configure_project "ggmgzozsqqjmehlrkkxq" "Development"
        ;;
    2)
        configure_project "flghyjbqpalhxjznfxcn" "Production"
        ;;
    3)
        configure_project "ggmgzozsqqjmehlrkkxq" "Development"
        configure_project "flghyjbqpalhxjznfxcn" "Production"
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "================================================"
echo "  Configuration Complete!                        "
echo "================================================"
echo ""
echo "Verify secrets with: npx supabase secrets list"
echo ""
