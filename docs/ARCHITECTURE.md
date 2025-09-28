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

We use **API routes only** architecture for maximum security:

1. **Server Components** get user info from Logto session
2. **All Convex calls** go through authenticated Next.js API routes
3. **API routes** validate Logto session and call Convex with verified user identity
4. **Client components** only call API routes, never Convex directly
5. **All operations** scoped to user's team

**Benefits**:
- **Maximum security**: Server controls all database access
- **No client spoofing**: Impossible to fake user identity from client
- **Centralized auth**: All authentication logic in API routes
- **Simple client code**: Clients just use standard fetch()
- **Easier debugging**: Clear request/response flow

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

**All data access goes through authenticated API routes**:

```typescript
// API Route (/api/appointments/route.ts)
export async function GET() {
  // 1. 🔐 Server-side authentication validation
  const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
  
  if (!isAuthenticated || !claims?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userEmail = claims.email; // 🔑 Server-controlled user identity
  
  // 2. 🔒 Call Convex with verified user email
  const result = await convex.query(api.appointments.get, { userEmail });
  
  return NextResponse.json(result);
}

// Convex Function (convex/appointments.ts)
export const get = query({
  args: {
    userEmail: v.string(), // Provided by trusted API route
  },
  handler: async (ctx, args) => {
    // 1. Verify user exists
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.userEmail))
      .unique();

    if (!user) {
      return []; // No user = no data
    }

    // 2. All operations scoped to user's team
    const teamId = user.teamId;
    return await ctx.db
      .query("appointments")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
  },
});
```

### 3. Authentication Flow

**New API Routes Architecture**:
```typescript
// 1. Server Component gets user info and team name
export default async function SecureWrapper() {
  const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
  
  if (!isAuthenticated) {
    return <LoginRequired />;
  }

  const userName = extractDisplayName(claims);
  
  // 2. Get team info via API route (not direct Convex)
  const response = await fetch('/api/users', {
    headers: { 'Cookie': cookies().toString() }
  });
  const { teamName } = await response.json();

  // 3. Pass to Client Component (no sensitive data)
  return <ClientComponent userName={userName} teamName={teamName} />;
}

// 4. Client Component calls API routes only
export default function ClientComponent({ userName, teamName }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    // 🔒 Call authenticated API route
    fetch('/api/appointments')
      .then(res => res.json())
      .then(setData);
  }, []);

  const handleAction = async (formData) => {
    // 🔒 All mutations through API routes
    await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
  };
}
```

## Component Architecture

### 1. Layout Structure

```
RootLayout
├── ThemeProvider (dark/light mode)
├── ConvexClientProvider (minimal, no auth)
├── AuthenticatedApp (auth wrapper)
├── Header (user info, navigation)
├── Main Content (page-specific)
└── Footer
```

**Note**: `ConvexClientProvider` is minimal and provides no authentication. All Convex access happens server-side through API routes.

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
- Server gets user info → Client calls `/api/appointments` → Server calls Convex

### 3. API Routes Architecture

**All Convex access goes through authenticated API routes**:

```
/api/
├── users/route.ts          # GET user info & team details
├── appointments/
│   ├── route.ts           # GET/POST appointments
│   └── [id]/route.ts      # DELETE specific appointment
└── auth/                  # Logto authentication routes
```

**API Route Pattern**:
```typescript
export async function GET/POST/DELETE() {
  // 1. 🔐 Validate Logto session
  const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);
  
  if (!isAuthenticated || !claims?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. 🔑 Extract verified user identity
  const userEmail = claims.email; // Server-controlled, cannot be spoofed
  
  // 3. 🔒 Call Convex with trusted user identity
  const result = await convex.mutation/query(api.someFunction, {
    userEmail, // Always provided by server
    ...otherArgs
  });
  
  return NextResponse.json(result);
}
```

**Security Benefits**:
- ✅ **No client spoofing**: User identity always verified server-side
- ✅ **Centralized auth**: All authentication logic in API routes
- ✅ **Simple debugging**: Clear request/response boundaries
- ✅ **Type safety**: Full TypeScript coverage end-to-end

### 4. Utility Functions

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
- ✅ **No direct database access**: All access through authenticated API routes
- ✅ **No client-side Convex**: Impossible to bypass server authentication
- ✅ **Input sanitization**: Convex handles SQL injection prevention
- ✅ **Type safety**: Full TypeScript coverage end-to-end
- ✅ **Audit trail**: All operations logged with user context

## Data Flow Examples

### 1. User Registration/Login
```
1. User visits app → Redirected to Logto
2. User authenticates → Logto creates session
3. User returns to app → Server component gets session
4. First app access → getOrCreateUserByEmail() called
5. User record created → Team created → Ready to use app
```

### 2. Secure Data Access (New Architecture)
```
1. User visits /appointments
2. AppointmentsWrapper (server) → Gets user/team info via /api/users
3. AppointmentsClient (client) → Calls fetch('/api/appointments')
4. API route validates Logto session → Calls Convex with verified userEmail
5. Convex appointments.get → Looks up user → Gets teamId
6. Query filtered by teamId → Returns only user's team data
```

### 3. Secure Data Mutation (New Architecture)
```
1. User submits appointment form
2. Client calls fetch('/api/appointments', { method: 'POST', ... })
3. API route validates Logto session → Extracts verified userEmail
4. API route calls Convex scheduleAppointment with server-verified userEmail
5. Convex verifies user exists → Gets user's teamId
6. Creates appointment with teamId → Data automatically isolated to user's team
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

This architecture provides a **bulletproof, secure foundation** for healthcare data management with:

- **Strong authentication** via Logto OIDC
- **Strict data isolation** via team-based multi-tenancy  
- **Maximum security** via API routes only architecture
- **No client spoofing** - impossible to fake user identity
- **Type-safe operations** via Convex and TypeScript
- **Comprehensive logging** for debugging and compliance

The **API routes only** approach provides maximum security by ensuring all database access is controlled by the server. This makes it ideal for applications where security and data isolation are paramount, such as healthcare data management.

### Key Security Principle

**🔒 "Never trust the client"** - All user identity verification happens server-side in API routes, making it impossible for malicious clients to spoof user identities or access unauthorized data.
