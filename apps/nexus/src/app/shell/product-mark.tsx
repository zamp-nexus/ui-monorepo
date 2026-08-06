import { useId } from 'react';

import { Link } from 'react-router-dom';

import { PRODUCT_NAME } from '../constants/product';

/**
 * The standalone product mark. Its fill follows the active product theme.
 */
export const ProductLogo = ({ className = 'h-9 w-9' }: { readonly className?: string }) => {
  const filterId = useId();

  return (
    <svg className={className} viewBox="0 0 368 368" aria-hidden="true">
      <defs>
        <filter id={filterId} colorInterpolationFilters="sRGB">
          <feColorMatrix in="SourceGraphic" type="luminanceToAlpha" result="luminance" />
          <feComponentTransfer in="luminance" result="invertedLuminance">
            <feFuncA type="table" tableValues="1 0" />
          </feComponentTransfer>
          <feComponentTransfer in="invertedLuminance" result="mark">
            <feFuncA type="gamma" amplitude="1.25" exponent="2.4" offset="-0.07" />
          </feComponentTransfer>
          <feFlood floodColor="currentColor" result="brandColor" />
          <feComposite in="brandColor" in2="mark" operator="in" />
        </filter>
      </defs>
      <image href="/nexus-mark-source.png" width="368" height="368" filter={`url(#${filterId})`} />
    </svg>
  );
};

/**
 * The product mark and wordmark together, and the only link back to the launcher.
 */
export const ProductMark = () => (
  <Link
    className="inline-flex items-center gap-2 text-primary no-underline"
    to="/"
    aria-label={`${PRODUCT_NAME} home`}
  >
    <ProductLogo className="h-10 w-10" />
    <span className="text-lg font-semibold tracking-[-0.025em] text-foreground">
      {PRODUCT_NAME}
    </span>
  </Link>
);
