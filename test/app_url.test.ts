import { afterEach, describe, expect, it } from "vitest";
import { getCanonicalAppUrl } from "../convex/lib/appUrl";

const ORIGINAL_ENV = { ...process.env };

describe("canonical app URL", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("prefers SITE_URL over BASE_URL and NEXT_PUBLIC_BASE_URL", () => {
    process.env.SITE_URL = "https://site.example.com";
    process.env.BASE_URL = "https://base.example.com";
    process.env.NEXT_PUBLIC_BASE_URL = "https://public.example.com";

    expect(getCanonicalAppUrl()).toBe("https://site.example.com");
  });

  it("falls back to BASE_URL if SITE_URL is missing", () => {
    delete process.env.SITE_URL;
    process.env.BASE_URL = "https://base.example.com";
    process.env.NEXT_PUBLIC_BASE_URL = "https://public.example.com";

    expect(getCanonicalAppUrl()).toBe("https://base.example.com");
  });
});
