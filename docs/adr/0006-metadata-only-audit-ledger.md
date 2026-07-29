# Keep customer values out of the immutable audit ledger

Audit Entries contain process metadata, hashes, typed outcomes, and `artifact://` references but never prompts, raw query results, credentials, or uploaded values. This preserves replay and accountability while allowing referenced customer data to expire or be deleted under the Tenant's data-processing agreement.
