# Persist four tenant membership roles

Membership uses owner, admin, member, and viewer as the canonical role vocabulary. Guest represents an unaffiliated or denied identity rather than a persisted Membership, preventing frontend and backend authorization from assigning different meanings to the same Tenant relationship.
