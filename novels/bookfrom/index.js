const SITE = 'https://www.bookfrom.net';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const GENRES = [
  ['romance', 'Romance'],
  ['fiction', 'Fiction'],
  ['fantasy', 'Fantasy'],
  ['young-adult', 'Young Adult'],
  ['contemporary', 'Contemporary'],
  ['mystery-thrillers', 'Mystery & Thrillers'],
  ['science-fiction-fantasy', 'Science Fiction & Fantasy'],
  ['paranormal', 'Paranormal'],
  ['historical-fiction', 'Historical Fiction'],
  ['mystery', 'Mystery'],
  ['science-fiction', 'Science Fiction'],
  ['literature-fiction', 'Literature & Fiction'],
  ['thriller', 'Thriller'],
  ['horror', 'Horror'],
  ['suspense', 'Suspense'],
  ['non-fiction', 'Nonfiction'],
  ['children-s-books', "Children's Books"],
  ['historical', 'Historical'],
  ['history', 'History'],
  ['crime', 'Crime'],
  ['chick-lit', 'Chick Lit'],
  ['short-stories', 'Short Stories'],
  ['humor', 'Humor'],
  ['poetry', 'Poetry'],
  ['erotica', 'Erotica'],
  ['classics', 'Classics'],
  ['gay-and-lesbian', 'Gay and Lesbian'],
  ['biography', 'Biography'],
  ['memoir', 'Memoir'],
  ['adult-fiction', 'Adult Fiction'],
  ['new-adult', 'New Adult'],
  ['womens-fiction', 'Womens Fiction'],
  ['science', 'Science'],
  ['historical-romance', 'Historical Romance'],
  ['vampires', 'Vampires'],
  ['urban-fantasy', 'Urban Fantasy'],
  ['sports', 'Sports'],
  ['paranormal-romance', 'Paranormal Romance'],
  ['dystopia', 'Dystopia'],
  ['politics', 'Politics'],
  ['travel', 'Travel'],
  ['christian-fiction', 'Christian Fiction'],
  ['philosophy', 'Philosophy'],
  ['religion', 'Religion'],
  ['autobiography', 'Autobiography'],
  ['m-m-romance', 'M M Romance'],
  ['cozy-mystery', 'Cozy Mystery'],
  ['adventure', 'Adventure'],
  ['comics-graphic-novels', 'Comics & Graphic Novels'],
  ['business', 'Business'],
  ['polyamorous', 'Polyamorous'],
  ['reverse-harem', 'Reverse Harem'],
  ['war', 'War'],
  ['self-help', 'Self Help'],
  ['music', 'Music'],
  ['art', 'Art'],
  ['bdsm', 'BDSM'],
  ['middle-grade', 'Middle Grade'],
  ['western', 'Western'],
  ['psychology', 'Psychology'],
  ['romantic-suspense', 'Romantic Suspense'],
  ['shapeshifters', 'Shapeshifters'],
  ['picture-books', 'Picture Books'],
  ['holiday', 'Holiday'],
  ['animals', 'Animals'],
  ['anthologies', 'Anthologies'],
  ['zombies', 'Zombies'],
  ['lgbt', 'LGBT'],
  ['lesbian-fiction', 'Lesbian Fiction'],
  ['christmas', 'Christmas'],
  ['military-fiction', 'Military Fiction'],
  ['post-apocalyptic', 'Post Apocalyptic'],
  ['true-crime', 'True Crime'],
  ['interracial-romance', 'Interracial Romance'],
  ['plays', 'Plays'],
  ['dark', 'Dark'],
  ['literature', 'Literature'],
  ['drama', 'Drama'],
  ['adult', 'Adult'],
  ['steampunk', 'Steampunk'],
  ['time-travel', 'Time Travel'],
  ['dark-romance', 'Dark Romance'],
  ['erotic', 'Erotic'],
  ['dark-fantasy', 'Dark Fantasy'],
  ['epic-fantasy', 'Epic Fantasy'],
  ['mythology', 'Mythology'],
  ['fairy-tales', 'Fairy Tales'],
  ['clean-romance', 'Clean Romance'],
  ['gothic', 'Gothic'],
  ['romantic-comedy', 'Romantic Comedy'],
  ['psychological-thriller', 'Psychological Thriller'],
];

const FEEDS = [
  { id: 'popular', name: 'Popular' },
  { id: 'genre:romance', name: 'Romance' },
  { id: 'genre:fiction', name: 'Fiction' },
  { id: 'genre:fantasy', name: 'Fantasy' },
  { id: 'genre:young-adult', name: 'Young Adult' },
  { id: 'genre:mystery-thrillers', name: 'Mystery & Thrillers' },
  { id: 'genre:science-fiction', name: 'Science Fiction' },
  { id: 'genre:paranormal', name: 'Paranormal' },
  { id: 'genre:historical-fiction', name: 'Historical Fiction' },
  { id: 'genre:horror', name: 'Horror' },
  { id: 'genre:non-fiction', name: 'Nonfiction' },
  { id: 'genre:classics', name: 'Classics' },
  { id: 'genre:children-s-books', name: "Children's Books" },
];

const EXPLICIT_GENRE = /^(erotica|erotic|bdsm|bdsm romance|bdsm erotica|bdsm and d\/s|dark erotica|romantic erotica|lesbian erotica|gay erotica|menage|reverse harem|reverse harem fantasy romance|omegaverse|m m f|m\/m\/f|smut|hentai|porn|pornography|erotic romance|erotic fiction)$/i;
const MATURE_GENRE = /^(adult|adult fiction|dark romance|sexuality|polyamorous|harem|mafia romance|dark fiction)$/i;

const EXPLICIT = [
  /\berotica\b/i,
  /\bbdsm\b/i,
  /\bhardcore\b/i,
  /\bxxx\b/i,
  /\bhentai\b/i,
  /\bnsfw\b/i,
  /\bsmut(ty)?\b/i,
  /\bporn(o|ography|ographic)\b/i,
  /\bexplicit (sex|sexual|scenes?)\b/i,
  /\bsexually explicit\b/i,
  /\bgraphic (sex|sexual)\b/i,
  /\berotic (romance|fiction|stories|story|tales?|novels?|fantasy|fantasies|literature|thriller|collection|short)\b/i,
  /\b(bondage|dominatrix|orgy|orgies|threesome|gangbang|fetish(es)?|kinky|kink)\b/i,
  /\bsex (slave|toy|toys|club)\b/i,
  /\bhot sex\b/i,
  /\bmenage\b/i,
  /\breverse harem\b/i,
  /\badults? only\b/i,
  /\bover 18\b/i,
  /\b18\+/i,
];

const SUGGESTIVE = [
  /\berotic(ism)?\b/i,
  /\bporn\b/i,
  /\bsteamy\b/i,
  /\bsensual(ity)?\b/i,
  /\bsexy\b/i,
  /\bseductive\b/i,
  /\bseduction\b/i,
  /\bdark romance\b/i,
  /\bsex (scenes?|story|stories)\b/i,
  /\bsexual (content|situations?|tension|violence|abuse|themes?|encounters?|adventures?|fantasy|fantasies|awakening)\b/i,
  /\bexplicit (content|language)\b/i,
  /\bmature (content|themes?|readers?|audiences?)\b/i,
  /\badult (content|themes?|language|situations?)\b/i,
  /\bspicy\b/i,
  /\blust(ful)?\b/i,
  /\brape\b/i,
  /\bnaked\b/i,
  /\bpassionate (night|affair|encounter)\b/i,
  /\bforbidden (love|desire|passion)\b/i,
  /\bbad boy\b/i,
  /\bharem\b/i,
  /\bmistress\b/i,
  /\bescort\b/i,
  /\bstripper\b/i,
  /\bwhore(s|house)?\b/i,
];

const CACHE_MS = 10 * 60 * 1000;
const pageMemo = new Map();
const authorMemo = new Map();
const cardMemo = new Map();

function memo(map, key, max, make) {
  const hit = map.get(key);
  const now = Date.now();
  if (hit && now - hit.at < CACHE_MS) return hit.value;
  const value = make();
  map.set(key, { at: now, value });
  if (map.size > max) map.delete(map.keys().next().value);
  value.catch(() => {
    const cur = map.get(key);
    if (cur && cur.value === value) map.delete(key);
  });
  return value;
}

function fixUtf8(text) {
  if (typeof text !== 'string' || !/[Â-ô][\u0080-¿]/.test(text)) return text;
  try {
    return decodeURIComponent(escape(text));
  } catch (e) {
    return text;
  }
}

function clean(text) {
  return fixUtf8(String(text || ''))
    .replace(/[   ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function rateText(parts) {
  const text = parts.filter(Boolean).join(' \n ');
  for (let i = 0; i < EXPLICIT.length; i++) if (EXPLICIT[i].test(text)) return 18;
  for (let i = 0; i < SUGGESTIVE.length; i++) if (SUGGESTIVE[i].test(text)) return 16;
  return 0;
}

function rateGenres(genres) {
  let rating = 0;
  for (let i = 0; i < genres.length; i++) {
    const g = clean(genres[i]);
    if (EXPLICIT_GENRE.test(g) || /erotic|bdsm|smut|hentai/i.test(g)) return 18;
    if (MATURE_GENRE.test(g)) rating = 16;
  }
  return rating;
}

function idFromHref(href) {
  const m = /^(?:https?:\/\/(?:[a-z0-9-]+\.)?bookfrom\.net)?\/([^/?#]+)\/(\d+-[^/?#]+?)\.html(?:[?#].*)?$/i.exec(String(href || '').trim());
  return m ? m[1] + '/' + m[2] : '';
}

function coverOf(src, full) {
  let u = String(src || '').trim();
  if (!u) return '';
  u = u.replace(/^http:\/\//i, 'https://').replace(/^\/\//, 'https://');
  if (u.charAt(0) === '/') u = SITE + u;
  u = u.replace(/^https:\/\/img\.bookfrom\.net\//i, 'https://picture.bookfrom.net/');
  if (full) u = u.replace(/_preview\.(jpe?g|png|webp)$/i, '.$1');
  return /^https:\/\/picture\.bookfrom\.net\//i.test(u) ? u : '';
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

class Source {
  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map((g) => ({ id: g[0], label: g[1] }));
  }

  async requestText(url, allow404) {
    const manager = App.createRequestManager({});
    const response = await manager.schedule(App.createRequest({ url, method: 'GET', headers: { 'User-Agent': UA, Accept: 'text/html,*/*' } }));
    if (response.status === 404 && allow404) return null;
    if (response.status < 200 || response.status >= 300) throw new Error('HTTP ' + response.status + ' for ' + url);
    return String(response.data || '');
  }

  parseCard($, el, fromSearch) {
    const $c = $(el);
    const link = $c.find('h2.title a').first();
    const mangaId = idFromHref(link.attr('href'));
    if (!mangaId) return null;
    const title = clean(link.text());
    if (!title) return null;
    const authorLink = fromSearch ? $c.find('h5.title a').first() : $c.find('h4 a').first();
    const author = clean(authorLink.text()).replace(/^"+|"+$/g, '');
    const genres = [];
    $c.find('a[title^="Genre"]').each((_, a) => {
      const g = clean($(a).text());
      if (g && genres.indexOf(g) < 0) genres.push(g);
    });
    const desc = clean($c.find('.text3').first().text());
    const image = coverOf($c.find('img').first().attr('src'), false);
    const year = (/(\d{4})/.exec(clean($c.find('time').first().text())) || [])[1];
    const card = {
      mangaId,
      title,
      author,
      genres,
      desc,
      image,
      year,
      ageRating: Math.max(rateGenres(genres), rateText([title, desc])),
    };
    return card;
  }

  parseList(html, fromSearch) {
    const $ = cheerio.load(html);
    const cards = [];
    const seen = {};
    const sel = fromSearch ? '[id="search result"]' : 'article.shortstory';
    $(sel).each((_, el) => {
      const card = this.parseCard($, el, fromSearch);
      if (!card || seen[card.mangaId]) return;
      seen[card.mangaId] = true;
      cards.push(card);
    });
    const next = $('.navigation .page_next a').first().attr('href') || '';
    return { cards, next: next ? next.replace(/^http:\/\//i, 'https://') : '' };
  }

  toResult(card) {
    const manga = {
      mangaId: card.mangaId,
      title: card.title,
      medium: 'novel',
      webURL: SITE + '/' + card.mangaId + '.html',
      ageRating: card.ageRating,
    };
    if (card.author) manga.author = card.author;
    if (card.image) manga.image = card.image;
    if (card.genres.length) manga.tags = card.genres;
    if (card.desc) manga.summary = card.desc;
    return manga;
  }

  rememberCards(cards) {
    cards.forEach((card) => {
      const old = cardMemo.get(card.mangaId);
      if (old && old.desc && !card.desc) return;
      cardMemo.set(card.mangaId, card);
    });
    while (cardMemo.size > 3000) cardMemo.delete(cardMemo.keys().next().value);
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') return { results: [] };
    const query = clean((request && request.title) || '');
    const tags = ((request && request.includedTags) || []).map((t) => t && t.id).filter(Boolean);
    const feed = (request && request.feed) || 'popular';
    const page = (metadata && metadata.page) || 1;
    let url;
    let fromSearch = false;
    if (query) {
      url = SITE + '/build_in_search/?q=' + encodeURIComponent(query);
      fromSearch = true;
    } else {
      const genre = tags.length ? tags[0] : feed.indexOf('genre:') === 0 ? feed.slice(6) : '';
      const base = genre ? SITE + '/' + encodeURIComponent(genre) + '/' : SITE + '/allbooks/';
      url = page > 1 ? base + 'page/' + page + '/' : base;
    }
    const html = await this.requestText(url, true);
    if (html === null) return { results: [] };
    const list = this.parseList(html, fromSearch);
    this.rememberCards(list.cards);
    const results = list.cards.map((c) => this.toResult(c));
    return { results, metadata: !fromSearch && results.length > 0 && list.next ? { page: page + 1 } : undefined };
  }

  bookPage(mangaId) {
    return memo(pageMemo, mangaId, 200, async () => {
      const html = await this.requestText(SITE + '/' + mangaId + '.html', true);
      if (html === null) throw new Error('Book not found: ' + mangaId);
      const $ = cheerio.load(html);
      const authorSlug = mangaId.split('/')[0];
      let author = '';
      $('a[href]').each((_, a) => {
        if (author) return;
        const href = $(a).attr('href') || '';
        if (new RegExp('^(?:https?://(?:[a-z0-9-]+\\.)?bookfrom\\.net)?/' + escapeRegExp(authorSlug) + '/$', 'i').test(href)) author = clean($(a).text());
      });
      let title = clean($('title').first().text()).replace(/\s*»\s*p\.\d+.*$/i, '');
      if (author) title = title.replace(new RegExp('\\s*\\(' + escapeRegExp(author) + '\\)\\s*$', 'i'), '');
      if (!$('#textToRead').length) throw new Error('This book page has no text: ' + mangaId);
      let pages = 1;
      $('a[href*="page,"]').each((_, a) => {
        const m = /page,(\d+),/.exec($(a).attr('href') || '');
        if (m) pages = Math.max(pages, parseInt(m[1], 10));
      });
      const series = clean($('a[href^="/series.html?id="]').first().text());
      const cover = coverOf($('a.highslide').first().attr('href'), false) || coverOf($('meta[property="og:image"]').attr('content'), false);
      return { mangaId, title: title || mangaId, author, pages, series, image: cover };
    });
  }

  async findCard(mangaId, title) {
    const known = cardMemo.get(mangaId);
    if (known && known.desc) return known;
    const authorSlug = mangaId.split('/')[0];
    const lists = await memo(authorMemo, authorSlug, 60, async () => {
      const urls = [1, 2, 3].map((n) => SITE + '/' + authorSlug + '/' + (n > 1 ? 'page/' + n + '/' : ''));
      const pages = await Promise.all(urls.map((u) => this.requestText(u, true).catch(() => null)));
      const cards = [];
      pages.forEach((h) => {
        if (h) this.parseList(h, false).cards.forEach((c) => cards.push(c));
      });
      return cards;
    });
    this.rememberCards(lists);
    const found = lists.filter((c) => c.mangaId === mangaId)[0];
    if (found) return found;
    if (known) return known;
    if (title) {
      try {
        const html = await this.requestText(SITE + '/build_in_search/?q=' + encodeURIComponent(title), true);
        if (html) {
          const cards = this.parseList(html, true).cards;
          this.rememberCards(cards);
          return cards.filter((c) => c.mangaId === mangaId)[0] || null;
        }
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  async getMangaDetails(mangaId) {
    const page = await this.bookPage(mangaId);
    const card = await this.findCard(mangaId, page.title).catch(() => null);
    const genres = card ? card.genres : [];
    const desc = card ? card.desc : '';
    const title = (card && card.title) || page.title;
    const author = (card && card.author) || page.author;
    const seriesLine = page.series ? 'Series: ' + page.series : '';
    const mangaInfo = {
      title,
      desc: [desc, seriesLine].filter(Boolean).join('\n\n'),
      status: 'COMPLETED',
      completed: true,
      tags: genres,
      medium: 'novel',
      webURL: SITE + '/' + mangaId + '.html',
      ageRating: Math.max(rateGenres(genres), rateText([title, desc, page.series])),
    };
    if (author) mangaInfo.author = author;
    const image = coverOf(page.image, true) || (card && card.image) || '';
    if (image) mangaInfo.image = image;
    return { mangaInfo };
  }

  async getChapters(mangaId) {
    const page = await this.bookPage(mangaId);
    const chapters = [];
    for (let n = 1; n <= page.pages; n++) {
      chapters.push({ id: String(n), chapterId: String(n), name: 'Page ' + n, number: n });
    }
    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    const n = parseInt(chapterId, 10);
    const page = await this.bookPage(mangaId);
    if (!(n >= 1 && n <= page.pages)) throw new Error('Page ' + chapterId + ' is outside this book (1 to ' + page.pages + ')');
    const slash = mangaId.indexOf('/');
    const url = n === 1 ? SITE + '/' + mangaId + '.html' : SITE + '/' + mangaId.slice(0, slash) + '/page,' + n + ',' + mangaId.slice(slash + 1) + '.html';
    const html = await this.requestText(url, true);
    if (html === null) throw new Error('Page ' + n + ' not found');
    const $ = cheerio.load(html);
    const box = $('#textToRead').first();
    if (!box.length) throw new Error('Page ' + n + ' has no text');
    box.find('center, a.highslide, img, script, style, iframe, ins, form, noscript').remove();
    box.find('br').replaceWith('\n');
    box.find('p, div, h1, h2, h3, h4, h5, h6, li, blockquote').each((_, el) => {
      $(el).append('\n');
    });
    const lines = fixUtf8(box.text())
      .split('\n')
      .map((l) => l.replace(/[   \s]+/g, ' ').trim())
      .filter(Boolean);
    if (lines.length && /^Page \d+$/i.test(lines[0])) lines.shift();
    const text = lines.join('\n\n').trim();
    if (!text) throw new Error('Page ' + n + ' has no text');
    return { id: String(n), mangaId, pages: [], text };
  }
}

module.exports = { Source };
