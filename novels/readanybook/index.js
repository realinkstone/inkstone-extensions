const SITE = 'https://www.readanybook.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const GENRES = [
  { id: 'action-adventure-9', label: 'Action & Adventure' },
  { id: 'children-10', label: 'Children' },
  { id: 'christmas-20', label: 'Christmas' },
  { id: 'classic-14', label: 'Classic' },
  { id: 'comedy-12', label: 'Comedy' },
  { id: 'drama-11', label: 'Drama' },
  { id: 'fantasy-6', label: 'Fantasy' },
  { id: 'fiction-17', label: 'Fiction' },
  { id: 'historical-fiction-8', label: 'Historical Fiction' },
  { id: 'horror-7', label: 'Horror' },
  { id: 'literature-15', label: 'Literature' },
  { id: 'love-romance-1', label: 'Love & Romance' },
  { id: 'mystery-3', label: 'Mystery' },
  { id: 'nonfiction-16', label: 'Nonfiction' },
  { id: 'poetry-13', label: 'Poetry' },
  { id: 'science-fiction-5', label: 'Science Fiction' },
  { id: 'thriller-4', label: 'Thriller' },
  { id: 'vampire-18', label: 'Vampire' },
  { id: 'western-2', label: 'Western' },
  { id: 'young-adult-19', label: 'Young Adult' },
];

const FEEDS = [
  { id: 'latest', name: 'Last Added' },
  { id: 'genre:fiction-17', name: 'Fiction' },
  { id: 'genre:nonfiction-16', name: 'Nonfiction' },
  { id: 'genre:classic-14', name: 'Classics' },
  { id: 'genre:love-romance-1', name: 'Love & Romance' },
  { id: 'genre:fantasy-6', name: 'Fantasy' },
  { id: 'genre:science-fiction-5', name: 'Science Fiction' },
  { id: 'genre:mystery-3', name: 'Mystery' },
  { id: 'genre:young-adult-19', name: 'Young Adult' },
];

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

const SKIP_TAGS = { script: 1, style: 1, head: 1, title: 1, svg: 1, noscript: 1, img: 1, meta: 1, link: 1, audio: 1, video: 1 };
const BLOCK_TAGS = {
  p: 1, div: 1, h1: 1, h2: 1, h3: 1, h4: 1, h5: 1, h6: 1, li: 1, ul: 1, ol: 1, blockquote: 1, pre: 1, section: 1, article: 1,
  table: 1, tbody: 1, thead: 1, tr: 1, td: 1, th: 1, dl: 1, dt: 1, dd: 1, figure: 1, figcaption: 1, header: 1, footer: 1, aside: 1,
  center: 1, body: 1, hr: 1, nav: 1, main: 1, address: 1, form: 1, fieldset: 1,
};

const FRONT_MATTER = /^(cover|cover page|front cover|title page|titlepage|half[- ]?title( page)?|contents|table of contents|toc|copyright|copyright page|also by\b.*|books by\b.*|by the same author|other books by\b.*)$/i;

const CACHE_MS = 10 * 60 * 1000;
const pageMemo = new Map();
const bookMemo = new Map();
const docMemo = new Map();
const ratingMemo = new Map();

function memo(map, key, max, make) {
  const hit = map.get(key);
  const now = Date.now();
  if (hit && now - hit.at < CACHE_MS) return hit.value;
  const value = make();
  map.set(key, { at: now, value });
  if (map.size > max) {
    const oldest = map.keys().next().value;
    map.delete(oldest);
  }
  value.catch(() => {
    const cur = map.get(key);
    if (cur && cur.value === value) map.delete(key);
  });
  return value;
}

function fixUtf8(text) {
  if (typeof text !== 'string' || !/[\u00c2-\u00f4][\u0080-\u00bf]/.test(text)) return text;
  try {
    return decodeURIComponent(escape(text));
  } catch (e) {
    return text;
  }
}

function clean(text) {
  return fixUtf8(String(text || ''))
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toHttps(url) {
  return String(url || '').replace(/^http:\/\//i, 'https://');
}

function absolute(url, base) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return toHttps(u);
  if (u.indexOf('//') === 0) return 'https:' + u;
  return (base || SITE) + (u.charAt(0) === '/' ? '' : '/') + u;
}

function coverUrl(raw) {
  const u = String(raw || '').trim();
  if (/^(https?:)?\/\/files\.readanybook\.com\//i.test(u)) return absolute(u);
  if (/^\/assets\/[^?#]*blank-cover[a-z-]*\.jpg$/i.test(u)) return SITE + u;
  return '';
}

function slugOf(href) {
  const m = /\/ebook\/([^/?#]+)/.exec(String(href || ''));
  return m ? m[1] : '';
}

function idOf(slug) {
  const m = /-(\d+)$/.exec(String(slug || ''));
  return m ? m[1] : '';
}

function rateText(parts) {
  const text = parts.filter(Boolean).join(' \n ');
  for (let i = 0; i < EXPLICIT.length; i++) if (EXPLICIT[i].test(text)) return 18;
  for (let i = 0; i < SUGGESTIVE.length; i++) if (SUGGESTIVE[i].test(text)) return 16;
  return 0;
}

function rateGenres(genres) {
  for (let i = 0; i < genres.length; i++) {
    if (/erotic|porn|hentai|adult only/i.test(genres[i])) return 18;
  }
  return 0;
}

function dirOf(path) {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i + 1);
}

function resolvePath(baseDir, rel) {
  let r = String(rel || '').split('#')[0].split('?')[0];
  try {
    r = decodeURIComponent(r);
  } catch (e) {
  }
  const out = [];
  const parts = (r.charAt(0) === '/' ? r.slice(1) : baseDir + r).split('/');
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p === '' || p === '.') continue;
    if (p === '..') out.pop();
    else out.push(p);
  }
  return out.join('/');
}

function encodePath(path) {
  return path
    .split('/')
    .map((p) => encodeURIComponent(p))
    .join('/');
}

function stripPrefixes(xml) {
  return String(xml || '').replace(/<(\/?)[A-Za-z][\w.-]*:(?=[A-Za-z])/g, '<$1');
}

function words(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\.(epub|txt|fb2|pdf|mobi|doc|docx|rtf|html?)$/i, ' ')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && ['the', 'and', 'book', 'epub', 'oceanofpdf', 'com', 'pdf', 'ebook'].indexOf(w) < 0);
}

function pickFile(files, title) {
  if (!files.length) return null;
  const want = words(title);
  let best = files[0];
  let bestScore = -1;
  for (let i = 0; i < files.length; i++) {
    const have = words(files[i].name);
    let score = 0;
    for (let j = 0; j < want.length; j++) if (have.indexOf(want[j]) >= 0) score++;
    if (score > bestScore) {
      best = files[i];
      bestScore = score;
    }
  }
  return best;
}

function htmlToBlocks(html) {
  const $ = cheerio.load(html);
  const blocks = [];
  let inline = '';
  function flush() {
    const lines = inline.split('\n').map((l) => clean(l)).filter(Boolean);
    inline = '';
    if (lines.length) blocks.push(lines.join('\n'));
  }
  function walk(node) {
    if (!node) return;
    if (node.type === 'text') {
      inline += node.data || '';
      return;
    }
    if (node.type !== 'tag') return;
    const name = String(node.name || '').toLowerCase();
    if (SKIP_TAGS[name]) return;
    if (name === 'br') {
      inline += '\n';
      return;
    }
    const block = !!BLOCK_TAGS[name];
    if (block) flush();
    const kids = node.children || [];
    for (let i = 0; i < kids.length; i++) walk(kids[i]);
    if (block) flush();
  }
  const top = $.root()[0];
  const kids = (top && top.children) || [];
  for (let i = 0; i < kids.length; i++) walk(kids[i]);
  flush();
  return blocks;
}

function anchorIndex(html, anchor) {
  if (!anchor) return 0;
  const esc = anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('\\s(?:id|name)\\s*=\\s*["\']' + esc + '["\']', 'i');
  const m = re.exec(html);
  if (!m) return -1;
  const lt = html.lastIndexOf('<', m.index);
  return lt < 0 ? 0 : lt;
}

function bodyOf(html) {
  const start = /<body[^>]*>/i.exec(html);
  let out = start ? html.slice(start.index + start[0].length) : html;
  const end = out.search(/<\/body>/i);
  if (end >= 0) out = out.slice(0, end);
  return out;
}

class Source {
  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map((g) => ({ id: g.id, label: g.label }));
  }

  async requestText(url, allow404) {
    const manager = App.createRequestManager({});
    const response = await manager.schedule(App.createRequest({ url, method: 'GET', headers: { 'User-Agent': UA, Accept: '*/*' } }));
    if (response.status === 404 && allow404) return null;
    if (response.status < 200 || response.status >= 300) throw new Error('HTTP ' + response.status + ' for ' + url);
    return String(response.data || '');
  }

  parseCards($) {
    const out = [];
    const seen = {};
    $('.book-preview-container').each((_, el) => {
      const $card = $(el);
      const link = $card.find('.preview-name a').first();
      const slug = slugOf(link.attr('href'));
      if (!slug || seen[slug]) return;
      if (!/^https?:\/\/(www\.)?readanybook\.com\//i.test(link.attr('href') || '')) return;
      seen[slug] = true;
      const title = clean(link.text());
      if (!title) return;
      const authors = $card
        .find('.preview-author .list a')
        .map((__, a) => clean($(a).text()))
        .get()
        .filter(Boolean);
      const img = $card.find('img').first();
      const image = coverUrl(img.attr('data-src'));
      const scoreText = clean($card.find('.preview-rate b').first().text());
      const score = parseFloat(scoreText);
      const manga = { mangaId: slug, title, medium: 'novel', webURL: SITE + '/ebook/' + slug };
      if (image) manga.image = image;
      if (authors.length) manga.author = authors.join(', ');
      if (isFinite(score) && score > 0) manga.rating = score;
      out.push(manga);
    });
    return out;
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') return { results: [] };
    const query = clean((request && request.title) || '');
    const tags = ((request && request.includedTags) || []).map((t) => t && t.id).filter(Boolean);
    const feed = (request && request.feed) || 'latest';
    const page = (metadata && metadata.page) || 1;
    let url = (metadata && metadata.next) || '';
    if (!url) {
      if (query) url = SITE + '/search?q=' + encodeURIComponent(query);
      else if (tags.length) url = SITE + '/genre/' + encodeURIComponent(tags[0]);
      else if (feed.indexOf('genre:') === 0) url = SITE + '/genre/' + encodeURIComponent(feed.slice(6));
      else url = SITE + '/read-online-free-books';
    }
    let results = [];
    let next = '';
    let read = 0;
    for (let hop = 0; hop < 4; hop++) {
      const html = await this.requestText(url, true);
      if (html === null) {
        next = '';
        break;
      }
      const $ = cheerio.load(html);
      const batch = this.parseCards($);
      next = toHttps($('ul.pagination li.next:not(.disabled) a').first().attr('href') || '');
      read += 1;
      const unreadable = await this.rateAll(batch);
      results = results.concat(batch.filter((r) => !unreadable[r.mangaId]));
      if (results.length >= 8 || !next || batch.length === 0) break;
      url = next;
    }
    return { results, metadata: results.length > 0 && next ? { page: page + read, next } : undefined };
  }

  bookPage(slug) {
    return memo(pageMemo, slug, 200, async () => {
      const html = await this.requestText(SITE + '/ebook/' + encodeURIComponent(slug), true);
      if (html === null) throw new Error('Book not found: ' + slug);
      return this.parseBookPage(html, slug);
    });
  }

  parseBookPage(html, slug) {
    const $ = cheerio.load(html);
    const h1 = $('.book-show h1[itemprop="name"]').first().clone();
    h1.find('span').remove();
    const title = clean(h1.text()) || slug;
    const authors = $('.book-show [itemprop="author"]')
      .map((_, a) => clean($(a).text()))
      .get()
      .filter(Boolean);
    const genres = [];
    $('.book-show .categories-list [itemprop="genre"]').each((_, a) => {
      const g = clean($(a).text());
      if (g && genres.indexOf(g) < 0) genres.push(g);
    });
    const desc = $('.book-show .book-description .show-more-text').first();
    let description = '';
    if (desc.length) {
      const copy = desc.clone();
      copy.find('.splitter-text, .more-button, a').remove();
      copy.find('br').replaceWith('\n');
      description = fixUtf8(copy.text())
        .split('\n')
        .map((l) => l.replace(/[\u00a0\s]+/g, ' ').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    } else {
      description = clean($('.book-show .book-description').first().text());
    }
    const seriesRow = $('.book-show .details-row')
      .filter((_, d) => /^Series/i.test(clean($(d).find('.details-header').text())))
      .first();
    const series = clean(seriesRow.find('.details-info').text());
    const score = parseFloat(clean($('.book-show .book-rating .current-rating').first().text()));
    const full = $('.book-show .book-cover a.gallery-item').first().attr('href') || '';
    const thumb = $('.book-show .book-cover img').first().attr('data-src') || '';
    const image = coverUrl(full) || coverUrl(thumb);
    const files = $('.reader-files .links-row[data-link]')
      .map((_, el) => ({
        id: $(el).attr('data-id') || '',
        link: toHttps($(el).attr('data-link') || '').replace(/\/+$/, ''),
        name: clean($(el).find('.links-name a').first().text()),
      }))
      .get()
      .filter((f) => /^https:\/\/files\.readanybook\.com\//.test(f.link));
    const ageRating = Math.max(rateGenres(genres), rateText([title, series, description]));
    return {
      slug,
      title,
      author: authors.join(', '),
      genres,
      description,
      series,
      score: isFinite(score) && score > 0 ? score : undefined,
      image,
      files,
      ageRating,
    };
  }

  async rateAll(results) {
    const pending = [];
    const unreadable = {};
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const known = ratingMemo.get(r.mangaId);
      if (known !== undefined) {
        r.ageRating = known.age;
        if (known.tags.length) r.tags = known.tags;
        if (!r.rating && known.score !== undefined) r.rating = known.score;
        if (!known.readable) unreadable[r.mangaId] = true;
        continue;
      }
      r.ageRating = rateText([r.title]);
      pending.push(
        this.bookPage(r.mangaId).then(
          (info) => {
            const entry = { age: info.ageRating, tags: info.genres, score: info.score, readable: info.files.length > 0 };
            ratingMemo.set(r.mangaId, entry);
            if (ratingMemo.size > 4000) ratingMemo.delete(ratingMemo.keys().next().value);
            r.ageRating = entry.age;
            if (entry.tags.length) r.tags = entry.tags;
            if (!r.rating && entry.score !== undefined) r.rating = entry.score;
            if (!entry.readable) unreadable[r.mangaId] = true;
          },
          () => {},
        ),
      );
    }
    if (!pending.length) return unreadable;
    let timer = null;
    const budget = new Promise((resolve) => {
      timer = setTimeout(resolve, 9000);
    });
    await Promise.race([Promise.all(pending), budget]);
    if (timer && typeof clearTimeout === 'function') clearTimeout(timer);
    return unreadable;
  }

  async getMangaDetails(mangaId) {
    const info = await this.bookPage(mangaId);
    const desc = info.series ? (info.description ? info.description + '\n\nSeries: ' + info.series : 'Series: ' + info.series) : info.description;
    const mangaInfo = {
      title: info.title,
      desc,
      status: 'COMPLETED',
      completed: true,
      tags: info.genres,
      medium: 'novel',
      webURL: SITE + '/ebook/' + mangaId,
      ageRating: info.ageRating,
    };
    if (info.author) mangaInfo.author = info.author;
    if (info.image) mangaInfo.image = info.image;
    if (info.score !== undefined) mangaInfo.rating = info.score;
    return { mangaInfo };
  }

  loadBook(base, title) {
    return memo(bookMemo, base, 60, async () => {
      const container = await this.requestText(base + '/META-INF/container.xml', true);
      const fp = container ? /full-path\s*=\s*"([^"]+)"/i.exec(container) : null;
      if (!fp) throw new Error('This book has no readable file on the site (no container.xml)');
      const opfPath = resolvePath('', fp[1]);
      const opfDir = dirOf(opfPath);
      const opfText = await this.requestText(base + '/' + encodePath(opfPath), true);
      if (opfText === null) throw new Error('This book has no package file on the site');
      const $o = cheerio.load(stripPrefixes(opfText), { xml: true });
      const manifest = {};
      $o('manifest item').each((_, el) => {
        const id = $o(el).attr('id');
        if (id) {
          manifest[id] = {
            href: resolvePath(opfDir, $o(el).attr('href') || ''),
            type: ($o(el).attr('media-type') || '').toLowerCase(),
            props: $o(el).attr('properties') || '',
          };
        }
      });
      const spine = [];
      $o('spine itemref').each((_, el) => {
        const item = manifest[$o(el).attr('idref')];
        if (!item) return;
        if (!/x?html|xml/.test(item.type)) return;
        spine.push({ path: item.href, linear: String($o(el).attr('linear') || 'yes').toLowerCase() !== 'no' });
      });
      if (!spine.length) throw new Error('This book has no readable pages on the site (empty spine)');
      const spineIndex = {};
      spine.forEach((s, i) => {
        spineIndex[s.path] = i;
      });
      const ncxId = $o('spine').attr('toc');
      let ncx = ncxId && manifest[ncxId] ? manifest[ncxId] : null;
      if (!ncx) {
        const found = Object.keys(manifest).filter((k) => manifest[k].type === 'application/x-dtbncx+xml');
        if (found.length) ncx = manifest[found[0]];
      }
      let navItem = null;
      Object.keys(manifest).forEach((k) => {
        if (/\bnav\b/.test(manifest[k].props)) navItem = manifest[k];
      });
      let entries = [];
      try {
        if (ncx) entries = await this.readNcx(base, ncx.href, spineIndex);
        if (!entries.length && navItem) entries = await this.readNav(base, navItem.href, spineIndex);
      } catch (e) {
        entries = [];
      }
      const book = { base, spine, entries, chapters: [], mode: 'toc' };
      const chapters = this.tocChapters(entries);
      if (chapters.length >= 3 || (chapters.length > 0 && spine.length < 3)) {
        book.chapters = chapters;
      } else {
        book.mode = 'spine';
        book.chapters = await this.spineChapters(book);
        if (!book.chapters.length && chapters.length) {
          book.mode = 'toc';
          book.chapters = chapters;
        }
      }
      if (!book.chapters.length) throw new Error('This book has no text on the site');
      return book;
    });
  }

  async readNcx(base, ncxPath, spineIndex) {
    const text = await this.requestText(base + '/' + encodePath(ncxPath), true);
    if (text === null) return [];
    const $ = cheerio.load(stripPrefixes(text), { xml: true });
    const dir = dirOf(ncxPath);
    const entries = [];
    function walk(point, depth, parentLabel) {
      const label = clean(point.children('navLabel').first().text());
      const src = point.children('content').first().attr('src') || '';
      const kids = point.children('navPoint');
      const file = resolvePath(dir, src);
      const hash = src.indexOf('#') >= 0 ? src.slice(src.indexOf('#') + 1) : '';
      let anchor = hash;
      try {
        anchor = decodeURIComponent(hash);
      } catch (e) {
        anchor = hash;
      }
      const entry = { label, file, anchor, depth, parent: parentLabel, hasChildren: kids.length > 0, spine: spineIndex[file] };
      entries.push(entry);
      kids.each((_, k) => walk($(k), depth + 1, label));
    }
    $('navMap')
      .first()
      .children('navPoint')
      .each((_, p) => walk($(p), 0, ''));
    return entries.filter((e) => e.spine !== undefined);
  }

  async readNav(base, navPath, spineIndex) {
    const text = await this.requestText(base + '/' + encodePath(navPath), true);
    if (text === null) return [];
    const $ = cheerio.load(text);
    const dir = dirOf(navPath);
    let nav = null;
    $('nav').each((_, el) => {
      const type = ($(el).attr('epub:type') || $(el).attr('type') || '').toLowerCase();
      if (!nav && type.indexOf('toc') >= 0) nav = $(el);
    });
    if (!nav) nav = $('nav').first();
    const entries = [];
    function walk(list, depth, parentLabel) {
      list.children('li').each((_, li) => {
        const a = $(li).children('a, span').first();
        const label = clean(a.text());
        const src = a.attr('href') || '';
        const sub = $(li).children('ol, ul').first();
        const file = resolvePath(dir, src);
        const hash = src.indexOf('#') >= 0 ? src.slice(src.indexOf('#') + 1) : '';
        let anchor = hash;
        try {
          anchor = decodeURIComponent(hash);
        } catch (e) {
          anchor = hash;
        }
        if (src) entries.push({ label, file, anchor, depth, parent: parentLabel, hasChildren: sub.length > 0 && sub.children('li').length > 0, spine: spineIndex[file] });
        if (sub.length) walk(sub, depth + 1, label);
      });
    }
    if (nav && nav.length) walk(nav.children('ol, ul').first(), 0, '');
    return entries.filter((e) => e.spine !== undefined);
  }

  tocChapters(entries) {
    if (!entries.length) return [];
    for (let i = 1; i < entries.length; i++) {
      if (entries[i].spine < entries[i - 1].spine) return [];
    }
    const chapters = [];
    const generic = /^(chapter|ch\.?|part|section|book|canto|act|scene|lesson|letter|page)?\s*[\divxlcIVXLC.:-]*$/i;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.hasChildren) continue;
      const prev = entries[i - 1];
      let start = { spine: e.spine, anchor: e.anchor };
      if (prev && prev.hasChildren && prev.depth === e.depth - 1 && prev.spine <= e.spine) start = { spine: prev.spine, anchor: prev.anchor };
      let name = e.label;
      if (/^\d{1,4}$/.test(name)) name = 'Chapter ' + name;
      if (e.parent && generic.test(name) && e.parent !== name) name = e.parent + ' - ' + (name || 'Start');
      const last = chapters[chapters.length - 1];
      if (last && last.start.spine === start.spine && last.start.anchor === start.anchor) continue;
      chapters.push({ id: 't' + chapters.length, name: name || 'Chapter ' + (chapters.length + 1), start, hidden: FRONT_MATTER.test(clean(name)) });
    }
    return chapters;
  }

  async spineChapters(book) {
    const linear = [];
    book.spine.forEach((s, i) => {
      if (s.linear) linear.push(i);
    });
    const chapters = [];
    if (linear.length > 60) {
      linear.forEach((i, n) => chapters.push({ id: 'd' + i, name: 'Part ' + (n + 1), spineIndex: i }));
      return chapters;
    }
    const docs = await Promise.all(
      linear.map((i) =>
        this.spineDoc(book, i).catch(() => null),
      ),
    );
    for (let n = 0; n < linear.length; n++) {
      const i = linear[n];
      const html = docs[n];
      if (html === null) continue;
      const parts = this.splitDoc(html);
      const total = parts.reduce((a, p) => a + p.length, 0);
      if (total < 120) continue;
      if (parts.length === 1) {
        chapters.push({ id: 'd' + i, name: parts[0].name || 'Part ' + (chapters.length + 1), spineIndex: i });
      } else {
        parts.forEach((p, k) => {
          if (p.length < 40) return;
          chapters.push({ id: 'd' + i + '.' + k, name: p.name || 'Part ' + (chapters.length + 1), spineIndex: i, part: k });
        });
      }
    }
    return chapters;
  }

  splitDoc(html) {
    const body = bodyOf(html);
    const plainLength = body.replace(/<[^>]*>/g, '').length;
    const whole = [{ name: this.firstHeading(body), length: plainLength, html: body }];
    if (plainLength < 30000) return whole;
    const tags = ['h1', 'h2', 'h3'];
    for (let t = 0; t < tags.length; t++) {
      const re = new RegExp('<' + tags[t] + '[\\s>]', 'ig');
      const hits = [];
      let m = null;
      while ((m = re.exec(body))) hits.push(m.index);
      if (hits.length >= 2) {
        const parts = [];
        const cuts = hits[0] > 200 ? [0].concat(hits) : hits;
        for (let c = 0; c < cuts.length; c++) {
          const slice = body.slice(cuts[c], c + 1 < cuts.length ? cuts[c + 1] : body.length);
          parts.push({ name: this.firstHeading(slice), length: slice.replace(/<[^>]*>/g, '').length, html: slice });
        }
        return parts;
      }
    }
    return whole;
  }

  firstHeading(html) {
    const m = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i.exec(html);
    if (!m) return '';
    const text = clean(m[1].replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' '));
    return text.length > 120 ? text.slice(0, 117) + '...' : text;
  }

  spineDoc(book, index) {
    const path = book.spine[index].path;
    const url = book.base + '/' + encodePath(path);
    return memo(docMemo, url, 12, async () => {
      const text = await this.requestText(url, true);
      if (text === null) throw new Error('Missing book file ' + path);
      return text;
    });
  }

  async bookFor(mangaId) {
    const info = await this.bookPage(mangaId);
    const file = pickFile(info.files, info.title);
    if (!file) throw new Error('ReadAnyBook has no readable file for this book (its reader shows a promo page instead)');
    const book = await this.loadBook(file.link, info.title);
    return { info, book };
  }

  async getChapters(mangaId) {
    const { book } = await this.bookFor(mangaId);
    const shown = book.chapters.filter((c) => !c.hidden);
    return (shown.length ? shown : book.chapters).map((c, i) => ({
      id: c.id,
      chapterId: c.id,
      name: c.name || 'Chapter ' + (i + 1),
      number: i + 1,
    }));
  }

  async getChapterDetails(mangaId, chapterId) {
    const { book } = await this.bookFor(mangaId);
    const index = book.chapters.findIndex((c) => c.id === chapterId);
    if (index < 0) throw new Error('Chapter not found: ' + chapterId);
    const chapter = book.chapters[index];
    let blocks = [];
    if (book.mode === 'toc') {
      const next = book.chapters[index + 1];
      const startSpine = chapter.start.spine;
      const endSpine = next ? next.start.spine : book.spine.length - 1;
      for (let s = startSpine; s <= endSpine; s++) {
        if (s !== startSpine && s !== endSpine && !book.spine[s].linear) continue;
        const html = bodyOf(await this.spineDoc(book, s));
        let from = 0;
        let to = html.length;
        if (s === startSpine) {
          const at = anchorIndex(html, chapter.start.anchor);
          from = at < 0 ? 0 : at;
        }
        if (next && s === endSpine) {
          const at = anchorIndex(html, next.start.anchor);
          to = at < 0 ? (next.start.anchor ? html.length : 0) : at;
          if (s === startSpine && to <= from) to = html.length;
        }
        if (to > from) blocks = blocks.concat(htmlToBlocks(html.slice(from, to)));
      }
    } else {
      const html = await this.spineDoc(book, chapter.spineIndex);
      const parts = this.splitDoc(html);
      const part = chapter.part === undefined ? null : parts[chapter.part];
      blocks = htmlToBlocks(part ? part.html : bodyOf(html));
    }
    let text = blocks.join('\n\n').trim();
    if (!text) text = 'This part of the book has no text on ReadAnyBook (the site file holds only pictures here). Open the book on ' + SITE + '/ebook/' + mangaId;
    return { id: chapterId, mangaId, pages: [], text };
  }
}

module.exports = { Source };
