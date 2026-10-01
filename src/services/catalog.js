export const DEFAULT_SETTINGS = {
  store_name: "Nidha Books World",
  store_tagline: "Books on the move, delivered to your doorstep",
  delivery_info: "We are a travelling bookseller. Place an order on WhatsApp and we will arrange delivery.",
  whatsapp_number: "917306266761",
  currency_symbol: "₹",
};

const covers = Array.from({ length: 10 }, (_, index) => `/images/covers/cover-${String(index + 1).padStart(2, "0")}.jpg`);

export const PREVIEW_BOOKS = [
  ["The Weight of Rain", "Elena Marsh", "Literary Fiction", "Good", 150, 2, 1, true, "9780143423891", "Harborlight Press", 312, "A quiet, aching novel about a family reassembling itself after loss, set along a rain-soaked coastline. Foxed pages, a firm spine, and a previous owner's pencil notes in the margins."],
  ["Letters to a Young Cartographer", "Owen Faelan", "Essays", "Like New", 220, 1, 2, true, "9780307946867", "Meridian & Co.", 168, "A slim, elegant collection of essays on maps, memory, and the art of getting lost. Barely read — the spine still creaks."],
  ["The Nine Doors of Midnight", "Yusuf Ibarra", "Mystery", "Good", 140, 3, 3, true, "9780199535569", "Raven's Quill", 384, "A twisting locked-room mystery set in a crumbling opera house. Some tanning to the pages, but tight binding and a striking cover."],
  ["Groundwork", "Dr. Priya Kanth", "Science", "Fair", 90, 4, 4, false, "9780262035613", "Fieldstone Books", 256, "An accessible tour of soil science and the hidden life beneath our feet. Well-loved copy with a cracked cover corner, fully readable."],
  ["The Salt Orchard", "Marguerite Duclos", "Literary Fiction", "New", 280, 1, 5, true, "9780593311827", "Harborlight Press", 402, "A lush, unread first edition about three generations of women tending an orchard by the sea. Dust jacket intact, no creases."],
  ["Field Notes on Silence", "Aki Morrow", "Poetry", "Like New", 160, 2, 6, false, "9780811221351", "Quiet Hours Editions", 96, "Spare, wintry poems about solitude and small kindnesses. Pages are crisp and the cover is unmarked."],
  ["The Clockmaker's Daughter's Ledger", "Bertram Solari", "Historical Fiction", "Good", 150, 2, 7, true, "9780143128086", "Gearwork House", 448, "A meticulous, gear-turning saga set in a 19th-century watch shop. Well-read but sturdy, with a previous owner's bookplate."],
  ["Small Gods of the Kitchen", "Renata Alba", "Essays", "Good", 120, 3, 8, false, "9781616206813", "Hearth & Table Press", 224, "Warm, funny essays on cooking, grief, and family recipes passed hand to hand. Some coffee-ring souvenirs on the cover."],
  ["The Long Ferry Home", "Callum Reyes", "Mystery", "Fair", 80, 5, 9, false, "9780857524337", "Foghorn Editions", 288, "A moody, fog-bound thriller aboard a night ferry. Reading copy with a soft, worn cover — perfect for the bus."],
  ["An Atlas of Forgotten Rivers", "Ines Halvard", "Science", "New", 300, 1, 10, true, "9780500518885", "Cartographic Society Press", 320, "A gorgeous, unread hardcover charting rivers that have vanished from modern maps. Heavy stock, vivid plates."],
  ["Everything I Owe the Wind", "Halima Voss", "Poetry", "Good", 130, 2, 1, false, "9781555978053", "Quiet Hours Editions", 112, "A debut collection about migration and the weather we carry inside us. Gently used, cover slightly sun-faded."],
  ["The Understudy's Almanac", "Felix Onwuka", "Historical Fiction", "Like New", 190, 2, 3, false, "9780241344890", "Gearwork House", 336, "A theatrical, witty novel following a stagehand who becomes a reluctant star. Practically untouched — tight spine, clean pages."],
].map((row, index) => ({
  id: index + 1,
  title: row[0],
  author: row[1],
  categories: [row[2]],
  genre: row[2],
  condition: row[3],
  price: row[4],
  stock: row[5],
  cover_image: covers[row[6] - 1],
  is_featured: row[7],
  isbn: row[8],
  publisher: row[9],
  pages: row[10],
  language: "English",
  description: row[11],
  preview_link: `https://books.google.com/books?q=${row[8]}`,
  date_added: new Date(Date.now() - (12 - index) * 86400000).toISOString(),
}));

export function resolveCover(value) {
  const cover = String(value || "").trim();
  if (!cover) return "/images/covers/cover-01.jpg";
  if (/^https?:\/\//i.test(cover)) return cover;
  if (cover.startsWith("/")) return cover;
  return `/${cover.replace(/^static\//, "")}`;
}

export function normalizeBook(book) {
  return {
    ...book,
    categories: book.categories || (book.genre ? [book.genre] : []),
    genre: book.genre || book.categories?.[0] || "",
    price: Number(book.price || 0),
    stock: Math.max(0, Number(book.stock || 0)),
  };
}

export function searchBooks(books, query = "", genre = "", condition = "") {
  const term = query.trim().toLowerCase();
  return books
    .filter((book) => book.stock > 0)
    .filter((book) => !term || [book.title, book.author, book.isbn, book.publisher, ...(book.categories || [])].join(" ").toLowerCase().includes(term))
    .filter((book) => !genre || book.categories?.includes(genre))
    .filter((book) => !condition || book.condition === condition)
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function formatInr(value, symbol = "₹") {
  const amount = Number(value);
  if (Number.isNaN(amount)) return String(value ?? "");
  return Number.isInteger(amount) ? `${symbol}${amount.toLocaleString("en-IN")}` : `${symbol}${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function getCategories(books) {
  return [...new Set(books.flatMap((book) => book.categories || []))].sort();
}

export async function fetchCatalog() {
  try {
    const response = await fetch("/api/catalog");
    if (response.ok) {
      const payload = await response.json();
      return { books: (payload.books || []).map(normalizeBook), settings: { ...DEFAULT_SETTINGS, ...(payload.settings || {}) }, source: payload.source || "catalog", warning: payload.warning || "" };
    }
    if (response.status !== 404) {
      const payload = await response.json().catch(() => ({}));
      return {
        books: [],
        settings: DEFAULT_SETTINGS,
        source: "error",
        warning: payload.error || "The catalog could not be read.",
      };
    }
  } catch {
    // The preview adapter below keeps the storefront usable while the Worker is not running.
  }
  return {
    books: PREVIEW_BOOKS,
    settings: DEFAULT_SETTINGS,
    source: "preview",
    warning: "Preview catalog is active. Connect the catalog service before publishing.",
  };
}