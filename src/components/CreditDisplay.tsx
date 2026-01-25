/**
 * CreditDisplay - Shows user's credit balance and usage
 */

import React, { useState } from 'react';
import { useUser, useCredits } from '../contexts/UserContext';
import { useTranslation } from 'react-i18next';
import './FeatureGate.css';

interface CreditDisplayProps {
  /** Show compact version */
  compact?: boolean;
  /** Show usage percentage bar */
  showProgress?: boolean;
  /** Click handler */
  onClick?: () => void;
}

export function CreditDisplay({
  compact = false,
  showProgress = false,
  onClick,
}: CreditDisplayProps) {
  const { t } = useTranslation();
  const { tier, isAuthenticated, refreshUser } = useUser();
  const { balance, limit } = useCredits();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Don't show for guests
  if (!isAuthenticated) {
    return null;
  }

  const handleClick = async () => {
    if (onClick) {
      onClick();
    } else {
      // Default: refresh credits
      setIsRefreshing(true);
      try {
        await refreshUser();
      } finally {
        setIsRefreshing(false);
      }
    }
  };

  const isLowCredits = balance < limit * 0.1; // Less than 10%
  const usagePercent = limit > 0 ? ((limit - balance) / limit) * 100 : 0;

  if (compact) {
    return (
      <div
        className={`credit-display ${isLowCredits ? 'low-credits' : ''} ${tier === 'pro' ? 'pro-badge' : ''} ${isRefreshing ? 'refreshing' : ''}`}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        title={t('credits.clickToRefresh', 'Click to refresh')}
        style={{ cursor: 'pointer' }}
      >
        <span className={`credit-display-icon ${isRefreshing ? 'spinning' : ''}`}>
          {isRefreshing ? '🔄' : '⚡'}
        </span>
        <span className="credit-display-amount">{balance.toLocaleString()}</span>
        {tier === 'pro' && <span className="pro-badge-inline">PRO</span>}
      </div>
    );
  }

  return (
    <div className="credit-display-full" onClick={onClick}>
      <div className="credit-display-header">
        <span className="credit-display-icon">⚡</span>
        <span className="credit-display-label">
          {t('credits.balance', 'Credits')}
        </span>
        {tier === 'pro' && <span className="pro-badge-inline">PRO</span>}
      </div>

      <div className="credit-display-amount-large">
        {balance.toLocaleString()}
        <span className="credit-display-limit">/ {limit.toLocaleString()}</span>
      </div>

      {showProgress && (
        <div className="credit-progress">
          <div
            className="credit-progress-bar"
            style={{ width: `${Math.min(usagePercent, 100)}%` }}
          />
        </div>
      )}

      {isLowCredits && (
        <div className="low-credits-warning">
          <span className="low-credits-warning-icon">⚠️</span>
          {t('credits.lowWarning', 'Running low on credits')}
        </div>
      )}
    </div>
  );
}

/**
 * UpgradeBanner - Promotional banner for upgrading to Pro
 */
interface UpgradeBannerProps {
  /** Dismiss handler */
  onDismiss?: () => void;
  /** Upgrade click handler */
  onUpgrade?: () => void;
}

export function UpgradeBanner({ onDismiss, onUpgrade }: UpgradeBannerProps) {
  const { t } = useTranslation();
  const { tier } = useUser();

  // Don't show for Pro users
  if (tier === 'pro') {
    return null;
  }

  const handleUpgrade = () => {
    if (onUpgrade) {
      onUpgrade();
    } else {
      window.dispatchEvent(new CustomEvent('open-upgrade-modal'));
    }
  };

  return (
    <div className="upgrade-banner">
      <div className="upgrade-banner-content">
        <span className="upgrade-banner-icon">🚀</span>
        <div className="upgrade-banner-text">
          <h4>{t('upgrade.bannerTitle', 'Upgrade to Pro')}</h4>
          <p>{t('upgrade.bannerSubtitle', 'Get 10,000 credits/month and unlock all features')}</p>
        </div>
      </div>
      <button className="btn-upgrade" onClick={handleUpgrade}>
        {t('upgrade.upgradeNow', 'Upgrade Now')}
      </button>
    </div>
  );
}

/**
 * CreditCost - Shows cost of an action in credits
 */
interface CreditCostProps {
  action: string;
  cost: number;
}

export function CreditCost({ action, cost }: CreditCostProps) {
  const { t } = useTranslation();

  return (
    <span className="credit-cost" title={t('credits.costTooltip', { action, cost })}>
      <span className="credit-cost-icon">⚡</span>
      <span className="credit-cost-amount">{cost}</span>
    </span>
  );
}

export default CreditDisplay;
