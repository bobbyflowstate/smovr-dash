"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

function OpsNav() {
  const pathname = usePathname();
  const router = useRouter();

  const isLoginPage = pathname === "/ops/login";
  if (isLoginPage) return null;

  const handleLogout = async () => {
    await fetch("/api/ops/auth/logout", { method: "POST" });
    router.push("/ops/login");
  };

  return (
    <header className="bg-gray-900 border-b border-gray-700">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link
            href="/ops"
            className="text-lg font-bold text-white tracking-tight"
          >
            Internal Ops
          </Link>
          <nav className="flex gap-4">
            <Link
              href="/ops"
              className={`text-sm font-medium transition-colors ${
                pathname === "/ops"
                  ? "text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Teams
            </Link>
            <Link
              href="/ops/teams/new"
              className={`text-sm font-medium transition-colors ${
                pathname === "/ops/teams/new"
                  ? "text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              + New Team
            </Link>
          </nav>
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          Log out
        </button>
      </div>
    </header>
  );
}

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${inter.className} min-h-screen bg-gray-950 text-gray-100`}>
      <OpsNav />
      <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
