const SITE = 'https://projectsuki.com';

const FEEDS = [
  { id: 'popular', name: 'Popular' },
  { id: 'latest', name: 'Latest Updates' },
  { id: 'az', name: 'A to Z' },
];

const RATE_18 = ['adult', 'smut', 'hentai', 'erotica', 'pornographic', 'sexual+violence', 'sexual-violence', 'lolicon', 'shotacon'];
const RATE_16 = ['ecchi', 'mature'];

const LANGUAGES = { english: 'en', french: 'fr', spanish: 'es', portuguese: 'pt', german: 'de', italian: 'it', russian: 'ru', indonesian: 'id', turkish: 'tr', arabic: 'ar', polish: 'pl', vietnamese: 'vi' };

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '...', ldquo: '"', rdquo: '"', lsquo: "'", rsquo: "'", ndash: '-', mdash: '-' };

function ascii(ch) {
  const map = { '\u2018': "'", '\u2019': "'", '\u201c': '"', '\u201d': '"', '\u2026': '...', '\u2013': '-', '\u2014': '-', '\u00a0': ' ' };
  return map[ch] !== undefined ? map[ch] : ch;
}

function plain(text) {
  return String(text || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (m, n) => ascii(String.fromCharCode(Number(n))))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => ascii(String.fromCharCode(parseInt(n, 16))))
    .replace(/&([a-z]+);/gi, (m, n) => (ENTITIES[n.toLowerCase()] !== undefined ? ENTITIES[n.toLowerCase()] : m))
    .replace(/[\u2018\u2019\u201c\u201d\u2026\u2013\u2014\u00a0]/g, ascii)
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function oneLine(text) {
  return plain(text).replace(/\s+/g, ' ').trim();
}

function absolute(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.charAt(0) === '/') return SITE + u;
  return '';
}

function cleanImage(url) {
  return absolute(url).replace(/\?$/, '');
}

function genreLabel(slug) {
  let s = String(slug || '');
  try {
    s = decodeURIComponent(s);
  } catch (e) {
  }
  return s
    .replace(/\+/g, ' ')
    .split(' ')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function ageOfSlugs(slugs) {
  if (slugs.some((s) => RATE_18.indexOf(s) >= 0)) return 18;
  if (slugs.some((s) => RATE_16.indexOf(s) >= 0)) return 16;
  return 0;
}

function statusOf(text) {
  const t = oneLine(text).toLowerCase();
  if (/complet|finish/.test(t)) return 'COMPLETED';
  if (/ongoing|releasing|publishing/.test(t)) return 'ONGOING';
  if (/hiatus|pause/.test(t)) return 'HIATUS';
  if (/cancel|drop|discontinu/.test(t)) return 'CANCELLED';
  return 'UNKNOWN';
}

function topOf(html) {
  const cut = html.indexOf('<table class="table table-sm"');
  return cut > 0 ? html.slice(0, cut) : html;
}

function tableOf(html) {
  const start = html.indexOf('<table class="table table-sm"');
  if (start < 0) return '';
  const end = html.indexOf('</table>', start);
  return end < 0 ? html.slice(start) : html.slice(start, end + 8);
}

function slugsOf(top) {
  const out = [];
  const re = /href="\/genre\/([^"]+)"/g;
  let m;
  while ((m = re.exec(top))) {
    const s = m[1].toLowerCase();
    if (out.indexOf(s) < 0) out.push(s);
  }
  return out;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.summaries = new Map();
    this.recent = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return [];
  }

  async fetchHtml(path) {
    const response = await this.requests.schedule(App.createRequest({ url: `${SITE}${path}`, method: 'GET', headers: { Accept: 'text/html,application/xhtml+xml' } }));
    const body = typeof response.data === 'string' ? response.data : '';
    if (/<title>\s*Just a moment/i.test(body) || (response.headers && String(response.headers['cf-mitigated'] || '').indexOf('challenge') >= 0)) {
      throw new Error('Project Suki is showing a Cloudflare check; open the source in the app to clear it');
    }
    if (response.status === 404) throw new Error('Project Suki: not found (HTTP 404)');
    if (response.status < 200 || response.status >= 300) throw new Error(`Project Suki: HTTP ${response.status}`);
    return body;
  }

  cards(html) {
    const $ = cheerio.load(html);
    const out = [];
    const seen = new Set();
    const add = (id, title, image, views, summary) => {
      if (!id || !title || seen.has(id)) return;
      seen.add(id);
      out.push({ id, title, image, views, summary });
    };
    $('div.browse').each((i, el) => {
      const node = $(el);
      const link = node.find('a[href^="/book/"]').first();
      const m = /^\/book\/(\d+)/.exec(String(link.attr('href') || ''));
      if (!m) return;
      const head = node.find('h4 a, h5 a').first();
      const text = oneLine(node.find('small').text());
      const v = /Views:\s*(\d*)/.exec(text);
      const rows = node.find('small div');
      let summary = '';
      rows.each((j, row) => {
        const t = oneLine($(row).text());
        if (!/^(Views|Status):/.test(t) && t.length > summary.length) summary = t.replace(/\s*Show more$/, '');
      });
      add(m[1], oneLine(head.text()) || oneLine(node.find('img.browse').first().attr('alt')), cleanImage(node.find('img.browse').first().attr('src')), v && v[1] !== '' ? Number(v[1]) : null, summary);
    });
    $('div.item').each((i, el) => {
      const node = $(el);
      const link = node.find('p.title a').first();
      const m = /^\/book\/(\d+)/.exec(String(link.attr('href') || ''));
      if (!m) return;
      add(m[1], oneLine(link.text()), cleanImage(node.find('img.thumbnail').first().attr('src')), 1, '');
    });
    const hasNext = /class="btn btn-secondary col-2 pull-right">\s*Next\s*</.test(html);
    return { cards: out, hasNext };
  }

  async summary(id) {
    const hit = this.summaries.get(id);
    if (hit && Date.now() - hit.at < 1800000) return hit.value;
    const html = await this.fetchHtml(`/book/${encodeURIComponent(id)}`);
    const top = topOf(html);
    const cover = /srcset="([^"\s]+)\s+210w/.exec(top);
    const value = {
      age: ageOfSlugs(slugsOf(top)),
      chapters: (html.match(/href="\/read\/\d+\/\d+\/1"/g) || []).length,
      cover: cover ? cover[1].replace(/&amp;/g, '&') : '',
    };
    if (this.summaries.size > 600) this.summaries.clear();
    this.summaries.set(id, { at: Date.now(), value });
    return value;
  }

  async feedCards(request, page) {
    const query = oneLine(request && request.title);
    const feed = (request && request.feed) || FEEDS[0].id;
    if (query) {
      const html = await this.fetchHtml(`/search?q=${encodeURIComponent(query)}&adv=1${page ? `&page=${page}` : ''}`);
      return this.sorted(this.cards(html));
    }
    if (feed === 'latest') {
      if (page > 0) return { cards: [], more: false };
      return { cards: this.cards(await this.fetchHtml('/')).cards, more: false };
    }
    if (feed === 'az') {
      const parsed = this.cards(await this.fetchHtml(`/browse/${page}`));
      return { cards: parsed.cards, more: parsed.hasNext };
    }
    return this.sorted(this.cards(await this.fetchHtml(`/search?q=%25&adv=1${page ? `&page=${page}` : ''}`)));
  }

  sorted(parsed) {
    const readable = parsed.cards.filter((c) => c.views !== null);
    return { cards: readable, more: parsed.hasNext && readable.length === parsed.cards.length };
  }

  async getSearchResults(request, metadata) {
    const page = Math.max(0, Number((metadata && metadata.page) || 0));
    const listed = await this.feedCards(request, page);
    const rated = await Promise.all(
      listed.cards.map(async (c) => {
        try {
          return { c, s: await this.summary(c.id) };
        } catch (e) {
          return { c, s: null };
        }
      }),
    );
    const results = [];
    for (const { c, s } of rated) {
      if (s && s.chapters === 0) continue;
      const card = { mangaId: c.id, title: c.title, image: c.image, medium: 'comics', ageRating: s ? s.age : 16 };
      if (s && s.cover && /\/thumb(\?|$)/.test(c.image)) card.image = cleanImage(s.cover);
      if (c.summary) card.summary = c.summary;
      results.push(card);
    }
    return { results, metadata: listed.more ? { page: page + 1 } : undefined };
  }

  async bookHtml(id) {
    const hit = this.recent.get(id);
    if (hit && Date.now() - hit.at < 180000) return hit.promise;
    const promise = this.fetchHtml(`/book/${encodeURIComponent(id)}`);
    if (this.recent.size > 4) this.recent.delete(this.recent.keys().next().value);
    this.recent.set(id, { at: Date.now(), promise });
    promise.catch(() => {
      const now = this.recent.get(id);
      if (now && now.promise === promise) this.recent.delete(id);
    });
    return promise;
  }

  async getMangaDetails(mangaId) {
    const html = await this.bookHtml(mangaId);
    const top = topOf(html);
    const $ = cheerio.load(top);
    const title = oneLine($('h2[itemprop="title"]').first().text());
    if (!title) throw new Error('Project Suki: title not found');
    const fields = {};
    $('div.row.py-1').each((i, el) => {
      const label = oneLine($(el).find('div.strong').first().text()).replace(/:$/, '');
      if (label && !(label in fields)) fields[label] = $(el).find('div[class*="col-8"]').first();
    });
    const names = (label) => {
      const out = [];
      if (fields[label]) {
        fields[label].find('a').each((i, a) => {
          const t = oneLine($(a).text());
          if (t && out.indexOf(t) < 0) out.push(t);
        });
        if (!out.length) {
          const t = oneLine(fields[label].text());
          if (t) out.push(t);
        }
      }
      return out;
    };
    const slugs = slugsOf(top);
    const cover = /<img class="img-thumbnail"[^>]*\ssrc="([^"]+)"/.exec(top);
    const info = {
      title,
      image: cover ? cleanImage(cover[1].replace(/&amp;/g, '&')) : '',
      desc: plain($('#descriptionCollapse').html() || '') || undefined,
      status: statusOf((names('Status')[0]) || ''),
      tags: slugs.map(genreLabel),
      webURL: `${SITE}/book/${mangaId}`,
      medium: 'comics',
      ageRating: ageOfSlugs(slugs),
    };
    const authors = names('Author');
    if (authors.length) info.author = authors.join(', ');
    const views = Number(oneLine(fields.Views ? fields.Views.text() : '').replace(/[^0-9]/g, ''));
    if (Number.isFinite(views) && views > 0) info.views = views;
    const alt = names('Alternative titles')[0];
    if (alt && info.desc) info.desc = `Also known as: ${alt}\n\n${info.desc}`;
    else if (alt) info.desc = `Also known as: ${alt}`;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const html = await this.bookHtml(mangaId);
    const table = tableOf(html);
    const rows = [];
    const seen = new Set();
    if (table) {
      const $ = cheerio.load(table);
      $('tbody tr').each((i, el) => {
        const cells = $(el).find('td');
        const link = cells.eq(0).find('a[href^="/read/"]').first();
        const m = /^\/read\/\d+\/(\d+)\//.exec(String(link.attr('href') || ''));
        if (!m || seen.has(m[1])) return;
        seen.add(m[1]);
        const label = oneLine(link.text()).replace(/\s+-\s*$/, '');
        const row = { id: m[1], chapterId: m[1], name: label || `Chapter ${m[1]}` };
        const n = /(?:Chapter|Ch\.?)\s*(\d+(?:\.\d+)?)/i.exec(label) || /^(\d+(?:\.\d+)?)\b/.exec(label);
        if (n) row.number = Number(n[1]);
        const v = /\bVol(?:ume|\.)?\s*(\d+)/i.exec(label);
        if (v) row.volume = String(Number(v[1]));
        const group = oneLine(cells.eq(2).text());
        if (group && group.toLowerCase() !== 'none') row.group = group;
        const lang = LANGUAGES[oneLine(cells.eq(1).text()).toLowerCase()];
        if (lang) row.language = lang;
        const date = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(cells.eq(4).find('span').first().attr('title') || '').trim());
        if (date) row.time = Date.UTC(Number(date[3]), Number(date[2]) - 1, Number(date[1]));
        rows.push(row);
      });
    }
    if (!rows.length) {
      const total = (html.match(/href="\/read\/\d+\/\d+\/1"/g) || []).length;
      if (total) throw new Error('Project Suki: the chapter table could not be read');
    }
    return rows;
  }

  firstImage(html) {
    const $ = cheerio.load(html);
    const out = [];
    $('.strip-reader img').each((i, el) => {
      const src = cleanImage($(el).attr('src'));
      if (src && /\/images\/gallery\//.test(src)) out.push(src);
    });
    return out[0] || '';
  }

  async getChapterDetails(mangaId, chapterId) {
    const first = this.firstImage(await this.fetchHtml(`/read/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}/1`));
    if (!first) throw new Error('Project Suki has no pages for this chapter');
    const pages = [first];
    let rest = null;
    try {
      rest = await this.callPage(mangaId, chapterId);
    } catch (e) {
      console.error('Project Suki /callpage failed, reading the pages one by one: ' + (e && e.message));
    }
    if (rest === null) rest = await this.walkPages(mangaId, chapterId, first);
    for (const url of rest) if (pages.indexOf(url) < 0) pages.push(url);
    return { id: chapterId, mangaId, pages };
  }

  async callPage(mangaId, chapterId) {
    const response = await this.requests.schedule(
      App.createRequest({
        url: `${SITE}/callpage`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json;charset=UTF-8', Accept: 'application/json, text/plain, */*' },
        body: JSON.stringify({ bookid: String(mangaId), chapterid: String(chapterId), first: true }),
      }),
    );
    if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
    let data;
    try {
      data = JSON.parse(response.data);
    } catch (e) {
      throw new Error('the answer is not JSON');
    }
    const $ = cheerio.load(String((data && data.src) || ''));
    const out = [];
    $('img').each((i, el) => {
      const src = cleanImage($(el).attr('src'));
      if (src) out.push(src);
    });
    return out;
  }

  async walkPages(mangaId, chapterId, first) {
    const out = [];
    let last = first;
    for (let n = 2; n <= 400; n += 6) {
      const batch = [];
      for (let k = n; k < n + 6; k++) batch.push(k);
      const htmls = await Promise.all(batch.map((k) => this.fetchHtml(`/read/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}/${k}`).then((h) => this.firstImage(h), () => '')));
      for (const url of htmls) {
        if (!url || url === last || out.indexOf(url) >= 0) return out;
        out.push(url);
        last = url;
      }
    }
    return out;
  }
}

module.exports = { Source };
