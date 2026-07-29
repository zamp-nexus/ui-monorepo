# ZentraOS Domain

ZentraOS turns recurring business-metric questions into investigations whose claims can be verified and replayed.

## Tenancy and identity

**Tenant**:
A customer organization whose data, policies, costs, and investigations are isolated from every other customer.
_Avoid_: Account, Clerk organization

**User**:
A human identity that may participate in more than one Tenant.
_Avoid_: Tenant user, account

**Membership**:
The relationship granting a User one role—owner, admin, member, or viewer—inside a Tenant.
_Avoid_: User role, guest membership

## Investigation

**Investigation**:
One attempt to answer a specific business question using governed metrics and traceable evidence.
_Avoid_: Chat, query, run

**Investigation Replay**:
The ordered record that explains how an Investigation moved from its question to each claim and decision.
_Avoid_: Logs, reasoning dump

## Trust and semantics

**Human Approval**:
A blocking decision by a User that grants, rejects, or modifies work that cannot proceed autonomously.
_Avoid_: Agent approval, confirmation

**Audit Entry**:
An immutable, tenant-scoped fact about an investigation step containing process metadata and artifact references, never raw customer data.
_Avoid_: Log line, prompt record

**Semantic Metric**:
A governed business measure with one agreed definition and grain for a Tenant.
_Avoid_: Calculated field, raw SQL metric
