const SITE = 'https://kuroko.cc';
const ANILIST = 'https://graphql.anilist.co';

const SAME_ORIGIN = { 'Sec-Fetch-Site': 'same-origin' };
const STREAM_HEADERS = { Referer: `${SITE}/` };

const FEEDS = [
  { id: 'season', name: 'This Season', path: 'browse?season=current', block: 0 },
  { id: 'airing', name: 'Airing Now', path: 'browse?status=current', block: 0 },
  { id: 'library', name: 'Library', path: 'browse', block: 1 },
  { id: 'az', name: 'A-Z Directory', format: '' },
  { id: 'movies', name: 'Movies A-Z', format: 'MOVIE' },
];
const GENRES = ['Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Mecha', 'Music', 'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural'];
const LETTERS = ['0', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
const AZ_PAGE = 24;

const LANGS = {
  english: 'en', portuguese: 'pt', spanish: 'es', arabic: 'ar', german: 'de', french: 'fr', italian: 'it', russian: 'ru', japanese: 'ja', chinese: 'zh', korean: 'ko',
  indonesian: 'id', thai: 'th', vietnamese: 'vi', turkish: 'tr', polish: 'pl', hindi: 'hi', dutch: 'nl', malay: 'ms', czech: 'cs', greek: 'el', hebrew: 'he', romanian: 'ro',
  ukrainian: 'uk', swedish: 'sv', hungarian: 'hu', bulgarian: 'bg', croatian: 'hr', finnish: 'fi', danish: 'da', norwegian: 'no', tamil: 'ta', telugu: 'te', persian: 'fa',
};

const TAGS_18 = /^(rape|sexual violence|explicit sex)$/i;
const TAGS_16 = /^(nudity|hypersexuality|prostitution|incest|sexual content)$/i;

function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function absolute(url, base) {
  const raw = clean(url);
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.indexOf('//') === 0) return `https:${raw}`;
  const origin = (/^(https?:\/\/[^/]+)/i.exec(base || SITE) || [])[1] || SITE;
  if (raw.charAt(0) === '/') return origin + raw;
  return `${base ? base.replace(/[?#].*$/, '').replace(/[^/]*$/, '') : `${SITE}/`}${raw}`;
}

function ageOf(genres, tags, adult) {
  const g = (genres || []).map((x) => clean(x).toLowerCase());
  const t = (tags || []).map((x) => clean(x));
  if (adult || g.indexOf('hentai') >= 0 || t.some((x) => TAGS_18.test(x))) return 18;
  if (g.indexOf('ecchi') >= 0 || t.some((x) => TAGS_16.test(x))) return 16;
  return 0;
}

function parseId(mangaId) {
  const id = String(mangaId || '').trim();
  if (!/^\d{1,9}$/.test(id)) throw new Error(`Kuroko: unknown title id ${id}`);
  return id;
}

function languageOf(label) {
  const word = clean(label).split(/[\s(-]/)[0].toLowerCase();
  return LANGS[word] || '';
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.meta = new Map();
    this.pages = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map((g) => ({ id: g, label: g }));
  }

  async send(url, options) {
    const o = options || {};
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.requests.schedule(
          App.createRequest({ url, method: o.method || 'GET', headers: Object.assign({ Accept: o.accept || 'text/html,application/xhtml+xml,application/json' }, o.headers || {}), body: o.body })
        );
        if (response.status !== 429 && (response.status < 502 || response.status > 504)) return response;
        last = response;
      } catch (e) {
        if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
        if (attempt === 1) throw e;
      }
      await pause(700);
    }
    return last;
  }

  async html(path) {
    const response = await this.send(absolute(path, `${SITE}/`));
    if (response.status === 404) throw new Error('Kuroko: not found (HTTP 404)');
    if (response.status < 200 || response.status >= 300) throw new Error(`Kuroko: HTTP ${response.status}`);
    return String(response.data || '');
  }

  async api(path, options) {
    const o = options || {};
    const response = await this.send(`${SITE}/index.php?page=${path}`, { accept: 'application/json', headers: Object.assign({}, SAME_ORIGIN, o.headers || {}) });
    let data = null;
    try {
      data = JSON.parse(String(response.data || ''));
    } catch (e) {
      data = null;
    }
    if (response.status === 403) throw new Error('Kuroko refused the request (HTTP 403 forbidden)');
    if (!data) throw new Error(`Kuroko answered something that is not JSON (HTTP ${response.status})`);
    return data;
  }

  async enrich(ids) {
    const out = new Map();
    const todo = [];
    for (const id of ids) {
      const hit = this.meta.get(id);
      if (hit) out.set(id, hit);
      else todo.push(id);
    }
    const query = 'query($ids:[Int]){Page(perPage:50){media(id_in:$ids,type:ANIME){id isAdult genres format seasonYear status coverImage{medium} tags{name rank}}}}';
    for (let i = 0; i < todo.length; i += 50) {
      try {
        const response = await this.send(ANILIST, {
          method: 'POST',
          accept: 'application/json',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, variables: { ids: todo.slice(i, i + 50).map(Number) } }),
        });
        if (response.status !== 200) continue;
        const media = (((JSON.parse(String(response.data || '{}')) || {}).data || {}).Page || {}).media || [];
        for (const m of media) {
          const tags = (m.tags || []).filter((t) => t && t.rank >= 50).map((t) => t.name);
          const cover = clean(m.coverImage && m.coverImage.medium).replace('/cover/medium/', '/cover/small/');
          const meta = { genres: m.genres || [], age: ageOf(m.genres, tags, m.isAdult), cover, format: clean(m.format), year: m.seasonYear || 0, status: clean(m.status) };
          this.meta.set(String(m.id), meta);
          out.set(String(m.id), meta);
        }
      } catch (e) {
        if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
      }
    }
    return out;
  }

  async results(rows) {
    const meta = await this.enrich(rows.map((r) => r.id));
    return rows.map((r) => {
      const m = meta.get(r.id);
      const card = { mangaId: r.id, title: r.title, image: (m && m.cover) || r.image || `${SITE}/assets/covers/al-${r.id}.jpg`, medium: 'anime', ageRating: m ? m.age : Math.max(r.age || 0, 16) };
      const parts = [m && m.format ? m.format.replace(/_/g, ' ') : r.format, (m && m.year) || r.year, r.note].filter(Boolean);
      if (parts.length) card.summary = parts.join(', ');
      if (m && m.genres.length) card.tags = m.genres.slice(0, 6);
      return card;
    });
  }

  grids(html) {
    const $ = cheerio.load(html);
    const blocks = [];
    $('.browse-results .poster-grid').each((b, grid) => {
      const rows = [];
      const seen = new Set();
      $(grid)
        .find('article.anime-card')
        .each((i, el) => {
          const node = $(el);
          const id = clean(node.attr('data-id'));
          const title = clean(node.find('.card-title').first().text());
          if (!/^\d+$/.test(id) || !title || seen.has(id)) return;
          seen.add(id);
          const langs = node.find('.langs span').map((j, s) => clean($(s).text())).get();
          rows.push({ id, title, image: absolute(node.find('img').first().attr('src')), note: langs.join(' and ') });
        });
      blocks.push(rows);
    });
    return blocks;
  }

  async azPage(letter, page, format) {
    const url = `${SITE}/index.php?page=azlist&letter=${encodeURIComponent(letter)}${format ? `&format=${format}` : ''}${page > 1 ? `&page_n=${page}` : ''}`;
    const response = await this.send(url);
    if (response.status < 200 || response.status >= 300) throw new Error(`Kuroko: HTTP ${response.status}`);
    const html = String(response.data || '');
    const total = Number((/of ([\d,]+) titles/.exec(html) || [])[1] ? (/of ([\d,]+) titles/.exec(html) || [])[1].replace(/,/g, '') : 0);
    const $ = cheerio.load(html);
    const rows = [];
    $('.az-grid a.az-card').each((i, el) => {
      const node = $(el);
      const m = /details\?id=(\d+)/.exec(node.attr('href') || '');
      const title = clean(node.find('.az-card-name').first().text());
      if (!m || !title) return;
      rows.push({ id: m[1], title, image: absolute(node.find('img').first().attr('src')) });
    });
    return { rows, pages: Math.max(1, Math.ceil(total / AZ_PAGE)) };
  }

  async getSearchResults(request, metadata) {
    const query = clean(request && request.title);
    const feed = FEEDS.find((f) => f.id === ((request && request.feed) || FEEDS[0].id)) || FEEDS[0];
    if (query) {
      const data = await this.api(`api.search&q=${encodeURIComponent(query)}`);
      if (data.ok === false) {
        if (/slow down|too many/i.test(String(data.error || ''))) throw new Error('Kuroko says too many requests, wait a minute and search again');
        return { results: [], metadata: undefined };
      }
      const rows = [];
      const seen = new Set();
      for (const x of data.results || []) {
        const id = clean(x.id);
        const title = clean(x.title);
        if (!/^\d+$/.test(id) || !title || seen.has(id)) continue;
        seen.add(id);
        const note = /NOT_YET|UPCOMING/i.test(String(x.status || '')) ? 'Upcoming' : '';
        rows.push({ id, title, image: absolute(x.image), age: ageOf(x.genres, [], false), note, year: Number(x.year) || 0, format: clean(x.format) });
      }
      return { results: await this.results(rows), metadata: undefined };
    }
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const genre = included.length ? String(included[0].id || included[0]) : '';
    if (genre) {
      if (GENRES.indexOf(genre) < 0) return { results: [], metadata: undefined };
      const blocks = this.grids(await this.html(`browse?genre=${encodeURIComponent(genre).replace(/%20/g, '+')}`));
      const seen = new Set();
      const rows = [].concat(...blocks).filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
      return { results: await this.results(rows), metadata: undefined };
    }
    if (feed.path) {
      const rows = this.grids(await this.html(feed.path))[feed.block] || [];
      return { results: await this.results(rows), metadata: undefined };
    }
    let letter = metadata && Number.isFinite(metadata.letter) ? metadata.letter : 0;
    let page = (metadata && metadata.page) || 1;
    for (let hops = 0; hops < 4 && letter < LETTERS.length; hops++) {
      const got = await this.azPage(LETTERS[letter], page, feed.format);
      if (got.rows.length) {
        const more = page < got.pages ? { letter, page: page + 1 } : letter + 1 < LETTERS.length ? { letter: letter + 1, page: 1 } : undefined;
        return { results: await this.results(got.rows), metadata: more };
      }
      letter += 1;
      page = 1;
    }
    return { results: [], metadata: letter < LETTERS.length ? { letter, page: 1 } : undefined };
  }

  async page(id) {
    const hit = this.pages.get(id);
    if (hit && Date.now() - hit.at < 60000) return hit.html;
    const html = await this.html(`details?id=${id}`);
    this.pages.set(id, { at: Date.now(), html });
    if (this.pages.size > 12) this.pages.delete(this.pages.keys().next().value);
    return html;
  }

  fieldsOf($) {
    const fields = {};
    $('.detail-sidebar .field').each((i, el) => {
      const node = $(el);
      const name = clean(node.find('h3').first().text());
      if (!name) return;
      const chips = node.find('.chip').map((j, c) => clean($(c).text())).get();
      fields[name] = chips.length ? chips : clean(node.find('span').first().text());
    });
    return fields;
  }

  async media(id) {
    const query = 'query($id:Int){Media(id:$id,type:ANIME){id isAdult title{romaji english} description(asHtml:false) genres format status episodes nextAiringEpisode{episode} coverImage{large} bannerImage averageScore tags{name rank}}}';
    try {
      const response = await this.send(ANILIST, { method: 'POST', accept: 'application/json', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables: { id: Number(id) } }) });
      if (response.status !== 200) return null;
      return ((JSON.parse(String(response.data || '{}')) || {}).data || {}).Media || null;
    } catch (e) {
      if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
      return null;
    }
  }

  mediaInfo(id, m) {
    const tags = (m.tags || []).filter((t) => t && t.rank >= 50).map((t) => t.name);
    const status = String(m.status || '');
    const info = {
      title: clean((m.title && (m.title.english || m.title.romaji)) || ''),
      image: clean(m.coverImage && m.coverImage.large) || `${SITE}/assets/covers/al-${id}.jpg`,
      desc: clean(String(m.description || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')) || undefined,
      status: status === 'RELEASING' ? 'ONGOING' : status === 'FINISHED' ? 'COMPLETED' : status === 'CANCELLED' ? 'CANCELLED' : status === 'HIATUS' ? 'HIATUS' : 'UNKNOWN',
      tags: (m.genres || []).concat(tags).slice(0, 24),
      webURL: `${SITE}/details?id=${id}`,
      medium: 'anime',
      ageRating: ageOf(m.genres, tags, m.isAdult),
    };
    info.completed = info.status === 'COMPLETED';
    if (m.bannerImage) info.banner = m.bannerImage;
    if (m.averageScore) info.rating = Math.round(Number(m.averageScore)) / 10;
    return info;
  }

  async getMangaDetails(mangaId) {
    const id = parseId(mangaId);
    let html;
    try {
      html = await this.page(id);
    } catch (e) {
      if (!/HTTP 404|not found/i.test(String(e && e.message))) throw e;
      const m = await this.media(id);
      if (!m) throw new Error('Kuroko: title not found');
      const info = this.mediaInfo(id, m);
      if (!info.title) throw new Error('Kuroko: title not found');
      return { mangaInfo: info };
    }
    const $ = cheerio.load(html);
    const title = clean($('.detail-hero h1').first().text());
    if (!title) throw new Error('Kuroko: title not found');
    const fields = this.fieldsOf($);
    const genres = Array.isArray(fields.Genres) ? fields.Genres : [];
    const tags = Array.isArray(fields.Tags) ? fields.Tags : [];
    const status = clean(fields.Status);
    const info = {
      title,
      image: absolute($('.detail-hero img.poster').first().attr('src')) || `${SITE}/assets/covers/al-${id}.jpg`,
      desc: clean($('#detail-desc').first().text()) || undefined,
      status: /airing/i.test(status) ? 'ONGOING' : /completed/i.test(status) ? 'COMPLETED' : 'UNKNOWN',
      tags: genres.concat(tags).slice(0, 24),
      webURL: `${SITE}/details?id=${id}`,
      medium: 'anime',
      ageRating: ageOf(genres, tags, false),
    };
    info.completed = info.status === 'COMPLETED';
    const banner = absolute($('.detail-hero img.backdrop').first().attr('src'));
    if (banner) info.banner = banner;
    const alt = clean($('.detail-hero .alt-title').first().text());
    if (alt && alt !== title) info.altTitles = [alt];
    const score = clean($('.detail-hero .score').first().text()).replace(/[^\d.]/g, '');
    if (score) info.rating = Math.round(Number(score)) / 10;
    return { mangaInfo: info };
  }

  async airedCount(id, $) {
    const fields = this.fieldsOf($);
    const status = clean(fields.Status);
    const total = Number(String(fields.Episodes || '').replace(/,/g, '')) || 0;
    const next = Number($('[data-countdown-ep]').first().attr('data-countdown-ep')) || 0;
    if (/upcoming/i.test(status)) return 0;
    if (/airing/i.test(status) && next > 1) return total > 0 ? Math.min(total, next - 1) : next - 1;
    if (total > 0 && !/airing/i.test(status)) return total;
    let count = 0;
    for (let page = 1; page <= 60; page++) {
      const html = page === 1 ? this.pages.get(id).html : await this.html(`details?id=${id}&tab=episodes&eppage=${page}`);
      const cards = [...html.matchAll(/<a class="ep-card([^"]*)" href="watch\?id=\d+&amp;ep=(\d+)"/g)];
      const aired = cards.filter((c) => !/future/.test(c[1]));
      count += aired.length;
      if (cards.length < 24 || aired.length < cards.length) break;
    }
    return count;
  }

  async getChapters(mangaId) {
    const id = parseId(mangaId);
    let html = null;
    try {
      html = await this.page(id);
    } catch (e) {
      if (!/HTTP 404|not found/i.test(String(e && e.message))) throw e;
    }
    let aired = 0;
    let movie = false;
    if (html) {
      const $ = cheerio.load(html);
      aired = await this.airedCount(id, $);
      movie = /movie/i.test(clean(this.fieldsOf($).Format)) && aired === 1;
    } else {
      const m = await this.media(id);
      if (!m) throw new Error('Kuroko: title not found');
      const status = String(m.status || '');
      const next = m.nextAiringEpisode && Number(m.nextAiringEpisode.episode) > 0 ? Number(m.nextAiringEpisode.episode) : 0;
      aired = status === 'NOT_YET_RELEASED' ? 0 : next ? next - 1 : Number(m.episodes) || 0;
      movie = /movie/i.test(String(m.format || '')) && aired === 1;
    }
    if (!aired) throw new Error('Kuroko has no episodes for this title yet (it has not started airing)');
    const out = [];
    for (let n = aired; n >= 1; n--) out.push({ id: String(n), chapterId: String(n), name: movie ? 'Movie' : `Episode ${n}`, number: n });
    return out;
  }

  async master(url, headers) {
    try {
      const response = await this.send(url, { accept: '*/*', headers });
      if (response.status < 200 || response.status >= 300) return { error: `HTTP ${response.status}` };
      const text = String(response.data || '');
      if (text.indexOf('#EXTM3U') < 0) return { error: 'not a playlist' };
      let top = 0;
      for (const h of text.match(/RESOLUTION=\d+x(\d+)/g) || []) top = Math.max(top, Number(h.split('x')[1]) || 0);
      const audio = [];
      for (const line of text.split('\n')) {
        if (line.indexOf('#EXT-X-MEDIA') !== 0 || !/TYPE=AUDIO/.test(line)) continue;
        const name = clean((/NAME="([^"]+)"/.exec(line) || [])[1]);
        if (name && audio.indexOf(name) < 0) audio.push(name);
      }
      return { top, audio };
    } catch (e) {
      if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
      return { error: String((e && e.message) || e) };
    }
  }

  async ask(id, ep, retry) {
    const data = await this.api(`api.stream&id=${id}&ep=${ep}${retry ? '&retry=1' : ''}`);
    if (data.ok === false) {
      const message = String(data.error || '');
      if (/slow down|too many/i.test(message)) throw new Error('Kuroko says too many stream requests, wait a minute and try again');
      if (/aired/i.test(message)) throw new Error(`Kuroko: episode ${ep} has not aired yet`);
      throw new Error(`Kuroko: ${message || 'its stream call failed'}`);
    }
    const servers = Array.isArray(data.servers) ? data.servers : [];
    const checked = await Promise.all(
      servers.map(async (s) => {
        const url = absolute(s && s.url, `${SITE}/`);
        if (!/^https?:\/\//.test(url)) return null;
        const probe = await this.master(url, STREAM_HEADERS);
        return { s, url, probe };
      })
    );
    return { listed: servers.length, checked: checked.filter(Boolean) };
  }

  async getVideos(mangaId, chapterId) {
    const id = parseId(mangaId);
    const ep = Number(String(chapterId || '').trim());
    if (!Number.isFinite(ep) || ep < 1) throw new Error(`Kuroko: unknown episode ${chapterId}`);
    let got = await this.ask(id, ep, false);
    if (!got.checked.some((c) => !c.probe.error)) {
      await pause(800);
      const again = await this.ask(id, ep, true);
      if (again.checked.length || !got.listed) got = again;
    }
    const videos = [];
    const failed = [];
    const seen = new Set();
    for (const c of got.checked) {
      if (c.probe.error) {
        failed.push(`${clean(c.s.name)}: ${c.probe.error}`);
        continue;
      }
      if (seen.has(c.url)) continue;
      seen.add(c.url);
      const dub = String(c.s.type || '').toLowerCase() === 'dub';
      const provider = String(c.s.provider || '');
      const server = /^kuroko-(\d+)$/.test(provider) ? `Kuroko ${provider.split('-')[1]}` : provider === 'anikoto' ? 'Inazuma' : clean(c.s.name).replace(/\s*\(?(sub|dub)\)?$/i, '') || 'Player';
      const subs = [];
      const names = new Set();
      for (const t of Array.isArray(c.s.subs) ? c.s.subs : []) {
        const url = absolute(t && t.url, `${SITE}/`);
        const name = clean(t && t.label);
        if (!/^https?:\/\//.test(url) || !name || names.has(name)) continue;
        names.add(name);
        const track = { url, label: name };
        const language = languageOf(name);
        if (language) track.language = language;
        subs.push(track);
      }
      subs.sort((a, b) => (a.language === 'en' ? 0 : 1) - (b.language === 'en' ? 0 : 1));
      const kind = dub ? 'Dub' : subs.length ? 'Softsub' : 'Sub, no subtitle file';
      const label = [server, c.probe.top ? `Auto up to ${c.probe.top}p` : 'Auto', kind];
      if (c.probe.audio.length > 1) label.push(`Audio: ${c.probe.audio.join(', ')}`);
      const video = { url: c.url, quality: label.join(', '), type: 'hls', server, headers: STREAM_HEADERS };
      if (subs.length) video.subtitles = subs.slice(0, 24);
      for (const key of ['intro', 'outro']) {
        const r = c.s[key];
        if (r && Number(r.end) > Number(r.start)) video[key] = { start: Math.round(Number(r.start) * 1000), end: Math.round(Number(r.end) * 1000) };
      }
      videos.push(video);
    }
    if (!videos.length) {
      if (!got.listed) throw new Error(`Kuroko has no stream for episode ${ep} of this title (none of its servers lists it)`);
      throw new Error(`Kuroko listed ${got.listed} server${got.listed === 1 ? '' : 's'} for episode ${ep} but none answered a playlist (${failed.slice(0, 3).join('; ')}), so the site itself cannot play it right now`);
    }
    return videos;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }
}

module.exports = { Source };
