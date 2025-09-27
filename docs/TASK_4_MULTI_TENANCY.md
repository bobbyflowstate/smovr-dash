# Task Spec: Implement Multi-Tenancy with Teams

## 1. Task

Refactor the application to support multi-tenancy, where all data is scoped to a team. Each user will belong to a team, and will only be able to see and manage data associated with their team.

## 2. Objective

To ensure data isolation between different teams and to lay the groundwork for future team-based features. By default, every new user will be assigned to their own unique team.

## 3. Key Steps: Schema

1.  **Update `convex/schema.ts`:**
    *   **`users` table:** Create a new table to store user information.
        *   `name`: `v.string()`
        *   `email`: `v.string()`
        *   `tokenIdentifier`: `v.string()` - This will store the unique user ID from the Logto authentication token (e.g., the `sub` claim). This will be used to link the Convex user to the Logto user.
        *   `teamId`: `v.id("teams")`
        *   Add an index on `tokenIdentifier` for efficient user lookups: `.index("by_token", ["tokenIdentifier"])`

    *   **`teams` table:** Create a new table to represent teams.
        *   `name`: `v.string()` (e.g., "Team A's Team")

    *   **Update `patients` and `appointments` tables:**
        *   Add a `teamId`: `v.id("teams")` field to both the `patients` and `appointments` tables.
        *   Add an index on `teamId` to both tables for efficient querying: `.index("by_team", ["teamId"])`

## 4. Key Steps: Logic

1.  **Configure Convex Authentication:**
    *   In the Convex dashboard, configure a new JWT authentication provider for Logto.
    *   You will need to provide the JWT issuer URL and audience from your Logto application settings.

2.  **Create User and Team on First Login:**
    *   Create a new mutation, e.g., `getOrCreateUser`.
    *   This mutation will be called from the client-side after a user logs in.
    *   It will use `ctx.auth.getUserIdentity()` to get the logged-in user's information from the Logto token.
    *   It will then query the `users` table to see if a user with that `tokenIdentifier` already exists.
    *   If the user does not exist, it will:
        1.  Create a new team in the `teams` table.
        2.  Create a new user in the `users` table, associating them with the new team.

3.  **Update All Queries and Mutations:**
    *   All queries and mutations that access the database will need to be updated to be team-aware.
    *   This will involve:
        1.  Getting the user's identity from `ctx.auth`.
        2.  Querying the `users` table to get the user's `teamId`.
        3.  Adding a `.withIndex("by_team", (q) => q.eq("teamId", teamId))` filter to all database queries.
        4.  Adding the `teamId` to all `db.insert()` operations.

    *   **Specific mutations/queries to update:**
        *   `scheduleAppointment`: Add `teamId` when creating new patients and appointments.
        *   `get` appointments: Only fetch appointments for the user's team.
        *   `cancel` appointment: Only allow cancellation of appointments within the user's team.

## 5. Deliverables

*   An updated `convex/schema.ts` with the new tables and fields for multi-tenancy.
*   A new Convex mutation for getting or creating a user and their default team.
*   Updated queries and mutations for `patients` and `appointments` that are scoped by team.
*   A secure, multi-tenant application where data is isolated between teams.
