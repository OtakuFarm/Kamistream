import { useEffect } from 'react';

interface SEOProps {
  title?:       string;
  description?: string;
  image?:       string;
  url?:         string;
  type?:        'website' | 'video.other';
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

const SITE            = 'https://kamistream.fun';
const DEFAULT_TITLE   = 'KamiStream — Watch Anime Free in HD';
const DEFAULT_DESC    = 'Stream thousands of anime episodes free on KamiStream. Sub & dub, trending, seasonal and classic anime all in one place.';
const DEFAULT_IMAGE   = `${SITE}/opengraph.jpg`;

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

export function useSEO({ title, description, image, url, type = 'website', jsonLd }: SEOProps = {}) {
  const fullTitle = title ? `${title} | KamiStream` : DEFAULT_TITLE;
  const desc      = description || DEFAULT_DESC;
  const img       = image || DEFAULT_IMAGE;
  const pageUrl   = url || (typeof window !== 'undefined' ? window.location.href : SITE);

  useEffect(() => {
    document.title = fullTitle;
    setMeta('description',         desc,      true);
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
      };
      if (jsonLd.score)    tvSeries.aggregateRating = { '@type': 'AggregateRating', ratingValue: jsonLd.score, bestRating: 10, ratingCount: 1000 };
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
          { '@type': 'ListItem', position: 1, name: 'Home',  item: SITE },
          { '@type': 'ListItem', position: 2, name: 'Browse', item: `${SITE}/browse` },
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
          'uploadDate':  new Date().toISOString(),
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
  }, [fullTitle, desc, img, pageUrl, type, JSON.stringify(jsonLd)]);
}
