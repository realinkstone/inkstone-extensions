const SITE = 'https://lnmtl.com';

const FEEDS = [
  { id: 'popular', name: 'Popular', q: 'orderBy=favourites&order=desc&filter=all' },
  { id: 'newest', name: 'Newest', q: 'orderBy=date&order=desc&filter=all' },
  { id: 'ongoing', name: 'Ongoing', q: 'orderBy=favourites&order=desc&filter=ongoing' },
  { id: 'finished', name: 'Finished', q: 'orderBy=favourites&order=desc&filter=finished' },
  { id: 'az', name: 'A to Z', q: 'orderBy=name&order=asc&filter=all' },
];

const GENRES = [
  ['action', 'Action'], ['adventure', 'Adventure'], ['comedy', 'Comedy'], ['drama', 'Drama'],
  ['ecchi', 'Ecchi'], ['fantasy', 'Fantasy'], ['gender-bender', 'Gender Bender'], ['harem', 'Harem'],
  ['historical', 'Historical'], ['horror', 'Horror'], ['josei', 'Josei'], ['lolicon', 'Lolicon'],
  ['martial-arts', 'Martial Arts'], ['mature', 'Mature'], ['mecha', 'Mecha'], ['mystery', 'Mystery'],
  ['adult', 'Adult'], ['psychological', 'Psychological'], ['romance', 'Romance'], ['school-life', 'School Life'],
  ['sci-fi', 'Sci-fi'], ['seinen', 'Seinen'], ['shounen', 'Shounen'], ['slice-of-life', 'Slice of Life'],
  ['sports', 'Sports'], ['supernatural', 'Supernatural'], ['tragedy', 'Tragedy'], ['wuxia', 'Wuxia'],
  ['xianxia', 'Xianxia'], ['xuanhuan', 'Xuanhuan'],
];

const TAGS = [
  ['polygamy', 'Polygamy'], ['rape', 'Rape'], ['loli', 'Loli'], ['rape-victim-becomes-lover', 'Rape Victim Becomes Lover'],
  ['perverted-protagonist', 'Perverted Protagonist'], ['slaves', 'Slaves'], ['mature-protagonist', 'Mature Protagonist'],
  ['pregnancy', 'Pregnancy'], ['sexual-cultivation-technique', 'Sexual Cultivation Technique'], ['reverse-rape', 'Reverse Rape'],
  ['harem-seeking-protagonist', 'Harem-seeking Protagonist'], ['depictions-of-cruelty', 'Depictions of Cruelty'], ['gore', 'Gore'],
  ['first-time-intercourse', 'First-time Intercourse'], ['cultivation', 'Cultivation'], ['male-protagonist', 'Male Protagonist'],
  ['dragons', 'Dragons'], ['gods', 'Gods'], ['demons', 'Demons'], ['elves', 'Elves'], ['politics', 'Politics'],
  ['marriage', 'Marriage'], ['death', 'Death'], ['childhood-friends', 'Childhood Friends'], ['pill-concocting', 'Pill Concocting'],
  ['mythical-beasts', 'Mythical Beasts'], ['legendary-artifacts', 'Legendary Artifacts'], ['fast-cultivation', 'Fast Cultivation'],
];

const RATE18_GENRES = ['adult', 'lolicon', 'hentai', 'smut'];
const RATE16_GENRES = ['mature', 'ecchi'];
const RATE18_TAGS = ['rape', 'reverse rape', 'rape victim becomes lover', 'sexual abuse', 'sex slaves', 'incest'];
const RATE16_TAGS = [
  'first-time intercourse', 'nudity', 'prostitutes', 'adultery', 'sexual cultivation technique', 'slave harem',
  'gore', 'torture', 'cannibalism',
];
const WORDS18 = /\b(rape[sd]?|raping|rapist|incest\w*|porn\w*|erotic\w*|hentai|orgy|orgies|bestiality)\b/i;
const WORDS16 = /\b(sex|sexual\w*|naked|nude|nudity|molest\w*|slut\w*|whore\w*|prostitut\w*|lewd|aphrodisiac\w*|seduc\w*|intercourse|dual cultivation|double cultivation)\b/i;

const PLACEHOLDER = /hitting in the hand|renovate the page|please (?:fed|feed) back contacts|tushumi/i;

function clean(text) {
  return String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
}

function slugOf(href) {
  const m = String(href || '').match(/\/novel\/([^/?#]+)/);
  return m ? m[1] : '';
}

function encPiece(p) {
  try {
    return encodeURIComponent(decodeURIComponent(p));
  } catch (e) {
    return encodeURIComponent(p);
  }
}

function ageRating(genres, tags, desc) {
  let r = 0;
  const g = (genres || []).map((x) => clean(x).toLowerCase());
  const t = (tags || []).map((x) => clean(x).toLowerCase());
  for (let i = 0; i < g.length; i++) {
    if (RATE18_GENRES.indexOf(g[i]) !== -1) return 18;
    if (RATE16_GENRES.indexOf(g[i]) !== -1) r = 16;
  }
  for (let i = 0; i < t.length; i++) {
    if (RATE18_TAGS.indexOf(t[i]) !== -1) return 18;
    if (RATE16_TAGS.indexOf(t[i]) !== -1) r = 16;
  }
  const d = desc || '';
  if (WORDS18.test(d)) return 18;
  if (WORDS16.test(d)) r = 16;
  return r;
}

function mapStatus(text) {
  const s = clean(text).toLowerCase();
  if (s.indexOf('ongoing') !== -1) return 'ONGOING';
  if (s.indexOf('complet') !== -1 || s.indexOf('finish') !== -1) return 'COMPLETED';
  if (s.indexOf('hiatus') !== -1) return 'HIATUS';
  return 'UNKNOWN';
}

function paragraphs($, $el) {
  const out = [];
  $el.find('p').each((_, p) => {
    const t = clean($(p).text());
    if (t) out.push(t);
  });
  if (!out.length) {
    const t = clean($el.text());
    if (t) out.push(t);
  }
  return out.join('\n\n');
}

function jsonAfter(html, marker) {
  const at = html.indexOf(marker);
  if (at === -1) return null;
  let i = at + marker.length;
  while (i < html.length && /\s/.test(html.charAt(i))) i++;
  const open = html.charAt(i);
  const close = open === '[' ? ']' : open === '{' ? '}' : '';
  if (!close) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = i; j < html.length; j++) {
    const c = html.charAt(j);
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return JSON.parse(html.slice(i, j + 1));
    }
  }
  return null;
}

function parseTime(text) {
  const m = String(text || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return undefined;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

function parseCards($) {
  const out = [];
  $('.media').each((_, el) => {
    const c = $(el);
    const a = c.find('h4.media-title a').first();
    const slug = slugOf(a.attr('href'));
    if (!slug) return;
    const genres = [];
    c.find('a[href*="novel?genre="]').each((_, x) => {
      const t = clean($(x).text());
      if (t) genres.push(t);
    });
    const tags = [];
    c.find('a[href*="novel?tag="]').each((_, x) => {
      const t = clean($(x).text());
      if (t) tags.push(t);
    });
    const author = clean(c.find('a[href*="novel?author="]').first().text());
    const desc = paragraphs($, c.find('div[style*="font-size: 11px"]').first());
    let image = clean(c.find('img').first().attr('src'));
    if (image && image.charAt(0) === '/') image = SITE + image;
    out.push({
      slug,
      title: clean(a.text()),
      image,
      author,
      desc,
      genres,
      tags,
      age: ageRating(genres, tags, desc),
    });
  });
  return out;
}

function toResult(n) {
  const r = {
    mangaId: n.slug,
    title: n.title,
    image: n.image,
    tags: n.genres.concat(n.tags),
    webURL: SITE + '/novel/' + n.slug,
    medium: 'novel',
    ageRating: n.age,
  };
  if (n.author) r.author = n.author;
  if (n.desc) r.summary = n.desc;
  return r;
}

function norm(s) {
  let t = String(s || '').toLowerCase();
  try {
    t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch (e) {
  }
  return t.replace(/[^a-z0-9\u3400-\u9fff]+/g, ' ').trim();
}

let CATALOGUE = null;
let CATALOGUE_AT = 0;
const CATALOGUE_TTL = 30 * 60 * 1000;
const STORED_TTL = 24 * 60 * 60 * 1000;

const PAGE = 20;

class Source {
  constructor() {
    this._pending = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map((g) => ({ id: 'genre:' + g[0], label: g[1] })).concat(
      TAGS.map((t) => ({ id: 'tag:' + t[0], label: t[1] })),
    );
  }

  async getSearchResults(request, metadata) {
    request = request || {};
    if (request.medium && request.medium !== 'novel') return { results: [] };
    const title = clean(request.title);
    const chosen = (request.includedTags || []).map((t) => String((t && t.id) || '')).filter(Boolean);
    const genres = chosen.filter((x) => x.indexOf('genre:') === 0).map((x) => x.slice(6));
    const tags = chosen.filter((x) => x.indexOf('tag:') === 0).map((x) => x.slice(4));
    const page = (metadata && metadata.page) || 1;

    if (title || genres.length > 1 || tags.length > 1) {
      return this.searchCatalogue(title, genres, tags, page);
    }

    let q;
    if (genres.length || tags.length) {
      const parts = [];
      if (genres.length) parts.push('genre=' + encodeURIComponent(genres[0]));
      if (tags.length) parts.push('tag=' + encodeURIComponent(tags[0]));
      q = parts.join('&');
    } else {
      const feed = FEEDS.filter((f) => f.id === request.feed)[0] || FEEDS[0];
      q = feed.q;
    }
    const url = SITE + '/novel?' + q + '&page=' + page;
    const res = await this.send(url, true);
    if (res.status === 404) return { results: [] };
    if (res.status < 200 || res.status >= 300) throw new Error('LNMTL list answered HTTP ' + res.status);
    const $ = cheerio.load(res.data);
    const cards = parseCards($);
    const hasNext = cards.length > 0 && $('.pagination a[rel="next"]').length > 0;
    return { results: cards.map(toResult), metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async searchCatalogue(title, genres, tags, page) {
    const cat = await this.loadCatalogue();
    const words = norm(title).split(' ').filter(Boolean);
    const hits = [];
    for (let i = 0; i < cat.length; i++) {
      const n = cat[i];
      if (genres.length || tags.length) {
        const gs = n.genres.map((x) => norm(x));
        const ts = n.tags.map((x) => norm(x));
        let ok = true;
        genres.forEach((g) => {
          if (gs.indexOf(norm(g)) === -1) ok = false;
        });
        tags.forEach((t) => {
          if (ts.indexOf(norm(t)) === -1) ok = false;
        });
        if (!ok) continue;
      }
      let score = 0;
      if (words.length) {
        const name = norm(n.title);
        let all = true;
        for (let k = 0; k < words.length; k++) {
          const needle = /[\u3400-\u9fff]/.test(words[k]) ? words[k] : ' ' + words[k];
          if (n.keys.indexOf(needle) === -1) {
            all = false;
            break;
          }
        }
        if (!all) continue;
        const phrase = words.join(' ');
        score = name === phrase ? 3 : name.indexOf(phrase) === 0 ? 2 : name.indexOf(phrase) !== -1 ? 1 : 0;
      }
      hits.push({ n, score, i });
    }
    hits.sort((a, b) => b.score - a.score || a.i - b.i);
    const slice = hits.slice((page - 1) * PAGE, page * PAGE);
    const more = hits.length > page * PAGE;
    return { results: slice.map((h) => toResult(h.n)), metadata: more ? { page: page + 1 } : undefined };
  }

  loadCatalogue() {
    const now = Date.now();
    if (CATALOGUE && now - CATALOGUE_AT < CATALOGUE_TTL) return CATALOGUE;
    const p = (async () => {
      const stored = await this.readStored();
      if (stored) return stored;
      const built = await this.buildCatalogue();
      await this.writeStored(built);
      return built;
    })();
    CATALOGUE = p;
    CATALOGUE_AT = now;
    p.catch(() => {
      if (CATALOGUE === p) CATALOGUE = null;
    });
    return p;
  }

  async readStored() {
    try {
      const text = await App.createSourceStateManager().retrieve('catalogue');
      if (typeof text !== 'string' || !text) return null;
      const saved = JSON.parse(text);
      if (!saved || !Array.isArray(saved.items) || Date.now() - saved.at > STORED_TTL || saved.items.length < 100) return null;
      return saved.items.map((x) => ({
        slug: x.s,
        title: x.t,
        author: x.a,
        image: x.i ? SITE + x.i : '',
        genres: x.g ? x.g.split('|') : [],
        tags: x.k ? x.k.split('|') : [],
        age: x.r,
        desc: '',
        keys: x.q,
      }));
    } catch (e) {
      return null;
    }
  }

  async writeStored(items) {
    try {
      const saved = {
        at: Date.now(),
        items: items.map((n) => ({
          s: n.slug,
          t: n.title,
          a: n.author,
          i: n.image.indexOf(SITE) === 0 ? n.image.slice(SITE.length) : '',
          g: n.genres.join('|'),
          k: n.tags.join('|'),
          r: n.age,
          q: n.keys,
        })),
      };
      await App.createSourceStateManager().store('catalogue', JSON.stringify(saved));
    } catch (e) {
      console.error('LNMTL catalogue not stored: ' + (e && e.message));
    }
  }

  async buildCatalogue() {
    const base = SITE + '/novel?orderBy=favourites&order=desc&filter=all';
    const first = await this.send(base + '&page=1', true);
    if (first.status < 200 || first.status >= 300) throw new Error('LNMTL list answered HTTP ' + first.status);
    const $1 = cheerio.load(first.data);
    let last = 1;
    $1('.pagination a[href*="page="]').each((_, a) => {
      const m = String($1(a).attr('href') || '').match(/[?&]page=(\d+)/);
      if (m && +m[1] > last) last = +m[1];
    });
    const pages = { 1: parseCards($1) };
    const todo = [];
    for (let p = 2; p <= last; p++) todo.push(p);
    const index = this.loadIndex(first.data);
    await this.pool(todo, 12, async (p) => {
      const res = await this.send(base + '&page=' + p, true);
      if (res.status < 200 || res.status >= 300) throw new Error('LNMTL list page ' + p + ' answered HTTP ' + res.status);
      pages[p] = parseCards(cheerio.load(res.data));
    });
    const alt = await index;
    const out = [];
    const seen = {};
    for (let p = 1; p <= last; p++) {
      (pages[p] || []).forEach((n) => {
        if (seen[n.slug]) return;
        seen[n.slug] = true;
        n.keys = ' ' + norm(n.title + ' ' + (alt[n.slug] || '') + ' ' + n.author) + ' ';
        n.desc = '';
        out.push(n);
      });
    }
    if (!out.length) throw new Error('LNMTL list gave no novels');
    return out;
  }

  async loadIndex(listHtml) {
    const map = {};
    try {
      const m = String(listHtml).match(/prefetch:\s*'([^']+novels-[^']+\.json)'/);
      const path = m ? m[1] : '/build/storage/novels-942e52eede.json';
      const res = await this.send(path.indexOf('http') === 0 ? path : SITE + path, false);
      if (res.status < 200 || res.status >= 300) return map;
      const list = JSON.parse(res.data);
      list.forEach((n) => {
        if (!n || !n.slug) return;
        map[n.slug] = [n.name_alternative, n.name_original, n.name_spelling, n.name_spelling_clean, n.name_acronym]
          .filter(Boolean)
          .join(' ');
      });
    } catch (e) {
      console.error('LNMTL index not read: ' + (e && e.message));
    }
    return map;
  }

  async getMangaDetails(mangaId) {
    const html = await this.novelPage(mangaId);
    const mark = html.indexOf('lnmtl.firstResponse');
    const end = mark === -1 ? -1 : html.indexOf('</script>', mark);
    const slim = mark === -1 || end === -1 ? html : html.slice(0, mark) + html.slice(end);
    const $ = cheerio.load(slim);
    const nameEl = $('.novel-name').first().clone();
    nameEl.find('small').remove();
    const title = clean(nameEl.text()) || mangaId;
    let image = clean($('.media-left img').first().attr('src'));
    if (image && image.charAt(0) === '/') image = SITE + image;
    const descEl = $('.description').first().clone();
    descEl.find('.source').remove();
    const desc = paragraphs($, descEl);

    let author = '';
    let status = 'UNKNOWN';
    $('dt').each((_, dt) => {
      const label = clean($(dt).text()).toLowerCase();
      const value = clean($(dt).next('dd').text());
      if (label === 'authors' || label === 'author') author = value;
      else if (label === 'current status') status = mapStatus(value);
    });
    const genres = [];
    $('a[href*="novel?genre="]').each((_, a) => {
      const t = clean($(a).text());
      if (t && genres.indexOf(t) === -1) genres.push(t);
    });
    const tags = [];
    $('a[href*="novel?tag="]').each((_, a) => {
      const t = clean($(a).text());
      if (t && tags.indexOf(t) === -1) tags.push(t);
    });
    const likes = clean($('.panel-heading:contains("Favorites")').first().parent().find('.panel-body').first().text());

    const info = {
      title,
      image,
      desc,
      status,
      tags: genres.concat(tags),
      webURL: SITE + '/novel/' + mangaId,
      medium: 'novel',
      ageRating: ageRating(genres, tags, desc),
      completed: status === 'COMPLETED',
    };
    if (author) info.author = author;
    const n = parseInt(likes.replace(/[^\d]/g, ''), 10);
    if (isFinite(n) && n > 0) info.views = n;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const html = await this.novelPage(mangaId);
    const volumes = jsonAfter(html, 'lnmtl.volumes =');
    if (!Array.isArray(volumes)) throw new Error('LNMTL volume list not found on the novel page');
    volumes.sort((a, b) => a.number - b.number);

    const perVolume = {};
    const jobs = [];
    volumes.forEach((v) => {
      perVolume[v.id] = [];
    });
    await this.pool(volumes, 6, async (v) => {
      const first = await this.chapterPage(v.id, 1);
      perVolume[v.id][0] = first.data || [];
      for (let p = 2; p <= (first.last_page || 1); p++) jobs.push({ v, p });
    });
    await this.pool(jobs, 6, async (j) => {
      const page = await this.chapterPage(j.v.id, j.p);
      perVolume[j.v.id][j.p - 1] = page.data || [];
    });

    const chapters = [];
    const seen = {};
    let lastNumber = 0;
    volumes.forEach((v) => {
      const rows = [].concat.apply([], perVolume[v.id]);
      rows.sort((a, b) => (a.position || 0) - (b.position || 0));
      rows.forEach((row) => {
        if (!row || !row.slug || seen[row.slug]) return;
        if (row.downloaded === false || row.translated_body === false) return;
        if (typeof row.length === 'number' && row.length < 300) return;
        seen[row.slug] = true;
        const hasNumber = row.number !== null && row.number !== undefined && isFinite(Number(row.number));
        const number = hasNumber ? Number(row.number) : lastNumber + 0.5;
        if (hasNumber) lastNumber = number;
        const label = clean(row.title);
        let name;
        if (hasNumber) {
          name = 'Chapter ' + number + (row.part ? ' Part ' + row.part : '') + (label ? ': ' + label : '');
        } else {
          name = label || 'Special';
        }
        if (name.length > 140) name = name.slice(0, 137) + '...';
        const ch = { id: row.slug, name, number, volume: String(v.number) };
        const time = parseTime(row.created_at);
        if (time !== undefined) ch.time = time;
        chapters.push(ch);
      });
    });
    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    const res = await this.send(SITE + '/chapter/' + encPiece(chapterId), true);
    if (res.status === 404) throw new Error('LNMTL has no chapter ' + chapterId);
    if (res.status < 200 || res.status >= 300) throw new Error('LNMTL chapter answered HTTP ' + res.status);
    const $ = cheerio.load(res.data);
    const lines = [];
    $('.chapter-body sentence.translated').each((_, el) => {
      const t = clean($(el).text());
      if (t) lines.push(t);
    });
    const text = lines.join('\n\n');
    if (!text) throw new Error('LNMTL has no translated text for this chapter yet');
    if (text.length < 700 && PLACEHOLDER.test(text)) {
      throw new Error('LNMTL only has a placeholder for this chapter (it says the content is being typed and to refresh later)');
    }
    return { id: chapterId, mangaId, pages: [], text };
  }

  novelPage(id) {
    const hit = this._pending.get(id);
    if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.p;
    const p = (async () => {
      const res = await this.send(SITE + '/novel/' + encPiece(id), true);
      if (res.status === 404) throw new Error('LNMTL has no novel ' + id);
      if (res.status < 200 || res.status >= 300) throw new Error('LNMTL novel page answered HTTP ' + res.status);
      return res.data;
    })();
    this._pending.set(id, { at: Date.now(), p });
    p.catch(() => {
      const cur = this._pending.get(id);
      if (cur && cur.p === p) this._pending.delete(id);
    });
    return p;
  }

  async chapterPage(volumeId, page) {
    const res = await this.send(SITE + '/chapter?page=' + page + '&volumeId=' + volumeId, true);
    if (res.status < 200 || res.status >= 300) {
      throw new Error('LNMTL chapter list (volume ' + volumeId + ', page ' + page + ') answered HTTP ' + res.status);
    }
    try {
      return JSON.parse(res.data);
    } catch (e) {
      throw new Error('LNMTL chapter list (volume ' + volumeId + ', page ' + page + ') was not JSON');
    }
  }

  async pool(items, limit, fn) {
    let next = 0;
    let failure = null;
    const run = async () => {
      while (!failure && next < items.length) {
        const item = items[next++];
        try {
          await fn(item);
        } catch (e) {
          failure = failure || e;
        }
      }
    };
    const workers = [];
    for (let i = 0; i < Math.min(limit, items.length); i++) workers.push(run());
    await Promise.all(workers);
    if (failure) throw failure;
  }

  async send(url, retry) {
    const manager = App.createRequestManager({});
    let lastErr = null;
    for (let attempt = 0; attempt < (retry ? 3 : 1); attempt++) {
      const u = attempt === 0 ? url : url + (url.indexOf('?') === -1 ? '?' : '&') + 'r=' + attempt;
      try {
        const res = await manager.schedule(App.createRequest({ url: u, method: 'GET' }));
        if (res.status >= 500 && attempt < 2 && retry) {
          lastErr = new Error('HTTP ' + res.status);
          continue;
        }
        return res;
      } catch (e) {
        if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
        lastErr = e;
      }
    }
    throw lastErr || new Error('LNMTL request failed');
  }
}

module.exports = { Source };
