import { useEffect, useMemo } from 'react';
import { SITE_URL, buildRoutes, KINDS, clampText } from '@/lib/routes';
import { POPULAR_GENRES_BY_NAME, isPopularGenre } from '@/lib/genres';
import { hubTitle, yearTitle } from '@/lib/bestOfYear';

interface SEOProps {
  title?:       string;
  description?: string;
  image?:       string;
  /** Canonical URL path for this page, e.g. "/anime/52991/sousou-no-frieren" */
  url?:         string;
  type?:        'website' | 'video.other';
  /** Set true on utility pages (search results, watch pages, auth, 404…) */
  noindex?:     boolean;
  // Structured data extras (anime detail page)
  jsonLd?: {
    animeName?:    string;
    score?:        number;
    episodes?:     number;
    status?:       string;
    genres?:       string[];
    studios?:      string[];
    aired?:        string;
    malId?:        number;
    episodeNum?:   number;
    episodeName?:  string;
  };
}

const DEFAULT_TITLE   = 'KamiStream — Watch Anime Free in HD';
const DEFAULT_DESC    = 'Stream thousands of anime episodes free on KamiStream. Sub & dub, trending, seasonal and classic anime all in one place.';
const DEFAULT_IMAGE   = `${SITE_URL}/opengraph.jpg`;

/**
 * The manifest is consulted for any page that did NOT pass an explicit
 * title. That is the fix for the drift this codebase had for months: the
 * <title> a crawler saw on the prerendered HTML, the one React set after
 * a client-side navigation, and the one in the sitemap were three
 * hand-maintained strings that had already fallen out of sync. Now all
 * three read the same rows in src/lib/routes.js.
 *
 * An explicit `title` still wins — pages whose metadata genuinely depends
 * on runtime data (an anime synopsis, a year page's ranked list) still
 * pass one, and the prerenderer builds the identical string.
 */
function manifestEntryFor(path: string) {
  // /genre/:id and /best-anime/:year are parameterised, so they need the
  // static path matched by shape rather than looked up by exact key.
  const genre = path.match(/^\/genre\/(\d+)/);
  if (genre && isPopularGenre(genre[1])) {
    const g = POPULAR_GENRES_BY_NAME.find(x => String(x.id) === genre[1]);
    return g ? { title: `${g.name} Anime — Watch Free Online | KamiStream`, description: null } : null;
  }
  const year = path.match(/^\/best-anime\/(\d{4})$/);
  if (year) return { title: yearTitle(Number(year[1])), description: null };

  const all = buildRoutes({ genreIds: [], years: [] });
  return all.find(r => r.kind !== KINDS.NOINDEX && r.path === path) || null;
}

function setMeta(property: string, content: string, isName = false) {
  const attr = isName ? 'name' : 'property';
  let el = document.querySelector(`meta[${attr}="${property}"]`) as HTMLMetaElement;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, property);
    document.head.appendChild(el);
  }
  el.content = content;
}

function setLink(rel: string, href: string) {
  let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.href = href;
}

function setJsonLd(id: string, data: object) {
  let el = document.getElementById(id) as HTMLScriptElement;
  if (!el) {
    el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

function removeJsonLd(id: string) {
  document.getElementById(id)?.remove();
}

export function useSEO({ title, description, image, url, type = 'website', noindex, jsonLd }: SEOProps = {}) {
  // Canonical: prefer the explicit per-page path, otherwise the current
  // path. (Homepage fallback only when location is unavailable.)
  const pageUrl   = url
    ? `${SITE_URL}${url}`
    : (typeof window !== 'undefined'
        ? `${SITE_URL}${window.location.pathname}`
        : SITE_URL);

  // Manifest lookup is keyed on the current path, so it is recomputed only
  // when navigation actually changes the URL.
  const path      = url || (typeof window !== 'undefined' ? window.location.pathname : '/');
  const fromManifest = useMemo(() => (title ? null : manifestEntryFor(path)), [title, path]);

  // NOTE the two different title shapes. An explicit `title` from a page
  // is a BARE title and gets the brand suffix appended, which is how every
  // page has always called this. A manifest title is ALREADY complete
  // ("... | KamiStream"), so appending again would produce
  // "Estimated Schedule | KamiStream | KamiStream". They are kept
  // deliberately distinct rather than normalised, because normalising
  // would mean stripping suffixes off a string that is sometimes both.
  const fullTitle = title
    ? `${title} | KamiStream`
    : (fromManifest?.title || DEFAULT_TITLE);
  const desc      = description || fromManifest?.description || DEFAULT_DESC;
  const img       = image || DEFAULT_IMAGE;

  useEffect(() => {
    document.title = fullTitle;
    setMeta('description',         desc,      true);
    setMeta('robots',              noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1', true);
    setLink('canonical',           pageUrl);
    setMeta('og:type',             type);
    setMeta('og:title',            fullTitle);
    setMeta('og:description',      desc);
    setMeta('og:image',            img);
    setMeta('og:url',              pageUrl);
    setMeta('og:site_name',        'KamiStream');
    setMeta('twitter:card',        'summary_large_image', true);
    setMeta('twitter:title',       fullTitle,             true);
    setMeta('twitter:description', desc,                  true);
    setMeta('twitter:image',       img,                   true);

    // Tell any prerender crawler (which reads the server response, not the
    // mutated DOM) that the title/meta just changed.
    window.dispatchEvent(new CustomEvent('kami-seo-update'));

    // ── JSON-LD structured data ─────────────────────────────────────
    if (jsonLd?.animeName) {
      // TVSeries schema for anime detail pages
      const tvSeries: any = {
        '@context':    'https://schema.org',
        '@type':       'TVSeries',
        'name':        jsonLd.animeName,
        'url':         pageUrl,
        'image':       img,
        'description': desc,
        // Off-site profile links help Google's Knowledge Graph
        'sameAs':      jsonLd.malId ? [`https://myanimelist.net/anime/${jsonLd.malId}`] : [],
      };
      // NOTE: no aggregateRating — we don't have a real vote count, and a
      // fabricated one violates Google's structured data guidelines.
      if (jsonLd.episodes) tvSeries.numberOfEpisodes = jsonLd.episodes;
      if (jsonLd.genres?.length)  tvSeries.genre  = jsonLd.genres;
      if (jsonLd.studios?.length) tvSeries.productionCompany = jsonLd.studios.map(s => ({ '@type': 'Organization', name: s }));
      if (jsonLd.aired)   tvSeries.startDate = jsonLd.aired;
      if (jsonLd.status === 'Currently Airing') tvSeries.contentRating = 'TV-14';

      setJsonLd('ld-tvseries', tvSeries);

      // BreadcrumbList
      setJsonLd('ld-breadcrumb', {
        '@context': 'https://schema.org',
        '@type':    'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home',    item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: 'Browse',  item: `${SITE_URL}/browse` },
          { '@type': 'ListItem', position: 3, name: jsonLd.animeName, item: pageUrl },
        ],
      });

      // VideoObject if we're on an episode
      if (jsonLd.episodeNum) {
        setJsonLd('ld-video', {
          '@context':    'https://schema.org',
          '@type':       'VideoObject',
          'name':        jsonLd.episodeName || `${jsonLd.animeName} Episode ${jsonLd.episodeNum}`,
          'description': desc,
          'thumbnailUrl': img,
          // No uploadDate: the episode's real publish date isn't known here
          // and a fake "today" on every render is worse than omitting it.
          'embedUrl':    pageUrl,
        });
      } else {
        removeJsonLd('ld-video');
      }
    } else {
      removeJsonLd('ld-tvseries');
      removeJsonLd('ld-breadcrumb');
      removeJsonLd('ld-video');
    }

    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [fullTitle, desc, img, pageUrl, type, noindex, JSON.stringify(jsonLd)]);
}
