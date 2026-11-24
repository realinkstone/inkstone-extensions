const SITE = 'https://es.niadd.com';
const UA = 'Boundless/1.0 (+https://boundless.moe)';
const MAX_DIR_PAGE = 138;
const MAX_PAGE = 100;
const INDEX_MS = 2 * 60 * 60 * 1000;

const FEEDS = [
  { id: 'hot', name: 'Popular', path: '/list/Hot-Manga/' },
  { id: 'updated', name: 'Latest Updates', path: '/list/New-Update/' },
  { id: 'new', name: 'New Manga', path: '/list/New-Manga/' },
  { id: 'all', name: 'All Titles', dir: true },
];

const GENRES = [
  'Acción', 'Aventura', 'Comedia', 'Drama', 'Romance', 'Fantasía', 'Sobrenatural', 'Ciencia Ficción', 'Misterio', 'Horror', 'Psicológico', 'Shonen', 'Seinen', 'Josei', 'Shojo',
  'Vida Escolar', 'Recuentos De La Vida', 'Harem', 'Ecchi', 'Boys Love', 'Girls Love', 'Yaoi', 'Yuri', 'Artes Marciales', 'Reencarnación', 'Demonios', 'Magia', 'Deportes',
  'Historia', 'Tragedia', 'Crimen', 'Mecha', 'Isekai', 'Thriller', 'Webcomic', 'One Shot', 'Familia', 'Vampiros', 'Superpoderes', 'Supervivencia', 'Guerra', 'Militar',
  'Parodia', 'Gender Bender', 'Manhua', 'Webtoon', 'Telenovela', 'Policiaco', 'Realidad Virtual', 'Animación', 'Música', 'Cultivo', 'Ciberpunk', 'Apocalíptico',
];

const INDEX_18 = ['Adulto', 'Hentai', 'Incest', 'Sexual Violence'];
const INDEX_16 = ['Mature', 'Loli', 'Shota', 'Traps', 'Doujinshi'];
const GENRE_18 = ['adulto', 'hentai', 'porno', 'sexo', 'orgia', 'incest', 'sexual violence', 'violacion'];
const GENRE_16 = ['maduro', 'mature', 'ecchi', 'loli', 'shota', 'gore', 'traps', 'doujinshi', 'transexual'];
const LIST_16 = ['Ecchi'];

const STRONG_18 = /\b(hentai|porn\w*|xxx|creampie|cumshot|orgasm\w*|semen|masturb\w*|verga|pene|vagina|chocho|cono|follar|follando|follada|folla|tener sexo|sexo salvaje|sexo explicito|escenas? de sexo|sex scenes?|nsfw|3p|threesome|tetas|bukkake|gangbang|explicit)\b/;
const WEAK_16 = /\b(sexual\w*|sexo|sex|erotic\w*|erotico|desnud\w*|naked|nude|prostitut\w*|violaci\w*|violad\w*|violar|rape\w*|seduc\w*|lujuria|lust\w*|infiel\w*|adulter\w*|pervert\w*|sexy|ecchi|incest\w*|pechos|senos|busty|boobs?|escort|burdel|brothel)\b/;

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '...', ldquo: '"', rdquo: '"', lsquo: "'", rsquo: "'", ndash: '-', mdash: '-',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', uuml: 'ü',
  iquest: '¿', iexcl: '¡', agrave: 'à', egrave: 'è', ocirc: 'ô', ccedil: 'ç', auml: 'ä', ouml: 'ö',
};
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decode(text) {
  return String(text || '')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => (ENTITIES[n] !== undefined ? ENTITIES[n] : m));
}

function oneLine(text) {
  return decode(String(text || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function fold(text) {
  return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function genreLabel(text) {
  return oneLine(text).replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, (m, a, b) => a + b.toLowerCase());
}

function ageFrom(genres, text) {
  const names = genres.map(fold);
  if (names.some((g) => GENRE_18.indexOf(g) >= 0)) return 18;
  const words = fold(text);
  if (STRONG_18.test(words)) return 18;
  if (names.some((g) => GENRE_16.indexOf(g) >= 0)) return 16;
  if (WEAK_16.test(words)) return 16;
  return 0;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.index18 = null;
    this.index18At = 0;
    this.index16 = null;
    this.index16At = 0;
    this.index16Loading = null;
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map((g) => ({ id: g, label: g }));
  }

  async html(url) {
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { 'User-Agent': UA, Accept: 'text/html' } }));
        if (response.status !== 429 && (response.status < 502 || response.status > 504)) {
          if (response.status === 404) throw new Error('NiAdd: not found (HTTP 404)');
          if (response.status < 200 || response.status >= 300) throw new Error(`NiAdd: HTTP ${response.status}`);
          return typeof response.data === 'string' ? response.data : String(response.data || '');
        }
        last = response;
      } catch (e) {
        if (attempt === 1 || /NiAdd/.test(String(e.message))) throw e;
      }
      await pause(700);
    }
    throw new Error(`NiAdd: HTTP ${last ? last.status : 0}`);
  }

  cards(page) {
    const out = [];
    const parts = String(page).split('<div class="manga-item">');
    for (let i = 1; i < parts.length; i++) {
      const it = parts[i];
      const m = it.match(/href="https:\/\/es\.niadd\.com\/(manga|original)\/([^"]+?)\.html"/);
      if (!m || m[1] !== 'manga') continue;
      const name = it.match(/<div class="manga-name">([^<]*)<\/div>/);
      const title = oneLine(name && name[1]);
      if (!title) continue;
      const cover = it.match(/<img src="(https?:\/\/[^"]+)"/);
      const intro = it.match(/<div class="manga-intro">[\s\S]*?>([^<]*)<\/a>/);
      const genres = [];
      const re = /<div class="manga-cate-item-name">([^<]*)<\/div>/g;
      let g;
      while ((g = re.exec(it))) genres.push(genreLabel(g[1]));
      out.push({ slug: m[2], title, image: cover ? cover[1] : '', desc: oneLine(intro && intro[1]), genres });
    }
    return out;
  }

  async slugsOf(names) {
    const set = new Set();
    await Promise.all(
      names.map(async (name) => {
        try {
          for (let p = 1; p <= 3; p++) {
            const text = await this.html(`${SITE}/category/${encodeURIComponent(name)}${p > 1 ? '_' + p : ''}.html`);
            if (!/<title>\s*Lista De Manga/i.test(text)) break;
            const found = this.cards(text);
            found.forEach((c) => set.add(c.slug));
            if (String(text).split('<div class="manga-item">').length - 1 < 36) break;
          }
        } catch (e) {
          console.error('NiAdd rating index ' + name + ' failed: ' + (e && e.message));
        }
      })
    );
    return set;
  }

  async ratings() {
    const fresh = (at) => at && Date.now() - at < INDEX_MS;
    if (!fresh(this.index18At)) {
      const set = await this.slugsOf(INDEX_18);
      if (set.size) {
        this.index18 = set;
        this.index18At = Date.now();
      }
    }
    if (!fresh(this.index16At) && !this.index16Loading) {
      this.index16Loading = this.slugsOf(INDEX_16)
        .then((set) => {
          if (set.size) {
            this.index16 = set;
            this.index16At = Date.now();
          }
        })
        .then(() => {
          this.index16Loading = null;
        });
    }
    return { adult: this.index18 || new Set(), mature: this.index16 || new Set() };
  }

  rate(card, rated, floor) {
    let age = ageFrom(card.genres, `${card.title} ${card.desc}`);
    if (rated.adult.has(card.slug)) age = 18;
    else if (rated.mature.has(card.slug) && age < 16) age = 16;
    if (floor && age < floor) age = floor;
    return age;
  }

  async getSearchResults(request, metadata) {
    const query = oneLine(request && request.title);
    const page = (metadata && metadata.page) || 1;
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const tagId = included.length ? String((included[0] && included[0].id) || included[0]) : '';
    const genre = tagId ? GENRES.find((g) => g === tagId || fold(g) === fold(tagId)) : null;
    const feed = FEEDS.find((f) => f.id === ((request && request.feed) || FEEDS[0].id)) || FEEDS[0];
    let url;
    let kind;
    if (query) {
      url = `${SITE}/search/?name=${encodeURIComponent(query)}&page=${page}`;
      kind = 'search';
    } else if (genre) {
      url = `${SITE}/category/${encodeURIComponent(genre)}${page > 1 ? '_' + page : ''}.html`;
      kind = 'category';
    } else if (feed.dir) {
      if (page > MAX_DIR_PAGE) return { results: [] };
      url = `${SITE}/category/index_${page}.html`;
      kind = 'category';
    } else {
      if (page > 1) return { results: [] };
      url = SITE + feed.path;
      kind = 'landing';
    }
    const [text, rated] = await Promise.all([this.html(url), this.ratings()]);
    if (kind === 'category' && !/<title>\s*Lista De Manga/i.test(text)) return { results: [] };
    const found = this.cards(text);
    const floor = genre && LIST_16.indexOf(genre) >= 0 ? 16 : 0;
    const results = found.map((c) => {
      const card = { mangaId: c.slug, title: c.title, image: c.image, medium: 'comics', ageRating: this.rate(c, rated, floor) };
      if (c.genres.length) card.tags = c.genres;
      return card;
    });
    const raw = String(text).split('<div class="manga-item">').length - 1;
    const more = kind === 'search' ? raw >= 20 : kind === 'category' && raw >= 36;
    const limit = kind === 'category' && !genre ? MAX_DIR_PAGE : MAX_PAGE;
    return { results, metadata: more && page < limit ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const slug = String(mangaId || '');
    const text = await this.html(`${SITE}/manga/${slug}.html`);
    const head = text.match(/<h1[^>]*class="book-headline-name"[^>]*>([^<]*)<\/h1>/);
    const title = oneLine(head && head[1]);
    if (!title) throw new Error('NiAdd: title not found');
    const og = text.match(/<meta property="og:image" content="([^"]+)"/);
    const genres = [];
    const re = /itemprop="genre">\s*([^<]+?)\s*</g;
    let g;
    while ((g = re.exec(text))) {
      const label = genreLabel(g[1].replace(/^,\s*/, ''));
      if (label && genres.indexOf(label) < 0) genres.push(label);
    }
    const author = text.match(/itemprop="author"[\s\S]*?itemprop="name">([^<]*)</);
    let desc = '';
    const syn = text.match(/<div class="detail-cate-title">Sinopsis<\/div>\s*<section class="detail-section detail-synopsis">([\s\S]*?)<\/section>/);
    if (syn) {
      const copies = syn[1].split(/&nbsp;\s*/).map((s) => decode(s.replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim());
      desc = copies.reduce((a, b) => (b.length > a.length ? b : a), '');
      if (/^informaci[oó]n no completada\.?$/i.test(desc)) desc = '';
    }
    const rated = await this.ratings();
    const age = this.rate({ slug, title, desc, genres }, rated, 0);
    const info = {
      title,
      image: og ? og[1] : '',
      desc: desc || undefined,
      status: 'UNKNOWN',
      tags: genres,
      webURL: `${SITE}/manga/${slug}.html`,
      medium: 'comics',
      ageRating: age,
    };
    const by = oneLine(author && author[1]);
    if (by) info.author = by;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const slug = String(mangaId || '');
    const text = await this.html(`${SITE}/manga/${slug}/chapters.html`);
    const heading = text.match(/<title>([^<]*?)\s+chapters,/i);
    const show = oneLine(heading && heading[1]);
    const rows = [];
    const seen = new Set();
    const re = /<a class="hover-underline" href="[^"]*\/chapter\/[^\/"]+\/(\d+)\/?[^"]*"[^>]*>\s*<li class="chp-item">([\s\S]*?)<\/li>/g;
    let m;
    let direct = 0;
    while ((m = re.exec(text))) {
      direct++;
      const id = m[1];
      if (seen.has(id)) continue;
      seen.add(id);
      const t = m[2].match(/<span class="chp-title">([\s\S]*?)<\/span>/);
      let name = oneLine(t && t[1]);
      if (show && name.toLowerCase().indexOf(show.toLowerCase()) === 0 && name.length > show.length) name = name.slice(show.length).replace(/^[\s:\-]+/, '');
      if (/^\d+(?:[.,]\d+)?$/.test(name)) name = `Capítulo ${name}`;
      const row = { id, chapterId: id, name: name || `Chapter ${rows.length + 1}` };
      const num = name.match(/(?:cap[ií]tulos?|cap\.?|chapter|ch\.?|episodio|ep\.?)\s*(\d+(?:[.,]\d+)?)/i) || name.match(/(\d+(?:[.,]\d+)?)/);
      if (num) {
        const n = Number(num[1].replace(',', '.'));
        if (Number.isFinite(n)) row.number = n;
      }
      const d = m[2].match(/<span class="chp-time">\s*([A-Za-z]{3})[a-z]*\s+(\d{1,2}),\s*(\d{4})/);
      if (d && MONTHS[d[1].toLowerCase()] !== undefined) row.time = Date.UTC(Number(d[3]), MONTHS[d[1].toLowerCase()], Number(d[2]));
      rows.push(row);
    }
    if (!rows.length) {
      if (/\/go\/rds\//.test(text)) throw new Error('NiAdd answered its ad links instead of chapters; try again later');
      throw new Error('NiAdd has no chapters for this title yet');
    }
    return rows;
  }

  async getChapterDetails(mangaId, chapterId) {
    const id = String(chapterId || '').replace(/\D/g, '');
    if (!id) throw new Error('NiAdd: bad chapter');
    const byIndex = new Map();
    let total = 0;
    for (let n = 1; n <= 80; n++) {
      const text = await this.html(`${SITE}/chapter/c/${id}-10-${n}.html`);
      const before = byIndex.size;
      const re = /<img class="manga_pic[^"]*"[^>]*?\bi="(\d+)"[^>]*?\bsrc="(https?:\/\/[^"]+)"/g;
      let m;
      while ((m = re.exec(text))) {
        const key = (n - 1) * 10 + Number(m[1]);
        if (!byIndex.has(key)) byIndex.set(key, m[2].replace(/&amp;/g, '&'));
      }
      if (n === 1) {
        const of = text.match(/\b(\d+)\s+of\s+(\d+)\b/);
        total = of ? Number(of[2]) : 0;
        if (!byIndex.size) throw new Error('NiAdd has no pages for this chapter (it may have been removed)');
      }
      if (byIndex.size === before || (total && byIndex.size >= total)) break;
    }
    const pages = Array.from(byIndex.keys())
      .sort((a, b) => a - b)
      .map((k) => byIndex.get(k));
    if (!pages.length) throw new Error('NiAdd has no pages for this chapter');
    return { id: chapterId, mangaId, pages };
  }
}

module.exports = { Source };
