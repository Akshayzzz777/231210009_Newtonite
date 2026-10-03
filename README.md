# Newtonite

Newtonite is a team work-management application built with Next.js, PostgreSQL, Prisma, and NextAuth. It supports team-scoped work items, ownership and assignment, approvals, comments, activity history, and role-based access.

## Requirements

- Node.js 20.9 or newer
- npm
- PostgreSQL 15 or newer, either local or hosted

## Local Setup

1. Install dependencies:

	```bash
	npm install
	```

2. Create `.env` from the template:

	```powershell
	Copy-Item .env.example .env
	```

	Set `DATABASE_URL` to a PostgreSQL connection string and replace `NEXTAUTH_SECRET` with a randomly generated value. Generate one with:

	```bash
	node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
	```

	`NEXTAUTH_URL` should be `http://localhost:3000` for local development.

	For a local database, start the included PostgreSQL container with `docker compose up -d db`. The development-only connection string is:

	```text
	postgresql://prisma:prismapassword@localhost:5432/newtonite_challenge?schema=public
	```

	These credentials are only for the local Compose database. Do not use them in a deployed environment.

3. Apply migrations and optionally load demo data:

	```bash
	npx prisma migrate deploy
	npx prisma db seed
	```

	The seed script is repeatable and creates demo users, teams, memberships, work items, approvals, comments, activity, and notifications. For local testing, the seeded users share the password `Password123!`; do not use these accounts or passwords in production.

4. Start the development server:

	```bash
	npm run dev
	```

5. Open [http://localhost:3000](http://localhost:3000) and sign in with a seeded email/password or register a new account.

For hosted PostgreSQL, configure `DATABASE_URL` in the environment. For schema changes, `DATABASE_URL_UNPOOLED` can optionally provide a direct, non-pooled connection for Prisma migrations.

## Useful Commands

```bash
npm run dev         # Development server
npm run build       # Generate Prisma Client and build for production
npm start           # Serve a previous production build
npm run lint        # ESLint
npm run typecheck   # TypeScript check
npm test            # Vitest suite
npx prisma db seed  # Load repeatable demo data
```

Run `npm run build` before `npm start`. To use seeded or existing data with a new checkout, apply migrations before starting the app.

## Tests

The Vitest suite covers authorization rules, workflow transitions, approval and comment APIs, work-item updates, optimistic concurrency conflicts, concurrent claims, and idempotent work-item creation. Run all tests with `npm test`.

## Known Limitations

- Automated coverage is unit and API-route focused; there is no browser end-to-end suite.
- Authentication supports email/password only. Email verification, password recovery, MFA, and external identity providers are not implemented.
- Newly registered users are not automatically added to a team; team membership must be managed separately.
- Idempotency keys are retained with work items and have no expiry or cleanup policy. API clients must send a UUID `Idempotency-Key` for each logical create operation and reuse it only when retrying that same operation.
- The seed file contains fixed demo accounts and a shared demo password; it is for development data only.

## Project Documents

- [Engineering decisions](ENGINEERING_DECISIONS.md)
