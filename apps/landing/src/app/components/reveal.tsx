import type { ReactNode } from 'react';

import { m } from 'motion/react';

export const Reveal = ({
  children,
  className,
  delay = 0,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly delay?: number;
}) => (
  <m.div
    className={className}
    initial={{ opacity: 0, y: 20, filter: 'blur(8px)' }}
    whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
    viewport={{ once: true, amount: 0.2 }}
    transition={{ duration: 0.65, delay, ease: [0.2, 0, 0, 1] }}
  >
    {children}
  </m.div>
);
