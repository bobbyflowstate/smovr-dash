# Smovr Dashboard - Architecture & Security Model

## Overview

Smovr Dashboard is a secure, multi-tenant healthcare data management application built with Next.js, Logto authentication, and Convex database. The architecture implements **app-layer authentication** with strict data isolation between teams.

## Tech Stack

- **Frontend**: Next.js 14 with TypeScript, React, Tailwind CSS
- **Authentication**: Logto (OpenID Connect provider)
- **Database**: Convex (serverless database with real-time capabilities)
- **Architecture Pattern**: Server Components + Client Components with app-layer security

## Authentication Architecture

### 1. Logto Integration

**Configuration** (`src/app/logto.ts`):
```typescript
export const logtoConfig: LogtoNextConfig = {
  appId: process.env.LOGTO_APP_ID!,
  appSecret: process.env.LOGTO_APP_SECRET!,
  endpoint: process.env.LOGTO_ENDPOINT!,
  baseUrl: process.env.LOGTO_BASE_URL || 'http://localhost:3000',
  cookieSecret: process.env.LOGTO_COOKIE_SECRET!,
  cookieSecure: process.env.NODE_ENV === 'production',
  scopes: ['openid', 'profile', 'email'], // Essential for getting user email
};
```

**Key Features**:
- OIDC-compliant authentication
- Secure cookie-based session management
- Email scope for user identification
- Server-side session validation

### 2. App-Layer Authentication Pattern

Instead of JWT token validation, we use **app-layer authentication**:

1. **Server Components** get user info from Logto session
2. **User identification** passed as parameters to Convex operations
3. **Database lookups** verify user exists and get team context
4. **All operations** scoped to user's team

**Benefits**:
- Simpler than JWT validation
- More reliable session management
- Clear separation of concerns
- Easier debugging and maintenance

## Security Model

### 1. Multi-Tenant Data Isolation

**Schema Design** (`convex/schema.ts`):
```typescript
users: defineTable({
  name: v.string(),
  email: v.string(),           // Primary identifier from Logto
  tokenIdentifier: v.string(), // Logto user ID for reference
  teamId: v.id("teams"),       // Team association
})
.index("by_email", ["email"])  // Fast user lookups

teams: defineTable({
  name: v.string(),
})

patients: defineTable({
  // ... patient fields
  teamId: v.id("teams"),       // Team isolation
})
.index("by_team", ["teamId"])  // Team-scoped queries

appointments: defineTable({
  // ... appointment fields
  teamId: v.id("teams"),       // Team isolation
})
.index("by_team", ["teamId"])  // Team-scoped queries
```

**Isolation Guarantees**:
- Every data table includes `teamId`
- All queries filtered by team
- Users can only access their team's data
- Automatic team creation for new users

### 2. Secure Data Access Pattern

**Every Convex operation follows this pattern**:

```typescript
export const secureOperation = mutation({
  args: {
    // ... operation args
    userEmail: v.string(), // Required: user identification
  },
  handler: async (ctx, args) => {
    // 1. Verify user exists
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.userEmail))
      .unique();

    if (!user) {
      throw new Error("User not found in database.");
    }

    // 2. Get team context
    const teamId = user.teamId;

    // 3. All operations scoped to team
    const data = await ctx.db
      .query("someTable")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();

    // 4. Team validation for writes
    await ctx.db.insert("someTable", {
      // ... data
      teamId, // Always include team
    });
  },
});
```

### 3. Authentication Flow

**Server Component Pattern**:
```typescript
// 1. Server Component gets user info
export default async function SecureWrapper() {
  const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
  
  if (!isAuthenticated) {
    return <LoginRequired />;
  }

  const userEmail = claims.email;
  const userName = extractDisplayName(claims);

  // 2. Pass to Client Component
  return <ClientComponent userEmail={userEmail} userName={userName} />;
}

// 3. Client Component uses Convex with user context
export default function ClientComponent({ userEmail }) {
  const data = useQuery(api.someQuery, { userEmail });
  const mutation = useMutation(api.someMutation);

  const handleAction = () => {
    mutation({ userEmail, ...otherArgs });
  };
}
```

## Component Architecture

### 1. Layout Structure

```
RootLayout
├── ThemeProvider (dark/light mode)
├── ConvexClientProvider (database client)
├── AuthenticatedApp (auth wrapper)
├── Header (user info, navigation)
├── Main Content (page-specific)
└── Footer
```

### 2. Page Structure Pattern

Each secure page follows this pattern:

```
/secure-page/
├── page.tsx (imports wrapper)
├── SecureWrapper.tsx (server component, auth check)
└── ClientComponent.tsx (client component, UI logic)
```

**Example**: Submit Form
- `page.tsx` → `SubmitFormWrapper.tsx` → `SubmitForm.tsx`
- Server gets user info → Client handles form logic

### 3. Utility Functions

**Authentication Utilities** (`src/lib/auth-utils.ts`):
- `extractDisplayName()`: Smart name extraction from email
- `getUserIdentifier()`: Consistent user identification

## Security Guarantees

### 1. Authentication Security
- ✅ **Server-side session validation**: All auth checks on server
- ✅ **Secure cookie storage**: HttpOnly, Secure flags in production
- ✅ **CSRF protection**: Built into Logto's OIDC flow
- ✅ **Session timeout**: Configurable session expiration

### 2. Authorization Security
- ✅ **Team-based isolation**: Users can only access their team's data
- ✅ **Parameter validation**: All inputs validated with Convex schemas
- ✅ **User verification**: Every operation verifies user exists
- ✅ **Team verification**: All data operations scoped to user's team

### 3. Data Security
- ✅ **No direct database access**: All access through Convex functions
- ✅ **Input sanitization**: Convex handles SQL injection prevention
- ✅ **Type safety**: Full TypeScript coverage
- ✅ **Audit trail**: All operations logged

## Data Flow Examples

### 1. User Registration/Login
```
1. User visits app → Redirected to Logto
2. User authenticates → Logto creates session
3. User returns to app → Server component gets session
4. First app access → getOrCreateUserByEmail() called
5. User record created → Team created → Ready to use app
```

### 2. Secure Data Access
```
1. User visits /appointments
2. AppointmentsWrapper (server) → Gets user email from Logto
3. AppointmentsClient (client) → Calls useQuery with userEmail
4. Convex appointments.get → Looks up user → Gets teamId
5. Query filtered by teamId → Returns only user's team data
```

### 3. Secure Data Mutation
```
1. User submits appointment form
2. Client calls mutation with userEmail parameter
3. Convex scheduleAppointment → Verifies user exists
4. Gets user's teamId → Creates appointment with teamId
5. Data automatically isolated to user's team
```

## Error Handling & Logging

### 1. Authentication Errors
- **Not authenticated**: Clear login prompts
- **User not found**: Automatic user creation
- **Session expired**: Redirect to login

### 2. Authorization Errors
- **Team access denied**: Clear error messages
- **Invalid operations**: Detailed error logging

### 3. Debugging Support
- **Comprehensive logging**: All auth operations logged
- **User context tracking**: Email/team info in all logs
- **Error boundaries**: Graceful error handling

## Deployment Security

### 1. Environment Variables
```bash
# Logto Configuration
LOGTO_APP_ID=your_app_id
LOGTO_APP_SECRET=your_app_secret
LOGTO_ENDPOINT=https://your-domain.logto.app
LOGTO_BASE_URL=https://your-app.com
LOGTO_COOKIE_SECRET=secure_random_string

# Convex Configuration
NEXT_PUBLIC_CONVEX_URL=https://your-convex-deployment.convex.cloud
```

### 2. Production Considerations
- ✅ **HTTPS enforcement**: All cookies marked secure
- ✅ **Environment separation**: Dev/staging/prod isolation
- ✅ **Secret management**: Secure environment variable handling
- ✅ **CORS configuration**: Proper origin restrictions

## Future Enhancements

### 1. Enhanced Security
- [ ] Rate limiting on mutations
- [ ] Advanced audit logging
- [ ] Role-based permissions within teams
- [ ] API key authentication for webhooks

### 2. Scalability
- [ ] Team invitation system
- [ ] Multi-team user support
- [ ] Advanced team management
- [ ] Data export/import capabilities

## Conclusion

This architecture provides a secure, scalable foundation for healthcare data management with:

- **Strong authentication** via Logto OIDC
- **Strict data isolation** via team-based multi-tenancy
- **Simple security model** via app-layer authentication
- **Type-safe operations** via Convex and TypeScript
- **Comprehensive logging** for debugging and compliance

The app-layer authentication approach trades some complexity for reliability and maintainability, making it ideal for applications where security and data isolation are paramount.
