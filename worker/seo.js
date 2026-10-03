const STATIC_SITEMAP_PATHS = ["/", "/browse", "/about"];

const PAGE_METADATA = {
  "/": {
    title: "Nidha Books World | Secondhand books delivered",
    description: "Browse a carefully chosen collection of secondhand books, delivered to your doorstep.",
  },
  "/browse": {
    title: "Browse the Collection | Nidha Books World",
    description: "Find secondhand books by title, author, ISBN, category, or publisher.",
  },
  "/about": {
    title: "About | Nidha Books World",
    description: "Meet Nidha Books World, a travelling bookseller with a carefully chosen collection.",
  },
};

function escapeAttribute(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function upsertMeta(html, attribute, key, value) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(`<meta\\s+${attribute}=["']${escapedKey}["'][^>]*>`, "i");
  const tag = `<meta ${attribute}="${escapeAttribute(key)}" content="${escapeAttribute(value)}" />`;
  return expression.test(html)
    ? html.replace(expression, tag)
    : html.replace(/<\/head>/i, `  ${tag}\n  </head>`);
}

export function createRobotsTxt(origin) {
  const base = new URL(origin).origin;
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /cart",
    "Disallow: /checkout",
    "Disallow: /order/",
    `Sitemap: ${base}/sitemap.xml`,
    "",
  ].join("\n");
}

export function createSitemapXml(origin, books = []) {
  const base = new URL(origin).origin;
  const paths = new Set(STATIC_SITEMAP_PATHS);

  for (const book of books) {
    const id = Number(book?.id);
    if (Number.isSafeInteger(id) && id > 0 && Number(book.stock) > 0) {
      paths.add(`/books/${id}`);
    }
  }

  const entries = [...paths]
    .map((path) => `  <url><loc>${escapeXml(new URL(path, base).href)}</loc></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

export function rewriteDocumentMetadata(html, requestUrl) {
  const url = new URL(requestUrl);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  const bookPage = /^\/books\/\d+$/.test(pathname);
  const metadata = PAGE_METADATA[pathname] || (bookPage
    ? {
      title: "Book Details | Nidha Books World",
      description: "Explore secondhand books in the Nidha Books World collection.",
    }
    : {
      title: "Page Not Found | Nidha Books World",
      description: "The page you requested could not be found.",
    });
  const privatePage = ["/admin", "/cart", "/checkout", "/order/confirmation"].some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  const indexable = Boolean(PAGE_METADATA[pathname] || bookPage);
  const canonicalUrl = new URL(pathname, url.origin).href;
  const socialImageUrl = new URL("/images/social-preview.jpg", url.origin).href;

  let result = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeAttribute(metadata.title)}</title>`);
  result = upsertMeta(result, "name", "description", metadata.description);
  result = upsertMeta(result, "name", "robots", privatePage || !indexable ? "noindex, nofollow" : "index, follow");
  result = upsertMeta(result, "property", "og:title", metadata.title);
  result = upsertMeta(result, "property", "og:description", metadata.description);
  result = upsertMeta(result, "property", "og:type", "website");
  result = upsertMeta(result, "property", "og:site_name", "Nidha Books World");
  result = upsertMeta(result, "property", "og:url", canonicalUrl);
  result = upsertMeta(result, "property", "og:image", socialImageUrl);
  result = upsertMeta(result, "property", "og:image:width", "1200");
  result = upsertMeta(result, "property", "og:image:height", "630");
  result = upsertMeta(result, "name", "twitter:card", "summary_large_image");
  result = upsertMeta(result, "name", "twitter:title", metadata.title);
  result = upsertMeta(result, "name", "twitter:description", metadata.description);
  result = upsertMeta(result, "name", "twitter:image", socialImageUrl);

  const canonicalTag = `<link rel="canonical" href="${escapeAttribute(canonicalUrl)}" />`;
  const canonicalExpression = /<link\s+rel=["']canonical["'][^>]*>/i;
  result = canonicalExpression.test(result)
    ? result.replace(canonicalExpression, canonicalTag)
    : result.replace(/<\/head>/i, `  ${canonicalTag}\n  </head>`);
  return result;
}