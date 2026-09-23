import { useEffect } from 'react';
import { SITE_URL } from '@/lib/seo';

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
  const fullTitle = title ? `${title} | KamiStream` : DEFAULT_TITLE;
  const desc      = description || DEFAULT_DESC;
  const img       = image || DEFAULT_IMAGE;
  // Canonical: prefer the explicit per-page path, otherwise the current
  // path. (Homepage fallback only when location is unavailable.)
  const pageUrl   = url
    ? `${SITE_URL}${url}`
    : (typeof window !== 'undefined'
        ? `${SITE_URL}${window.location.pathname}`
        : SITE_URL);

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
