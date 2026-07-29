# Keep identity-provider subjects outside domain identifiers

Users and Tenants have internal UUIDs, while Clerk user and organization IDs live in binding tables resolved at the authenticated API boundary. A User may hold Memberships in multiple Tenants, avoiding provider lock-in and matching the existing active-tenant switching behavior.
