# ADR 001: SQLite as Authoritative Transactional Store

## Context
LÓGOS AI previously used a hybrid persistence model: flat JSON files (`sessions/`, `personas.json`, `relationships.json`) loaded into memory at boot and periodically written back, with parallel "fire-and-forget" dual writes to an SQLite database for querying. This model caused inconsistencies, lost data during abrupt shutdowns, failed to guarantee atomicity for complex operations, and allowed derived vector indexes to drift from the source text.

## Decision
We will use **SQLite** as the single authoritative, transactional data store for the application's runtime state. JSON files will be completely deprecated as a runtime storage mechanism and retained only for optional manual import/export mechanisms. 

Additionally:
- **Migrations:** We will use versioned schema migrations managed by a ledger table.
- **Data Integrity:** `PRAGMA foreign_keys = ON;` will be enforced globally to guarantee referential integrity.
- **Vector Index Synchronization:** Derived indexes (e.g. Chroma/MemPalace vector DB) will no longer be updated inline with the primary transaction. Instead, an Outbox pattern (`VectorIndexOutbox`) will track pending indexing jobs, ensuring that the primary write succeeds quickly and derived indexes are eventually consistent without data loss.
- **Encryption:** Rely on OS-level file system encryption for data at rest.

## Consequences
### Positive
- **Atomicity:** We can perform multi-table updates (e.g. creating a message and updating relationships) safely.
- **Consistency:** No more drift between RAM state and disk state. What is read is what is stored.
- **Resilience:** Power failures or application crashes will no longer corrupt the flat files (thanks to SQLite WAL and transactions).
- **Scale:** Memory usage will drop since we no longer need to keep all chats in RAM.

### Negative
- **Opaque Storage:** Users can no longer simply open a `session.json` file in a text editor to view or modify their chat history; they must use the UI or an SQLite browser.
- **Migration Effort:** A one-time migration step is required for existing users to convert their JSON state into SQLite.
