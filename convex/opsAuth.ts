import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

export const verifyCredentials = internalQuery({
  args: {
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await ctx.db
      .query("opsAdmins")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .unique();

    if (!admin) {
      return null;
    }

    const valid = bcrypt.compareSync(args.password, admin.passwordHash);
    if (!valid) {
      return null;
    }

    return { email: admin.email, _id: admin._id };
  },
});

export const seedAdmin = internalMutation({
  args: {
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase();
    const existing = await ctx.db
      .query("opsAdmins")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    if (existing) {
      const hash = bcrypt.hashSync(args.password, BCRYPT_ROUNDS);
      await ctx.db.patch(existing._id, { passwordHash: hash });
      return { adminId: existing._id, created: false };
    }

    const hash = bcrypt.hashSync(args.password, BCRYPT_ROUNDS);
    const adminId = await ctx.db.insert("opsAdmins", {
      email,
      passwordHash: hash,
      createdAt: new Date().toISOString(),
    });

    return { adminId, created: true };
  },
});
