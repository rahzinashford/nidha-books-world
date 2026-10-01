const PROVIDERS = {
  google_books: { label: "Google Books", endpoint: "https://www.googleapis.com/books/v1/volumes" },
  open_library: { label: "Open Library", endpoint: "https://openlibrary.org/search.json" },
  loc: { label: "Library of Congress", endpoint: "https://www.loc.gov/books/" },
  hathitrust: { label: "HathiTrust", endpoint: "https://catalog.hathitrust.org/api/volumes/brief/isbn/" },
  dc_bookstore: { label: "DC Books", endpoint: "https://dcbookstore.com/dc-admin/api/v1/search" },
};

const REQUEST_TIMEOUT = 7000;
const SOURCE_NAMES = Object.keys(PROVIDERS);
const CATALOG_SOURCES = ["google_books", "open_library", "loc"];

export async function metadataSearch(query, source = "all") {
  const rawQuery = String(query || "").trim();
  if (rawQuery.length > 300) throw new Error("Search queries must be 300 characters or fewer.");
  if (source !== "all" && !SOURCE_NAMES.includes(source)) throw new Error("Choose a supported metadata source.");
  const requested = source === "all" ? SOURCE_NAMES : [source];
  const selected = [...new Set([
    ...requested,
    ...(source === "dc_bookstore" ? CATALOG_SOURCES : []),
  ])].filter((name) => SOURCE_NAMES.includes(name));
  const providers = SOURCE_NAMES.map((name) => {
    const status = providerStatus(name, selected.includes(name), rawQuery);
    if (!requested.includes(name) && selected.includes(name)) {
      status.role = "cross_check";
      status.reason = "Checking DC Books matches against book catalogs.";
    }
    return status;
  });
  const errors = [];

  if (!rawQuery) {
    providers.forEach((item) => { if (item.status === "skipped") item.reason = "Enter a title, author, or ISBN."; });
    return { results: [], providers, errors, source, query: rawQuery };
  }

  const responses = await Promise.all(selected.map(async (name) => {
    const status = providers.find((item) => item.source === name);
    if (status.status === "skipped") return [];
    try {
      const payload = await fetchProvider(name, rawQuery);
      const normalized = normalize(name, payload, rawQuery);
      const exact = normalizeIsbn(rawQuery);
      const filtered = exact ? normalized.filter((item) => item.isbn && normalizeIsbn(item.isbn) === exact) : normalized;
      status.status = filtered.length ? "ok" : "no_results";
      status.count = filtered.length;
      if (payload?.detailErrors) status.reason = `${payload.detailErrors} DC Books detail request${payload.detailErrors === 1 ? " was" : "s were"} unavailable; search results were retained.`;
      if (!filtered.length && normalized.length && exact) status.reason = "No result matched the requested ISBN exactly.";
      return filtered;
    } catch (error) {
      status.status = "error";
      status.reason = error.message || "Provider request failed.";
      errors.push({ source: name, message: status.reason });
      return [];
    }
  }));

  const allResults = dedupe(responses.flat())
    .map((item) => {
      const match = relevance(item, rawQuery);
      return { ...item, match_confidence: match.confidence, match_label: match.label, relevance: match.confidence };
    })
    .sort((a, b) => b.relevance - a.relevance || a.title.localeCompare(b.title));
  allResults.forEach((item) => delete item.relevance);
  const catalogResults = allResults.filter((item) => item.sources.some((itemSource) => CATALOG_SOURCES.includes(itemSource)));
  const dcResults = allResults.filter((item) => item.source === "dc_bookstore");
  dcResults.forEach((item) => {
    item.cross_check_matches = catalogResults
      .filter((catalogItem) => sameWork(item, catalogItem))
      .map((catalogItem) => ({
        ...catalogItem,
        cross_check_note: "Title and author match. Edition details have not been verified against this DC Books listing.",
      }));
  });
  const results = source === "dc_bookstore" ? dcResults : allResults;
  return { results, providers, errors, source, query: rawQuery };
}

function providerStatus(name, selected, query) {
  const status = { source: name, label: PROVIDERS[name].label, status: selected ? "pending" : "skipped", count: 0 };
  if (!selected) status.reason = "Not selected.";
  if (name === "hathitrust" && selected && !normalizeIsbn(query)) {
    status.status = "skipped";
    status.reason = "HathiTrust supports identifier lookup only; enter an ISBN.";
  }
  return status;
}

async function fetchProvider(name, query) {
  if (name === "hathitrust" && !normalizeIsbn(query)) return { skipped: true };
  if (name === "open_library" && normalizeIsbn(query)) {
    const isbn = encodeURIComponent(normalizeIsbn(query));
    const [edition, search] = await Promise.all([
      fetchJson(`https://openlibrary.org/isbn/${isbn}.json`),
      fetchJson(`${PROVIDERS.open_library.endpoint}?isbn=${isbn}&limit=8&fields=title,subtitle,author_name,isbn,publisher,first_publish_year,number_of_pages_median,subject,cover_i,key,language`),
    ]);
    return { edition, search };
  }
  if (name === "loc") return fetchLoc(query);
  if (name === "dc_bookstore") return fetchDcBookstore(query);
  const url = providerUrl(name, query);
  return fetchJson(url);
}

async function fetchLoc(query) {
  const isbn = normalizeIsbn(query);
  if (isbn) return fetchJson(locSearchUrl(`isbn:${isbn}`));

  const byTitle = await fetchJson(locSearchUrl(`title:${query}`));
  if (Array.isArray(byTitle.results) && byTitle.results.length) return byTitle;
  return fetchJson(locSearchUrl(`contributor:${query}`));
}

function locSearchUrl(query) {
  const params = new URLSearchParams({ fo: "json", q: query, c: "8" });
  return `${PROVIDERS.loc.endpoint}?${params}`;
}

async function fetchDcBookstore(query) {
  const search = await fetchJson(`${PROVIDERS.dc_bookstore.endpoint}?keyword=${encodeURIComponent(query)}&category=all&per_page=8&page=1`);
  const items = (Array.isArray(search.data) ? search.data : []).filter(isDcBook);
  let next = 0;
  let detailErrors = 0;
  const hydrated = [...items];
  const workers = Array.from({ length: Math.min(4, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      const item = items[index];
      const slug = item.sefurl || item.slug || item.sef_url || item.id;
      if (slug == null || slug === "") continue;
      try {
        const detail = await fetchJson(`https://dcbookstore.com/dc-admin/api/v1/products/${encodeURIComponent(String(slug))}`);
        hydrated[index] = { ...item, ...dcDetailRecord(detail) };
      } catch {
        detailErrors++;
      }
    }
  });
  await Promise.all(workers);
  return { ...search, data: hydrated, detailErrors };
}

function isDcBook(item) {
  if (!item || typeof item !== "object") return false;
  const type = [item?.type, item?.product_type, item?.category, item?.product_category].filter(Boolean).join(" ").toLowerCase();
  const title = String(item?.title || item?.name || "").toLowerCase();
  if (/combo[\s-]*(offer|pack)|bundle offer/.test(title)) return false;
  return !type || !/stationery|gift card|accessor(y|ies)|non[\s-]*book/.test(type);
}

function dcDetailRecord(payload) {
  let record = payload?.data ?? payload?.product ?? payload;
  if (Array.isArray(record)) record = record[0] || {};
  if (record?.product && typeof record.product === "object") record = record.product;
  return record && typeof record === "object" ? record : {};
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "NidhaBooksWorld/1.0 (metadata import)" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Provider returned ${response.status}.`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function providerUrl(name, query) {
  const isbn = normalizeIsbn(query);
  if (name === "google_books") return `${PROVIDERS[name].endpoint}?q=${encodeURIComponent(isbn ? `isbn:${isbn}` : query)}&maxResults=8`;
  if (name === "open_library") return isbn
    ? `https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`
    : `${PROVIDERS[name].endpoint}?q=${encodeURIComponent(query)}&limit=8&fields=title,subtitle,author_name,isbn,publisher,first_publish_year,number_of_pages_median,subject,cover_i,key,language`;
  if (name === "loc") return locSearchUrl(isbn ? `isbn:${isbn}` : query);
  if (name === "hathitrust") return `${PROVIDERS[name].endpoint}${encodeURIComponent(isbn)}.json`;
  return `${PROVIDERS[name].endpoint}?keyword=${encodeURIComponent(query)}&category=all&per_page=8&page=1`;
}

function normalize(source, payload, query) {
  if (source === "google_books") return (payload.items || []).map((item) => {
    const info = item.volumeInfo || {};
    return book({ source, source_url: info.infoLink, title: info.title, subtitle: info.subtitle, author: (info.authors || []).join(", "), isbn: preferredIsbn(info.industryIdentifiers), description: info.description, publisher: info.publisher, published_date: info.publishedDate, pages: info.pageCount, categories: info.categories, cover_image: info.imageLinks?.thumbnail, language: info.language, preview_link: info.previewLink });
  });
  if (source === "open_library") {
    if (payload.edition?.title || payload.title) {
      const edition = payload.edition || payload;
      const doc = (payload.search?.docs || []).find((item) => (item.isbn || []).some((isbn) => normalizeIsbn(isbn) === normalizeIsbn(edition.isbn_13?.[0] || edition.isbn_10?.[0])));
      return [book({ source, source_url: edition.key ? `https://openlibrary.org${edition.key}` : "", title: edition.title || doc?.title, subtitle: edition.subtitle || doc?.subtitle, author: (doc?.author_name || edition.authors?.map((author) => author.name || author.author?.key) || []).join(", "), isbn: edition.isbn_13?.[0] || edition.isbn_10?.[0] || doc?.isbn?.[0], description: typeof edition.description === "string" ? edition.description : edition.description?.value, publisher: edition.publishers?.[0], published_date: edition.publish_date, pages: edition.number_of_pages, categories: doc?.subject?.slice(0, 4), cover_image: edition.covers?.[0] ? `https://covers.openlibrary.org/b/id/${edition.covers[0]}-L.jpg` : (doc?.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : ""), language: edition.languages?.[0]?.key?.split("/").pop() || doc?.language?.[0] })];
    }
    return (payload.docs || []).map((item) => book({ source, source_url: item.key ? `https://openlibrary.org${item.key}` : "", title: item.title, subtitle: item.subtitle, author: (item.author_name || []).join(", "), isbn: preferredIsbn((item.isbn || []).map((value) => ({ type: "ISBN", identifier: value }))), publisher: item.publisher?.[0], published_date: item.first_publish_year, pages: item.number_of_pages_median, categories: item.subject?.slice(0, 4), cover_image: item.cover_i ? `https://covers.openlibrary.org/b/id/${item.cover_i}-L.jpg` : "", language: item.language?.[0] }));
  }
  if (source === "loc") return (payload.results || []).map((item) => {
    const physical = firstText(item.physical);
    const pageCount = physical.match(/\b(\d{1,6})\s+p(?:ages?)?\.?\b/i);
    return book({
      source, source_url: item.url, title: item.title, author: listText(item.contributor),
      isbn: preferredIsbn(listValues(item.isbn)), description: listText(item.description),
      publisher: listText(item.publisher), published_date: item.date,
      pages: item.pages || (pageCount ? Number(pageCount[1]) : null),
      categories: listValues(item.subject).slice(0, 4), cover_image: item.image_url,
      language: listText(item.language),
    });
  });
  if (source === "hathitrust") return normalizeHathi(payload);
  if (source === "dc_bookstore") return (payload.data || []).map((item) => book({
    source, source_url: dcProductUrl(item),
    title: item.title || item.name, subtitle: item.subtitle, author: dcText(item.authors || item.author),
    isbn: preferredIsbn(listValues(item.isbn || item.isbn_13 || item.isbn13)),
    publisher: dcText(item.publisher), published_date: item.published_date || item.publishing_date || item.publication_date || item.published_at,
    description: item.description || item.summary, pages: item.pages || item.page_count,
    categories: dcValues(item.categories || item.category).slice(0, 4),
    cover_image: item.image || item.cover_image || item.image_url,
    language: item.language, preview_link: item.preview_link || dcProductUrl(item),
    retailer_price: item.selling_price ?? item.actual_price,
    retailer_in_stock: dcBoolean(item.in_stock),
    retailer_id: item.id,
  }));
  return [];
}

function dcProductUrl(item) {
  const url = item.product_url || item.url || item.canonical_url;
  if (url) return String(url);
  const slug = item.sefurl || item.slug || item.id;
  return slug == null || slug === "" ? "" : `https://dcbookstore.com/books/${encodeURIComponent(String(slug))}`;
}

function dcValues(value) {
  if (Array.isArray(value)) return value.flatMap((item) => dcValues(item));
  if (value == null || value === "") return [];
  if (typeof value === "object") {
    const text = value.name ?? value.label ?? value.value ?? value.title;
    return text == null || text === "" ? [] : [String(text)];
  }
  return [String(value)];
}

function dcText(value) {
  return dcValues(value).join(", ");
}

function dcBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && (value === 0 || value === 1)) return value === 1;
  if (typeof value === "string") {
    if (["true", "1", "yes", "in stock"].includes(value.trim().toLowerCase())) return true;
    if (["false", "0", "no", "out of stock"].includes(value.trim().toLowerCase())) return false;
  }
  return null;
}

function listValues(value) {
  if (Array.isArray(value)) return value.flatMap((item) => listValues(item));
  return value == null || value === "" ? [] : [String(value)];
}

function listText(value) {
  return listValues(value).join(", ");
}

function firstText(value) {
  return listValues(value)[0] || "";
}

function sameWork(left, right) {
  const title = normalizeWorkText(left.title);
  const author = normalizeWorkText(left.author);
  return Boolean(title && author && title === normalizeWorkText(right.title) && author === normalizeWorkText(right.author));
}

function normalizeWorkText(value) {
  return String(value || "").normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

function normalizeHathi(payload) {
  const records = Object.values(payload.records || {});
  const items = records.length ? records : payload.items || [];
  return items.map((item) => {
    const record = item.bib || item;
    const first = (value) => Array.isArray(value) ? value[0] : value;
    const listText = (value) => Array.isArray(value) ? value.map((entry) => typeof entry === "string" ? entry : entry?.name || entry?.value || "").filter(Boolean).join(", ") : value;
    return book({ source: "hathitrust", source_url: record.recordURL || record.recordUrl || record.url || record.rights_url, title: first(record.titles || record.title), author: listText(record.names || record.authors || record.author), isbn: first(record.isbns || record.isbn), publisher: record.publisher, published_date: first(record.publishDates || record.publishDate || record.date || record.pub_date), pages: record.pages, language: record.language, description: record.description });
  });
}

function book(item) {
  return {
    source: item.source, sources: [item.source], source_url: item.source_url || "", title: String(item.title || "").trim(),
    subtitle: String(item.subtitle || ""), author: String(item.author || "").trim(), isbn: normalizeIsbn(item.isbn),
    description: plainText(item.description), publisher: String(item.publisher || ""), published_date: item.published_date || "",
    pages: item.pages || null, categories: Array.isArray(item.categories) ? item.categories.filter(Boolean) : [],
    cover_image: item.cover_image || "", language: item.language || "", preview_link: item.preview_link || "",
    retailer_price: item.retailer_price ?? null, retailer_in_stock: item.retailer_in_stock ?? null, retailer_id: item.retailer_id || null,
  };
}

function plainText(value) {
  return String(value || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeIsbn(value) {
  const cleaned = String(value || "").replace(/[^0-9Xx]/g, "").toUpperCase();
  if (cleaned.length === 13 && /^\d{13}$/.test(cleaned)) {
    const sum = cleaned.slice(0, 12).split("").reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
    return (10 - (sum % 10)) % 10 === Number(cleaned[12]) ? cleaned : "";
  }
  if (cleaned.length !== 10 || !/^\d{9}[\dX]$/.test(cleaned)) return "";
  const valid10 = cleaned.split("").reduce((sum, digit, index) => sum + (digit === "X" ? 10 : Number(digit)) * (10 - index), 0) % 11 === 0;
  if (!valid10) return "";
  const body = cleaned.slice(0, 9);
  const isbn13Body = `978${body}`;
  const isbn13Check = (10 - isbn13Body.split("").reduce((sum, digit, index) => sum + Number(digit) * (index % 2 ? 3 : 1), 0) % 10) % 10;
  return `${isbn13Body}${isbn13Check}`;
}

function preferredIsbn(identifiers = []) {
  const valid = identifiers.map((item) => item?.identifier || item).map(normalizeIsbn).filter(Boolean);
  return valid.find((value) => value.startsWith("978") || value.startsWith("979")) || valid[0] || "";
}

function relevance(item, query) {
  const isbn = normalizeIsbn(query);
  if (isbn) return { confidence: item.isbn === isbn ? 100 : 0, label: item.isbn === isbn ? "Exact ISBN" : "No ISBN match" };
  const tokens = tokenize(query);
  const titleTokens = tokenize(item.title);
  const searchable = new Set([...titleTokens, ...tokenize(item.author)]);
  const coverage = tokens.length ? tokens.filter((token) => searchable.has(token)).length / tokens.length : 0;
  const exactTitle = titleTokens.join(" ") === tokens.join(" ");
  if (exactTitle) return { confidence: 95, label: "Exact title" };
  if (coverage) return { confidence: Math.round(40 + coverage * 45), label: `${Math.round(coverage * 100)}% token match` };
  return { confidence: item.isbn ? 5 : 0, label: "Related result" };
}

function tokenize(value) {
  return String(value || "").normalize("NFKD").toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
}

function dedupe(results) {
  const byIsbn = new Map();
  return results.filter((item) => {
    if (!item.isbn) return true;
    const existing = byIsbn.get(item.isbn);
    if (!existing) { byIsbn.set(item.isbn, item); return true; }
    existing.sources = [...new Set([...existing.sources, item.source])];
    for (const key of ["subtitle", "description", "publisher", "published_date", "pages", "cover_image", "language", "preview_link"]) if (!existing[key] && item[key]) existing[key] = item[key];
    return false;
  });
}