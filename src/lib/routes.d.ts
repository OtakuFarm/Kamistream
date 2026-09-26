// Type surface for src/lib/routes.js. The implementation is plain JS so
// the Node build scripts can import it without a compile step — see the
// long note at the top of routes.js.

export type RouteKind = 'static' | 'category' | 'genre' | 'year' | 'noindex';

export interface RouteEntry {
  kind:     RouteKind;
  path:     string;
  url:      string;
  title:    string;
  description: string;
  priority: string;
  changefreq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  lastmod:  string;
  prerender: boolean;
  navLabel: string;
  /** Visible page heading, which is not always the <title>. */
  h1?: string;
}

export interface CategoryDef {
  slug: string;
  label: string;
  desc: string;
}

export interface BuildRoutesOptions {
  genreIds?: Array<string | number | { id: string | number; name?: string }>;
  years?: number[];
  base?:   string;
}

export declare function clampText(text: unknown, max?: number): string;
export declare function genreTitle(name: string): string;
export declare function genreDescription(name: string): string;
export declare function buildRoutes(options?: BuildRoutesOptions): RouteEntry[];
export declare function indexablePaths(options?: BuildRoutesOptions): Set<string>;
export declare function isNoindexPath(path: unknown): boolean;

export declare const SITE_NAME: string;
export declare const SITE_URL: string;
export declare const CATEGORIES: ReadonlyArray<CategoryDef>;
export declare const CATEGORY_SLUGS: ReadonlyArray<string>;
export declare const KINDS: Readonly<Record<'STATIC' | 'CATEGORY' | 'GENRE' | 'YEAR' | 'NOINDEX', RouteKind>>;
export declare const NOINDEX_PATHS: ReadonlyArray<string>;
export declare const NOINDEX_REASONS: Readonly<Record<string, string>>;
