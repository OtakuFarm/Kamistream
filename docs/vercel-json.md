# vercel.json notes

Kept out of vercel.json itself, because Vercel validates that file against a
strict schema and an unknown top-level key (a `$comment`, for example) is
enough to fail a build before a single line of the app is compiled.

## The three retired sitemap redirects

    /sitemap.xml        -> /sitemap-index.xml
    /sitemap-anime.xml  -> /sitemap-media.xml
    /sitemap-pages.xml  -> /sitemap-static.xml

Those files were removed when the sitemap was rebuilt on the manifest in
`src/lib/routes.js`. Without an explicit redirect they fall through the
catch-all rewrite `/(.*)` to `/index.html` and answer `200 text/html`.

That is a soft 404, and it is worse than a real one: the fetch succeeds, so
a crawler believes it received a sitemap, and then fails to parse HTML as
XML. Google had all three URLs cached from the old robots.txt, so it was
actively re-fetching broken ones. A genuine 404 would have been better,
because Google would have dropped them and picked up the new files.

Verify after a deploy:

    curl -sI https://www.kamistream.fun/sitemap.xml | head -3
    # expect: HTTP/2 301   location: /sitemap-index.xml

`npm run audit:live` checks this along with every URL in the sitemap.

## Ordering note

The `/(.*)` host redirect to `www.` is listed first. It carries a
`has: host` condition, so it only applies to the apex domain and is
skipped for www requests - the sitemap redirects below are therefore
reached normally.