interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'video.other';
}

const DEFAULT_TITLE       = 'KamiStream — Watch Anime Free';
const DEFAULT_DESCRIPTION = 'Stream thousands of anime episodes free on KamiStream. Trending, seasonal, and classic anime all in one place.';
const DEFAULT_IMAGE       = 'https://kamistream.fun/og-default.jpg';

export function useSEO({ title, description, image, url, type = 'website' }: SEOProps = {}) {
  const fullTitle = title ? `${title} — KamiStream` : DEFAULT_TITLE;
  const desc      = description || DEFAULT_DESCRIPTION;
  const img       = image || DEFAULT_IMAGE;
  const pageUrl   = url || (typeof window !== 'undefined' ? window.location.href : 'https://kamistream.fun');

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

  // Set all meta tags
  document.title = fullTitle;
  setMeta('description',       desc,     true);
  setMeta('og:type',           type);
  setMeta('og:title',          fullTitle);
  setMeta('og:description',    desc);
  setMeta('og:image',          img);
  setMeta('og:url',            pageUrl);
  setMeta('og:site_name',      'KamiStream');
  setMeta('twitter:card',      'summary_large_image', true);
  setMeta('twitter:title',     fullTitle, true);
  setMeta('twitter:description', desc,   true);
  setMeta('twitter:image',     img,      true);
}
