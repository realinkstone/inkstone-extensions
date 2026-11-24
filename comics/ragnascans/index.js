const SITE_BASE = 'https://lector.ragnascan.xyz';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'popular', name: 'Popular', orden: 'vistas' },
  { id: 'latest', name: 'Latest Updates', orden: 'actualizado' },
];

const MONTHS_ES = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
};

const ADULT_GENRE = /^(adult|adulto|hentai|smut|erotica|erótico|erotico|nsfw|\+18|18\+)$/i;
const SUGGESTIVE_GENRE = /^(mature|maduro|ecchi|bl|yaoi)$/i;

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function absolute(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  return SITE_BASE + (u.charAt(0) === '/' ? '' : '/') + u;
}

function encodeMangaId(href) {
  const path = String(href || '').replace(/^https?:\/\/[^/]+/i, '');
  const m = /\/manga\/([^/?#]+)/.exec(path);
  if (m) return 'slug~' + m[1];
  const q = /[?&]id=(\d+)/.exec(path);
  if (q) return 'id~' + q[1];
  return path.replace(/^\/+/, '');
}

function mangaUrlFromId(mangaId) {
  if (String(mangaId).indexOf('slug~') === 0) return `${SITE_BASE}/manga/${encodeURIComponent(mangaId.slice(5))}`;
  if (String(mangaId).indexOf('id~') === 0) return `${SITE_BASE}/manga.php?id=${encodeURIComponent(mangaId.slice(3))}`;
  return `${SITE_BASE}/${mangaId}`;
}

function mapStatus(text) {
  const s = cleanText(text).toLowerCase();
  if (s.includes('finaliz') || s.includes('complet')) return 'COMPLETED';
  if (s.includes('paus') || s.includes('hiatus')) return 'HIATUS';
  if (s.includes('cancel')) return 'CANCELLED';
  if (s.includes('emisi') || s.includes('curso') || s.includes('ongoing')) return 'ONGOING';
  return 'UNKNOWN';
}

function parseDateEs(text) {
  const m = /(\d{1,2})\s+([a-záéíóú]+),?\s+(\d{4})/i.exec(cleanText(text));
  if (!m) return undefined;
  const mon = MONTHS_ES[m[2].toLowerCase()];
  if (mon === undefined) return undefined;
  const t = Date.UTC(parseInt(m[3], 10), mon, parseInt(m[1], 10));
  return Number.isFinite(t) ? t : undefined;
}

class Source {
  constructor() {
    this.pageCache = new Map();
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 1 } });
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/directorio.php`);
      const $ = cheerio.load(html);
      const tags = [];
      const seen = new Set();
      $('input[name="generos[]"]').each((_, el) => {
        const val = cleanText($(el).attr('value'));
        const label = cleanText($(el).parent().text()) || val;
        if (!val || seen.has(val)) return;
        seen.add(val);
        tags.push({ id: val, label });
      });
      return tags;
    } catch (e) {
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') return { results: [] };
    const query = cleanText(request && request.title);
    const tags = ((request && request.includedTags) || []).filter((t) => t && t.id);
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    const page = (metadata && metadata.page) || 1;

    const params = [`page=${page}`, `orden=${encodeURIComponent(feed.orden)}`, `q=${encodeURIComponent(query)}`];
    tags.forEach((t) => params.push(`generos[]=${encodeURIComponent(t.id)}`));

    const html = await this.requestHTML(`${SITE_BASE}/directorio.php?${params.join('&')}`);
    const $ = cheerio.load(html);
    const results = [];
    const seen = new Set();
    $('.mod-grid .mod-card').each((_, el) => {
      const card = $(el);
      const href = card.attr('href') || card.find('a').first().attr('href') || '';
      const mangaId = encodeMangaId(href);
      const title = cleanText(card.find('.mod-card-title').first().text());
      const image = absolute(card.find('.mod-card-cover').first().attr('src') || card.find('img').first().attr('src'));
      if (!mangaId || !title || !image || seen.has(mangaId)) return;
      seen.add(mangaId);
      results.push({
        mangaId,
        title,
        image,
        referer: SITE_BASE + '/',
        webURL: mangaUrlFromId(mangaId),
        medium: 'comics',
      });
    });

    let hasNext = false;
    $('.mod-pg-btn').each((_, el) => {
      if (cleanText($(el).text()).toLowerCase().includes('sig')) hasNext = true;
    });
    return { results, metadata: hasNext && results.length > 0 ? { page: page + 1 } : undefined };
  }

  async titleHtml(mangaId) {
    const kept = this.pageCache.get(mangaId);
    if (kept && Date.now() - kept.at < 300000) return kept.html;
    const html = await this.requestHTML(mangaUrlFromId(mangaId));
    this.pageCache.set(mangaId, { at: Date.now(), html });
    return html;
  }

  async getMangaDetails(mangaId) {
    const $ = cheerio.load(await this.titleHtml(mangaId));
    const title = cleanText($('h1').first().text()) || mangaId;
    const image = absolute($('.cover-wrapper img').first().attr('src') || $('img').first().attr('src'));
    let author = '';
    let artist = '';
    $('span').each((_, el) => {
      const t = cleanText($(el).text());
      if (t.indexOf('Autor:') === 0 && !author) author = cleanText(t.slice(6));
      if (t.indexOf('Ilustrador:') === 0 && !artist) artist = cleanText(t.slice(11));
    });
    const people = [author, artist].filter((p, i, a) => p && a.indexOf(p) === i);
    const desc = cleanText($('#sinopsisWrapper p').text()) || title;

    const tags = [];
    let status = 'UNKNOWN';
    $('.meta-table .meta-row').each((_, el) => {
      const row = $(el);
      const label = cleanText(row.find('.meta-label').first().text()).toLowerCase();
      if (label.includes('género') || label.includes('genero')) {
        row.find('.meta-value a').each((__, a) => {
          const g = cleanText($(a).text());
          if (g && tags.indexOf(g) === -1) tags.push(g);
        });
      } else if (label.includes('estado')) {
        status = mapStatus(row.find('.meta-value').first().text());
      }
    });

    const info = {
      title,
      image,
      referer: SITE_BASE + '/',
      author: people.join(', '),
      desc,
      status,
      completed: status === 'COMPLETED',
      tags,
      webURL: mangaUrlFromId(mangaId),
      medium: 'comics',
    };
    if (tags.some((t) => ADULT_GENRE.test(t))) info.ageRating = 18;
    else if (tags.some((t) => SUGGESTIVE_GENRE.test(t))) info.ageRating = 16;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const $ = cheerio.load(await this.titleHtml(mangaId));
    const rows = [];
    const seen = new Set();
    $('#chaptersContainer .chapter-item').each((_, el) => {
      const item = $(el);
      if (item.hasClass('locked-neon') || item.find('.ph-lock-key').length > 0) return;
      const href = (item.attr('href') || '').trim();
      const rel = href.replace(/^https?:\/\/[^/]+/i, '');
      if (!rel || seen.has(rel)) return;
      seen.add(rel);
      const rawName = cleanText(item.find('.chapter-item-title h4').first().text()).replace(/\.00$/, '');
      const name = rawName || rel;
      const numM = /(\d+(?:\.\d+)?)/.exec(name);
      const number = numM ? parseFloat(numM[1]) : 0;
      const time = parseDateEs(item.find('.chapter-item-date').first().text());
      rows.push({ id: rel, chapterId: rel, name, number, time });
    });
    rows.reverse();
    let last = -Infinity;
    return rows.map((r) => {
      let number = r.number;
      if (number <= last) number = Math.round((last + 0.0001) * 10000) / 10000;
      last = number;
      const ch = { id: r.id, chapterId: r.id, name: r.name, number };
      if (r.time !== undefined) ch.time = r.time;
      return ch;
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = absolute(chapterId);
    const $ = cheerio.load(await this.requestHTML(url));
    const pages = [];
    $('#pagesContainer .page-container img').each((_, el) => {
      const img = $(el);
      const dv = cleanText(img.attr('data-verify'));
      if (dv) {
        try {
          const rev = App.base64Decode(dv).split('').reverse().join('');
          const u = absolute(rev);
          if (u) pages.push(u);
        } catch (e) {}
      } else {
        const src = cleanText(img.attr('src') || img.attr('data-src'));
        if (src && src.indexOf('data:image') !== 0) pages.push(absolute(src));
      }
    });
    if (pages.length === 0) throw new Error('RagnaScans returned no pages for this chapter');
    return { id: chapterId, mangaId, pages, referer: SITE_BASE + '/' };
  }

  async requestHTML(url) {
    const response = await this.requests.schedule(App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Referer: SITE_BASE + '/' },
    }));
    if (response.status < 200 || response.status >= 300) throw new Error(`RagnaScans HTTP ${response.status}`);
    return response.data;
  }
}

module.exports = { Source };
