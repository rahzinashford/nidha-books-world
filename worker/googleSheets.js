export const SHEET_HEADERS = [
  "id", "title", "subtitle", "author", "isbn", "publisher", "published_date",
  "description", "pages", "language", "cover_image", "preview_link", "price",
  "stock", "condition", "is_featured", "categories", "shelves", "created_at", "date_added",
];

const REQUIRED = ["GOOGLE_SERVICE_ACCOUNT_JSON", "GOOGLE_SHEETS_SPREADSHEET_ID", "GOOGLE_SHEETS_WORKSHEET"];
const CONDITIONS = new Set(["New", "Like New", "Good", "Fair"]);
const MAX_TEXT = 20000;
const SETTING_KEYS = ["store_name", "store_tagline", "delivery_info", "whatsapp_number", "currency_symbol"];
const SETTING_DEFAULTS = {
  store_name: "Nidha Books World",
  store_tagline: "Books on the move, delivered to your doorstep",
  delivery_info: "We are a travelling bookseller. Place your order on WhatsApp and we will arrange delivery.",
  whatsapp_number: "",
  currency_symbol: "₹",
};

export function sheetConfig(env) {
  const present = REQUIRED.filter((key) => String(env[key] || "").trim());
  if (!present.length) return { configured: false, missing: REQUIRED };
  const missing = REQUIRED.filter((key) => !String(env[key] || "").trim());
  if (missing.length) throw new Error("Catalog storage configuration is incomplete. Configure the catalog connection.");
  return { configured: true, missing: [] };
}

function parseNumber(value, field, row) {
  if (String(value ?? "").trim() === "") return field === "pages" ? null : 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || (field === "pages" && !Number.isInteger(parsed))) throw new Error(`Invalid ${field} on catalog row ${row}.`);
  return parsed;
}

function parseBool(value) {
  return ["true", "1", "yes", "y"].includes(String(value || "").trim().toLowerCase());
}

export function parseSheetValues(values) {
  if (!values?.length) return [];
  const headers = values[0].map((value) => String(value).trim());
  if (JSON.stringify(headers) !== JSON.stringify(SHEET_HEADERS)) throw new Error("The catalog table headers do not match the expected Books schema.");
  const ids = new Set();
  return values.slice(1).flatMap((row, index) => {
    if (!row.some((value) => String(value).trim())) return [];
    const rowNumber = index + 2;
    const cells = [...row, ...Array(SHEET_HEADERS.length).fill("")].slice(0, SHEET_HEADERS.length);
    const record = Object.fromEntries(SHEET_HEADERS.map((header, cellIndex) => [header, cells[cellIndex]]));
    const id = Number(record.id);
    if (!Number.isInteger(id) || id < 1) throw new Error(`Invalid book ID on catalog row ${rowNumber}.`);
    if (ids.has(id)) throw new Error(`Duplicate book ID ${id} in the catalog.`);
    ids.add(id);
    if (!String(record.title).trim() || !String(record.author).trim()) throw new Error(`Every catalog book needs a title and author (row ${rowNumber}).`);
    const condition = String(record.condition || "Good").trim();
    if (!CONDITIONS.has(condition)) throw new Error(`Invalid condition on catalog row ${rowNumber}.`);
    const book = {
      id, title: String(record.title).trim(), subtitle: String(record.subtitle || ""),
      author: String(record.author).trim(), isbn: String(record.isbn || "").trim(),
      publisher: String(record.publisher || ""), published_date: String(record.published_date || ""),
      description: String(record.description || ""), pages: parseNumber(record.pages, "pages", rowNumber),
      language: String(record.language || "English"), cover_image: String(record.cover_image || "images/covers/cover-01.jpg"),
      preview_link: String(record.preview_link || ""), price: parseNumber(record.price, "price", rowNumber),
      stock: parseNumber(record.stock, "stock", rowNumber), condition, is_featured: parseBool(record.is_featured),
      categories: String(record.categories || "").split("|").map((item) => item.trim()).filter(Boolean),
      shelves: String(record.shelves || "").split("|").map((item) => item.trim()).filter(Boolean),
      created_at: String(record.created_at || ""), date_added: String(record.date_added || ""),
    };
    Object.defineProperty(book, "_rowNumber", { value: rowNumber, enumerable: false });
    return [book];
  });
}

async function googleToken(serviceAccount) {
  // The complete JWT exchange is kept server-side. Deployments should use the
  // service account secret; this function intentionally never reaches browser code.
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" })).replace(/=/g, "");
  const now = Math.floor(Date.now() / 1000);
  const claim = btoa(JSON.stringify({ iss: serviceAccount.client_email, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", exp: now + 3600, iat: now })).replace(/=/g, "");
  const keyData = serviceAccount.private_key.replace(/\\n/g, "\n");
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(keyData), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claim}`));
  const binary = String.fromCharCode(...new Uint8Array(signature));
  const assertion = `${header}.${claim}.${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${encodeURIComponent(assertion)}` });
  if (!response.ok) throw new Error("Google authentication failed. Check the service account credentials.");
  return (await response.json()).access_token;
}

function pemToDer(pem) {
  const raw = atob(pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, ""));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0)).buffer;
}

function sheetRange(sheetName, range) {
  const safeName = /^[A-Za-z0-9_]+$/.test(sheetName) ? sheetName : `'${sheetName.replace(/'/g, "''")}'`;
  return encodeURIComponent(`${safeName}!${range}`);
}

async function authorizedFetch(env, url, options = {}) {
  const serviceAccount = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const token = await googleToken(serviceAccount);
  return fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
}

export async function readSheet(env) {
  sheetConfig(env);
  const range = sheetRange(env.GOOGLE_SHEETS_WORKSHEET, "A:T");
  const response = await authorizedFetch(env, `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEETS_SPREADSHEET_ID}/values/${range}`);
  if (!response.ok) throw new Error(`Catalog read failed (${response.status}).`);
  return parseSheetValues((await response.json()).values || []);
}

function settingsWorksheet(env) {
  const name = text(env.GOOGLE_SHEETS_SETTINGS_WORKSHEET || "Settings", "settings worksheet", 100);
  if (!name || name === env.GOOGLE_SHEETS_WORKSHEET) throw new Error("The settings worksheet must be a separate, non-empty sheet name.");
  return name;
}

function settingsDefaults(env) {
  return { ...SETTING_DEFAULTS, whatsapp_number: text(env.WHATSAPP_NUMBER || "", "whatsapp_number", 32) };
}

async function spreadsheetMetadata(env) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEETS_SPREADSHEET_ID}?fields=sheets.properties(sheetId,title)`;
  const response = await authorizedFetch(env, url);
  if (!response.ok) throw new Error(`Catalog metadata read failed (${response.status}).`);
  return (await response.json()).sheets || [];
}

export async function readSettings(env) {
  sheetConfig(env);
  const worksheet = settingsWorksheet(env);
  const sheets = await spreadsheetMetadata(env);
  if (!sheets.some((sheet) => sheet.properties?.title === worksheet)) return settingsDefaults(env);
  const response = await authorizedFetch(env, `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEETS_SPREADSHEET_ID}/values/${sheetRange(worksheet, "A:B")}`);
  if (!response.ok) throw new Error(`Store settings read failed (${response.status}).`);
  const rows = (await response.json()).values || [];
  if (!rows.length) return settingsDefaults(env);
  if (JSON.stringify(rows[0].map((value) => String(value).trim())) !== JSON.stringify(["setting", "value"])) {
    throw new Error(`The ${worksheet} worksheet must have "setting" and "value" headers in columns A and B.`);
  }
  const settings = settingsDefaults(env);
  const seen = new Set();
  for (const [key, value] of rows.slice(1)) {
    if (!SETTING_KEYS.includes(String(key))) continue;
    if (seen.has(String(key))) throw new Error(`Duplicate ${key} setting in the ${worksheet} worksheet.`);
    seen.add(String(key));
    settings[key] = String(value ?? "");
  }
  return validateSettingsInput(settings, env);
}

export function validateSettingsInput(input, env = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("A settings object is required.");
  const defaults = settingsDefaults(env);
  const settings = {};
  settings.store_name = text(input.store_name ?? defaults.store_name, "store_name", 150);
  settings.store_tagline = text(input.store_tagline ?? defaults.store_tagline, "store_tagline", 300);
  settings.delivery_info = text(input.delivery_info ?? defaults.delivery_info, "delivery_info", 2000);
  settings.whatsapp_number = text(input.whatsapp_number ?? defaults.whatsapp_number, "whatsapp_number", 32).replace(/[^\d]/g, "");
  if (settings.whatsapp_number && (settings.whatsapp_number.length < 7 || settings.whatsapp_number.length > 15)) {
    throw new Error("whatsapp_number must contain 7 to 15 digits.");
  }
  settings.currency_symbol = text(input.currency_symbol ?? defaults.currency_symbol, "currency_symbol", 8);
  if (!settings.store_name || !settings.currency_symbol) throw new Error("Store name and currency symbol are required.");
  return settings;
}

export async function saveSettings(env, input) {
  sheetConfig(env);
  const worksheet = settingsWorksheet(env);
  const settings = validateSettingsInput(input, env);
  const sheets = await spreadsheetMetadata(env);
  if (!sheets.some((sheet) => sheet.properties?.title === worksheet)) {
    const batchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEETS_SPREADSHEET_ID}:batchUpdate`;
    await sheetRequest(env, batchUrl, {
      method: "POST",
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: worksheet } } }] }),
    });
  }
  const values = [["setting", "value"], ...SETTING_KEYS.map((key) => [key, settings[key]])];
  const range = sheetRange(worksheet, `A1:B${values.length}`);
  await sheetRequest(env, `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEETS_SPREADSHEET_ID}/values/${range}?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ majorDimension: "ROWS", values }),
  });
  return { settings };
}

function text(value, field, max = MAX_TEXT) {
  if (value != null && typeof value !== "string") throw new Error(`${field} must be text.`);
  const result = String(value ?? "").trim();
  if (result.length > max) throw new Error(`${field} is too long (maximum ${max} characters).`);
  return result;
}

function number(value, field, { integer = false, max = 100000000 } = {}) {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") {
    throw new Error(`${field} must be a finite nonnegative${integer ? " integer" : ""}.`);
  }
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0 || result > max || (integer && !Number.isInteger(result))) {
    throw new Error(`${field} must be a finite nonnegative${integer ? " integer" : ""}.`);
  }
  return result;
}

function isbnKey(value) {
  const raw = String(value || "").toUpperCase().replace(/[^0-9X]/g, "");
  if (raw.length === 10 && /^[0-9]{9}[0-9X]$/.test(raw)) {
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += (raw[i] === "X" ? 10 : Number(raw[i])) * (10 - i);
    if (sum % 11 !== 0) return "";
    const isbn13Body = `978${raw.slice(0, 9)}`;
    const isbn13Sum = isbn13Body.split("").reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
    return `${isbn13Body}${(10 - (isbn13Sum % 10)) % 10}`;
  }
  if (raw.length !== 13 || !/^97[89][0-9]{10}$/.test(raw)) return "";
  const sum = raw.slice(0, 12).split("").reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(raw[12]) ? raw : "";
}

function normalized(value) {
  return String(value || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

function textList(value, field) {
  const plural = field === "category" ? "categories" : "shelves";
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error(`${plural} must be an array.`);
  if (value.length > 20) throw new Error(`A book may have at most 20 ${plural}.`);
  const values = [];
  const seen = new Set();
  for (const item of value) {
    const name = text(item, field, 80);
    if (!name) throw new Error(`${field} names cannot be empty.`);
    const key = name.toLocaleLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      values.push(name);
    }
  }
  return values;
}

function inputBoolean(value, field) {
  if (value == null || value === "") return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && (value === 0 || value === 1)) return value === 1;
  if (typeof value === "string" && ["true", "1", "yes", "y", "false", "0", "no", "n"].includes(value.trim().toLowerCase())) {
    return parseBool(value);
  }
  throw new Error(`${field} must be a boolean.`);
}

export function validateBookInput(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("A book object is required.");
  const title = text(input.title, "title", 300);
  const author = text(input.author, "author", 300);
  if (!title || !author) throw new Error("Every catalog book needs a title and author.");
  const rawIsbn = text(input.isbn, "isbn", 32);
  const compactIsbn = rawIsbn.toUpperCase().replace(/[\s-]/g, "");
  if (compactIsbn && !/^(?:[0-9]{9}[0-9X]|[0-9]{13})$/.test(compactIsbn)) {
    throw new Error("isbn must be a valid ISBN-10 or ISBN-13.");
  }
  const isbn = compactIsbn ? isbnKey(compactIsbn) : "";
  if (rawIsbn && !isbn) throw new Error("isbn must be a valid ISBN-10 or ISBN-13.");
  if (input.price == null || String(input.price).trim() === "") throw new Error("price is required.");
  if (input.stock == null || String(input.stock).trim() === "") throw new Error("stock is required.");
  const condition = text(input.condition || "Good", "condition", 20);
  if (!CONDITIONS.has(condition)) throw new Error("Invalid condition.");
  if (input.categories != null && !Array.isArray(input.categories)) throw new Error("categories must be an array.");
  if (input.shelves != null && !Array.isArray(input.shelves)) throw new Error("shelves must be an array.");
  const categories = textList(input.categories, "category");
  const shelves = textList(input.shelves, "shelf");
  const cover = text(input.cover_image || "images/covers/cover-01.jpg", "cover_image", 2000);
  if (cover && !/^(https?:\/\/|\/|[A-Za-z0-9][A-Za-z0-9._/-]*$)/i.test(cover)) throw new Error("cover_image must be an HTTP(S) URL or local path.");
  return {
    title, subtitle: text(input.subtitle, "subtitle", 500), author, isbn,
    publisher: text(input.publisher, "publisher", 300), published_date: text(input.published_date, "published_date", 40),
    description: text(input.description, "description"), pages: input.pages == null || input.pages === "" ? null : number(input.pages, "pages", { integer: true, max: 100000 }),
    language: text(input.language || "English", "language", 80), cover_image: cover, preview_link: text(input.preview_link, "preview_link", 2000),
    price: number(input.price, "price"), stock: number(input.stock, "stock", { integer: true, max: 1000000 }), condition,
    is_featured: inputBoolean(input.is_featured, "is_featured"), categories, shelves,
  };
}

function rowValues(book) {
  return [book.id, book.title, book.subtitle, book.author, book.isbn, book.publisher, book.published_date,
    book.description, book.pages ?? "", book.language, book.cover_image, book.preview_link, book.price,
    book.stock, book.condition, book.is_featured ? "true" : "false", book.categories.join("|"), book.shelves.join("|"), book.created_at, book.date_added];
}

async function sheetRequest(env, url, options = {}) {
  const response = await authorizedFetch(env, url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("Catalog write permission denied. Check that the catalog connection has editor access.");
    throw new Error(`Catalog write failed (${response.status}).`);
  }
  return response.json().catch(() => ({}));
}

export async function appendBook(env, input) {
  sheetConfig(env);
  const book = validateBookInput(input);
  const books = await readSheet(env);
  const isbn = isbnKey(book.isbn);
  const duplicate = books.find((item) => (isbn && isbnKey(item.isbn) === isbn) || (normalized(item.title) === normalized(book.title) && normalized(item.author) === normalized(book.author)));
  if (duplicate) {
    return { duplicate: { id: duplicate.id, title: duplicate.title, author: duplicate.author, isbn: duplicate.isbn, stock: duplicate.stock } };
  }
  const id = Math.max(0, ...books.map((item) => item.id)) + 1;
  const timestamp = new Date().toISOString();
  const saved = { ...book, id, created_at: timestamp, date_added: timestamp };
   const range = sheetRange(env.GOOGLE_SHEETS_WORKSHEET, "A:T");
  await sheetRequest(env, `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEETS_SPREADSHEET_ID}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: JSON.stringify({ majorDimension: "ROWS", values: [rowValues(saved)] }) });
  return { book: saved };
}

export async function importCopy(env, input = {}) {
  sheetConfig(env);
  const bookId = number(input.book_id, "book_id", { integer: true, max: 2147483647 });
  if (bookId < 1) throw new Error("book_id must be a positive integer.");
  const quantity = number(input.quantity, "quantity", { integer: true, max: 1000000 });
  if (quantity < 1) throw new Error("quantity must be a positive integer.");
  const price = number(input.price, "price");
  const condition = text(input.condition, "condition", 20);
  if (!CONDITIONS.has(condition)) throw new Error("Invalid condition.");
  const books = await readSheet(env);
  const existing = books.find((book) => book.id === bookId);
  if (!existing) throw new Error("The requested book was not found.");
  const values = [[price, existing.stock + quantity, condition]];
  const range = sheetRange(env.GOOGLE_SHEETS_WORKSHEET, `M${existing._rowNumber}:O${existing._rowNumber}`);
  await sheetRequest(env, `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEETS_SPREADSHEET_ID}/values/${range}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ majorDimension: "ROWS", values }) });
  return { book: { ...existing, price, stock: existing.stock + quantity, condition } };
}

const BOOK_FIELD_COLUMNS = {
  title: 1, subtitle: 2, author: 3, isbn: 4, publisher: 5, published_date: 6,
  description: 7, pages: 8, language: 9, cover_image: 10, preview_link: 11,
  price: 12, stock: 13, condition: 14, is_featured: 15, categories: 16, shelves: 17,
};

function columnName(index) {
  let label = "";
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    label = String.fromCharCode(65 + ((value - 1) % 26)) + label;
  }
  return label;
}

function matchingBook(books, book, excludeId = null) {
  const isbn = isbnKey(book.isbn);
  return books.find((item) => item.id !== excludeId && (
    (isbn && isbnKey(item.isbn) === isbn) ||
    (normalized(item.title) === normalized(book.title) && normalized(item.author) === normalized(book.author))
  ));
}

function sameIsbn(left, right) {
  const leftKey = isbnKey(left);
  const rightKey = isbnKey(right);
  return leftKey && rightKey ? leftKey === rightKey : normalized(left) === normalized(right);
}

async function writeBookChanges(env, existing, input, changedFields, books) {
  const incomingIsbn = Object.hasOwn(input, "isbn") ? input.isbn : existing.isbn;
  const isbnUnchanged = sameIsbn(existing.isbn, incomingIsbn);
  const validationInput = { ...existing, ...input };
  if (isbnUnchanged && existing.isbn && !isbnKey(existing.isbn)) validationInput.isbn = "";
  const validated = validateBookInput(validationInput);
  const book = { ...validated, ...(isbnUnchanged ? { isbn: existing.isbn || "" } : {}) };
  const duplicate = matchingBook(books, book, existing.id);
  if (duplicate) throw new Error(`A matching book already exists in the catalog (ID ${duplicate.id}).`);
  const updated = {
    ...book,
    id: existing.id,
    created_at: existing.created_at,
    date_added: existing.date_added,
  };
  const indexes = changedFields.map((field) => BOOK_FIELD_COLUMNS[field]).sort((a, b) => a - b);
  if (!indexes.length || indexes.some((index) => index == null)) throw new Error("No valid book fields were provided.");
  const start = indexes[0];
  const end = indexes[indexes.length - 1];
  const values = rowValues(updated).slice(start, end + 1);
  const row = existing._rowNumber;
  const range = sheetRange(env.GOOGLE_SHEETS_WORKSHEET, `${columnName(start)}${row}:${columnName(end)}${row}`);
  await sheetRequest(env, `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEETS_SPREADSHEET_ID}/values/${range}?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ majorDimension: "ROWS", values: [values] }),
  });
  return updated;
}

export async function updateBook(env, bookIdValue, input) {
  sheetConfig(env);
  const bookId = number(bookIdValue, "book_id", { integer: true, max: 2147483647 });
  if (bookId < 1) throw new Error("book_id must be a positive integer.");
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("A book object is required.");
  const books = await readSheet(env);
  const existing = books.find((book) => book.id === bookId);
  if (!existing) throw new Error("The requested book was not found.");
  const updated = await writeBookChanges(env, existing, input, Object.keys(BOOK_FIELD_COLUMNS), books);
  return { book: updated };
}

export async function patchBook(env, bookIdValue, patch) {
  sheetConfig(env);
  const bookId = number(bookIdValue, "book_id", { integer: true, max: 2147483647 });
  if (bookId < 1) throw new Error("book_id must be a positive integer.");
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("A book changes object is required.");
  const changedFields = Object.keys(patch);
  if (!changedFields.length || changedFields.some((field) => !Object.hasOwn(BOOK_FIELD_COLUMNS, field))) {
    throw new Error("Only editable book fields may be changed.");
  }
  const books = await readSheet(env);
  const existing = books.find((book) => book.id === bookId);
  if (!existing) throw new Error("The requested book was not found.");
  const updated = await writeBookChanges(env, existing, patch, changedFields, books);
  return { book: updated };
}

export async function deleteBook(env, bookIdValue) {
  sheetConfig(env);
  const bookId = number(bookIdValue, "book_id", { integer: true, max: 2147483647 });
  if (bookId < 1) throw new Error("book_id must be a positive integer.");
  const existing = (await readSheet(env)).find((book) => book.id === bookId);
  if (!existing) throw new Error("The requested book was not found.");
  const range = sheetRange(env.GOOGLE_SHEETS_WORKSHEET, `A${existing._rowNumber}:T${existing._rowNumber}`);
  await sheetRequest(env, `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEETS_SPREADSHEET_ID}/values/${range}:clear`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  return { ok: true, id: existing.id };
}
