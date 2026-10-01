import { readSheet, sheetConfig } from "./googleSheets";

export async function getCatalog(env) {
  const config = sheetConfig(env);
  if (!config.configured) throw new Error("Catalog storage is not configured.");
  const books = await readSheet(env);
  return { books, settings: { store_name: "Nidha Books World", store_tagline: "Books on the move, delivered to your doorstep", delivery_info: "We are a travelling bookseller. Place an order on WhatsApp and we will arrange delivery.", whatsapp_number: env.WHATSAPP_NUMBER || "", currency_symbol: "₹" }, source: "google_sheets" };
}

export function queryBooks(books, query = "") {
  const term = query.trim().toLowerCase();
  return books.filter((book) => book.stock > 0 && (!term || [book.title, book.author, book.isbn, book.publisher, ...(book.categories || [])].join(" ").toLowerCase().includes(term))).sort((a, b) => a.title.localeCompare(b.title));
}