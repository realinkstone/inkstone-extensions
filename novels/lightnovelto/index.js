const SITE = 'https://lightnovel.to';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const PARALLEL = 12;

const FEEDS = [
  { id: 'latest', name: 'Latest Updates', query: '' },
  { id: 'popular', name: 'Popular', query: 'sort=popular' },
  { id: 'rating', name: 'Top Rated', query: 'sort=rating' },
  { id: 'newest', name: 'Recently Added', query: 'sort=newest' },
  { id: 'chapters', name: 'Longest', query: 'sort=chapters' },
  { id: 'completed', name: 'Completed', query: 'status=completed' },
  { id: 'lightnovels', name: 'Light Novels', query: 'type=light_novel' },
];

const GENRE_SLUGS = [
  'fantasy', 'action', 'romance', 'adventure', 'male-protagonist', 'comedy', 'weak-to-strong', 'system', 'adult', 'reincarnation', 'slice-of-life', 'transmigration', 'magic', 'drama',
  'cultivation', 'mystery', 'supernatural', 'female-protagonist', 'beautiful-female-lead', 'harem', 'martial-arts', 'overpowered-protagonist', 'handsome-male-lead', 'modern-day',
  'sci-fi', 'game-elements', 'revenge', 'eastern', 'calm-protagonist', 'psychological', 'xianxia', 'josei', 'r-18', 'shounen', 'dark', 'xuanhuan', 'survival', 'historical', 'academy',
  'school-life', 'clever-protagonist', 'mature', 'kingdom-building', 'superpowers', 'tragedy', 'fantasy-world', 'betrayal', 'level-system', 'seinen', 'urban', 'monsters', 'evolution',
  'genius-protagonist', 'demons', 'isekai', 'apocalypse', 'special-abilities', 'hard-working-protagonist', 'character-growth', 'second-chance', 'sword-and-magic', 'cheats',
  'chinese-novel', 'power-couple', 'face-slapping', 'alternate-world', 'game', 'villain', 'determined-protagonist', 'ruthless-protagonist', 'aristocracy', 'poor-to-rich', 'gods',
  'antihero', 'rebirth', 'royalty', 'nobles', 'yaoi', 'ecchi', 'smut', 'bl', 'horror', 'tragic-past', 'transported-to-another-world',
];

const RATE_18 = /^(r-?18|smut|erotica|hentai|bdsm|incest|[a-z-]*-incest|rape|attempted-rape|[a-z-]*-rape|sexual-abuse|sexual-assault|sexual-cultivation-technique|sex-s-aves|sex-slaves?|multiple-sexual-partners|sexually-active-protagonist|sex-friends|sex-magic|non-consensual-[a-z-]+|lemon|nsfw|porn[a-z-]*|explicit[a-z-]*)$/;
const RATE_16 = /^(adult|mature|mature-romance|ecchi|sexy|sexual-innuendo|sex-comedy)$/;

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
    .replace(/\s+/g, ' ')
    .trim();
}

function enc(text) {
  return encodeURIComponent(String(text));
}

function piece(text) {
  const raw = String(text || '');
  try {
    return encodeURIComponent(decodeURIComponent(raw));
  } catch (e) {
    return encodeURIComponent(raw);
  }
}

function labelOf(slug) {
  const words = String(slug).replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function mapStatus(text) {
  const s = String(text || '').toLowerCase();
  if (s.indexOf('ongoing') >= 0) return 'ONGOING';
  if (s.indexOf('complete') >= 0) return 'COMPLETED';
  if (s.indexOf('hiatus') >= 0) return 'HIATUS';
  if (s.indexOf('cancel') >= 0 || s.indexOf('dropped') >= 0) return 'CANCELLED';
  return 'UNKNOWN';
}

function genreSlugs(html) {
  const out = [];
  const rows = /<div class="ln-tagrow"[^>]*>([\s\S]*?)<\/div>/g;
  let row;
  while ((row = rows.exec(html))) {
    const links = /href="\/genre\/([^"?#]+)"/g;
    let link;
    while ((link = links.exec(row[1]))) out.push(link[1]);
  }
  return out;
}

function ageOf(slugs, flagged) {
  if (slugs.some((s) => RATE_18.test(s))) return 18;
  if (flagged || slugs.some((s) => RATE_16.test(s))) return 16;
  return 0;
}

function parseCards(html) {
  const found = [];
  const re = /<a class="ln-ncard[^"]*" href="(\/novel\/[^"?#]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    const slug = decodeURIComponent(m[1].slice('/novel/'.length));
    const inner = m[2];
    const img = inner.match(/<img[^>]*\ssrc="([^"]+)"/);
    const name = inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
    const alt = inner.match(/<img[^>]*\salt="([^"]*)"/);
    const count = inner.match(/([\d,]+)(?:<!-- -->)?\s*chapters/);
    const title = oneLine(name ? name[1] : alt ? alt[1] : '');
    if (!slug || !title) continue;
    const card = { mangaId: slug, title, image: img ? decode(img[1]) : '', medium: 'novel', webURL: `${SITE}/novel/${piece(slug)}` };
    if (count) card.chapters = Number(count[1].replace(/,/g, ''));
    found.push(card);
  }
  return found;
}

function lastPage(html) {
  let last = 1;
  const re = /<a[^>]*href="[^"]*[?&](?:amp;)?page=(\d+)"[^>]*>\s*(\d+)\s*<\/a>/g;
  let m;
  while ((m = re.exec(html))) last = Math.max(last, Number(m[2]));
  return last;
}

function proseText(html) {
  const start = html.indexOf('<div class="ln-prose"');
  if (start < 0) return null;
  let end = html.indexOf('<div class="ln-chcomments"', start);
  if (end < 0) end = Math.min(html.length, start + 400000);
  const $ = cheerio.load(html.slice(start, end));
  const root = $('div.ln-prose').first();
  root.find('script, style, iframe, noscript, ins, #frame').remove();
  root.find('br').replaceWith('\n');
  const blocks = [];
  root.find('p, h1, h2, h3, h4, h5, h6, li').each((i, el) => {
    String($(el).text())
      .split(/\n+/)
      .forEach((line) => blocks.push(line));
  });
  if (!blocks.length) String(root.text()).split(/\n+/).forEach((line) => blocks.push(line));
  const clean = blocks
    .map((line) =>
      line
        .replace(/<\/?(?:strong|em|b|i|u|s|span|p|br|div|font|center|a|h[1-6])(?:\s[^>]*)?\/?>/gi, '')
        .replace(/[ ​]/g, ' ')
        .replace(/[ \t\r\f\v]+/g, ' ')
        .trim(),
    )
    .filter(Boolean);
  return clean.join('\n\n');
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.ages = new Map();
    this.genres = null;
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async load(path, accept) {
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await this.requests.schedule(
        App.createRequest({ url: `${SITE}${path}`, method: 'GET', headers: { 'User-Agent': UA, Accept: accept || 'text/html' } }),
      );
      if (response.status !== 429 && (response.status < 502 || response.status > 504)) return response;
      last = response;
      await pause(700);
    }
    return last;
  }

  async page(path) {
    const response = await this.load(path, 'text/html');
    if (response.status === 404) return null;
    if (response.status < 200 || response.status >= 300) throw new Error(`LightNovel.to: HTTP ${response.status}`);
    return String(response.data || '');
  }

  async getSearchTags() {
    if (!this.genres) {
      let names = {};
      try {
        const response = await this.load('/api/genres', 'application/json');
        if (response.status >= 200 && response.status < 300) {
          JSON.parse(response.data).forEach((g) => {
            if (g && g.slug && g.name) names[String(g.slug)] = oneLine(g.name);
          });
        }
      } catch (e) {
        console.error('LightNovel.to genre names failed: ' + (e && e.message));
      }
      this.genres = GENRE_SLUGS.map((slug) => ({ id: slug, label: names[slug] || labelOf(slug) }));
    }
    return this.genres;
  }

  async ageOfTitle(slug) {
    if (this.ages.has(slug)) return this.ages.get(slug);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const html = await this.page(`/novel/${piece(slug)}`);
        if (html) {
          const age = ageOf(genreSlugs(html), /class="ln-warn"/.test(html));
          if (this.ages.size > 5000) this.ages.clear();
          this.ages.set(slug, age);
          return age;
        }
      } catch (e) {
        console.error('LightNovel.to rating read failed: ' + (e && e.message));
      }
      await pause(500);
    }
    return 16;
  }

  async rate(cards) {
    for (let i = 0; i < cards.length; i += PARALLEL) {
      const group = cards.slice(i, i + PARALLEL);
      const ages = await Promise.all(group.map((c) => this.ageOfTitle(c.mangaId)));
      group.forEach((c, n) => {
        c.ageRating = ages[n];
      });
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') return { results: [] };
    const query = oneLine(request && request.title);
    const page = (metadata && metadata.page) || 1;
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    const tags = (Array.isArray(request && request.includedTags) ? request.includedTags : [])
      .map((t) => String((t && t.id) || t || ''))
      .filter(Boolean);
    const parts = [];
    let path;
    if (query) {
      path = '/search';
      parts.push(`q=${enc(query)}`);
    } else {
      path = '/novels';
      if (feed.query) parts.push(feed.query);
    }
    tags.forEach((t) => parts.push(`genre=${enc(t)}`));
    if (page > 1) parts.push(`page=${page}`);
    const html = await this.page(path + (parts.length ? `?${parts.join('&')}` : ''));
    if (!html) return { results: [] };
    const cards = parseCards(html);
    await this.rate(cards);
    const more = cards.length > 0 && page < lastPage(html);
    return { results: cards, metadata: more ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const html = await this.page(`/novel/${piece(mangaId)}`);
    if (!html) throw new Error('LightNovel.to: this title was not found (HTTP 404)');
    const start = html.lastIndexOf('<div class="ln-dhead"');
    if (start < 0) throw new Error('LightNovel.to: the title page has no details (the layout changed?)');
    const syn = html.indexOf('class="ln-synwrap"', start);
    let end = syn >= 0 ? html.indexOf('<h2', syn) : -1;
    if (end < 0) end = Math.min(html.length, start + 60000);
    const $ = cheerio.load(html.slice(start, end));
    const title = oneLine($('.ln-dtitle').first().text());
    if (!title) throw new Error('LightNovel.to: the title page has no name (the layout changed?)');
    const meta = {};
    $('.ln-meta p').each((i, el) => {
      const key = oneLine($(el).find('.ln-k').first().text()).toLowerCase();
      if (!key) return;
      meta[key] = oneLine($(el).text()).slice(key.length).trim();
    });
    const tags = [];
    $('.ln-tagrow a[href^="/genre/"]').each((i, el) => {
      const t = oneLine($(el).text());
      if (t && tags.indexOf(t) < 0) tags.push(t);
    });
    const counted = oneLine($('.ln-facts').first().text()).match(/([\d,]+)\s*chapters/i);
    const paragraphs = [];
    $('.ln-syn p').each((i, el) => {
      const p = oneLine($(el).text());
      if (p) paragraphs.push(p);
    });
    const desc = paragraphs.length ? paragraphs.join('\n\n') : oneLine($('.ln-syn').first().text());
    const slugs = genreSlugs(html);
    const age = ageOf(slugs, /class="ln-warn"/.test(html));
    this.ages.set(mangaId, age);
    const status = mapStatus(meta.status);
    const info = {
      title,
      image: ($('.ln-dcv img').first().attr('src') || '').trim(),
      desc: desc || undefined,
      status,
      tags,
      webURL: `${SITE}/novel/${piece(mangaId)}`,
      medium: 'novel',
      completed: status === 'COMPLETED',
      ageRating: age,
    };
    if (meta.author) info.author = meta.author;
    if (counted) info.chapters = Number(counted[1].replace(/,/g, ''));
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const response = await this.load(`/api/novel-chapters?slug=${enc(mangaId)}`, 'application/json');
    if (response.status < 200 || response.status >= 300) throw new Error(`LightNovel.to: the chapter list answered HTTP ${response.status}`);
    let body;
    try {
      body = JSON.parse(response.data);
    } catch (e) {
      throw new Error('LightNovel.to: the chapter list is not JSON');
    }
    const rows = Array.isArray(body) ? body : body && body.chapters;
    if (!Array.isArray(rows)) throw new Error('LightNovel.to: the chapter list has an unexpected shape');
    const chapters = [];
    const seen = new Set();
    for (const c of rows) {
      const id = String((c && c.slug) || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const number = Number(c.number);
      const chapter = { id, chapterId: id, name: oneLine(c.title) || `Chapter ${c.number}` };
      if (Number.isFinite(number)) chapter.number = number;
      const time = Date.parse(String(c.createdAt || ''));
      if (Number.isFinite(time)) chapter.time = time;
      chapters.push(chapter);
    }
    chapters.sort((a, b) => (a.number || 0) - (b.number || 0));
    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    const html = await this.page(`/novel/${piece(mangaId)}/${piece(chapterId)}`);
    if (!html) throw new Error('LightNovel.to: this chapter was not found (HTTP 404)');
    const text = proseText(html);
    if (text === null) throw new Error('LightNovel.to: the chapter page has no text block (the layout changed?)');
    if (!text) throw new Error('LightNovel.to has no text for this chapter yet');
    return { id: chapterId, mangaId, pages: [], text };
  }
}

module.exports = { Source };
