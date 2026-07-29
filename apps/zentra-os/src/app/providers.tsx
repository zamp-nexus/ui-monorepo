import type { ReactNode } from 'react';

import { ClerkProvider } from '@clerk/clerk-react';

import { useAuth } from '@open-zentra/foundation-auth';
import { ClerkAuthProvider } from '@open-zentra/foundation-auth/clerk';
import { ClerkAuthzProvider } from '@open-zentra/foundation-authz/clerk';

interface AppProvidersProps {
  readonly children: ReactNode;
}

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

const AuthzBoundary = ({ children }: AppProvidersProps) => {
  const { scope } = useAuth();

  return <ClerkAuthzProvider scope={scope}>{children}</ClerkAuthzProvider>;
};

export const AppProviders = ({ children }: AppProvidersProps) => {
  if (!clerkPublishableKey) {
    return children;
  }

  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <ClerkAuthProvider>
        <AuthzBoundary>{children}</AuthzBoundary>
      </ClerkAuthProvider>
    </ClerkProvider>
  );
};
