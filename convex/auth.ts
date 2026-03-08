import Resend from "@auth/core/providers/resend";
import { convexAuth } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import { normalizeEmail, pickCanonicalUserId } from "./lib/emailIdentity";

const DEFAULT_AUTH_EMAIL_FROM = "My App <onboarding@resend.dev>";

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Resend({
      from: process.env.AUTH_EMAIL_FROM || DEFAULT_AUTH_EMAIL_FROM,
    }),
  ],
  callbacks: {
    createOrUpdateUser: async (ctx, args) => {
      const normalizedEmail = normalizeEmail(asString(args.profile.email));

      if (args.existingUserId) {
        if (normalizedEmail) {
          const existing = await ctx.db.get(args.existingUserId);
          if (existing && existing.email !== normalizedEmail) {
            await ctx.db.patch(args.existingUserId, { email: normalizedEmail });
          }
        }
        return args.existingUserId;
      }

      if (normalizedEmail) {
        const usersWithEmail = (await ctx.db.query("users").collect()).filter(
          (user) => normalizeEmail(user.email) === normalizedEmail
        );

        const canonicalUserId = pickCanonicalUserId(
          usersWithEmail.map((user) => ({
            _id: user._id,
            _creationTime: user._creationTime,
          }))
        );

        if (canonicalUserId) {
          return canonicalUserId as Id<"users">;
        }
      }

      return await ctx.db.insert("users", {
        name: asString(args.profile.name),
        email: normalizedEmail ?? undefined,
        image: asString(args.profile.image),
        phone: asString(args.profile.phone),
        ...(args.profile.emailVerified ? { emailVerificationTime: Date.now() } : null),
        ...(args.profile.phoneVerified ? { phoneVerificationTime: Date.now() } : null),
      });
    },
  },
});
