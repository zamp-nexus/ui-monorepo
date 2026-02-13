/**
 * Banner.Description sub-component
 * @module components/banner
 */
import React from 'react';

import { useTheme } from '../../theme';
import { useBannerContext } from './banner.context';
import type { BannerDescriptionProps } from './banner';
import { bannerDefaultTheme } from './banner';

/**
 * Banner.Description component
 *
 * Description text for the banner. Uses context to provide proper ARIA description.
 */
export const BannerDescription: React.FC<BannerDescriptionProps> = ({
  children,
  className,
  oiid,
}) => {
  const theme = useTheme('banner', bannerDefaultTheme);
  const { descriptionId, variant } = useBannerContext();

  return (
    <p
      id={descriptionId}
      className={theme.description?.({ className, variant }) ?? className}
      data-oiid={oiid}
      data-slot="description"
    >
      {children}
    </p>
  );
};

BannerDescription.displayName = 'Banner.Description';
