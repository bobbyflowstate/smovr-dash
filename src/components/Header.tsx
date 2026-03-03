import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../convex/_generated/api";
import ClientHeader from "@/components/ClientHeader";
import { globalLogger } from "@/lib/observability";

export default async function Header() {
  const token = await convexAuthNextjsToken();

  if (!token) {
    return null;
  }

  let userName = "User";
  let teamId: string | null = null;
  let teamName: string | null = null;

  try {
    const userInfo = await fetchQuery(api.users.currentUser, {}, { token });

    if (userInfo) {
      userName = userInfo.userName || userName;
      teamId = userInfo.teamId ?? null;
      teamName = userInfo.teamName || null;
    }
  } catch (error) {
    globalLogger.error("Header: Error fetching user info", error);
  }

  return (
    <ClientHeader
      userName={userName}
      teamId={teamId}
      teamName={teamName}
    />
  );
}
