import { PREVIEW_BOOKS, DEFAULT_SETTINGS, normalizeBook } from "./catalog";

const STORAGE_KEY = "nidha-cloudflare-catalog";

function readBooks() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return Array.isArray(stored) ? stored.map(normalizeBook) : PREVIEW_BOOKS.map(normalizeBook);
  } catch {
    return PREVIEW_BOOKS.map(normalizeBook);
  }
}

function writeBooks(books) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(books));
}

export const demoApi = {
  getBooks() {
    return readBooks();
  },
  saveBook(book) {
    const books = readBooks();
    const next = normalizeBook({ ...book, id: book.id || Math.max(0, ...books.map((item) => item.id)) + 1 });
    writeBooks([...books.filter((item) => item.id !== next.id), next]);
    return next;
  },
  deleteBook(id) {
    writeBooks(readBooks().filter((book) => book.id !== id));
  },
  toggleFeatured(id) {
    const books = readBooks().map((book) => book.id === id ? { ...book, is_featured: !book.is_featured } : book);
    writeBooks(books);
    return books.find((book) => book.id === id);
  },
  updateInventory(id, changes) {
    const books = readBooks().map((book) => book.id === id ? normalizeBook({ ...book, ...changes }) : book);
    writeBooks(books);
    return books.find((book) => book.id === id);
  },
  getSettings() {
    try {
      return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem("nidha-cloudflare-settings") || "{}")) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  },
  saveSettings(settings) {
    localStorage.setItem("nidha-cloudflare-settings", JSON.stringify(settings));
    return settings;
  },
};

export async function workerRequest(path, options) {
  const isFormData = typeof FormData !== "undefined" && options?.body instanceof FormData;
  const headers = new Headers(options?.headers || {});
  if (!isFormData && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "Request failed");
    error.status = response.status;
    error.code = payload.code || "";
    error.payload = payload;
    throw error;
  }
  return payload;
}