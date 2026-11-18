const SITE = 'https://www.baka-tsuki.org';
const API = `${SITE}/project/api.php`;
const LOGO = `${SITE}/project/images/nyahaha.png`;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const CATEGORIES = ['Category:Light novel (English)', 'Category:Teaser (English)'];
const PAGE_SIZE = 30;
const CATALOG_MS = 30 * 60 * 1000;
const PAGE_MS = 5 * 60 * 1000;

const FEEDS = [
  { id: 'all', name: 'All Projects' },
  { id: 'active', name: 'Active' },
  { id: 'completed', name: 'Completed' },
  { id: 'inactive', name: 'Inactive' },
  { id: 'teasers', name: 'Teasers' },
];

const GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Harem', 'Horror', 'Isekai', 'Josei', 'Mature', 'Mecha', 'Mystery', 'Psychological', 'Romance', 'Sci-Fi',
  'Shounen', 'Slice of Life', 'Supernatural',
];

const SKIP_HEADING = /^(story synopsis|synopsis|series information|translation|registration|feedback|updates?|project staff|translators?|editors?|series overview|contents|guides.*|general information|staff|links?|notes?|navigation|about|plot|characters?|world setting|terminology|active|inactive)\b/i;
const NO_LABEL = /^(format standards|guides.*|general information)/i;
const BAD_TITLE = /(registration page|(^|[: ])updates?$|illustrations?$|names and terminology|terminology|guidelines?$|style guide|gallery|colou?r (pages?|illustrations?)|format guideline)/i;
const NS = /^(File|Category|Template|Special|Help|Talk|User|User talk|Baka-Tsuki|MediaWiki|Project|Image|Media):/i;
const OTHER_LANGUAGE = /(\((?:indonesia|indonesian|swedish|chinese|spanish|italian|french|german|brazilian portuguese|polish|russian)\)|~|espa[nñ]ol|fran[cç]ais)/i;
const NOT_ENGLISH_TITLE = /[áéíóúñ]| y el /i;
const ECCHI_WORDS = /\b(ecchi|erotic\w*|pervert\w*|underwear|panties|nude|naked|breasts?|fetish\w*|sexual\w*|lewd|nsfw)\b/i;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '...', ldquo: '"', rdquo: '"', lsquo: "'", rsquo: "'", ndash: '-', mdash: '-' };

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decode(text) {
  return String(text || '')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => (ENTITIES[n.toLowerCase()] !== undefined ? ENTITIES[n.toLowerCase()] : m));
}

function oneLine(text) {
  return decode(String(text || '').replace(/<[^>]+>/g, ' '))
    .replace(/[ ​‎‏]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wikiUrl(title) {
  return `${SITE}/project/index.php?title=${encodeURIComponent(String(title).replace(/ /g, '_'))}`;
}

function thumbUrl(file, width) {
  return `${SITE}/project/thumb.php?f=${encodeURIComponent(String(file).replace(/ /g, '_'))}&width=${width || 300}`;
}

function titleOfHref(href) {
  const m = /[?&]title=([^&#]+)/.exec(href || '');
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]).replace(/_/g, ' ');
  } catch (e) {
    return null;
  }
}

function lower(text) {
  return String(text || '').toLowerCase();
}

function byTitle(a, b) {
  const x = lower(a.title);
  const y = lower(b.title);
  return x < y ? -1 : x > y ? 1 : 0;
}

function statusOf(states) {
  if (states.indexOf('Completed Project') >= 0) return 'COMPLETED';
  if (states.indexOf('Active Projects') >= 0) return 'ONGOING';
  if (states.indexOf('Inactive Projects') >= 0 || states.indexOf('Stalled Projects') >= 0 || states.indexOf('Idle Projects') >= 0) return 'HIATUS';
  return 'UNKNOWN';
}

function shortHeading(text) {
  return oneLine(text)
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s*[-:]\s*(full text|mobi|pdf|epub).*$/i, '')
    .trim();
}

function chapterPages(html, projectTitle, others) {
  const $ = cheerio.load(html);
  $('.mw-editsection, script, style, #toc, .toc, .navbox, .thumbcaption, .rating-section, .mw-references-wrap').remove();
  const rows = [];
  const seen = new Set();
  let skip = true;
  let group = '';
  let full = null;
  let count = 0;
  const closeGroup = () => {
    if (!skip && group && count === 0 && full && !seen.has(full)) {
      seen.add(full);
      rows.push({ title: full, name: '', group: shortHeading(group) });
    }
  };
  $('h2, h3, h4, h5, a').each((i, el) => {
    const tag = el.tagName.toLowerCase();
    if (tag !== 'a') {
      closeGroup();
      const text = oneLine($(el).text());
      skip = SKIP_HEADING.test(text);
      group = NO_LABEL.test(text) ? '' : text;
      count = 0;
      full = null;
      $(el)
        .find('a')
        .each((j, a) => {
          const t = titleOfHref($(a).attr('href'));
          if (!full && t && !NS.test(t) && /full (text|volume)/i.test($(a).text())) full = t;
        });
      return;
    }
    if (skip || $(el).parents('h2, h3, h4, h5').length) return;
    if ($(el).hasClass('new') || $(el).hasClass('external') || $(el).hasClass('mw-file-description')) return;
    const title = titleOfHref($(el).attr('href'));
    if (!title || NS.test(title) || BAD_TITLE.test(title) || title === projectTitle || others.has(title) || OTHER_LANGUAGE.test(title)) return;
    if (seen.has(title)) return;
    seen.add(title);
    count++;
    rows.push({ title, name: oneLine($(el).text()), group: shortHeading(group) });
  });
  closeGroup();
  return rows;
}

function proseOf(html) {
  const read = (dropTables) => {
    const $ = cheerio.load(html);
    $('script, style, #toc, .toc, .mw-editsection, .navbox, .noprint, sup.reference, .reference, ol.references, .references, .mw-references-wrap, rt, rp, figure, .thumb, .gallery, ul.gallery, .gallerybox, img').remove();
    if (dropTables) $('table').remove();
    $('br').replaceWith('\n');
    $('p, div, h1, h2, h3, h4, h5, h6, li, dd, dt, blockquote, pre, tr').append('\n');
    return $.root()
      .text()
      .split('\n')
      .map((line) => line.replace(/[\u00a0\u200b]/g, ' ').replace(/[ \t\r\f\v]+/g, ' ').trim())
      .filter(Boolean);
  };
  let lines = read(true);
  if (lines.join('').length < 200) lines = read(false);
  lines = lines.map((line) => line.replace(/^(?:Big text)+/i, '').replace(/^=+\s*(.*?)\s*=+$/, '$1').trim()).filter(Boolean);
  while (lines.length && /^(notes?|references?|footnotes?|translator'?s? notes?|translation notes( and references)?)$/i.test(lines[lines.length - 1])) lines.pop();
  lines = lines.filter((line) => !/^(back to|return to|forward to)\b/i.test(line) && !/^\[?edit\]?$/i.test(line) && !/^status:\s*(incomplete|complete|in progress|proofreading|editing|teaser)\.?$/i.test(line));
  return lines.join('\n\n');
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.catalog = null;
    this.catalogAt = 0;
    this.loading = null;
    this.pages = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async api(params) {
    const query = Object.keys(params)
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
      .concat(['format=json', 'formatversion=2'])
      .join('&');
    const url = `${API}?${query}`;
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { 'User-Agent': UA, Accept: 'application/json' } }));
      if (response.status !== 429 && (response.status < 502 || response.status > 504)) {
        if (response.status < 200 || response.status >= 300) throw new Error(`Baka-Tsuki: HTTP ${response.status}`);
        let body;
        try {
          body = JSON.parse(response.data);
        } catch (e) {
          throw new Error('Baka-Tsuki answered something that is not JSON');
        }
        if (body && body.error) throw new Error(`Baka-Tsuki: ${oneLine(body.error.info || body.error.code)}`);
        return body;
      }
      last = response;
      await pause(700);
    }
    throw new Error(`Baka-Tsuki: HTTP ${last ? last.status : 0}`);
  }

  loadCatalog() {
    if (this.catalog && Date.now() - this.catalogAt < CATALOG_MS) return Promise.resolve(this.catalog);
    if (!this.loading) {
      this.loading = (async () => {
        const found = new Map();
        const walks = CATEGORIES.map(async (category) => {
          let more = {};
          for (let guard = 0; guard < 12; guard++) {
            const params = {
              action: 'query', generator: 'categorymembers', gcmtitle: category, gcmnamespace: '0', gcmlimit: '50',
              prop: 'pageimages|categories', piprop: 'thumbnail', pithumbsize: '300', pilimit: '50', cllimit: '500',
            };
            Object.keys(more).forEach((k) => {
              params[k] = more[k];
            });
            const reply = await this.api(params);
            for (const page of (reply.query && reply.query.pages) || []) {
              const cats = (page.categories || []).map((c) => String(c.title).replace(/^Category:/, ''));
              const old = found.get(page.title);
              const entry = old || { title: page.title, image: '', cats: [], teaser: false, fromLight: false };
              cats.forEach((c) => {
                if (entry.cats.indexOf(c) < 0) entry.cats.push(c);
              });
              if (page.thumbnail && page.thumbnail.source) entry.image = page.thumbnail.source;
              if (category.indexOf('Teaser') >= 0) entry.teaser = true;
              else entry.fromLight = true;
              found.set(page.title, entry);
            }
            if (!reply.continue) break;
            more = reply.continue;
          }
        });
        await Promise.all(walks);
        const list = [];
        found.forEach((e) => {
          const wrongLanguage =
            e.cats.some((c) => /^(Light novel|Teaser) \((?!English)/.test(c) || /^(Brazilian Portuguese|Czech|Esperanto|Filipino|French|German|Greek|Hungarian|Indonesian|Italian|Korean|Lithuanian|Norwegian|Polish|Romanian|Russian|Spanish|Swedish|Turkish|Ukrainian|Vietnamese)$/.test(c)) ||
            OTHER_LANGUAGE.test(e.title) ||
            NOT_ENGLISH_TITLE.test(e.title);
          if (wrongLanguage) return;
          const genres = e.cats.filter((c) => /^Genre - /.test(c)).map((c) => c.slice('Genre - '.length)).filter((g) => GENRES.indexOf(g) >= 0);
          list.push({
            title: e.title,
            image: e.image ? e.image.replace(/width=\d+/, 'width=240') : LOGO,
            genres,
            states: e.cats,
            teaser: e.teaser && !e.fromLight,
            linked: e.cats.indexOf('Linked Project') >= 0,
          });
        });
        const open = list.filter((e) => !e.linked);
        open.sort(byTitle);
        if (!open.length) throw new Error('Baka-Tsuki: the project list came back empty');
        this.catalog = open;
        this.catalogAt = Date.now();
        return open;
      })();
      const clear = () => {
        this.loading = null;
      };
      this.loading.then(clear, clear);
    }
    return this.loading;
  }

  async getSearchTags() {
    return GENRES.map((g) => ({ id: g, label: g }));
  }

  ageOfGenres(genres) {
    if (genres.indexOf('Mature') >= 0) return 18;
    if (genres.indexOf('Ecchi') >= 0) return 16;
    return 0;
  }

  card(e) {
    return {
      mangaId: e.title,
      title: e.title,
      image: e.image,
      tags: e.genres,
      medium: 'novel',
      webURL: wikiUrl(e.title),
      completed: e.states.indexOf('Completed Project') >= 0,
      ageRating: this.ageOfGenres(e.genres),
    };
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') return { results: [] };
    const catalog = await this.loadCatalog();
    const page = (metadata && metadata.page) || 1;
    const query = oneLine(request && request.title)
      .toLowerCase()
      .replace(/[^a-z0-9\u00c0-\uffff]+/g, ' ')
      .trim();
    const wanted = (Array.isArray(request && request.includedTags) ? request.includedTags : [])
      .map((t) => String((t && t.id) || t || ''))
      .filter(Boolean);
    const feed = (request && request.feed) || 'all';
    let list = catalog.filter((e) => {
      if (!query && feed === 'active' && e.states.indexOf('Active Projects') < 0) return false;
      if (!query && feed === 'completed' && e.states.indexOf('Completed Project') < 0) return false;
      if (!query && feed === 'inactive' && !(e.states.indexOf('Inactive Projects') >= 0 || e.states.indexOf('Stalled Projects') >= 0 || e.states.indexOf('Idle Projects') >= 0)) return false;
      if (!query && feed === 'teasers' && !e.teaser) return false;
      if (wanted.some((g) => e.genres.indexOf(g) < 0)) return false;
      if (query) {
        const name = lower(e.title).replace(/[^a-z0-9\u00c0-\uffff]+/g, ' ');
        return query.split(' ').every((word) => name.indexOf(word) >= 0);
      }
      return true;
    });
    const start = (page - 1) * PAGE_SIZE;
    const slice = list.slice(start, start + PAGE_SIZE);
    return { results: slice.map((e) => this.card(e)), metadata: start + PAGE_SIZE < list.length ? { page: page + 1 } : undefined };
  }

  page(title, props) {
    const key = `${props}|${title}`;
    const cached = this.pages.get(key);
    if (cached && Date.now() - cached.at < PAGE_MS) return cached.promise;
    if (this.pages.size > 40) this.pages.clear();
    const promise = this.api({ action: 'parse', page: title, prop: props, redirects: '1' }).then((reply) => {
      if (!reply.parse) throw new Error('Baka-Tsuki: this page does not exist');
      return reply.parse;
    });
    this.pages.set(key, { at: Date.now(), promise });
    promise.catch(() => this.pages.delete(key));
    return promise;
  }

  async getMangaDetails(mangaId) {
    const parsed = await this.page(mangaId, 'text|categories|images');
    const $ = cheerio.load(parsed.text);
    $('.mw-editsection, script, style').remove();
    const cats = (parsed.categories || []).map((c) => String(c.category).replace(/_/g, ' '));
    const genres = cats.filter((c) => /^Genre - /.test(c)).map((c) => c.slice('Genre - '.length)).filter((g) => GENRES.indexOf(g) >= 0);
    const lead = oneLine(
      $('p')
        .filter((i, p) => $(p).prevAll('h2').length === 0)
        .map((i, p) => $(p).text())
        .get()
        .join(' '),
    );
    let synopsis = '';
    $('h2').each((i, h) => {
      if (!synopsis && /synopsis|summary|story/i.test(oneLine($(h).text()))) {
        const parts = [];
        let node = $(h).next();
        while (node.length && !/^h[1-6]$/i.test(node[0].tagName || '')) {
          if (/^(p|ul|dl|blockquote)$/i.test(node[0].tagName || '')) {
            const t = oneLine(node.text());
            if (t) parts.push(t);
          }
          node = node.next();
        }
        synopsis = parts.join('\n\n');
      }
    });
    if (!synopsis) {
      $('p').each((i, p) => {
        const t = oneLine($(p).text());
        if (!synopsis && t.length > 120) synopsis = t;
      });
    }
    const info = {};
    $('li').each((i, li) => {
      const key = oneLine($(li).children('b').first().text()).toLowerCase();
      if (key && key.length < 30 && !info[key]) info[key] = oneLine($(li).text()).slice(key.length).replace(/^\s*[:\-]\s*/, '').trim();
    });
    const cleanName = (text) =>
      oneLine(text)
        .replace(/\([^)]*\)|\[[^\]]*\]/g, '')
        .replace(/\s+(?:and|&|with)?\s*(?:the\s+)?(?:illustrat\w*|ilustrat\w*|published|serializ\w*|serialis\w*|translated)\b.*$/i, '')
        .replace(/^author\s+/i, '')
        .replace(/[,.;:]+$/, '')
        .trim();
    let author = cleanName(info.author || info.authors || info['written by'] || '');
    if (!author) {
      const m = /(?:written|authored)\s+by\s+([^,.(]+)/i.exec(lead);
      if (m) author = cleanName(m[1]);
    }
    if (!author) {
      $('h2, h3').each((i, h) => {
        const m = /\bby\s+([^,(]+)/i.exec(oneLine($(h).text()));
        if (!author && m && !/^(the|a)\s/i.test(m[1])) author = cleanName(m[1]);
      });
    }
    if (author.length > 60) author = '';
    const illustrator = info.ilustrator || info.illustrator || '';
    const lines = [];
    if (info['original title']) lines.push(`Original title: ${info['original title']}`);
    if (illustrator) lines.push(`Illustrator: ${illustrator.replace(/\.$/, '')}`);
    if (info['published volume']) lines.push(`Published volumes: ${info['published volume']}`);
    const voted = parseFloat(oneLine($('.voteboxrate').first().text()));
    const adultBanner = /18%2B\.png|18\+\.png/.test(parsed.text);
    const listed = (info.genre || '')
      .split(/[,;]/)
      .map((g) => g.replace(/\.$/, '').trim())
      .filter((g) => g && g.length < 24);
    const tags = genres.slice();
    listed.forEach((g) => {
      if (!tags.some((t) => lower(t) === lower(g))) tags.push(g);
    });
    let age = this.ageOfGenres(tags);
    if (adultBanner) age = 18;
    else if (age === 0 && ECCHI_WORDS.test(`${lead} ${synopsis}`)) age = 16;
    let image = '';
    const catalog = this.catalog;
    const known = catalog ? catalog.find((e) => e.title === mangaId) : null;
    if (known && known.image && known.image !== LOGO) image = known.image;
    if (!image) {
      const file = (parsed.images || []).find((f) => !/^(stalled|active|idle|halted|inactive|completed)\b|\.gif$|icon|18\+|18%2B|flag|button|star|rating|banner/i.test(f));
      image = file ? thumbUrl(file, 300) : LOGO;
    }
    const status = statusOf(cats);
    const info2 = {
      title: oneLine(parsed.title) || mangaId,
      image,
      desc: [synopsis, lines.join('\n')].filter(Boolean).join('\n\n') || undefined,
      status,
      tags,
      webURL: wikiUrl(parsed.title || mangaId),
      medium: 'novel',
      completed: status === 'COMPLETED',
      ageRating: age,
    };
    if (author) info2.author = author;
    if (Number.isFinite(voted) && voted > 0) info2.rating = voted;
    return { mangaInfo: info2 };
  }

  async existing(rows) {
    const keep = new Set();
    const batches = [];
    for (let i = 0; i < rows.length; i += 50) batches.push(rows.slice(i, i + 50));
    for (let i = 0; i < batches.length; i += 4) {
      await Promise.all(
        batches.slice(i, i + 4).map(async (batch) => {
          try {
            const reply = await this.api({ action: 'query', titles: batch.map((r) => r.title).join('|'), prop: 'info' });
            const renamed = {};
            ((reply.query && reply.query.normalized) || []).forEach((n) => {
              renamed[n.from] = n.to;
            });
            const alive = new Set();
            ((reply.query && reply.query.pages) || []).forEach((p) => {
              if (!p.missing && !p.invalid && (p.redirect || Number(p.length) >= 30)) alive.add(p.title);
            });
            batch.forEach((r) => {
              if (alive.has(renamed[r.title] || r.title)) keep.add(r.title);
            });
          } catch (e) {
            console.error('Baka-Tsuki page check failed: ' + (e && e.message));
            batch.forEach((r) => keep.add(r.title));
          }
        }),
      );
    }
    return rows.filter((r) => keep.has(r.title));
  }

  async getChapters(mangaId) {
    const parsed = await this.page(mangaId, 'text|categories|images');
    const catalog = await this.loadCatalog().catch(() => []);
    const others = new Set(catalog.map((e) => e.title));
    const rows = await this.existing(chapterPages(parsed.text, parsed.title || mangaId, others));
    if (!rows.length) {
      throw new Error('Baka-Tsuki: this project keeps its chapters on another site, not on the wiki. Open the project page to follow the translator link.');
    }
    const title = lower(parsed.title || mangaId);
    return rows.map((row, i) => {
      const suffix = row.title.indexOf(':') >= 0 ? row.title.slice(row.title.indexOf(':') + 1) : row.title;
      let name = row.name || suffix;
      const group = row.group && lower(row.group).indexOf(title) < 0 && !/\bseries\b/i.test(row.group) ? row.group : '';
      if (row.name === '' && group) name = `${group} (full text)`;
      else if (group && name.toLowerCase().indexOf(group.toLowerCase()) < 0) name = `${group}: ${name}`;
      return { id: row.title, chapterId: row.title, name, number: i + 1 };
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const parsed = await this.page(chapterId, 'text');
    const text = proseOf(parsed.text);
    if (!text) throw new Error('Baka-Tsuki has no text on this page');
    return { id: chapterId, mangaId, pages: [], text };
  }
}

module.exports = { Source };
