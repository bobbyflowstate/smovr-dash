import { NextResponse } from "next/server";
import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";
import { jwtVerify } from "jose";

const isSignInPage = createRouteMatcher(["/sign-in"]);
const isProtectedRoute = createRouteMatcher([
  "/appointments(.*)",
  "/patients(.*)",
  "/messages(.*)",
  "/submit(.*)",
  "/audit-logs(.*)",
]);

const isOpsRoute = createRouteMatcher(["/ops(.*)"]);
const isOpsLoginRoute = createRouteMatcher(["/ops/login"]);
const isOpsApiRoute = createRouteMatcher(["/api/ops(.*)"]);
const isOpsAuthApiRoute = createRouteMatcher(["/api/ops/auth(.*)"]);

async function verifyOpsToken(token: string): Promise<boolean> {
  const secret = process.env.OPS_JWT_SECRET;
  if (!secret) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
    });
    return true;
  } catch {
    return false;
  }
}

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  // Ops API routes (except auth endpoints) require ops session
  if (isOpsApiRoute(request) && !isOpsAuthApiRoute(request)) {
    const opsToken = request.cookies.get("ops_session")?.value;
    if (!opsToken || !(await verifyOpsToken(opsToken))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Ops pages (except login) require ops session
  if (isOpsRoute(request) && !isOpsLoginRoute(request)) {
    const opsToken = request.cookies.get("ops_session")?.value;
    if (!opsToken || !(await verifyOpsToken(opsToken))) {
      return nextjsMiddlewareRedirect(request, "/ops/login");
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Ops login page: redirect to /ops if already authenticated
  if (isOpsLoginRoute(request)) {
    const opsToken = request.cookies.get("ops_session")?.value;
    if (opsToken && (await verifyOpsToken(opsToken))) {
      return nextjsMiddlewareRedirect(request, "/ops");
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (isSignInPage(request) && (await convexAuth.isAuthenticated())) {
    return nextjsMiddlewareRedirect(request, "/");
  }
  if (isProtectedRoute(request) && !(await convexAuth.isAuthenticated())) {
    return nextjsMiddlewareRedirect(request, "/sign-in");
  }

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
