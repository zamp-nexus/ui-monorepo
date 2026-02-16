/**
 * Banner.Title sub-component
 * @module components/banner
 */
import React from 'react';

import { useTheme } from '../../theme';
import type { BannerTitleProps } from './banner';
import { bannerDefaultTheme } from './banner';
import { useBannerContext } from './banner.context';

/**
 * Banner.Title component
 *
 * Title text for the banner. Uses context to provide proper ARIA labeling.
 */
export const BannerTitle: React.FC<BannerTitleProps> = ({ children, className, oiid }) => {
  const theme = useTheme('banner', bannerDefaultTheme);
  const { titleId, variant } = useBannerContext();

  return (
    <div
      id={titleId}
      className={theme.title?.({ className, variant }) ?? className}
      data-oiid={oiid}
      data-slot="title"
    >
      {children}
    </div>
  );
};

BannerTitle.displayName = 'Banner.Title';
