const SITE = 'https://webnex.cc';

const FEEDS = [
  { id: 'popular', name: 'Popular', sort: 'popular' },
  { id: 'updated', name: 'Recently Updated', sort: 'updated' },
  { id: 'newest', name: 'Newest Releases', sort: 'year_newest' },
  { id: 'az', name: 'Title A to Z', sort: 'title' },
  { id: 'explicit', name: 'Erotica and Pornographic (18+)', sort: 'popular', explicit: true },
];

const GENRES = ["Action", "Adventure", "Boys' Love", "Comedy", "Crime", "Drama", "Ecchi", "Fantasy", "Gender Bender", "Girls' Love", "Gore", "Historical", "Horror", "Isekai", "Josei",
  "Magical Girls", "Mature", "Mecha", "Medical", "Mystery", "Philosophical", "Psychological", "Romance", "Sci-Fi", "Seinen", "Sexual Violence", "Shoujo", "Shoujo Ai", "Shounen",
  "Shounen Ai", "Slice of Life", "Sports", "Superhero", "Thriller", "Tragedy", "Wuxia", "Yaoi", "Yuri"];
const THEMES = ["Aliens", "Animals", "Cooking", "Crossdressing", "Delinquents", "Demons", "Genderswap", "Ghosts", "Gyaru", "Harem", "Incest", "Loli", "Mafia", "Magic", "Martial Arts",
  "Military", "Monster Girls", "Monsters", "Music", "Ninja", "Office Workers", "Police", "Post-Apocalyptic", "Reincarnation", "Reverse Harem", "Samurai", "School Life", "Shota",
  "Supernatural", "Survival", "Time Travel", "Traditional Games", "Vampires", "Video Games", "Villainess", "Virtual Reality", "Zombies"];
const FORMATS = ["4-Koma", "Adaptation", "Anthology", "Award Winning", "Doujinshi", "Fan Colored", "Full Color", "Long Strip", "Official Colored", "Oneshot", "Self-Published", "Web Comic"];

const BUCKETS = {
  safe: { rated: ['safe'], age: 0 },
  suggestive: { rated: ['suggestive'], age: 16 },
  explicit: { rated: ['erotica', 'pornographic'], age: 18 },
};

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function oneLine(text) {
  return String(text === undefined || text === null ? '' : text).replace(/\s+/g, ' ').trim();
}

function toInt(text) {
  const n = parseInt(String(text || '').replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function settle(html) {
  const $ = cheerio.load(html);
  const pairs = [];
  const re = /\$RS\("S:([0-9a-z]+)","P:([0-9a-z]+)"\)/g;
  let m;
  while ((m = re.exec(html))) pairs.push([m[1], m[2]]);
  for (let pass = 0; pass < 4 && pairs.length; pass++) {
    const holes = {};
    const blocks = {};
    $('template[id^="P:"]').each((i, el) => {
      holes[el.attribs.id.slice(2)] = el;
    });
    $('div[id^="S:"]').each((i, el) => {
      blocks[el.attribs.id.slice(2)] = el;
    });
    let moved = 0;
    for (const [sid, pid] of pairs) {
      const hole = holes[pid];
      const block = blocks[sid];
      if (!hole || !block) continue;
      $(hole).replaceWith($(block).contents());
      $(block).remove();
      delete holes[pid];
      delete blocks[sid];
      moved++;
    }
    if (!moved) break;
  }
  $('div[hidden][id^="S:"]').removeAttr('hidden');
  return $;
}

function stepper($) {
  const text = oneLine($('.page-stepper-text').first().text());
  const m = /^([\d,]+)\s*\/\s*([\d,]+)$/.exec(text);
  return m ? { page: toInt(m[1]), pages: toInt(m[2]) } : { page: 1, pages: 1 };
}

function statusOf(text) {
  const t = oneLine(text).toLowerCase();
  if (t === 'ongoing') return 'ONGOING';
  if (t === 'completed') return 'COMPLETED';
  if (t === 'on hiatus' || t === 'hiatus') return 'HIATUS';
  if (t === 'cancelled' || t === 'canceled') return 'CANCELLED';
  return null;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.totals = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.concat(THEMES, FORMATS).map((name) => ({ id: name, label: name }));
  }

  async html(path) {
    let last = 'no answer';
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await this.requests.schedule(App.createRequest({ url: `${SITE}${path}`, method: 'GET', headers: { Accept: 'text/html,application/xhtml+xml' } }));
        if (response.status === 404) throw new Error('Webnex: not found (HTTP 404)');
        if (response.status >= 200 && response.status < 300) {
          const text = String(response.data || '');
          if (text.indexOf('<html') < 0) throw new Error('Webnex answered something that is not a page');
          return settle(text);
        }
        last = `HTTP ${response.status}`;
        if (response.status === 403) throw new Error('Webnex: HTTP 403');
      } catch (e) {
        if (/Webnex:|not a page/.test(String(e && e.message))) throw e;
        last = String((e && e.message) || e);
      }
      await pause(500 * (attempt + 1));
    }
    throw new Error(`Webnex: ${last}`);
  }

  browsePath(options, ratedList, page) {
    const parts = [];
    const add = (k, v) => parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    if (options.q) add('q', options.q);
    add('sort', options.sort);
    for (const g of options.genres) add('genre', g);
    for (const t of options.tagsOnly) add('tag', t);
    for (const r of ratedList) add('rated', r);
    if (page > 1) add('page', String(page));
    return `/browse?${parts.join('&')}`;
  }

  async bucketPage(options, bucketName, page) {
    const bucket = BUCKETS[bucketName];
    const key = this.browsePath(options, bucket.rated, 1);
    if (page > 1 && this.totals.has(key) && page > this.totals.get(key)) return { cards: [], more: false };
    const $ = await this.html(this.browsePath(options, bucket.rated, page));
    const step = stepper($);
    this.totals.set(key, step.pages);
    const cards = [];
    if (step.page === page || (page === 1 && !$('.page-stepper-text').length)) {
      $('li.card-item').each((i, el) => {
        const row = $(el);
        const href = String(row.find('a.card-link').first().attr('href') || '');
        const m = /^\/manga\/([^/?#]+)/.exec(href);
        const title = oneLine(row.find('.card-title').first().text());
        if (!m || !title) return;
        const image = String(row.find('img.cover-img').first().attr('src') || '');
        cards.push({
          mangaId: decodeURIComponent(m[1]),
          title,
          image: /^https?:\/\//.test(image) ? image : '',
          medium: 'comics',
          ageRating: bucket.age,
        });
      });
    }
    return { cards, more: page < step.pages };
  }

  async getSearchResults(request, metadata) {
    const q = oneLine(request && request.title);
    const page = Math.max(1, Number(metadata && metadata.page) || 1);
    const feed = FEEDS.find((f) => f.id === ((request && request.feed) || FEEDS[0].id)) || FEEDS[0];
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const genres = [];
    const tagsOnly = [];
    for (const t of included) {
      const name = oneLine(t && typeof t === 'object' ? t.id || t.label : t);
      if (!name) continue;
      const hit = GENRES.find((g) => g.toLowerCase() === name.toLowerCase());
      if (hit) genres.push(hit);
      else tagsOnly.push(THEMES.concat(FORMATS).find((g) => g.toLowerCase() === name.toLowerCase()) || name);
    }
    const searching = !!q || genres.length > 0 || tagsOnly.length > 0;
    const options = { q, genres, tagsOnly, sort: q ? 'relevance' : feed.sort };
    const names = searching ? ['safe', 'suggestive', 'explicit'] : feed.explicit ? ['explicit'] : ['safe', 'suggestive'];
    const pages = await Promise.all(names.map((n) => this.bucketPage(options, n, page)));
    const results = [];
    const seen = new Set();
    const longest = Math.max.apply(null, pages.map((p) => p.cards.length).concat([0]));
    for (let i = 0; i < longest; i++) {
      for (const p of pages) {
        const card = p.cards[i];
        if (card && !seen.has(card.mangaId)) {
          seen.add(card.mangaId);
          results.push(card);
        }
      }
    }
    const more = pages.some((p) => p.more);
    return { results, metadata: results.length && more ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const $ = await this.html(`/manga/${encodeURIComponent(decodeURIComponent(mangaId))}`);
    const title = oneLine($('h1.series-title').first().text());
    if (!title || !$('.series-badges').length) throw new Error('Webnex: title not found');
    let status = 'UNKNOWN';
    let ageRating = 0;
    $('.series-badges li').each((i, el) => {
      const t = oneLine($(el).text());
      const s = statusOf(t);
      if (s && status === 'UNKNOWN') status = s;
      if (/^suggestive$/i.test(t)) ageRating = Math.max(ageRating, 16);
      if (/^(erotica|pornographic)$/i.test(t)) ageRating = Math.max(ageRating, 18);
    });
    const names = (selector) => {
      const out = [];
      $(selector).each((i, el) => {
        const t = oneLine($(el).text());
        if (t && out.indexOf(t) < 0) out.push(t);
      });
      return out;
    };
    const author = names('.series-credits > span:first-child a').slice(0, 4).join(', ');
    const artist = names('.series-credits > span:nth-child(2) a').slice(0, 4).join(', ');
    const tags = [];
    $('.detail-row').each((i, row) => {
      const label = oneLine($(row).find('dt').first().text());
      if (label !== 'Genres' && label !== 'Themes' && label !== 'Format') return;
      $(row).find('a.chip').each((j, a) => {
        const t = oneLine($(a).text());
        if (t && tags.indexOf(t) < 0) tags.push(t);
      });
    });
    const descNode = $('.series-desc').first();
    descNode.find('br').replaceWith('\n');
    descNode.find('p').each((i, p) => {
      $(p).append('\n\n');
    });
    const desc = descNode
      .text()
      .replace(/\[This series was migrated[^\]]*\]/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/ ?\n ?/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    const image = String($('.series-top-cover img').first().attr('src') || '');
    const info = {
      title,
      image: /^https?:\/\//.test(image) ? image : '',
      desc: desc || undefined,
      status,
      tags,
      webURL: `${SITE}/manga/${mangaId}`,
      medium: 'comics',
      ageRating,
    };
    if (author) info.author = author;
    if (artist) info.artist = artist;
    return { mangaInfo: info };
  }

  chapterRows($) {
    const rows = [];
    $('.ch-list > li.ch-row').each((i, el) => {
      const row = $(el);
      const href = String(row.find('a.ch-link').first().attr('href') || '');
      const m = /^\/read\/([^/?#]+)/.exec(href);
      if (!m) return;
      const numNode = row.find('.ch-num').first().clone();
      numNode.find('span').remove();
      const numText = oneLine(numNode.text());
      const number = /^-?\d+(\.\d+)?$/.test(numText) ? parseFloat(numText) : NaN;
      const title = oneLine(row.find('.ch-title').first().text());
      const group = oneLine(row.find('.ch-credit-group, .ch-source-name').first().text());
      const time = Date.parse(String(row.find('time.ch-time').first().attr('datetime') || ''));
      const label = Number.isFinite(number) ? `Chapter ${numText}` : numText ? `Chapter ${numText}` : '';
      rows.push({
        id: decodeURIComponent(m[1]),
        name: label && title ? `${label} - ${title}` : label || title || 'Chapter',
        number,
        group: group && group !== 'Unknown' ? group : '',
        time: Number.isFinite(time) ? time : undefined,
      });
    });
    return rows;
  }

  async getChapters(mangaId) {
    const base = `/manga/${encodeURIComponent(decodeURIComponent(mangaId))}`;
    const first = await this.html(base);
    const declared = toInt(first('.cover-chapters strong').first().text());
    let last = 1;
    first('.pagination-page a').each((i, a) => {
      const m = /Page (\d+)/.exec(String(first(a).attr('aria-label') || ''));
      if (m) last = Math.max(last, Number(m[1]));
    });
    let rows = this.chapterRows(first);
    const pages = new Array(Math.max(0, last - 1));
    let next = 0;
    const worker = async () => {
      while (next < pages.length) {
        const index = next++;
        const doc = await this.html(`${base}?page=${index + 2}`);
        const got = this.chapterRows(doc);
        if (!got.length) throw new Error(`Webnex: page ${index + 2} of the chapter list was empty`);
        pages[index] = got;
      }
    };
    await Promise.all([...Array(Math.min(12, pages.length))].map(() => worker()));
    for (const got of pages) rows = rows.concat(got);
    const seen = new Set();
    const out = [];
    for (const r of rows) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      const item = { id: r.id, chapterId: r.id, name: r.name, number: Number.isFinite(r.number) ? r.number : 0 };
      if (r.group) item.group = r.group;
      if (r.time !== undefined) item.time = r.time;
      out.push(item);
    }
    if (!out.length) {
      if (declared) throw new Error(`Webnex: the chapter list was empty but the site says ${declared} chapters`);
      return [];
    }
    if (declared && out.length < declared) console.error(`Webnex: ${out.length} chapters read, the site says ${declared}`);
    const indexOf = new Map(out.map((c, i) => [c.id, i]));
    out.sort((a, b) => b.number - a.number || indexOf.get(a.id) - indexOf.get(b.id));
    return out;
  }

  async getChapterDetails(mangaId, chapterId) {
    const id = decodeURIComponent(chapterId);
    const script = `
      (async () => {
        try {
          const path = location.pathname.replace(/\\/$/, '');
          let status = 0;
          let message = '';
          for (let attempt = 0; attempt < 4; attempt++) {
            const r = await fetch(path + '/pages', { cache: 'no-store' });
            status = r.status;
            let d = {};
            try { d = await r.json(); } catch (e) { d = {}; }
            if (r.ok && d && Array.isArray(d.pages)) { __reportResult({ pages: d.pages }); return; }
            message = (d && d.message) || '';
            await new Promise((resolve) => setTimeout(resolve, 400));
          }
          __reportError('pages HTTP ' + status + ' ' + message);
        } catch (e) {
          __reportError(String((e && e.message) || e));
        }
      })();
    `;
    const result = await App.executeInWebView({ url: `${SITE}/read/${encodeURIComponent(id)}`, script, timeoutMs: 40000 });
    if (!result || result.error) throw new Error(`Webnex: ${oneLine(result && result.error) || 'the reader page did not answer'}`);
    const list = result.value && Array.isArray(result.value.pages) ? result.value.pages : [];
    const pages = list
      .map((u) => String(u || '').trim())
      .map((u) => (u.charAt(0) === '/' && u.charAt(1) !== '/' ? `${SITE}${u}` : u))
      .filter((u) => /^https?:\/\//.test(u));
    if (!pages.length) throw new Error('Webnex has no pages for this chapter yet');
    const out = { id: chapterId, mangaId, pages };
    if (pages.some((u) => u.indexOf(`${SITE}/api/image/`) === 0)) out.referer = `${SITE}/`;
    return out;
  }
}

module.exports = { Source };
