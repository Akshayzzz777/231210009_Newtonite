# Engineering Decisions

This document records the main implementation trade-offs in Newtonite.

## 1. Relational Domain Model

Users, teams, memberships, work items, approvals, comments, notifications, and activity records are represented as related PostgreSQL tables through Prisma. Membership has a unique `(userId, teamId)` pair, while work items reference their creator, owner, assignee, and team. This makes referential integrity and team-scoped queries explicit, at the cost of joins and migrations when the domain evolves.

## 2. Database-Backed Authorization

Authentication identifies a user with email/password credentials and stores the user ID and global role in a NextAuth JWT session. Team access and team roles are checked against `TeamMember` records; global administrators can cross team boundaries. This keeps team authorization tied to persisted membership rather than trusting a role or team ID supplied by the browser. The trade-off is that protected requests need membership lookups.

## 3. Versioned Writes and Append-Only Activity

Work-item updates carry a version, and writes use the expected version so concurrent edits cannot silently overwrite each other. Conflicts return `409` for a client to resolve. Mutations and their activity records are written in a database transaction; the activity log is append-only so audit history is not lost when the current work-item state changes. This adds transaction and version-handling code in exchange for consistent state and an explainable history.

## 4. Idempotent Work-Item Creation

Each logical create request carries a UUID idempotency key. PostgreSQL enforces uniqueness, and the server stores a hash of the normalized request so a retry can return the original item while key reuse with different input is rejected. The work item and its `CREATED` activity entry are committed together. A unique constraint is the concurrency authority, avoiding a pre-insert lookup on the normal create path. Keys are retained indefinitely with their work items because there is no cleanup policy yet.

## 5. Synchronous Persistence, Asynchronous Refresh

Creation and audit recording remain synchronous: the client only reports success after the database transaction commits. Refreshing the work-item list is started in the background so it does not delay that success feedback. The client blocks overlapping submissions and reuses the same idempotency key for a retry of unchanged form data. This keeps the interface responsive without making persisted writes fire-and-forget.