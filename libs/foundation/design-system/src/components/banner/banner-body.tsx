/**
 * Banner.Body sub-component
 * @module components/banner
 */
import React from 'react';

import { useTheme } from '../../theme';
import type { BannerBodyProps } from './banner';
import { bannerDefaultTheme } from './banner';

/**
 * Banner.Body component
 *
 * Container for custom body content in the banner
 */
export const BannerBody: React.FC<BannerBodyProps> = ({
  children,
  className,
  oiid,
}) => {
  const theme = useTheme('banner', bannerDefaultTheme);

  return (
    <div
      className={theme.body?.({ className }) ?? className}
      data-oiid={oiid}
      data-slot="body"
    >
      {children}
    </div>
  );
};

BannerBody.displayName = 'Banner.Body';
