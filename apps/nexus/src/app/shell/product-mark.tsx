import { Link } from 'react-router-dom';

import { PRODUCT_NAME, PRODUCT_RELEASE_LABEL } from '../constants/product';

interface ProductMarkProps {
  /** Show the release line under the wordmark, as the navigation rail does. */
  readonly showRelease?: boolean;
  /** Render the initial alone, for a collapsed rail. */
  readonly compact?: boolean;
}

/**
 * The wordmark, and the only link back to the launcher.
 */
export const ProductMark = ({ showRelease = false, compact = false }: ProductMarkProps) => (
  <Link
    className="inline-flex flex-col gap-0.5 no-underline"
    to="/"
    aria-label={`${PRODUCT_NAME} home`}
  >
    <span className="text-lg font-semibold leading-none tracking-[-0.035em] text-foreground">
      {compact ? PRODUCT_NAME.charAt(0) : PRODUCT_NAME}
    </span>
    {showRelease && !compact ? (
      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-foreground-muted">
        {PRODUCT_RELEASE_LABEL}
      </span>
    ) : null}
  </Link>
);
