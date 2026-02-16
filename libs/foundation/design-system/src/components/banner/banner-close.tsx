/**
 * Banner.Close sub-component
 * @module components/banner
 */
import React from 'react';

import { Icon } from '@open-insights-web/foundation-icons';

import { useTheme } from '../../theme';
import type { BannerCloseProps } from './banner';
import { bannerDefaultTheme } from './banner';
import { useBannerContext } from './banner.context';

/**
 * Banner.Close component
 *
 * Close button for dismissible banners. Uses context to access dismiss handler.
 */
export const BannerClose: React.FC<BannerCloseProps> = ({ className, oiid }) => {
  const theme = useTheme('banner', bannerDefaultTheme);
  const { variant, onDismiss } = useBannerContext();

  if (!onDismiss) {
    return null;
  }

  return (
    <button
      type="button"
      className={theme.close?.({ className, variant }) ?? className}
      onClick={onDismiss}
      aria-label="Dismiss banner"
      data-oiid={oiid}
      data-slot="close"
    >
      <Icon name="x" size="sm" />
    </button>
  );
};

BannerClose.displayName = 'Banner.Close';
