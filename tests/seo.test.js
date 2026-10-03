import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "vite";
import { createRobotsTxt, createSitemapXml } from "../worker/seo.js";

let server;
let worker;

before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false } });
  ({ default: worker } = await server.ssrLoadModule("/worker/index.js"));
});

after(async () => {
  await server?.close();
});

test("robots response points to the current host sitemap and excludes private flows", async () => {
  const response = await worker.fetch(new Request("https://shop.example.test/robots.txt"), {});
  const content = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/plain/);
  assert.match(content, /Sitemap: https:\/\/shop\.example\.test\/sitemap\.xml/);
  assert.match(content, /Disallow: \/admin/);
  assert.match(content, /Disallow: \/checkout/);
});

test("sitemap contains public pages and in-stock books only", () => {
  const sitemap = createSitemapXml("https://shop.example.test/", [
    { id: 12, stock: 2 },
    { id: 13, stock: 0 },
    { id: "not-a-number", stock: 1 },
  ]);

  assert.match(sitemap, /<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(sitemap, /https:\/\/shop\.example\.test\/about/);
  assert.match(sitemap, /https:\/\/shop\.example\.test\/privacy/);
  assert.match(sitemap, /https:\/\/shop\.example\.test\/terms/);
  assert.match(sitemap, /https:\/\/shop\.example\.test\/books\/12/);
  assert.doesNotMatch(sitemap, /\/books\/13/);
  assert.doesNotMatch(sitemap, /not-a-number/);
});

test("HTTP requests are permanently redirected to HTTPS before app routes run", async () => {
  const response = await worker.fetch(new Request("http://shop.example.test/browse?q=poetry"), {});

  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "https://shop.example.test/browse?q=poetry");
});

test("public HTML gets route-specific metadata and private screens are noindex", async () => {
  const source = `<!doctype html><html><head><title>Old title</title><meta name="description" content="Old description"></head><body></body></html>`;
  const assets = { fetch: async () => new Response(source, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Length": "999" } }) };
  const response = await worker.fetch(new Request("https://shop.example.test/about"), { ASSETS: assets });
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /<title>About \| Nidha Books World<\/title>/);
  assert.match(html, /property="og:image" content="https:\/\/shop\.example\.test\/images\/social-preview\.jpg"/);
  assert.match(html, /rel="canonical" href="https:\/\/shop\.example\.test\/about"/);
  assert.equal(response.headers.get("content-length"), null);

  const privacyResponse = await worker.fetch(new Request("https://shop.example.test/privacy"), { ASSETS: assets });
  const privacyHtml = await privacyResponse.text();
  assert.match(privacyHtml, /<title>Privacy Notice \| Nidha Books World<\/title>/);
  assert.match(privacyHtml, /name="robots" content="index, follow"/);

  const termsResponse = await worker.fetch(new Request("https://shop.example.test/terms"), { ASSETS: assets });
  assert.match(await termsResponse.text(), /<title>Terms of Sale \| Nidha Books World<\/title>/);

  const privateResponse = await worker.fetch(new Request("https://shop.example.test/checkout"), { ASSETS: assets });
  assert.match(await privateResponse.text(), /name="robots" content="noindex, nofollow"/);
});

test("sitemap reports catalog configuration failures instead of returning invalid XML", async () => {
  const response = await worker.fetch(new Request("https://shop.example.test/sitemap.xml"), {});

  assert.equal(response.status, 503);
  assert.match(response.headers.get("content-type"), /text\/plain/);
});