/**
 * FeatureGate - Component for gating features based on user tier
 */

import React, { ReactNode } from 'react';
import { useUser, UserTier } from '../contexts/UserContext';
import { useTranslation } from 'react-i18next';

interface FeatureGateProps {
  /** The feature being gated */
  feature: string;
  /** Minimum tier required to access this feature */
  requiredTier: UserTier;
  /** Content to show when user has access */
  children: ReactNode;
  /** Custom fallback content (optional) */
  fallback?: ReactNode;
  /** If true, show nothing instead of upgrade prompt when blocked */
  hideWhenBlocked?: boolean;
}

// Tier hierarchy for comparison
const TIER_LEVELS: Record<UserTier, number> = {
  guest: 0,
  free: 1,
  pro: 2,
};

/**
 * Check if user has access to a feature
 */
export function hasAccess(userTier: UserTier, requiredTier: UserTier): boolean {
  return TIER_LEVELS[userTier] >= TIER_LEVELS[requiredTier];
}

/**
 * FeatureGate component
 *
 * Usage:
 * ```tsx
 * <FeatureGate feature="cloud_sync" requiredTier="pro">
 *   <CloudSyncButton />
 * </FeatureGate>
 * ```
 */
export function FeatureGate({
  feature,
  requiredTier,
  children,
  fallback,
  hideWhenBlocked = false,
}: FeatureGateProps) {
  const { tier, isAuthenticated } = useUser();

  // Check if user has access
  if (hasAccess(tier, requiredTier)) {
    return <>{children}</>;
  }

  // Show nothing if hideWhenBlocked is true
  if (hideWhenBlocked) {
    return null;
  }

  // Show custom fallback if provided
  if (fallback) {
    return <>{fallback}</>;
  }

  // Show default upgrade prompt
  return (
    <UpgradePrompt
      feature={feature}
      requiredTier={requiredTier}
      isAuthenticated={isAuthenticated}
    />
  );
}

interface UpgradePromptProps {
  feature: string;
  requiredTier: UserTier;
  isAuthenticated: boolean;
  onUpgrade?: () => void;
  onSignUp?: () => void;
}

/**
 * Default upgrade prompt component
 */
export function UpgradePrompt({
  feature,
  requiredTier,
  isAuthenticated,
  onUpgrade,
  onSignUp,
}: UpgradePromptProps) {
  const { t } = useTranslation();

  const handleUpgrade = () => {
    if (onUpgrade) {
      onUpgrade();
    } else {
      // Default: open upgrade modal or navigate to pricing
      window.dispatchEvent(new CustomEvent('open-upgrade-modal', { detail: { feature } }));
    }
  };

  const handleSignUp = () => {
    if (onSignUp) {
      onSignUp();
    } else {
      // Default: open auth modal
      window.dispatchEvent(new CustomEvent('open-auth-modal'));
    }
  };

  return (
    <div className="feature-gate-prompt">
      <div className="feature-gate-icon">🔒</div>
      <div className="feature-gate-content">
        <h4>{t('upgrade.title', 'Unlock Feature')}</h4>
        <p>
          {requiredTier === 'pro'
            ? t('upgrade.proRequired', 'This feature requires a Pro subscription.')
            : t('upgrade.freeRequired', 'Sign up for free to access this feature.')
          }
        </p>
        <div className="feature-gate-actions">
          {!isAuthenticated ? (
            <button className="btn-primary" onClick={handleSignUp}>
              {t('upgrade.signUp', 'Sign Up Free')}
            </button>
          ) : requiredTier === 'pro' ? (
            <button className="btn-primary" onClick={handleUpgrade}>
              {t('upgrade.upgradeToPro', 'Upgrade to Pro')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Hook to check feature access
 *
 * Usage:
 * ```tsx
 * const canExport = useFeatureAccess('export', 'pro');
 * ```
 */
export function useFeatureAccess(feature: string, requiredTier: UserTier): boolean {
  const { tier } = useUser();
  return hasAccess(tier, requiredTier);
}

/**
 * Higher-order component for feature gating
 *
 * Usage:
 * ```tsx
 * const ProtectedCloudSync = withFeatureGate(CloudSync, 'cloud_sync', 'pro');
 * ```
 */
export function withFeatureGate<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  feature: string,
  requiredTier: UserTier
) {
  return function FeatureGatedComponent(props: P) {
    return (
      <FeatureGate feature={feature} requiredTier={requiredTier}>
        <WrappedComponent {...props} />
      </FeatureGate>
    );
  };
}

export default FeatureGate;
