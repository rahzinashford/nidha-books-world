import assert from "node:assert/strict";
import { test } from "node:test";
import { metadataSearch, normalizeIsbn } from "../worker/metadata.js";

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("normalizes ISBN-10 to ISBN-13", () => {
  assert.equal(normalizeIsbn("0-7352-1129-9"), "9780735211292");
  assert.equal(normalizeIsbn("978-0-7352-1129-2"), "9780735211292");
  assert.equal(normalizeIsbn("not an isbn"), "");
});

test("searches providers concurrently and returns provider statuses", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes("googleapis")) return jsonResponse({ items: [{ volumeInfo: { title: "Atomic Habits", authors: ["James Clear"], industryIdentifiers: [{ type: "ISBN_13", identifier: "9780735211292" }] } }] });
    if (String(url).includes("openlibrary")) return jsonResponse({ title: "Atomic Habits", authors: [{ name: "James Clear" }], isbn_13: ["9780735211292"] });
    if (String(url).includes("www.loc.gov")) return jsonResponse({ results: [{ title: "Atomic Habits", contributor: ["James Clear"], isbn: ["9780735211292"] }] });
    if (String(url).includes("hathitrust")) return jsonResponse({ records: {} });
    return jsonResponse({ data: [{ id: 4, title: "Atomic Habits (Malayalam)", authors: ["James Clear"], image: "cover.jpg", selling_price: 450, in_stock: true }] });
  };
  try {
    const response = await metadataSearch("Atomic Habits", "all");
    assert.equal(calls.length, 5);
    assert.equal(response.providers.find((item) => item.source === "hathitrust").status, "skipped");
    assert.equal(response.providers.find((item) => item.source === "loc").status, "ok");
    assert.equal(response.providers.find((item) => item.source === "dc_bookstore").status, "ok");
    assert.equal(response.results.some((item) => item.source === "dc_bookstore" && item.retailer_price === 450), true);
  } finally { globalThis.fetch = originalFetch; }
});

test("exact ISBN rejects false matches and preserves provider errors", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("googleapis")) return jsonResponse({ items: [{ volumeInfo: { title: "Wrong edition", industryIdentifiers: [{ type: "ISBN_13", identifier: "9780000000002" }] } }] });
    if (String(url).includes("openlibrary.org/isbn")) return jsonResponse({ title: "Atomic Habits", isbn_13: ["9780735211292"], number_of_pages: 320 });
    if (String(url).includes("openlibrary.org/search.json")) return jsonResponse({ docs: [] });
    if (String(url).includes("www.loc.gov")) return jsonResponse({ results: [] });
    if (String(url).includes("hathitrust")) return jsonResponse({ records: {}, items: [] });
    throw new Error("DC unavailable");
  };
  try {
    const response = await metadataSearch("9780735211292", "all");
    assert.equal(response.results.length, 1);
    assert.equal(response.results[0].isbn, "9780735211292");
    assert.equal(response.providers.find((item) => item.source === "google_books").status, "no_results");
    assert.equal(response.providers.find((item) => item.source === "dc_bookstore").status, "error");
    assert.equal(response.errors[0].source, "dc_bookstore");
  } finally { globalThis.fetch = originalFetch; }
});

test("DC Books title hits receive conservative catalog cross-checks", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("googleapis")) return jsonResponse({ items: [{ volumeInfo: { title: "The Example Book", authors: ["A Writer"], industryIdentifiers: [{ type: "ISBN_13", identifier: "9780735211292" }], pageCount: 240 } }] });
    if (String(url).includes("openlibrary")) return jsonResponse({ docs: [] });
    if (String(url).includes("www.loc.gov")) return jsonResponse({ results: [] });
    if (String(url).includes("dcbookstore")) return jsonResponse({ data: [{ id: 9, title: "The Example Book", authors: ["A Writer"] }] });
    throw new Error("Unexpected metadata provider");
  };
  try {
    const response = await metadataSearch("The Example Book", "dc_bookstore");
    assert.equal(response.results.length, 1);
    assert.equal(response.results[0].isbn, "");
    assert.equal(response.results[0].cross_check_matches.length, 1);
    assert.equal(response.results[0].cross_check_matches[0].isbn, "9780735211292");
    assert.match(response.results[0].cross_check_matches[0].cross_check_note, /edition details have not been verified/i);
    assert.equal(response.providers.find((item) => item.source === "google_books").role, "cross_check");
  } finally { globalThis.fetch = originalFetch; }
});

test("does not merge ISBN-less editions", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse({ data: [{ id: 1, title: "Same Book", authors: ["Author"], language: "English" }, { id: 2, title: "Same Book", authors: ["Author"], language: "Malayalam" }] });
  try {
    const response = await metadataSearch("same book", "dc_bookstore");
    assert.equal(response.results.length, 2);
  } finally { globalThis.fetch = originalFetch; }
});

test("Library of Congress falls back from title search to creator search", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (calls.length === 1) return jsonResponse({ results: [] });
    return jsonResponse({ results: [{
      title: "A Sample Book",
      contributor: ["A Sample Author"],
      isbn: ["9780735211292"],
      description: ["<p>A <strong>useful</strong> book.</p>"],
      physical: ["240 pages"],
      publisher: ["Sample Press"],
      image_url: "https://www.loc.gov/sample-cover.jpg",
      url: "https://www.loc.gov/item/sample/",
    }] });
  };
  try {
    const response = await metadataSearch("A Sample Author", "loc");
    assert.equal(calls.length, 2);
    assert.match(calls[0], /title%3AA\+Sample\+Author/);
    assert.match(calls[1], /contributor%3AA\+Sample\+Author/);
    assert.equal(response.results[0].source, "loc");
    assert.equal(response.results[0].isbn, "9780735211292");
    assert.equal(response.results[0].pages, 240);
    assert.equal(response.results[0].description, "A useful book.");
  } finally { globalThis.fetch = originalFetch; }
});

test("DC Books hydrates only book listings with at most four detail requests at once", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let inFlightDetails = 0;
  let maximumDetails = 0;
  globalThis.fetch = async (url) => {
    const address = String(url);
    calls.push(address);
    if (address.includes("googleapis")) return jsonResponse({ items: [] });
    if (address.includes("openlibrary")) return jsonResponse({ docs: [] });
    if (address.includes("www.loc.gov")) return jsonResponse({ results: [] });
    if (address.includes("/search?")) {
      return jsonResponse({ data: [
        ...Array.from({ length: 6 }, (_, index) => ({ sefurl: `book-${index}`, title: `Book ${index}`, authors: ["Writer"] })),
        { sefurl: "bundle", title: "Combo Offer: Book Bundle", authors: ["Writer"] },
      ] });
    }
    if (address.includes("/products/")) {
      inFlightDetails++;
      maximumDetails = Math.max(maximumDetails, inFlightDetails);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlightDetails--;
      const slug = decodeURIComponent(new URL(address).pathname.split("/").pop());
      return jsonResponse({ data: {
        title: `Detailed ${slug}`,
        authors: [{ id: 7, name: "Detail Writer", sefurl: "detail-writer" }],
        publisher: { id: 8, name: "DC Press", sefurl: "dc-press" },
        publishing_date: "04-10-2022",
        categories: [{ id: 9, name: "Self Help", sefurl: "self-help" }],
        summary: "<p>Full <strong>description</strong>.</p>",
        pages: 272,
        format: "Paper Back",
        binding: "Papercover",
        edition: "1",
        weight: "300 gm",
        selling_price: 450,
        actual_price: 499,
        in_stock: "false",
      } });
    }
    throw new Error(`Unexpected provider request: ${address}`);
  };
  try {
    const response = await metadataSearch("Book", "dc_bookstore");
    const detailCalls = calls.filter((url) => url.includes("/products/"));
    assert.equal(response.results.length, 6);
    assert.equal(detailCalls.length, 6);
    assert.ok(maximumDetails <= 4);
    assert.equal(response.results[0].author, "Detail Writer");
    assert.equal(response.results[0].publisher, "DC Press");
    assert.equal(response.results[0].description, "Full description.");
    assert.equal(response.results[0].published_date, "04-10-2022");
    assert.equal(response.results[0].pages, 272);
    assert.deepEqual(response.results[0].categories, ["Self Help"]);
    assert.equal(response.results[0].retailer_price, 450);
    assert.equal(response.results[0].retailer_in_stock, false);
    assert.equal(response.results[0].source_url, "https://dcbookstore.com/books/book-0");
    assert.equal(response.results[0].preview_link, "https://dcbookstore.com/books/book-0");
  } finally { globalThis.fetch = originalFetch; }
});

test("rejects unsupported sources and oversized metadata searches", async () => {
  await assert.rejects(metadataSearch("Atomic Habits", "unknown"), /supported metadata source/i);
  await assert.rejects(metadataSearch("x".repeat(301), "all"), /300 characters or fewer/i);
});