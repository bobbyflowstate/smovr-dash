/**
 * Convex typecheck runs with TypeScript settings that don't include Vite's
 * ImportMeta.glob typing. The runtime used by Vitest does support it.
 */
interface ImportMetaWithGlob extends ImportMeta {
  glob: (pattern: string) => Record<string, () => Promise<unknown>>;
}

export const modules = (import.meta as ImportMetaWithGlob).glob("./**/!(*.*.*)*.*s");
