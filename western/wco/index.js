const SITES = ['https://www.wco.tv', 'https://www.wcoforever.net', 'https://www.wcoflix.tv'];
const EMBED = 'https://embed.wcostream.com';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'recent', name: 'Recently Added' },
  { id: 'cartoons', name: 'Cartoons A-Z' },
];
const PAGE_SIZE = 24;

const ADULT_18 = /^(erotica|hentai|pornography|adult manga)$/i;
const ADULT_16 = /^(ecchi|harem|reverse harem|adult animation|adult cartoons|adult interest|adult puppeteering|yaoi|splatter|drug crime|toilet humou?r|off-color humor|cringe comedy)$/i;

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function absolute(url) {
  const raw = String(url || '').trim();
  if (!raw || raw.startsWith('data:')) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('//')) return 'https:' + raw;
  return SITES[0] + (raw.startsWith('/') ? '' : '/') + raw;
}

function slugOfHref(href) {
  const m = /\/anime\/([A-Za-z0-9%._~-]+)/.exec(String(href || '').split(/[?#]/)[0]);
  return m ? m[1] : '';
}

function checkSlug(mangaId) {
  const id = String(mangaId || '');
  if (!/^[A-Za-z0-9%._~-]+$/.test(id)) throw new Error('WCO: unknown title id ' + id);
  return id;
}

function ageRatingOfGenres(genres) {
  let age = 0;
  for (const g of genres) {
    const name = cleanText(g);
    if (ADULT_18.test(name)) return 18;
    if (ADULT_16.test(name)) age = 16;
  }
  return age;
}

function decodePlayer(html) {
  const found = /String\.fromCharCode\(parseInt\(\w+\(/.exec(String(html || ''));
  if (!found) return '';
  const at = found.index;
  const start = html.lastIndexOf('<script', at);
  const end = html.indexOf('</script>', at);
  if (start < 0 || end < 0) return '';
  const script = html.slice(start, end);
  const array = /\[((?:\s*["'][A-Za-z0-9+/=]+["']\s*,?)+)\s*\]/.exec(script);
  const shift = /-\s*(\d{5,})\s*\)/.exec(script);
  if (!array || !shift) return '';
  const values = array[1].match(/["']([A-Za-z0-9+/=]+)["']/g) || [];
  let out = '';
  for (const quoted of values) {
    const digits = String(App.base64Decode(quoted.slice(1, -1))).replace(/\D/g, '');
    out += String.fromCharCode(parseInt(digits, 10) - parseInt(shift[1], 10));
  }
  try {
    return decodeURIComponent(escape(out));
  } catch (e) {
    return out;
  }
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.start = 0;
    this.series = new Map();
    this.cartoons = null;
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async seriesInfo(slug) {
    if (this.series.has(slug)) return this.series.get(slug);
    const $ = cheerio.load(await this.html(`/anime/${slug}`));
    const title = cleanText($('h1').first().text());
    if (!title) throw new Error('WCO: series page not found');
    const genres = [];
    $('#sidebar_cat a[href*="search-by-genre"]').each((_, a) => {
      const g = cleanText($(a).text());
      if (g && genres.indexOf(g) === -1) genres.push(g);
    });
    const info = $('#sidebar_cat h3').filter((_, h) => /info/i.test($(h).text())).first().next('p');
    const image = absolute($('meta[property="og:image"]').attr('content') || $('#sidebar_cat img').first().attr('src'));
    const out = { title, image, desc: cleanText(info.text()), genres, ageRating: ageRatingOfGenres(genres) };
    this.series.set(slug, out);
    return out;
  }

  async enrich(cards) {
    let next = 0;
    const worker = async () => {
      while (next < cards.length) {
        const card = cards[next++];
        try {
          const info = await this.seriesInfo(card.mangaId);
          if (!card.image && info.image) card.image = info.image;
          card.ageRating = info.ageRating;
        } catch (e) {
          if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
    return cards;
  }

  async getSearchResults(request, metadata) {
    const query = cleanText(request && request.title);
    const page = (metadata && metadata.page) || 1;
    if (query) {
      if (page > 1) return { results: [] };
      const html = await this.send('/search', {
        method: 'POST',
        headers: (base) => ({ 'Content-Type': 'application/x-www-form-urlencoded', Origin: base, Referer: `${base}/` }),
        body: `catara=${encodeURIComponent(query)}&konuara=series&submit=`,
      });
      const $ = cheerio.load(html);
      const cards = [];
      const seen = new Set();
      $('div.img a[href*="/anime/"]').each((_, a) => {
        const slug = slugOfHref($(a).attr('href'));
        if (!slug || seen.has(slug)) return;
        const row = $(a).closest('li, div.cerceve, div').parent();
        const title = cleanText($(a).find('img').attr('alt')) || cleanText(row.find('.recent-release-episodes a').first().text());
        if (!title) return;
        seen.add(slug);
        cards.push({ mangaId: slug, title, image: absolute($(a).find('img').attr('src')), webURL: `${SITES[0]}/anime/${slug}`, medium: 'anime' });
      });
      return { results: await this.enrich(cards) };
    }
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    let cards = [];
    let hasNext = false;
    if (feed.id === 'recent') {
      const $ = cheerio.load(await this.html('/'));
      const seen = new Set();
      $('#sidebar_right2 ul.items li').each((_, li) => {
        const row = $(li);
        const slug = slugOfHref(row.find('a[href*="/anime/"]').first().attr('href'));
        if (!slug || seen.has(slug)) return;
        const title = cleanText(row.find('.recent-release-episodes a').first().text()) || cleanText(row.find('img').attr('alt'));
        if (!title) return;
        seen.add(slug);
        cards.push({ mangaId: slug, title, image: absolute(row.find('img').first().attr('src')), webURL: `${SITES[0]}/anime/${slug}`, medium: 'anime' });
      });
    } else {
      if (!this.cartoons) {
        const $ = cheerio.load(await this.html('/cartoon-list'));
        const list = [];
        const seen = new Set();
        $('#ddmcc_container li a').each((_, a) => {
          const slug = slugOfHref($(a).attr('href'));
          const title = cleanText($(a).text());
          if (!slug || !title || seen.has(slug)) return;
          seen.add(slug);
          list.push({ mangaId: slug, title });
        });
        if (list.length) this.cartoons = list;
        else throw new Error('WCO: the cartoon list is empty');
      }
      const from = (page - 1) * PAGE_SIZE;
      cards = this.cartoons.slice(from, from + PAGE_SIZE).map((c) => ({ mangaId: c.mangaId, title: c.title, image: '', webURL: `${SITES[0]}/anime/${c.mangaId}`, medium: 'anime' }));
      hasNext = from + PAGE_SIZE < this.cartoons.length;
    }
    await this.enrich(cards);
    return hasNext ? { results: cards, metadata: { page: page + 1 } } : { results: cards };
  }

  async getMangaDetails(mangaId) {
    const slug = checkSlug(mangaId);
    const info = await this.seriesInfo(slug);
    const out = {
      title: info.title,
      image: info.image,
      desc: info.desc,
      status: 'UNKNOWN',
      tags: info.genres.slice(0, 12),
      webURL: `${SITES[0]}/anime/${slug}`,
      medium: 'anime',
      ageRating: info.ageRating,
    };
    return { mangaInfo: out };
  }

  async getChapters(mangaId) {
    const slug = checkSlug(mangaId);
    const $ = cheerio.load(await this.html(`/anime/${slug}`));
    const rows = [];
    const seen = new Set();
    $('#episodeList a.dark-episode-item').each((_, a) => {
      const node = $(a);
      const id = String(node.attr('href') || '').replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+/, '').split(/[?#]/)[0];
      if (!/^[A-Za-z0-9%._~-]+$/.test(id) || seen.has(id)) return;
      seen.add(id);
      const label = cleanText(node.find('span').first().text()) || id;
      const lang = String(node.attr('data-lang') || '');
      const m = /^(?:Season\s+(\d+)\s+)?Episode\s+(\d+(?:\.\d+)?)\s*(.*)$/i.exec(label);
      const sm = /^s(\d+)/.exec(String(node.attr('data-season') || ''));
      const season = m && m[1] ? parseInt(m[1], 10) : sm ? parseInt(sm[1], 10) : 1;
      const number = m ? parseFloat(m[2]) : undefined;
      let name = label;
      if (m) {
        const rest = cleanText(m[3]).replace(/\s*English (Subbed|Dubbed)\s*$/i, '');
        name = `Episode ${m[2]}${rest ? ': ' + rest : ''}`;
      }
      if (lang === 'sub') name += ' (Sub)';
      else if (lang === 'dub') name += ' (Dub)';
      rows.push({ id, name, number, season, lang });
    });
    if (!rows.length) throw new Error('WCO has no episodes for this series yet');
    const many = new Set(rows.map((r) => r.season)).size > 1;
    return rows.map((r) => {
      const out = { id: r.id, chapterId: r.id, name: r.name };
      if (r.number !== undefined && Number.isFinite(r.number)) out.number = r.number;
      if (many) {
        out.season = String(r.season);
        out.seasonName = `Season ${r.season}`;
      }
      return out;
    });
  }

  async getVideos(mangaId, chapterId) {
    const id = String(chapterId || '');
    if (!/^[A-Za-z0-9%._~-]+$/.test(id)) throw new Error('WCO: unknown episode id ' + id);
    const html = await this.html(`/${id}`);
    const pageUrl = `${SITES[this.start]}/${id}`;
    const player = decodePlayer(html) || html;
    const src = (/<iframe[^>]*\ssrc=["']([^"']*\/inc\/embed\/index\.php\?[^"']*)["']/i.exec(player) || [])[1];
    if (!src) {
      if (/This Video Is for Premium Users/i.test(html)) throw new Error('WCO: this episode is for Premium users only');
      throw new Error('WCO: the episode page names no player');
    }
    const query = src.slice(src.indexOf('?') + 1).replace(/&amp;/g, '&');
    const playerPage = `${EMBED}/inc/embed/video-js.php?${query}`;
    const video = await this.plain(playerPage, { Referer: pageUrl, 'User-Agent': UA });
    const call = (/\$\.getJSON\(\s*["']([^"']*getvidlink\.php[^"']*)["']/.exec(video) || [])[1];
    if (!call) {
      if (/To watch this episode please go to/i.test(video)) throw new Error('WCO: the player link was refused (expired or changed), open the episode again');
      throw new Error('WCO: the player page holds no stream call');
    }
    const answer = await this.plain(EMBED + (call.startsWith('/') ? '' : '/') + call.replace(/&amp;/g, '&'), { Referer: playerPage, 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json, */*', 'User-Agent': UA });
    let data = null;
    try {
      data = JSON.parse(answer);
    } catch (e) {
      data = null;
    }
    if (!data || !data.server || !(data.fhd || data.hd || data.enc)) throw new Error(`WCO: the stream call answered ${cleanText(answer).slice(0, 40) || 'nothing'}`);
    const server = String(data.server).replace(/\/+$/, '');
    const qualities = [
      ['Full HD, 1080p', data.fhd],
      ['HD, 720p', data.hd],
      ['SD, 576p', data.enc],
    ].filter((q) => q[1]);
    const seen = new Set();
    const resolved = await Promise.all(
      qualities.map(async ([label, token]) => {
        if (seen.has(token)) return null;
        seen.add(token);
        const direct = `${server}/getvid?evid=${token}`;
        let url = direct;
        try {
          const node = JSON.parse(await this.plain(`${direct}&json`, { Referer: playerPage, 'User-Agent': UA }));
          if (typeof node === 'string' && /^https:\/\/\./.test(node)) return null;
          if (typeof node === 'string' && /^https:\/\/[^/]+\.wcostream\.com\//.test(node)) url = node;
        } catch (e) {
          if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
        }
        const entry = { url, quality: label, type: 'mp4', server: 'WCO', headers: { 'User-Agent': UA } };
        if (data.sub) entry.subtitles = [{ url: `${server}/getvid?evid=${data.sub}`, label: 'English', language: 'en' }];
        return entry;
      })
    );
    const videos = resolved.filter(Boolean);
    if (!videos.length) throw new Error('WCO gave no stream for this episode');
    return videos;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async raw(request) {
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await this.requests.schedule(App.createRequest(request));
      } catch (e) {
        if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
        last = e;
      }
    }
    throw last;
  }

  async send(path, spec) {
    let last = null;
    for (let i = 0; i < SITES.length; i++) {
      const base = SITES[(this.start + i) % SITES.length];
      let response;
      try {
        response = await this.raw({
          url: base + path,
          method: (spec && spec.method) || 'GET',
          headers: Object.assign({ Accept: 'text/html,application/xhtml+xml,*/*' }, spec && spec.headers ? (typeof spec.headers === 'function' ? spec.headers(base) : spec.headers) : {}),
          body: spec && spec.body,
        });
      } catch (e) {
        if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
        last = e;
        continue;
      }
      if (response.status === 404) throw new Error('WCO: not found (HTTP 404)');
      if (response.status === 451 || response.status >= 500 || response.status === 403) {
        last = new Error(`WCO: ${base} answered HTTP ${response.status}`);
        continue;
      }
      if (response.status < 200 || response.status >= 300) throw new Error(`WCO: HTTP ${response.status}`);
      const body = String(response.data || '');
      if (!/wco|cartoon/i.test(body.slice(0, 300000))) {
        last = new Error(`WCO: ${base} did not answer with the site`);
        continue;
      }
      this.start = (this.start + i) % SITES.length;
      return body;
    }
    throw last || new Error('WCO is not reachable');
  }

  async html(path) {
    return this.send(path);
  }

  async plain(url, headers) {
    const response = await this.raw({ url, method: 'GET', headers: Object.assign({ Accept: '*/*' }, headers || {}) });
    if (response.status < 200 || response.status >= 300) throw new Error(`WCO: ${(/^https?:\/\/([^/]+)/.exec(url) || [])[1] || 'the stream host'} answered HTTP ${response.status}`);
    return String(response.data || '');
  }
}

module.exports = { Source };
