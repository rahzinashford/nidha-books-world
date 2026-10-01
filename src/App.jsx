import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { workerRequest } from "./services/api";
import { DEFAULT_SETTINGS, fetchCatalog, formatInr, getCategories, resolveCover, searchBooks } from "./services/catalog";

const StoreContext = createContext(null);
const CONDITIONS = ["New", "Like New", "Good", "Fair"];

const ICON_GLYPHS = {
  "⌂": "home",
  "▦": "grid",
  "▤": "book",
  "▱": "bag",
  "ⓘ": "info",
  "◌": "chat",
  "⌕": "search",
  "♧": "truck",
  "⌧": "fileQuestion",
  "⌁": "sparkles",
  "₹": "rupee",
  "★": "star",
  "△": "alert",
  "✎": "pencil",
  "⌫": "trash",
  "→": "arrowRight",
  "←": "arrowLeft",
  "↓": "download",
  "↗": "externalLink",
  "↪": "logOut",
  "＋": "plus",
  "−": "minus",
  "✓": "check",
};

const ICON_SHAPES = {
  home: <><path d="m3 10 9-7 9 7" /><path d="M5 9.5V21h14V9.5" /><path d="M9 21v-7h6v7" /></>,
  grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
  boxes: <><path d="m4 8 4-2 4 2-4 2-4-2Z" /><path d="M4 8v5l4 2 4-2V8" /><path d="m12 8 4-2 4 2-4 2-4-2Z" /><path d="M12 8v5l4 2 4-2V8" /><path d="m8 16 4-2 4 2-4 2-4-2Z" /><path d="M8 16v4l4 2 4-2v-4" /></>,
  settings: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="8" cy="18" r="2" /></>,
  book: <><path d="M12 6v15" /><path d="M12 7C9.8 5.3 6.7 4.6 3 5v14c3.7-.4 6.8.3 9 2" /><path d="M12 7c2.2-1.7 5.3-2.4 9-2v14c-3.7-.4-6.8.3-9 2" /></>,
  bag: <><path d="M5 8h14l1 13H4L5 8Z" /><path d="M9 8a3 3 0 0 1 6 0" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></>,
  chat: <><path d="M20.5 11.5a8.5 8.5 0 0 1-12.8 7.3L3 20l1.2-4.3A8.5 8.5 0 1 1 20.5 11.5Z" /><path d="M8 12h.01M12 12h.01M16 12h.01" /></>,
  search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>,
  truck: <><path d="M3 7h11v11H3z" /><path d="M14 11h4l3 3v4h-7z" /><circle cx="7.5" cy="19" r="1.5" /><circle cx="17.5" cy="19" r="1.5" /></>,
  fileQuestion: <><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /><path d="M10 13a2 2 0 1 1 3.6 1.2c-.9 1-1.6 1.2-1.6 2.3" /><path d="M12 19h.01" /></>,
  sparkles: <><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z" /><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" /><path d="m5 3 .6 1.4L7 5l-1.4.6L5 7l-.6-1.4L3 5l1.4-.6L5 3Z" /></>,
  rupee: <text className="icon__text" x="12" y="18" textAnchor="middle">₹</text>,
  star: <path className="icon__fill" d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" />,
  alert: <><path d="M10.3 4.4a2 2 0 0 1 3.4 0l7 12.1a2 2 0 0 1-1.7 3H5a2 2 0 0 1-1.7-3z" /><path d="M12 9v4" /><path d="M12 16h.01" /></>,
  pencil: <><path d="m15 5 4 4" /><path d="m4 20 4.2-.8L19 8.4 15.6 5 4.8 15.8 4 20Z" /><path d="m13.8 6.8 3.4 3.4" /></>,
  trash: <><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="m6 7 1 14h10l1-14M9 7V4h6v3" /></>,
  arrowRight: <><path d="M4 12h15" /><path d="m13 6 6 6-6 6" /></>,
  arrowLeft: <><path d="M20 12H5" /><path d="m11 6-6 6 6 6" /></>,
  arrowDown: <><path d="M12 4v15" /><path d="m6 13 6 6 6-6" /></>,
  download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" /></>,
  externalLink: <><path d="M14 4h6v6" /><path d="m20 4-9 9" /><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" /></>,
  logOut: <><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  minus: <path d="M5 12h14" />,
  check: <path d="m5 12 4 4L19 6" />,
};

function Icon({ children, name, className = "" }) {
  const glyph = typeof children === "string" ? children.trim() : "";
  const iconName = name || ICON_GLYPHS[glyph];
  return <span className={`icon${className ? ` ${className}` : ""}`} aria-hidden="true">
    {ICON_SHAPES[iconName] ? <svg viewBox="0 0 24 24" focusable="false">{ICON_SHAPES[iconName]}</svg> : children}
  </span>;
}

function StoreProvider({ children }) {
  const [catalog, setCatalog] = useState({ books: [], settings: DEFAULT_SETTINGS, source: "loading", warning: "" });
  const [cart, setCart] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("nidha-cart") || "{}"); } catch { return {}; }
  });

  const refresh = useCallback(async () => {
    const payload = await fetchCatalog();
    setCatalog({ ...payload, books: payload.books.map((book) => ({ ...book })) });
    return payload;
  }, []);
  const updateCatalogBook = useCallback((id, changes) => {
    setCatalog((current) => ({
      ...current,
      books: current.books.map((book) => book.id === Number(id) ? { ...book, ...changes } : book),
    }));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    sessionStorage.setItem("nidha-cart", JSON.stringify(cart));
  }, [cart]);

  const addToCart = (id, quantity = 1) => {
    const book = catalog.books.find((item) => item.id === id);
    if (!book || book.stock < 1) return { ok: false, message: "This book is currently unavailable." };
    const next = Math.min(book.stock, (cart[id] || 0) + Math.max(1, Number(quantity) || 1));
    setCart({ ...cart, [id]: next });
    return { ok: true, limited: next < (cart[id] || 0) + quantity };
  };

  const updateCart = (id, quantity) => {
    const book = catalog.books.find((item) => item.id === id);
    const next = Math.max(0, Math.min(book?.stock || 0, Number(quantity) || 0));
    setCart({ ...cart, ...(next ? { [id]: next } : {}) });
    if (!next) setCart((current) => { const copy = { ...current }; delete copy[id]; return copy; });
  };

  const removeFromCart = (id) => setCart((current) => { const copy = { ...current }; delete copy[id]; return copy; });
  const clearCart = () => setCart({});
  const lines = Object.entries(cart).map(([id, quantity]) => {
    const book = catalog.books.find((item) => item.id === Number(id));
    if (!book || book.stock < 1) return null;
    const safeQuantity = Math.min(quantity, book.stock);
    return { book, quantity: safeQuantity, lineTotal: safeQuantity * book.price };
  }).filter(Boolean);
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);

  return <StoreContext.Provider value={{ ...catalog, cart, lines, itemCount, subtotal, addToCart, updateCart, removeFromCart, clearCart, refresh, updateCatalogBook }}>{children}</StoreContext.Provider>;
}

function useStore() {
  return useContext(StoreContext);
}

function useReveal() {
  useEffect(() => {
    const targets = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      targets.forEach((item) => item.classList.add("is-visible"));
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    }), { threshold: 0.12 });
    targets.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  });
}

function Layout({ children }) {
  const { settings, itemCount } = useStore();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const isCart = ["/cart", "/checkout", "/order/confirmation"].includes(location.pathname);
  const nav = [
    ["/", "Home", "home"],
    ["/browse", "Browse", "grid"],
    ["/cart", `Cart${itemCount ? ` (${itemCount})` : ""}`, "bag"],
    ["/about", "About", "info"],
  ];
  return <>
    <header className={`site-header ${scrolled ? "is-scrolled" : ""}`}>
      <Link className="site-header__brand" to="/">
        <img src="/images/logo.png" alt="" className="site-header__logo" />
        <img src="/images/header-name.png" alt={settings.store_name} className="site-header__name" />
      </Link>
      <nav className="site-header__nav">
        {nav.map(([path, label]) => <Link key={path} className={`${(path === "/" ? location.pathname === "/" : location.pathname.startsWith(path)) || (isCart && path === "/cart") ? "is-active" : ""}`} to={path}>{label}</Link>)}
      </nav>
    </header>
    <main className="site-main">
      {children}
    </main>
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div><span className="site-footer__name">{settings.store_name}</span><p className="site-footer__tagline">{settings.store_tagline}</p></div>
        <div className="site-footer__details"><p><Icon name="truck" /> {settings.delivery_info}</p></div>
      </div>
      <p className="site-footer__copyright">© {new Date().getFullYear()} {settings.store_name}. Every book has a next chapter.</p>
    </footer>
    <nav className="tab-bar" aria-label="Primary">
      {nav.map(([path, label, icon]) => <Link key={path} to={path} className={`tab-bar__item ${((path === "/" ? location.pathname === "/" : location.pathname.startsWith(path)) || (isCart && path === "/cart")) ? "is-active" : ""}`}><Icon name={icon} /><span>{label}</span></Link>)}
      <a href={`https://wa.me/${settings.whatsapp_number}`} target="_blank" rel="noreferrer" className="tab-bar__item"><Icon name="chat" /><span>WhatsApp</span></a>
    </nav>
  </>;
}

function SearchSuggest({ value, onChange, onSubmit, className = "" }) {
  const { books } = useStore();
  const [active, setActive] = useState(-1);
  const suggestions = value.trim().length >= 2 ? searchBooks(books, value).slice(0, 6) : [];
  const handleKeyDown = (event) => {
    if (!suggestions.length) return;
    if (event.key === "ArrowDown") { event.preventDefault(); setActive(Math.min(active + 1, suggestions.length - 1)); }
    if (event.key === "ArrowUp") { event.preventDefault(); setActive(Math.max(active - 1, 0)); }
    if (event.key === "Escape") setActive(-1);
    if (event.key === "Enter" && active >= 0) { event.preventDefault(); window.location.href = `/books/${suggestions[active].id}`; }
  };
  return <div className={`search-suggest ${className}`}>
    <Icon name="search" />
    <input value={value} onChange={(event) => { setActive(-1); onChange(event.target.value); }} onKeyDown={handleKeyDown} placeholder="Search title, author, ISBN, category…" aria-label="Search the collection" />
    {suggestions.length > 0 && <div className="search-suggest__list">
      {suggestions.map((book, index) => <Link key={book.id} className={`search-suggest__item ${index === active ? "is-active" : ""}`} to={`/books/${book.id}`}>
        <img className="search-suggest__cover" src={resolveCover(book.cover_image)} alt="" />
        <span className="search-suggest__text"><strong className="search-suggest__title">{book.title}</strong><small className="search-suggest__meta">{book.author} · {book.genre}</small></span>
        <b className="search-suggest__price">{formatInr(book.price)}</b>
      </Link>)}
    </div>}
    <button className="search-submit" type="button" onClick={() => onSubmit(value)} aria-label="Search"><Icon name="arrowRight" /></button>
  </div>;
}

function BookCard({ book }) {
  return <article className="book-card reveal">
    <Link to={`/books/${book.id}`} className="book-card__link">
      <div className="book-card__cover"><img src={resolveCover(book.cover_image)} alt={`Cover of ${book.title}`} loading="lazy" onError={(event) => { event.currentTarget.src = "/images/covers/cover-01.jpg"; }} /><span className="book-card__condition">{book.condition}</span></div>
      <div className="book-card__body"><h3 className="book-card__title">{book.title}</h3><p className="book-card__author">{book.author}</p><p className="book-card__price">{formatInr(book.price)}</p></div>
    </Link>
  </article>;
}

function Home() {
  const { books, settings } = useStore();
  const [query, setQuery] = useState("");
  useReveal();
  const featured = books.filter((book) => book.is_featured && book.stock > 0).slice(0, 6);
  const recent = [...books].filter((book) => book.stock > 0).sort((a, b) => new Date(b.date_added) - new Date(a.date_added)).slice(0, 8);
  const categories = getCategories(books);
  const goSearch = (term) => { if (term.trim()) window.location.href = `/browse?q=${encodeURIComponent(term.trim())}`; };
  return <div className="page-home">
    <section className="hero"><div className="hero__media"><img src="/images/hero.jpg" alt={`${settings.store_name} shelves at dusk`} /><div className="hero__scrim" /></div><div className="hero__content"><p className="hero__eyebrow"><Icon>▤</Icon> Travelling bookseller</p><h1 className="hero__title">{settings.store_name}</h1><p className="hero__tagline">{settings.store_tagline}. Every spine has a past owner — and, if you like, a next one.</p><div className="hero__actions"><Link to="/browse" className="btn btn--accent btn--lg">Browse the collection</Link><a href="#delivery-info" className="btn btn--ghost-light btn--lg"><Icon>♧</Icon> How delivery works</a></div></div></section>
    <section className="search-hero"><div className="search-hero__inner"><p className="section-eyebrow section-eyebrow--center">Card Catalog</p><h2 className="search-hero__title">What are you looking for?</h2><p className="search-hero__hint">Search by title, author, ISBN, category, or publisher.</p><SearchSuggest value={query} onChange={setQuery} onSubmit={goSearch} /><div className="search-hero__quick"><span>Or try:</span><Link to="/browse?q=poetry">Poetry</Link><Link to="/browse?condition=Like%20New">Like New</Link><Link to="/browse?q=essays">Essays</Link><Link to="/browse">Everything</Link></div></div></section>
    <BookSection eyebrow="Available now" title="Featured Books" books={featured} />
    <section className="section section--muted"><div className="section__heading"><div><p className="section-eyebrow">Recently added</p><h2>Fresh arrivals</h2></div><Link to="/browse" className="section__link">See all →</Link></div><div className="book-grid">{recent.map((book) => <BookCard key={book.id} book={book} />)}</div></section>
    <section className="section"><div className="section__heading"><div><p className="section-eyebrow">The drawers</p><h2>Browse by Category</h2></div></div><div className="drawer-grid">{categories.map((category) => <Link className="drawer-card" key={category} to={`/browse?genre=${encodeURIComponent(category)}`}><span className="drawer-card__pull" /><span className="drawer-card__label">{category}</span><span className="drawer-card__count">{books.filter((book) => book.categories?.includes(category) && book.stock > 0).length} books</span></Link>)}</div></section>
    <section className="callout" id="delivery-info"><div className="callout__inner"><Icon>♧</Icon><p className="section-eyebrow section-eyebrow--center section-eyebrow--light">Delivery available</p><h2>Books that come to you</h2><p>{settings.delivery_info}</p><a href={`https://wa.me/${settings.whatsapp_number}`} target="_blank" rel="noreferrer" className="btn btn--accent"><Icon>◌</Icon> Chat with us</a></div></section>
    <section className="section about-teaser"><div className="about-teaser__media"><img src="/images/about.jpg" alt="Hands arranging old books for delivery" /></div><div className="about-teaser__body"><p className="section-eyebrow">Our story</p><h2>About {settings.store_name}</h2><p>{settings.store_name} started as a single crate of paperbacks on a folding table. Today we travel with a carefully chosen collection, stocked with whatever has found its way into our hands — secondhand novels, forgotten poetry, essays with someone else's notes still in the margins.</p><p>No complicated checkout. If something catches your eye, message us on WhatsApp, confirm your order, and we will arrange delivery.</p><Link to="/about" className="section__link">Read our story →</Link></div></section>
  </div>;
}

function BookSection({ eyebrow, title, books }) {
  return <section className="section"><div className="section__heading"><div><p className="section-eyebrow">{eyebrow}</p><h2>{title}</h2></div><Link to="/browse" className="section__link">See all →</Link></div>{books.length ? <div className="book-scroller">{books.map((book) => <BookCard key={book.id} book={book} />)}</div> : <p className="section__subtitle">Nothing pinned as a favourite just yet — browse the full collection below.</p>}</section>;
}

function Browse() {
  const { books } = useStore();
  useReveal();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") || "");
  const genre = params.get("genre") || "";
  const condition = params.get("condition") || "";
  const results = searchBooks(books, query, genre, condition);
  const categories = getCategories(books);
  const submit = (event) => { event.preventDefault(); const next = new URLSearchParams(params); query ? next.set("q", query) : next.delete("q"); setParams(next); };
  return <><PageHeader title="Browse the collection" eyebrow="The shelves" subtitle={`${results.length} book${results.length === 1 ? "" : "s"} available to order.`} /><form className="filter-bar" onSubmit={submit}><SearchSuggest value={query} onChange={setQuery} onSubmit={(term) => { setQuery(term); submit({ preventDefault: () => {} }); }} /><div className="filter-bar__selects"><select aria-label="Filter by category" value={genre} onChange={(event) => { const next = new URLSearchParams(params); event.target.value ? next.set("genre", event.target.value) : next.delete("genre"); setParams(next); }}><option value="">All shelves</option>{categories.map((category) => <option key={category}>{category}</option>)}</select><select aria-label="Filter by condition" value={condition} onChange={(event) => { const next = new URLSearchParams(params); event.target.value ? next.set("condition", event.target.value) : next.delete("condition"); setParams(next); }}><option value="">Any condition</option>{CONDITIONS.map((item) => <option key={item}>{item}</option>)}</select><button className="btn btn--primary" type="submit">Apply</button></div></form>{results.length ? <div className="book-grid">{results.map((book) => <BookCard key={book.id} book={book} />)}</div> : <EmptyState icon="⌕" title="No books match yet" text="Try a different shelf or search term." />}</>;
}

function PageHeader({ eyebrow, title, subtitle, split = false, action }) {
  return <section className={`page-header ${split ? "page-header--split" : ""}`}><div>{eyebrow && <p className="section-eyebrow">{eyebrow}</p>}<h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action}</section>;
}

function BookDetail() {
  const { id } = useParams();
  const { books, settings, addToCart } = useStore();
  const book = books.find((item) => item.id === Number(id));
  const navigate = useNavigate();
  const [notice, setNotice] = useState("");
  if (!book) return <NotFound />;
  const related = books.filter((item) => item.id !== book.id && item.stock > 0 && item.categories?.some((category) => book.categories?.includes(category))).slice(0, 4);
  const add = () => { const result = addToCart(book.id); setNotice(result.ok ? (result.limited ? `Only ${book.stock} copies are available.` : "Added to your cart.") : result.message); };
  return <>
    <div className="book-detail">
      <Link to="/browse" className="back-link"><Icon name="arrowLeft" /> Back to the collection</Link>
      <div className="book-detail__grid">
        <div className="book-detail__cover">
          <img src={resolveCover(book.cover_image)} alt={`Cover of ${book.title}`} onError={(event) => { event.currentTarget.src = "/images/covers/cover-01.jpg"; }} />
          {!book.stock && <span className="badge badge--muted">Unavailable</span>}
        </div>
        <div className="book-detail__info">
          <p className="book-detail__genre">{book.genre}</p>
          <h1 className="book-detail__title">{book.title}</h1>
          <p className="book-detail__author">by {book.author}</p>
          <div className="book-detail__meta"><span className="book-detail__price">{formatInr(book.price)}</span><span className="badge">Used · {book.condition}</span></div>
          <p className={`book-detail__stock ${!book.stock ? "book-detail__stock--out" : ""}`}><Icon name="boxes" /> {book.stock ? `Stock: ${book.stock}` : "Out of stock"}</p>
          <hr className="divider" />
          <h2 className="book-detail__section-title">Description</h2>
          <p className="book-detail__description">{book.description}</p>
          <hr className="divider" />
          <dl className="book-detail__specs">
            <div className="book-detail__spec"><dt>Publisher</dt><dd>{book.publisher || "—"}</dd></div>
            <div className="book-detail__spec"><dt>ISBN</dt><dd>{book.isbn || "—"}</dd></div>
            <div className="book-detail__spec"><dt>Pages</dt><dd>{book.pages || "—"}</dd></div>
            <div className="book-detail__spec"><dt>Language</dt><dd>{book.language || "English"}</dd></div>
          </dl>
          {book.preview_link && <a className="book-detail__catalog-link" href={book.preview_link} target="_blank" rel="noreferrer"><Icon name="externalLink" /> View catalog details</a>}
          <hr className="divider" />
          {book.stock ? <div className="book-detail__order-actions">
            <button className="btn btn--accent btn--lg btn--block" onClick={add}><Icon name="bag" /> Add to cart</button>
            <a className="btn btn--primary btn--lg btn--block" href={`https://wa.me/${settings.whatsapp_number}?text=${encodeURIComponent(`Hi! I'd like to order "${book.title}" by ${book.author} (${formatInr(book.price)}). Please confirm availability and delivery options.`)}`} target="_blank" rel="noreferrer"><Icon name="chat" /> Order directly</a>
          </div> : <button className="btn btn--disabled btn--lg btn--block" disabled>Currently unavailable</button>}
          {notice && <div className="notice notice--success">{notice} <button onClick={() => navigate("/cart")}>View cart →</button></div>}
          <p className="book-detail__hint">Delivery charges are confirmed separately on WhatsApp.</p>
        </div>
      </div>
    </div>
    {related.length > 0 && <BookSection eyebrow="From the same shelf" title="You may also enjoy" books={related} />}
  </>;
}

function Cart() {
  const { lines, subtotal, itemCount, updateCart, removeFromCart } = useStore();
  return <><PageHeader eyebrow="Your selection" title="Your cart" subtitle={`${itemCount} book${itemCount === 1 ? "" : "s"} ready for checkout.`} split action={<Link to="/browse" className="btn btn--ghost">Continue shopping</Link>} />{lines.length ? <div className="cart-layout"><section className="cart-list">{lines.map(({ book, quantity, lineTotal }) => <article className="cart-line" key={book.id}><Link to={`/books/${book.id}`} className="cart-line__cover"><img src={resolveCover(book.cover_image)} alt={`Cover of ${book.title}`} /></Link><div className="cart-line__details"><p className="cart-line__genre">{book.genre}</p><h2><Link to={`/books/${book.id}`}>{book.title}</Link></h2><p className="cart-line__author">by {book.author}</p><p className="cart-line__unit-price">{formatInr(book.price)} each</p></div><div className="cart-line__controls"><label htmlFor={`qty-${book.id}`}>Qty</label><input id={`qty-${book.id}`} type="number" min="0" max={book.stock} value={quantity} onChange={(event) => updateCart(book.id, event.target.value)} /><button className="cart-line__remove" onClick={() => removeFromCart(book.id)}>Remove</button></div><p className="cart-line__total">{formatInr(lineTotal)}</p></article>)}</section><aside className="cart-summary"><p className="section-eyebrow">Order summary</p><h2>Ready when you are</h2><div className="cart-summary__row"><span>Books subtotal</span><strong>{formatInr(subtotal)}</strong></div><div className="cart-summary__notice"><Icon>♧</Icon><p>Delivery charges are not included. They will be confirmed with you on WhatsApp.</p></div><Link to="/checkout" className="btn btn--accent btn--lg btn--block">Continue to checkout →</Link></aside></div> : <EmptyState icon="▱" title="Your cart is waiting" text="Browse the collection and save the books you would like delivered." action={<Link to="/browse" className="btn btn--accent btn--lg">Browse books</Link>} />}</>;
}

function Checkout() {
  const { lines, itemCount, subtotal } = useStore();
  const [contact, setContact] = useState(() => { try { return JSON.parse(sessionStorage.getItem("nidha-contact") || "{}"); } catch { return {}; } });
  const [errors, setErrors] = useState([]);
  const navigate = useNavigate();
  if (!lines.length) return <Navigate to="/cart" replace />;
  const submit = (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const next = { name: String(data.get("name") || "").trim(), phone: String(data.get("phone") || "").trim(), address: String(data.get("address") || "").trim() }; const messages = []; if (!next.name) messages.push("Please enter your name."); else if (next.name.length > 120) messages.push("Please keep your name under 120 characters."); if (!next.phone) messages.push("Please enter your phone number."); else if (next.phone.length > 40) messages.push("Please keep your phone number under 40 characters."); if (!next.address) messages.push("Please enter the delivery address."); else if (next.address.length > 500) messages.push("Please keep the delivery address under 500 characters."); setContact(next); setErrors(messages); if (!messages.length) { sessionStorage.setItem("nidha-contact", JSON.stringify(next)); navigate("/order/confirmation"); } };
  return <><PageHeader eyebrow="Almost there" title="Delivery details" subtitle="Tell us where to send your books. No account or sign-in is needed." /><div className="checkout-layout"><form className="checkout-form" onSubmit={submit}><div className="checkout-form__header"><p className="section-eyebrow">Contact information</p><h2>Where should we deliver?</h2></div>{errors.length > 0 && <div className="form-errors" role="alert">{errors.map((error) => <p key={error}>{error}</p>)}</div>}<label htmlFor="name">Your name</label><input id="name" name="name" maxLength="120" defaultValue={contact.name || ""} required /><label htmlFor="phone">Phone number</label><input id="phone" name="phone" type="tel" maxLength="40" defaultValue={contact.phone || ""} required /><label htmlFor="address">Delivery address</label><textarea id="address" name="address" rows="5" maxLength="500" defaultValue={contact.address || ""} required /><div className="checkout-form__notice"><Icon>ⓘ</Icon><p>Delivery charges will be shared and confirmed with you through WhatsApp after the order is placed.</p></div><button className="btn btn--accent btn--lg btn--block">Review your order →</button></form><OrderSummary lines={lines} itemCount={itemCount} subtotal={subtotal} /></div></>;
}

function OrderSummary({ lines, itemCount, subtotal }) {
  return <aside className="checkout-summary"><p className="section-eyebrow">Your books</p><h2>{itemCount} books</h2>{lines.map(({ book, quantity, lineTotal }) => <div className="checkout-summary__line" key={book.id}><span>{book.title} <small>× {quantity}</small></span><strong>{formatInr(lineTotal)}</strong></div>)}<div className="checkout-summary__total"><span>Books subtotal</span><strong>{formatInr(subtotal)}</strong></div><Link to="/cart" className="checkout-summary__edit">← Edit cart</Link></aside>;
}

function Confirmation() {
  const { lines, itemCount, subtotal, clearCart, settings } = useStore();
  let contact = {};
  try { contact = JSON.parse(sessionStorage.getItem("nidha-contact") || "{}"); } catch { /* empty */ }
  const placeOrder = () => {
    const bookLines = lines.flatMap(({ book, quantity, lineTotal }, index) => [`${index + 1}. ${book.title}`, `   Author: ${book.author}`, `   Quantity: ${quantity}`, `   Unit price: ${formatInr(book.price)}`, `   Line total: ${formatInr(lineTotal)}`]);
    const message = ["Hello Nidha Books World,", "", "I would like to place this order:", "", ...bookLines, "", `Books subtotal: ${formatInr(subtotal)}`, "Delivery charges: To be confirmed on WhatsApp", `Total before delivery: ${formatInr(subtotal)}`, "", "Delivery details:", `Name: ${contact.name}`, `Phone: ${contact.phone}`, "Address:", contact.address, "", "Please confirm availability, delivery charges, and the final total."].join("\n");
    clearCart();
    sessionStorage.removeItem("nidha-contact");
    window.location.href = `https://wa.me/${String(settings.whatsapp_number).replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
  };
  if (!lines.length || !contact.name) return <Navigate to={lines.length ? "/checkout" : "/cart"} replace />;
  return <>
    <PageHeader eyebrow="Final review" title="Confirm your order" subtitle="Check the details below, then send the order to us on WhatsApp." />
    <div className="confirmation-layout">
      <section className="confirmation-card confirmation-card--details">
        <p className="section-eyebrow">Deliver to</p><h2>{contact.name}</h2>
        <p className="confirmation-card__phone">{contact.phone}</p><p className="confirmation-card__address">{contact.address}</p>
        <Link to="/checkout" className="checkout-summary__edit"><Icon name="pencil" /> Edit contact details</Link>
      </section>
      <section className="confirmation-card">
        <p className="section-eyebrow">Your books</p><h2>{itemCount} books</h2>
        <div className="confirmation-lines">{lines.map(({ book, quantity, lineTotal }) => <div className="confirmation-line" key={book.id}><div><strong>{book.title}</strong><span>by {book.author} · Qty {quantity}</span></div><strong>{formatInr(lineTotal)}</strong></div>)}</div>
        <div className="confirmation-total"><span>Books subtotal</span><strong>{formatInr(subtotal)}</strong></div>
        <div className="checkout-form__notice"><Icon name="truck" /><p>Delivery charges will be confirmed separately in WhatsApp.</p></div>
        <button className="btn btn--accent btn--lg btn--block" onClick={placeOrder}><Icon name="chat" /> Place order on WhatsApp</button>
      </section>
    </div>
  </>;
}

function About() {
  const { settings } = useStore();
  return <><section className="about-hero"><img src="/images/about.jpg" alt="Arranging books for delivery" /></section><section className="section about-story"><h1>A travelling bookseller, not a chain store</h1><p>{settings.store_name} started as a single crate of paperbacks on a folding table. These days we travel with a carefully chosen collection, stocked with whatever has found its way into our hands — secondhand novels, forgotten poetry, essays with someone else's notes still in the margins.</p><p>We keep ordering simple. If something catches your eye, message us on WhatsApp, confirm your order, and we will arrange delivery.</p></section><section className="section section--muted about-details"><InfoCard icon="♧" title="Delivery" text={settings.delivery_info} /><InfoCard icon="▤" title="Browse anytime" text="Explore the collection online and message us when you are ready to order." /><InfoCard icon="◌" title="Order on WhatsApp" text="Tell us what you would like and we will confirm availability and delivery." /></section><section className="callout"><div className="callout__inner"><Icon>◌</Icon><h2>Say hello</h2><p>Ask about a title, place an order, or check delivery availability.</p><a href={`https://wa.me/${settings.whatsapp_number}`} target="_blank" rel="noreferrer" className="btn btn--accent btn--lg">Message us on WhatsApp</a></div></section></>;
}

function InfoCard({ icon, title, text }) {
  return <div className="about-details__card"><Icon>{icon}</Icon><div><h3>{title}</h3><p>{text}</p></div></div>;
}

function EmptyState({ icon, title, text, action }) {
  return <section className="empty-state empty-state--card"><Icon>{icon}</Icon><h2>{title}</h2><p>{text}</p>{action}</section>;
}

function NotFound() {
  return <section className="not-found"><Icon>⌧</Icon><h1>That page slipped off the shelf.</h1><p>We couldn't find what you were looking for.</p><Link to="/" className="btn btn--primary">Back to Nidha Books World</Link></section>;
}

function AdminLayout({ children, onLogout }) {
  const location = useLocation();
  const links = [["/admin", "Dashboard", "grid"], ["/admin/books", "Books", "book"], ["/admin/inventory", "Inventory", "boxes"], ["/admin/settings", "Settings", "settings"]];
  return <><header className="site-header"><Link className="site-header__brand" to="/admin"><img src="/images/logo.png" alt="" className="site-header__logo" /><span className="site-header__name admin-brand-name">Nidha Books World <span className="admin-badge">Admin</span></span></Link><nav className="site-header__nav">{links.map(([path, label]) => <Link key={path} className={location.pathname === path || (path !== "/admin" && location.pathname.startsWith(path)) ? "is-active" : ""} to={path}>{label}</Link>)}</nav><div className="site-header__actions"><Link className="admin-header-link" to="/"><Icon>↗</Icon><span>View site</span></Link><button className="admin-header-link" onClick={onLogout}><Icon>↪</Icon><span>Log out</span></button></div></header><main className="site-main admin-main">{children}</main><nav className="tab-bar">{links.map(([path, label, icon]) => <Link key={path} className={`tab-bar__item ${location.pathname === path ? "is-active" : ""}`} to={path}><Icon name={icon} /><span>{label}</span></Link>)}</nav></>;
}

function AdminGuard() {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();
  useEffect(() => {
    workerRequest("/api/admin/session")
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false))
      .finally(() => setChecking(false));
  }, []);
  if (checking) return <div className="admin-login"><p role="status">Checking admin session…</p></div>;
  if (!authed) return <AdminLogin onLogin={() => setAuthed(true)} />;
  return <AdminLayout onLogout={async () => { await workerRequest("/admin/logout", { method: "POST" }).catch(() => {}); setAuthed(false); navigate("/admin/login"); }}><Routes><Route index element={<AdminDashboard />} /><Route path="books" element={<AdminBooks />} /><Route path="books/new" element={<AdminBookForm />} /><Route path="books/:bookId/edit" element={<AdminBookForm />} /><Route path="books/import" element={<AdminImport />} /><Route path="inventory" element={<AdminInventory />} /><Route path="settings" element={<AdminSettings />} /></Routes></AdminLayout>;
}

function AdminLogin({ onLogin }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get("password");
    setError("");
    setLoading(true);
    try {
      await workerRequest("/admin/login", { method: "POST", body: JSON.stringify({ password }) });
      onLogin();
    } catch (err) {
      setError(err.message || "Sign-in failed.");
    } finally {
      setLoading(false);
    }
  };
  return <div className="admin-login"><div className="admin-login__card"><img src="/images/logo.png" alt="" className="admin-login__logo" /><h1>Admin Login</h1><p className="admin-login__hint">Sign in to manage Nidha Books World.</p>{error && <div className="admin-flash admin-flash--error">{error}</div>}<form onSubmit={submit} className="admin-form"><input name="username" type="text" autoComplete="username" tabIndex="-1" aria-hidden="true" className="sr-only" /><label className="admin-field"><span>Password</span><input name="password" type="password" autoComplete="current-password" autoFocus required /></label><button className="btn btn--primary btn--block" disabled={loading}>{loading ? "Signing in…" : "Log in"}</button></form><p className="preview-note">Sign-in is checked by the Worker. Configure ADMIN_PASSWORD and SESSION_SECRET in the environment.</p></div></div>;
}

function AdminDashboard() {
  const { books, source, warning } = useStore();
  const totalStock = books.reduce((sum, book) => sum + book.stock, 0);
  const value = books.reduce((sum, book) => sum + book.stock * book.price, 0);
  const low = books.filter((book) => book.stock > 0 && book.stock <= 2).sort((a, b) => a.stock - b.stock).slice(0, 6);
  const recent = [...books].sort((a, b) => new Date(b.date_added) - new Date(a.date_added)).slice(0, 5);
  return <><PageHeader title="Dashboard" subtitle="A quick look at the catalog." />{source === "error" && <div className="admin-flash admin-flash--error" role="alert">{warning}</div>}{source === "loading" && <p role="status">Loading catalog…</p>}<div className="admin-stat-grid"><Stat icon="▤" value={books.length} label="Books in catalog" /><Stat icon="▦" value={totalStock} label="Copies in stock" /><Stat icon="₹" value={formatInr(value)} label="Inventory value" /><Stat icon="★" value={books.filter((book) => book.is_featured).length} label="Featured" /><Stat icon="△" value={books.filter((book) => book.stock === 0).length} label="Out of stock" warn /></div><div className="admin-panel-grid"><AdminList title="Low stock" items={low.map((book) => [book.title, `${book.stock} left`])} empty="Nothing running low right now." /><AdminList title="Recently added" items={recent.map((book) => [book.title, formatInr(book.price)])} empty="No books yet." /></div><div className="admin-quick-actions"><Link to="/admin/books/import" className="btn btn--primary"><Icon>↓</Icon> Import a book</Link><Link to="/admin/books/new" className="btn btn--ghost"><Icon>＋</Icon> Add a book manually</Link><Link to="/admin/inventory" className="btn btn--ghost"><Icon>▦</Icon> Manage inventory</Link></div></>;
}

function Stat({ icon, value, label, warn }) { return <div className={`admin-stat-card ${warn ? "admin-stat-card--warn" : ""}`}><Icon>{icon}</Icon><span className="admin-stat-card__value">{value}</span><span className="admin-stat-card__label">{label}</span></div>; }
function AdminList({ title, items, empty }) { return <section className="admin-panel"><div className="admin-panel__header"><h2>{title}</h2><Link to="/admin/inventory" className="section__link">See all →</Link></div>{items.length ? <ul className="admin-list">{items.map(([title, meta]) => <li className="admin-list__row" key={title}><span className="admin-list__title">{title}</span><span className="badge badge--muted">{meta}</span></li>)}</ul> : <p className="admin-panel__empty">{empty}</p>}</section>; }

function AdminBooks() {
  const [query, setQuery] = useState("");
  const { books: catalogBooks, source, warning, refresh } = useStore();
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const books = catalogBooks.filter((book) => !query || [book.title, book.author, book.isbn].join(" ").toLowerCase().includes(query.toLowerCase())).sort((a, b) => a.title.localeCompare(b.title));
  const toggleFeatured = async (book) => {
    setBusyId(book.id);
    setNotice(null);
    try {
      await workerRequest(`/api/admin/catalog/${book.id}`, { method: "PATCH", body: JSON.stringify({ is_featured: !book.is_featured }) });
      await refresh();
      setNotice({ type: "success", text: `Featured status for “${book.title}” was saved.` });
    } catch (error) {
      setNotice({ type: "error", text: error.message || "Featured status could not be saved." });
    } finally {
      setBusyId(null);
    }
  };
  const del = async (book) => {
    if (!window.confirm(`Delete "${book.title}" from the catalog? This can't be undone.`)) return;
    setBusyId(book.id);
    setNotice(null);
    try {
      await workerRequest(`/api/admin/catalog/${book.id}`, { method: "DELETE" });
      await refresh();
      setNotice({ type: "success", text: `“${book.title}” was removed from the catalog.` });
    } catch (error) {
      setNotice({ type: "error", text: error.message || "The book could not be deleted." });
    } finally {
      setBusyId(null);
    }
  };
  return <>
    <PageHeader title="Books" subtitle={`${books.length} titles in the catalog.`} split action={<div className="admin-page-header__actions"><Link to="/admin/books/import" className="btn btn--ghost"><Icon>↓</Icon> Import book</Link><Link to="/admin/books/new" className="btn btn--primary"><Icon>＋</Icon> Add book</Link></div>} />
    {source === "loading" && <p role="status">Loading catalog…</p>}{source === "error" && <div className="admin-flash admin-flash--error" role="alert">{warning}</div>}{notice && <div className={`admin-flash admin-flash--${notice.type}`} role="status">{notice.text}</div>}
    <div className="admin-search-bar"><div className="search-suggest"><Icon>⌕</Icon><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by title, author, or ISBN" /></div><button className="btn btn--primary">Search</button></div>
    <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Book</th><th>Condition</th><th>Price</th><th>Stock</th><th>Featured</th><th /></tr></thead><tbody>{books.map((book) => <tr key={book.id}>
      <td className="admin-table__book"><img src={resolveCover(book.cover_image)} alt="" /><div><span className="admin-table__title">{book.title}</span><span className="admin-table__author">{book.author}</span></div></td>
      <td><span className="badge">{book.condition}</span></td><td>{formatInr(book.price)}</td><td><span className={`badge ${book.stock === 0 ? "badge--muted" : ""}`}>{book.stock}</span></td>
      <td><button disabled={busyId === book.id} className={`admin-icon-toggle ${book.is_featured ? "is-active" : ""}`} aria-label={book.is_featured ? `Remove ${book.title} from featured` : `Feature ${book.title}`} title={book.is_featured ? "Remove from featured" : "Add to featured"} onClick={() => toggleFeatured(book)}><Icon>★</Icon></button></td>
      <td className="admin-table__actions"><Link className="admin-icon-link" to={`/admin/books/${book.id}/edit`} aria-label={`Edit ${book.title}`} title="Edit book"><Icon>✎</Icon></Link><button disabled={busyId === book.id} className="admin-icon-link admin-icon-link--danger" aria-label={`Delete ${book.title}`} title="Delete book" onClick={() => del(book)}><Icon>⌫</Icon></button></td>
    </tr>)}</tbody></table></div>
  </>;
}

function AdminBookForm() {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const { books, source, warning, refresh, updateCatalogBook } = useStore();
  const existing = bookId ? books.find((book) => book.id === Number(bookId)) : null;
  const [book, setBook] = useState(existing || { title: "", author: "", isbn: "", publisher: "", pages: "", language: "English", cover_image: "/images/covers/cover-01.jpg", description: "", categories: ["Literary Fiction"], price: 0, stock: 0, condition: "Good", is_featured: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverNotice, setCoverNotice] = useState(null);
  const coverFileRef = useRef(null);
  useEffect(() => {
    if (existing) setBook({ ...existing });
  }, [bookId, existing?.id]);
  if (bookId && source === "loading") return <p role="status">Loading this book…</p>;
  if (bookId && source === "error") return <div className="admin-flash admin-flash--error" role="alert">{warning}</div>;
  if (bookId && !existing) return <NotFound />;
  const update = (key, value) => setBook((current) => ({ ...current, [key]: value }));
  const uploadCover = async (event) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (!existing) {
      setCoverNotice({ type: "error", text: "Save the book before uploading a cover image." });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setCoverNotice({ type: "error", text: "Choose an image that is 8 MB or smaller." });
      return;
    }
    if (file.type && !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setCoverNotice({ type: "error", text: "Use a JPEG, PNG, or WebP image." });
      return;
    }
    const formData = new FormData();
    formData.append("cover", file, file.name);
    setCoverUploading(true);
    setCoverNotice(null);
    setError("");
    try {
      const response = await workerRequest(`/api/admin/catalog/${existing.id}/cover`, { method: "POST", body: formData });
      const coverImage = response.book?.cover_image || response.cover_image;
      if (!coverImage) throw new Error("The upload completed without returning a saved cover path.");
      update("cover_image", coverImage);
      updateCatalogBook(existing.id, { cover_image: coverImage });
      setCoverNotice({ type: "success", text: "Uploaded cover saved to the catalog and Google Sheets." });
    } catch (uploadError) {
      setCoverNotice({ type: "error", text: uploadError.message || "The cover image could not be uploaded." });
    } finally {
      setCoverUploading(false);
    }
  };
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const payload = { ...book, price: Number(book.price), stock: Number(book.stock), categories: book.categories || [], shelves: book.shelves || [] };
      await workerRequest(existing ? `/api/admin/catalog/${existing.id}` : "/api/admin/catalog", {
        method: existing ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      await refresh();
      navigate("/admin/books");
    } catch (submitError) {
      setError(submitError.message || "The book could not be saved.");
    } finally {
      setSaving(false);
    }
  };
  return <><div className="page-header"><Link to="/admin/books" className="admin-back-link">← Back to books</Link><h1>{existing ? "Edit book" : "Add a book"}</h1></div>{error && <div className="admin-flash admin-flash--error" role="alert">{error}</div>}<form className="admin-form admin-form--wide" onSubmit={submit}><div className="admin-form-grid"><fieldset className="admin-fieldset"><legend>Catalog details</legend><Field label="Title" value={book.title} onChange={(value) => update("title", value)} required /><Field label="Author" value={book.author} onChange={(value) => update("author", value)} required /><div className="admin-field-row"><Field label="ISBN" value={book.isbn} onChange={(value) => update("isbn", value)} /><Field label="Publisher" value={book.publisher} onChange={(value) => update("publisher", value)} /></div><div className="admin-field-row"><Field label="Pages" type="number" value={book.pages} onChange={(value) => update("pages", value)} /><Field label="Language" value={book.language} onChange={(value) => update("language", value)} /></div><Field label="Cover image path or URL" value={book.cover_image} onChange={(value) => update("cover_image", value)} /><div className="admin-cover-upload">
    <img className="admin-cover-upload__preview" src={resolveCover(book.cover_image)} alt={`Current cover for ${book.title || "this book"}`} onError={(event) => { event.currentTarget.src = "/images/covers/cover-01.jpg"; }} />
    <div className="admin-cover-upload__controls">
      <input ref={coverFileRef} id="admin-cover-file" className="admin-cover-upload__input" type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadCover} aria-label="Choose a cover image from this device" />
      <button type="button" className="btn btn--ghost btn--sm" aria-controls="admin-cover-file" onClick={() => coverFileRef.current?.click()} disabled={!existing || coverUploading || saving}>{coverUploading ? "Uploading cover…" : "Upload image from device"}</button>
      <small>{existing ? "JPEG, PNG, or WebP · up to 8 MB. Uploading replaces the cover URL and saves the new path to Google Sheets." : "Save the book first, then reopen it to upload a cover image."}</small>
      {coverNotice && <p className={`admin-cover-upload__notice admin-cover-upload__notice--${coverNotice.type}`} role={coverNotice.type === "error" ? "alert" : "status"}>{coverNotice.text}</p>}
    </div>
  </div><label className="admin-field"><span>Description</span><textarea rows="5" value={book.description} onChange={(event) => update("description", event.target.value)} /></label></fieldset><fieldset className="admin-fieldset"><legend>Categories & shelves</legend><Field label="Categories (comma separated)" value={(book.categories || []).join(", ")} onChange={(value) => update("categories", value.split(",").map((item) => item.trim()).filter(Boolean))} /><Field label="Shelves (comma separated)" value={(book.shelves || []).join(", ")} onChange={(value) => update("shelves", value.split(",").map((item) => item.trim()).filter(Boolean))} /><p className="admin-field__hint">Categories and shelves are saved with this listing.</p></fieldset><fieldset className="admin-fieldset"><legend>Price & stock</legend><div className="admin-field-row"><Field label="Price (₹)" type="number" value={book.price} onChange={(value) => update("price", value)} required /><Field label="Stock" type="number" value={book.stock} onChange={(value) => update("stock", value)} required /></div><label className="admin-field"><span>Condition</span><select value={book.condition} onChange={(event) => update("condition", event.target.value)}>{CONDITIONS.map((condition) => <option key={condition}>{condition}</option>)}</select></label><label className="admin-checkbox"><input type="checkbox" checked={book.is_featured} onChange={(event) => update("is_featured", event.target.checked)} /> Feature this book on the homepage</label></fieldset></div><div className="admin-form-actions"><button disabled={saving || coverUploading} className="btn btn--primary btn--lg">{saving ? "Saving…" : existing ? "Save changes" : "Add book"}</button><Link to="/admin/books" className="btn admin-btn-cancel">Cancel</Link></div></form></>;
}

function Field({ label, value, onChange, type = "text", required = false }) { return <label className="admin-field"><span>{label}</span><input type={type} min={type === "number" ? 0 : undefined} value={value ?? ""} onChange={(event) => onChange(event.target.value)} required={required} /></label>; }

function AdminInventory() {
  const [filter, setFilter] = useState("");
  const { books, source, warning, refresh } = useStore();
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [notice, setNotice] = useState(null);
  const filteredBooks = books.filter((book) => !filter || (filter === "low" ? book.stock > 0 && book.stock <= 2 : book.stock === 0));
  const draftFor = (book) => drafts[book.id] || {
    price: String(book.price),
    stock: String(book.stock),
    condition: book.condition,
    is_featured: book.is_featured,
  };
  const setDraftValue = (book, field, value) => {
    setDrafts((current) => {
      const base = current[book.id] || {
        price: String(book.price),
        stock: String(book.stock),
        condition: book.condition,
        is_featured: book.is_featured,
      };
      return { ...current, [book.id]: { ...base, [field]: value } };
    });
  };
  const saveInventory = async (book) => {
    const draft = draftFor(book);
    if (!String(draft.price).trim() || !String(draft.stock).trim()) {
      setNotice({ type: "error", text: "Enter both a price and stock quantity before saving." });
      return;
    }
    setSavingId(book.id);
    setNotice(null);
    try {
      await workerRequest(`/api/admin/catalog/${book.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          price: Number(draft.price),
          stock: Number(draft.stock),
          condition: draft.condition,
          is_featured: draft.is_featured,
        }),
      });
      await refresh();
      setDrafts((current) => {
        const next = { ...current };
        delete next[book.id];
        return next;
      });
      setNotice({ type: "success", text: `Inventory for “${book.title}” was saved.` });
    } catch (error) {
      setNotice({ type: "error", text: error.message || "Inventory changes could not be saved." });
    } finally {
      setSavingId(null);
    }
  };
  return <>
    <PageHeader title="Inventory" subtitle="Update stock, price, condition, and featured status." />
    {source === "loading" && <p role="status">Loading catalog…</p>}{source === "error" && <div className="admin-flash admin-flash--error" role="alert">{warning}</div>}{notice && <div className={`admin-flash admin-flash--${notice.type}`} role="status">{notice.text}</div>}
    <div className="admin-filter-chips">{[["", "All"], ["low", "Low stock"], ["out", "Out of stock"]].map(([value, label]) => <button key={value} className={`genre-chip ${filter === value ? "is-active" : ""}`} onClick={() => setFilter(value)}>{label}</button>)}</div>
    <div className="admin-inventory-list">{filteredBooks.map((book) => {
      const draft = draftFor(book);
      return <div className="admin-inventory-card" key={book.id}>
      <img src={resolveCover(book.cover_image)} alt="" className="admin-inventory-card__cover" />
      <div className="admin-inventory-card__body">
        <div className="admin-inventory-card__title-row"><div><span className="admin-inventory-card__title">{book.title}</span><span className="admin-inventory-card__author">{book.author}</span></div>{book.stock === 0 ? <span className="badge badge--muted">Out of stock</span> : book.stock <= 2 ? <span className="badge">Low: {book.stock} left</span> : null}</div>
        <div className="admin-inventory-card__fields">
          <Field label="Price (₹)" type="number" value={draft.price} onChange={(value) => setDraftValue(book, "price", value)} />
          <span className="admin-stock-stepper">
            <button type="button" aria-label={`Decrease stock for ${book.title}`} title="Decrease stock" onClick={() => setDraftValue(book, "stock", String(Math.max(0, (Number(draft.stock) || 0) - 1)))}><Icon>−</Icon></button>
            <input type="number" aria-label={`Stock quantity for ${book.title}`} value={draft.stock} min="0" step="1" onChange={(event) => setDraftValue(book, "stock", event.target.value)} />
            <button type="button" aria-label={`Increase stock for ${book.title}`} title="Increase stock" onClick={() => setDraftValue(book, "stock", String((Number(draft.stock) || 0) + 1))}><Icon>＋</Icon></button>
          </span>
          <label className="admin-field admin-field--compact"><span>Condition</span><select value={draft.condition} onChange={(event) => setDraftValue(book, "condition", event.target.value)}>{CONDITIONS.map((condition) => <option key={condition}>{condition}</option>)}</select></label>
          <label className="admin-checkbox admin-checkbox--compact"><input type="checkbox" checked={draft.is_featured} onChange={(event) => setDraftValue(book, "is_featured", event.target.checked)} /> Featured</label>
        </div>
        <div className="admin-form-actions"><span className="inventory-saved">Save applies all changes for this book.</span><button type="button" disabled={savingId === book.id} className="btn btn--primary" onClick={() => saveInventory(book)}>{savingId === book.id ? "Saving…" : "Save changes"}</button></div>
      </div>
    </div>;
    })}</div>
  </>;
}

function AdminSettings() {
  const { settings, source, warning, refresh } = useStore();
  const [values, setValues] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  useEffect(() => setValues(settings), [settings]);
  const update = (key, value) => setValues((current) => ({ ...current, [key]: value }));
  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      await workerRequest("/api/admin/settings", { method: "PUT", body: JSON.stringify(values) });
      await refresh();
      setNotice({ type: "success", text: "Settings saved." });
    } catch (error) {
      setNotice({ type: "error", text: error.message || "Settings could not be saved." });
    } finally {
      setSaving(false);
    }
  };
  const fields = [["store_name", "Store name"], ["store_tagline", "Store tagline"], ["delivery_info", "Delivery information"], ["whatsapp_number", "WhatsApp number"], ["currency_symbol", "Currency symbol"]];
  return <><PageHeader title="Settings" subtitle="These details appear across the storefront." />{source === "error" && <div className="admin-flash admin-flash--error" role="alert">{warning}</div>}{notice && <div className={`admin-flash admin-flash--${notice.type}`} role="status">{notice.text}</div>}<form className="admin-form" onSubmit={save}>{fields.map(([key, label]) => key === "store_tagline" || key === "delivery_info" ? <label className="admin-field" key={key}><span>{label}</span><textarea rows="3" value={values[key] ?? ""} onChange={(event) => update(key, event.target.value)} /></label> : <Field key={key} label={label} value={values[key] ?? ""} onChange={(value) => update(key, value)} />)}<div className="admin-form-actions"><button disabled={saving} className="btn btn--primary btn--lg">{saving ? "Saving…" : "Save settings"}</button></div><p className="preview-note">These settings are saved for your storefront. No credentials are stored in the browser.</p></form></>;
}

function mergeImportCandidates(existingCandidates, incomingCandidates) {
  const normalizeText = (value) => String(value || "").normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
  const normalizeIsbn = (value) => String(value || "").replace(/[^0-9Xx]/g, "").toUpperCase();
  const next = [...existingCandidates];
  for (const incoming of incomingCandidates) {
    const isbn = normalizeIsbn(incoming.isbn);
    const matchIndex = next.findIndex((item) => {
      const itemIsbn = normalizeIsbn(item.isbn);
      if (isbn && itemIsbn) return isbn === itemIsbn;
      return !isbn && !itemIsbn
        && normalizeText(item.title) === normalizeText(incoming.title)
        && normalizeText(item.author) === normalizeText(incoming.author);
    });
    if (matchIndex < 0) {
      next.push(incoming);
      continue;
    }
    const existing = next[matchIndex];
    const merged = { ...incoming, ...existing };
    for (const field of ["title", "subtitle", "author", "isbn", "description", "publisher", "published_date", "pages", "language", "cover_image", "preview_link"]) {
      if (existing[field] == null || existing[field] === "") merged[field] = incoming[field] || existing[field];
    }
    merged.sources = [...new Set([...(existing.sources || [existing.source]), ...(incoming.sources || [incoming.source])].filter(Boolean))];
    merged.categories = [...new Set([...(existing.categories || []), ...(incoming.categories || [])].filter(Boolean))];
    next[matchIndex] = merged;
  }
  return next;
}

function hasSearchableIsbn(value) {
  const isbn = String(value || "").replace(/[^0-9Xx]/g, "").toUpperCase();
  return /^\d{13}$/.test(isbn) || /^\d{9}[\dX]$/.test(isbn);
}

function AdminImport() {
  const { refresh } = useStore();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [notice, setNotice] = useState(null);
  const [searchError, setSearchError] = useState("");
  const [searchSource, setSearchSource] = useState("all");
  const [results, setResults] = useState([]);
  const [providers, setProviders] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [duplicate, setDuplicate] = useState(null);
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState(1);
  const [condition, setCondition] = useState("Good");
  const [featured, setFeatured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [retryingSource, setRetryingSource] = useState("");
  const [enriching, setEnriching] = useState(false);
  const [enrichmentError, setEnrichmentError] = useState("");
  const searchId = useRef(0);
  const enrichmentId = useRef(0);
  const sources = [
    ["all", "All sources"],
    ["google_books", "Google Books"],
    ["open_library", "Open Library"],
    ["loc", "Library of Congress"],
    ["hathitrust", "HathiTrust"],
    ["dc_bookstore", "DC Books"],
  ];
  const search = async (event) => {
    event.preventDefault();
    const term = query.trim();
    if (!term) {
      setSearchError("Enter a title, author, or ISBN to search.");
      return;
    }
    const requestId = ++searchId.current;
    enrichmentId.current++;
    setSearching(true);
    setRetryingSource("");
    setEnriching(false);
    setSearched(false);
    setSearchError("");
    setNotice(null);
    setSelected(null);
    setDuplicate(null);
    setEnrichmentError("");
    try {
      const params = new URLSearchParams({ q: term, source: searchSource });
      const payload = await workerRequest(`/api/admin/metadata/search?${params}`);
      if (requestId !== searchId.current) return;
      setResults(Array.isArray(payload.results)
        ? payload.results.filter((book) => book && typeof book === "object" && typeof book.title === "string" && typeof book.author === "string" && typeof book.source === "string")
        : []);
      setProviders(Array.isArray(payload.providers)
        ? payload.providers.filter((provider) => provider && typeof provider === "object" && typeof provider.source === "string" && typeof provider.status === "string")
        : []);
      setSearched(true);
    } catch (error) {
      if (requestId !== searchId.current) return;
      setResults([]);
      setProviders([]);
      setSearchError(error.message || "Search failed.");
      setSearched(true);
    } finally {
      if (requestId === searchId.current) setSearching(false);
    }
  };
  const enrichMetadata = async (book) => {
    if (!hasSearchableIsbn(book?.isbn)) return;
    const requestId = ++enrichmentId.current;
    const isbn = String(book.isbn).replace(/[^0-9Xx]/g, "").toUpperCase();
    setEnriching(true);
    setEnrichmentError("");
    try {
      const params = new URLSearchParams({ q: isbn, source: "all" });
      const payload = await workerRequest(`/api/admin/metadata/search?${params}`);
      if (requestId !== enrichmentId.current) return;
      const exactMatch = (payload.results || []).find((item) => String(item.isbn || "").replace(/[^0-9Xx]/g, "").toUpperCase() === isbn);
      if (!exactMatch) {
        setEnrichmentError("No additional exact-ISBN metadata was found. The selected provider record is unchanged.");
        return;
      }
      const merged = mergeImportCandidates([book], [exactMatch])[0];
      setSelected((current) => current ? merged : current);
      setResults((current) => mergeImportCandidates(current, [exactMatch]));
      if (Array.isArray(payload.providers)) setProviders(payload.providers);
    } catch (error) {
      if (requestId === enrichmentId.current) {
        setEnrichmentError(error.message || "Metadata refresh failed. The selected provider record is unchanged.");
      }
    } finally {
      if (requestId === enrichmentId.current) setEnriching(false);
    }
  };
  const retryProvider = async (source) => {
    const term = query.trim();
    if (!term || retryingSource) return;
    const requestId = ++searchId.current;
    setRetryingSource(source);
    setProviders((current) => current.map((provider) => provider.source === source
      ? { ...provider, status: "pending", reason: "Retrying this source." }
      : provider));
    try {
      const params = new URLSearchParams({ q: term, source });
      const payload = await workerRequest(`/api/admin/metadata/search?${params}`);
      if (requestId !== searchId.current) return;
      const status = (payload.providers || []).find((provider) => provider.source === source);
      if (status) setProviders((current) => current.map((provider) => provider.source === source ? status : provider));
      setResults((current) => mergeImportCandidates(current, payload.results || []));
    } catch (error) {
      if (requestId !== searchId.current) return;
      setProviders((current) => current.map((provider) => provider.source === source
        ? { ...provider, status: "error", reason: error.message || "Retry failed." }
        : provider));
    } finally {
      if (requestId === searchId.current) setRetryingSource("");
    }
  };
  const selectBook = (book) => {
    enrichmentId.current++;
    setSelected(book);
    setPrice("");
    setStock(1);
    setCondition("Good");
    setFeatured(false);
    setNotice(null);
    setDuplicate(null);
    setEnrichmentError("");
    if (hasSearchableIsbn(book.isbn)) void enrichMetadata(book);
  };
  const importBook = async (event) => {
    event.preventDefault();
    if (!selected || price === "" || !Number.isFinite(Number(price)) || Number(price) < 0 || !Number.isInteger(Number(stock)) || Number(stock) < 0) {
      setNotice({ type: "error", text: "Enter a valid price and a whole-number stock quantity." });
      return;
    }
    const input = {
      title: selected.title,
      subtitle: selected.subtitle,
      author: selected.author,
      isbn: selected.isbn,
      publisher: selected.publisher,
      published_date: selected.published_date,
      description: selected.description,
      pages: selected.pages,
      language: selected.language,
      cover_image: selected.cover_image,
      preview_link: selected.preview_link,
      price: Number(price),
      stock: Number(stock),
      condition,
      is_featured: featured,
      categories: selected.categories || [],
      shelves: [],
    };
    setNotice(null);
    setDuplicate(null);
    setSaving(true);
    try {
      const response = await workerRequest("/api/admin/catalog", { method: "POST", body: JSON.stringify(input) });
      await refresh();
      setNotice({ type: "success", text: `Added “${response.book.title}” to the catalog (ID ${response.book.id}).` });
      setSelected(null);
    } catch (error) {
      if (error.code === "CATALOG_DUPLICATE") {
        setDuplicate(error.payload?.duplicate || null);
        setNotice({ type: "error", text: error.message });
      } else {
        setNotice({ type: "error", text: error.message || "The book could not be added." });
      }
    } finally {
      setSaving(false);
    }
  };
  const addCopiesToDuplicate = async () => {
    if (!duplicate) return;
    setSaving(true);
    try {
      const response = await workerRequest("/api/admin/catalog/import-copy", {
        method: "POST",
        body: JSON.stringify({ book_id: duplicate.id, quantity: Number(stock), price: Number(price), condition }),
      });
      await refresh();
      setNotice({ type: "success", text: `Added ${stock} copies to “${response.book.title}”.` });
      setSelected(null);
      setDuplicate(null);
    } catch (error) {
      setNotice({ type: "error", text: error.message || "The existing catalog entry could not be updated." });
    } finally {
      setSaving(false);
    }
  };
  const providerState = (status) => ({
    pending: "Searching",
    ok: Number.isFinite(status.count) ? `${status.count} found` : "Available",
    no_results: "No results",
    skipped: "Skipped",
    error: "Unavailable",
  }[status.status] || status.status);
  return <>
    <div className="page-header"><Link to="/admin/books" className="admin-back-link">← Back to books</Link><h1>Import a book</h1><p>Search book catalogs, review a match, then add it to your collection.</p></div>
     <form className="import-search-bar" onSubmit={search}><label className="admin-field import-search-field"><span className="sr-only">ISBN, title, or author</span><div className="import-search-input-wrap"><Icon>⌕</Icon><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. 9780143127550 or “Atomic Habits”" autoFocus maxLength="300" /></div></label><button className="btn btn--primary btn--lg" disabled={searching}><Icon>⌕</Icon> {searching ? "Searching…" : "Search"}</button></form>
     <nav className="import-source-tabs" aria-label="Search source"><span className="import-source-tabs__label">Search source:</span>{sources.map(([value, label]) => <button type="button" className={`import-source-tab ${searchSource === value ? "is-active" : ""}`} aria-pressed={searchSource === value} key={value} onClick={() => { searchId.current++; enrichmentId.current++; setSearching(false); setRetryingSource(""); setEnriching(false); setSearchSource(value); setResults([]); setProviders([]); setSelected(null); setDuplicate(null); setSearched(false); setSearchError(""); setEnrichmentError(""); }}>{label}</button>)}</nav>
    <p className="import-main-database-note">Imported records are added to your catalog. Retailer prices from search results are not used as your selling price.</p>
    {searchError && <div className="admin-flash admin-flash--error" role="alert">{searchError}</div>}
    {notice && <div className={`admin-flash admin-flash--${notice.type}`} role="status">{notice.text}</div>}
     {providers.length > 0 && <div className="import-provider-status" aria-live="polite"><h2>Source status</h2><ul>{providers.map((provider) => <li key={provider.source} className={`import-provider-status__item import-provider-status__item--${provider.status}`}><span>{provider.label}{provider.role === "cross_check" ? " · cross-check" : ""}</span><span>{providerState(provider)}</span>{provider.reason && <small>{provider.reason}</small>}{provider.status === "error" && searched && <button type="button" className="btn btn--ghost btn--sm import-provider-status__retry" disabled={searching || Boolean(retryingSource)} onClick={() => retryProvider(provider.source)}>{retryingSource === provider.source ? "Retrying…" : "Retry source"}</button>}</li>)}</ul></div>}
     {selected ? <div className="import-preview-grid">
       <div className="import-metadata-refresh"><span role={enrichmentError ? "alert" : "status"}>{enriching ? "Checking this ISBN across all sources…" : enrichmentError || (hasSearchableIsbn(selected.isbn) ? `Metadata checked for ISBN ${selected.isbn}.` : "This result has no ISBN for an exact-edition metadata check.")}</span>{hasSearchableIsbn(selected.isbn) && <button type="button" className="btn btn--ghost btn--sm" disabled={enriching} onClick={() => enrichMetadata(selected)}>{enriching ? "Refreshing…" : "Refresh metadata"}</button>}</div>
      <div className="admin-import-preview"><img src={resolveCover(selected.cover_image)} alt="" className="admin-import-preview__cover" /><div className="admin-import-preview__meta"><h2>{selected.title}</h2><p className="admin-import-preview__author">{selected.author || "Author unavailable"}</p><dl className="admin-import-preview__specs"><div><dt>ISBN</dt><dd>{selected.isbn || "Not listed"}</dd></div><div><dt>Publisher</dt><dd>{selected.publisher || "Not listed"}</dd></div><div><dt>Pages</dt><dd>{selected.pages || "Not listed"}</dd></div><div><dt>Category</dt><dd>{(selected.categories || [])[0] || "Not listed"}</dd></div><div><dt>Match</dt><dd>{selected.match_label || "Review details"}</dd></div><div><dt>Source</dt><dd>{(selected.sources || [selected.source]).filter(Boolean).join(", ")}</dd></div></dl><p className="admin-import-preview__description">{selected.description || "No description provided by this source."}</p>{selected.cross_check_matches?.length > 0 && <div className="import-cross-check"><strong>Catalog cross-checks</strong><p>These records match the title and author, but the edition has not been verified against the DC Books listing.</p>{selected.cross_check_matches.map((match, index) => <button type="button" className="import-cross-check__match" key={`${match.source}-${index}`} onClick={() => selectBook(match)}>Review {match.title} — {match.source.replaceAll("_", " ")}{match.isbn ? ` · ISBN ${match.isbn}` : ""}</button>)}</div>}</div></div>
      <form className="admin-fieldset import-inventory-form" onSubmit={importBook}><p className="import-inventory-form__heading">Your listing</p><div className="admin-field-row"><Field label="Selling price (₹)" type="number" value={price} onChange={setPrice} required /><Field label="Stock (whole copies)" type="number" value={stock} onChange={setStock} required /></div><label className="admin-field admin-field--compact"><span>Condition</span><select value={condition} onChange={(event) => setCondition(event.target.value)}>{CONDITIONS.map((item) => <option key={item}>{item}</option>)}</select></label><label className="admin-checkbox"><input type="checkbox" checked={featured} onChange={(event) => setFeatured(event.target.checked)} /> Show in Featured Picks</label><div className="admin-form-actions"><button className="btn btn--primary" disabled={!price || saving}><Icon>✓</Icon> {saving ? "Saving…" : "Add to catalog"}</button><button type="button" className="btn admin-btn-cancel" onClick={() => { setSelected(null); setDuplicate(null); }}><Icon>←</Icon> Back to results</button></div>{duplicate && <div className="import-duplicate-action"><p>Existing catalog entry: <strong>{duplicate.title}</strong> by {duplicate.author} (ID {duplicate.id}, {duplicate.stock} in stock). Nothing was added yet.</p><button type="button" className="btn btn--ghost" onClick={addCopiesToDuplicate} disabled={!price || Number(stock) < 1 || saving}>Add these copies to the existing listing</button></div>}</form>
    </div> : <>
      {results.length > 0 ? <div className="admin-import-results">{results.map((book, index) => <article className="admin-import-candidate" key={`${book.source}-${book.isbn || book.title}-${index}`}><img src={resolveCover(book.cover_image)} alt="" /><div className="admin-import-candidate__body"><span className="admin-import-candidate__title">{book.title || "Title unavailable"}</span><span className="admin-import-candidate__author">{book.author || "Author unavailable"}</span><span className="admin-import-candidate__isbn">ISBN {book.isbn || "not listed"} · {book.publisher || "publisher not listed"}</span><span className="admin-import-candidate__isbn">{book.match_label || "Review details"}{book.sources?.length > 1 ? ` · ${book.sources.length} sources` : ` · ${book.source.replaceAll("_", " ")}`}</span>{book.cross_check_matches?.length > 0 && <span className="admin-import-candidate__cross-check">Title and author also appear in {book.cross_check_matches.map((match) => match.source.replaceAll("_", " ")).join(", ")}; edition not confirmed.</span>}</div><button type="button" className="btn btn--primary import-use-btn" onClick={() => selectBook(book)}><Icon>↓</Icon> Review</button></article>)}</div> : searched && !searchError ? <div className="admin-import-hint"><Icon>⌁</Icon><p>No matching books were found in the selected sources.</p></div> : !searched && <div className="admin-import-hint"><Icon>⌁</Icon><p>Search by ISBN for a precise edition, or use a title and author. Review each match before saving it to the catalog.</p><p className="admin-import-hint__sources">DC Books may omit ISBN and page count. Matching title and author against other catalogs is a cross-check, not proof of an identical edition.</p></div>}
    </>}
  </>;
}

export default function App() {
  return <StoreProvider><Routes><Route path="/admin/*" element={<AdminGuard />} /><Route path="/*" element={<Layout><Routes><Route path="/" element={<Home />} /><Route path="/browse" element={<Browse />} /><Route path="/books/:id" element={<BookDetail />} /><Route path="/cart" element={<Cart />} /><Route path="/checkout" element={<Checkout />} /><Route path="/order/confirmation" element={<Confirmation />} /><Route path="/about" element={<About />} /><Route path="*" element={<NotFound />} /></Routes></Layout>} /></Routes></StoreProvider>;
}