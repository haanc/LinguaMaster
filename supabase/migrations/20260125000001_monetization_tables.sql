-- LinguaMaster Monetization Tables
-- Migration: 20260125000001
-- Description: Create user profiles, subscriptions, credits, devices, and referrals tables

-- Enable UUID extension if not already enabled
create extension if not exists "uuid-ossp";

-- ============================================================================
-- 1. User Profiles (extends auth.users)
-- ============================================================================
create table if not exists public.user_profiles (
  id uuid references auth.users on delete cascade primary key,
  tier text not null default 'free' check (tier in ('guest', 'free', 'pro')),
  credits_balance int not null default 500,
  credits_monthly_limit int not null default 500,
  credits_reset_at timestamptz default (date_trunc('month', now()) + interval '1 month'),
  referral_code text unique,
  referred_by uuid references public.user_profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Auto-generate referral code on insert
create or replace function generate_referral_code()
returns trigger as $$
begin
  if new.referral_code is null then
    new.referral_code := upper(substr(md5(new.id::text || now()::text), 1, 8));
  end if;
  return new;
end;
$$ language plpgsql;

create trigger set_referral_code
  before insert on public.user_profiles
  for each row execute function generate_referral_code();

-- Auto-create profile when user signs up
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.user_profiles (id)
  values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function update_updated_at_column();

-- ============================================================================
-- 2. Subscriptions (LemonSqueezy integration)
-- ============================================================================
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.user_profiles(id) on delete cascade not null,
  lemon_subscription_id text unique,
  lemon_customer_id text,
  lemon_order_id text,
  lemon_product_id text,
  lemon_variant_id text,
  plan text not null check (plan in ('monthly', 'yearly')),
  status text not null default 'active' check (status in ('active', 'cancelled', 'expired', 'past_due', 'paused', 'unpaid')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  cancelled_at timestamptz,
  ends_at timestamptz,
  trial_ends_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger update_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function update_updated_at_column();

-- Index for quick user lookup
create index idx_subscriptions_user_id on public.subscriptions(user_id);
create index idx_subscriptions_lemon_id on public.subscriptions(lemon_subscription_id);

-- ============================================================================
-- 3. Credit Logs (usage tracking)
-- ============================================================================
create table if not exists public.credit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.user_profiles(id) on delete cascade not null,
  amount int not null,
  balance_after int not null,
  action text not null check (action in (
    'word_lookup',
    'ai_explain',
    'ai_tutor',
    'whisper',
    'translate',
    'referral_bonus',
    'monthly_reset',
    'purchase',
    'admin_adjustment'
  )),
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- Indexes for analytics and user history
create index idx_credit_logs_user_id on public.credit_logs(user_id);
create index idx_credit_logs_created_at on public.credit_logs(created_at);
create index idx_credit_logs_action on public.credit_logs(action);

-- ============================================================================
-- 4. Devices (multi-device management)
-- ============================================================================
create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.user_profiles(id) on delete cascade not null,
  device_name text not null,
  device_fingerprint text not null,
  platform text check (platform in ('windows', 'macos', 'linux', 'web', 'ios', 'android')),
  app_version text,
  is_active boolean default true,
  last_active_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Unique constraint: one fingerprint per user
create unique index idx_devices_user_fingerprint on public.devices(user_id, device_fingerprint);
create index idx_devices_user_id on public.devices(user_id);

-- ============================================================================
-- 5. Referrals (invite system)
-- ============================================================================
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid references public.user_profiles(id) on delete cascade not null,
  referred_id uuid references public.user_profiles(id) on delete cascade not null unique,
  referrer_credits_awarded int default 100,
  referred_credits_awarded int default 100,
  status text default 'completed' check (status in ('pending', 'completed', 'expired')),
  created_at timestamptz default now()
);

create index idx_referrals_referrer_id on public.referrals(referrer_id);

-- ============================================================================
-- 6. Credit Purchases (one-time top-ups)
-- ============================================================================
create table if not exists public.credit_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.user_profiles(id) on delete cascade not null,
  lemon_order_id text unique,
  amount_usd numeric(10, 2) not null,
  credits_amount int not null,
  status text default 'completed' check (status in ('pending', 'completed', 'refunded')),
  created_at timestamptz default now()
);

create index idx_credit_purchases_user_id on public.credit_purchases(user_id);

-- ============================================================================
-- 7. Row Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS on all tables
alter table public.user_profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.credit_logs enable row level security;
alter table public.devices enable row level security;
alter table public.referrals enable row level security;
alter table public.credit_purchases enable row level security;

-- User Profiles: users can only read/update their own profile
create policy "Users can view own profile"
  on public.user_profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.user_profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Subscriptions: users can only view their own subscriptions
create policy "Users can view own subscriptions"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Credit Logs: users can only view their own logs
create policy "Users can view own credit logs"
  on public.credit_logs for select
  using (auth.uid() = user_id);

-- Devices: users can view/manage their own devices
create policy "Users can view own devices"
  on public.devices for select
  using (auth.uid() = user_id);

create policy "Users can insert own devices"
  on public.devices for insert
  with check (auth.uid() = user_id);

create policy "Users can update own devices"
  on public.devices for update
  using (auth.uid() = user_id);

create policy "Users can delete own devices"
  on public.devices for delete
  using (auth.uid() = user_id);

-- Referrals: users can view referrals they made or received
create policy "Users can view own referrals"
  on public.referrals for select
  using (auth.uid() = referrer_id or auth.uid() = referred_id);

-- Credit Purchases: users can only view their own purchases
create policy "Users can view own purchases"
  on public.credit_purchases for select
  using (auth.uid() = user_id);

-- ============================================================================
-- 8. Functions for Credit Management
-- ============================================================================

-- Function to deduct credits
create or replace function deduct_credits(
  p_user_id uuid,
  p_amount int,
  p_action text,
  p_metadata jsonb default '{}'
)
returns table (success boolean, new_balance int, error_message text)
language plpgsql
security definer
as $$
declare
  v_current_balance int;
  v_new_balance int;
begin
  -- Lock the user row for update
  select credits_balance into v_current_balance
  from public.user_profiles
  where id = p_user_id
  for update;

  if v_current_balance is null then
    return query select false, 0, 'User not found'::text;
    return;
  end if;

  if v_current_balance < p_amount then
    return query select false, v_current_balance, 'Insufficient credits'::text;
    return;
  end if;

  v_new_balance := v_current_balance - p_amount;

  -- Update balance
  update public.user_profiles
  set credits_balance = v_new_balance, updated_at = now()
  where id = p_user_id;

  -- Log the transaction
  insert into public.credit_logs (user_id, amount, balance_after, action, metadata)
  values (p_user_id, -p_amount, v_new_balance, p_action, p_metadata);

  return query select true, v_new_balance, null::text;
end;
$$;

-- Function to add credits
create or replace function add_credits(
  p_user_id uuid,
  p_amount int,
  p_action text,
  p_metadata jsonb default '{}'
)
returns table (success boolean, new_balance int)
language plpgsql
security definer
as $$
declare
  v_new_balance int;
begin
  update public.user_profiles
  set credits_balance = credits_balance + p_amount, updated_at = now()
  where id = p_user_id
  returning credits_balance into v_new_balance;

  if v_new_balance is null then
    return query select false, 0;
    return;
  end if;

  -- Log the transaction
  insert into public.credit_logs (user_id, amount, balance_after, action, metadata)
  values (p_user_id, p_amount, v_new_balance, p_action, p_metadata);

  return query select true, v_new_balance;
end;
$$;

-- Function to reset monthly credits
create or replace function reset_monthly_credits()
returns void
language plpgsql
security definer
as $$
begin
  -- Reset credits for users whose reset date has passed
  update public.user_profiles
  set
    credits_balance = credits_monthly_limit,
    credits_reset_at = date_trunc('month', now()) + interval '1 month',
    updated_at = now()
  where credits_reset_at <= now();

  -- Log the resets
  insert into public.credit_logs (user_id, amount, balance_after, action, metadata)
  select
    id,
    credits_monthly_limit - credits_balance,
    credits_monthly_limit,
    'monthly_reset',
    jsonb_build_object('reset_at', now())
  from public.user_profiles
  where credits_reset_at > now() - interval '1 minute'
    and credits_reset_at <= now();
end;
$$;

-- Function to upgrade user to Pro
create or replace function upgrade_to_pro(p_user_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update public.user_profiles
  set
    tier = 'pro',
    credits_monthly_limit = 10000,
    credits_balance = greatest(credits_balance, 10000),
    updated_at = now()
  where id = p_user_id;
end;
$$;

-- Function to downgrade user to Free
create or replace function downgrade_to_free(p_user_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update public.user_profiles
  set
    tier = 'free',
    credits_monthly_limit = 500,
    -- Keep current balance, will reset at next period
    updated_at = now()
  where id = p_user_id;
end;
$$;

-- Function to process referral
create or replace function process_referral(
  p_referred_id uuid,
  p_referral_code text
)
returns table (success boolean, message text)
language plpgsql
security definer
as $$
declare
  v_referrer_id uuid;
begin
  -- Find referrer by code
  select id into v_referrer_id
  from public.user_profiles
  where referral_code = upper(p_referral_code);

  if v_referrer_id is null then
    return query select false, 'Invalid referral code'::text;
    return;
  end if;

  if v_referrer_id = p_referred_id then
    return query select false, 'Cannot refer yourself'::text;
    return;
  end if;

  -- Check if already referred
  if exists (select 1 from public.referrals where referred_id = p_referred_id) then
    return query select false, 'Already used a referral code'::text;
    return;
  end if;

  -- Create referral record
  insert into public.referrals (referrer_id, referred_id)
  values (v_referrer_id, p_referred_id);

  -- Award credits to both
  perform add_credits(v_referrer_id, 100, 'referral_bonus',
    jsonb_build_object('referred_user_id', p_referred_id));
  perform add_credits(p_referred_id, 100, 'referral_bonus',
    jsonb_build_object('referrer_id', v_referrer_id));

  -- Update referred_by
  update public.user_profiles
  set referred_by = v_referrer_id
  where id = p_referred_id;

  return query select true, 'Referral processed successfully'::text;
end;
$$;

-- ============================================================================
-- 9. Scheduled Job for Monthly Reset (requires pg_cron extension)
-- ============================================================================
-- Note: Enable pg_cron in Supabase Dashboard > Database > Extensions
-- Then run:
-- select cron.schedule('reset-monthly-credits', '0 0 1 * *', 'select reset_monthly_credits()');

-- ============================================================================
-- 10. Comments for documentation
-- ============================================================================
comment on table public.user_profiles is 'User profiles extending Supabase auth, storing tier and credits';
comment on table public.subscriptions is 'LemonSqueezy subscription records';
comment on table public.credit_logs is 'All credit transactions for auditing';
comment on table public.devices is 'Registered devices per user for multi-device limits';
comment on table public.referrals is 'Referral relationships and bonus tracking';
comment on table public.credit_purchases is 'One-time credit top-up purchases';
