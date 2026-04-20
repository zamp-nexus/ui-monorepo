import type { ReactNode } from 'react';

import { ClerkProvider } from '@clerk/clerk-react';

import { ClerkAuthProvider } from '@open-zentra/foundation-auth/clerk';

interface AppProvidersProps {
  readonly children: ReactNode;
}

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

export const AppProviders = ({ children }: AppProvidersProps) => {
  if (!clerkPublishableKey) {
    return <>{children}</>;
  }

  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <ClerkAuthProvider>{children}</ClerkAuthProvider>
    </ClerkProvider>
  );
};
