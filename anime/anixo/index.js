const DB = 'https://db.anixo.buzz/index.php';
const ANILIST = 'https://graphql.anilist.co';
const VC = 'https://vidcloud.sbs';
const WEB = 'https://anixo.live';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

const XOR_BASE = 0x4d;
const XOR_PERIOD = 23;
const PAGE_SIZE = 24;
const MAX_CARD_PAGES = 40;
const CACHE_MS = 5 * 60 * 1000;
const MAX_SUBTITLES = 40;
const GRACE_MS = 6000;

const FEEDS = [
  { id: 'trending', name: 'Trending', sort: 'TRENDING_DESC' },
  { id: 'popular', name: 'Popular', sort: 'POPULARITY_DESC' },
  { id: 'seasonal', name: 'Airing This Season', sort: 'POPULARITY_DESC', status: 'RELEASING' },
];

const LANG_CODES = {
  english: 'en', arabic: 'ar', french: 'fr', german: 'de', italian: 'it', portuguese: 'pt', spanish: 'es', russian: 'ru', japanese: 'ja',
  chinese: 'zh', korean: 'ko', indonesian: 'id', malay: 'ms', thai: 'th', vietnamese: 'vi', turkish: 'tr', hindi: 'hi', polish: 'pl',
  dutch: 'nl', czech: 'cs', greek: 'el', hebrew: 'he', hungarian: 'hu', romanian: 'ro', swedish: 'sv', danish: 'da', finnish: 'fi',
  norwegian: 'no', ukrainian: 'uk', bulgarian: 'bg', croatian: 'hr', serbian: 'sr', slovak: 'sk', slovenian: 'sl', catalan: 'ca',
  filipino: 'fil', persian: 'fa', bengali: 'bn', tamil: 'ta', telugu: 'te', urdu: 'ur', lithuanian: 'lt', latvian: 'lv', estonian: 'et',
};

function ageRatingOf(genres, isAdult) {
  const list = Array.isArray(genres) ? genres.map((g) => String(g).toLowerCase()) : [];
  if (isAdult || list.indexOf('hentai') !== -1) return 18;
  if (list.indexOf('ecchi') !== -1) return 16;
  return 0;
}

function statusOf(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'RELEASING') return 'ONGOING';
  if (s === 'FINISHED') return 'COMPLETED';
  return 'UNKNOWN';
}

function cleanText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function pickTitle(t) {
  if (!t) return '';
  return String(t.english || t.userPreferred || t.romaji || t.native || '').trim();
}

function bigCover(url) {
  return String(url || '').replace('/cover/medium/', '/cover/large/');
}

function base64urlToBytes(text) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = String(text || '').replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/]/g, '');
  const out = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    buffer = (buffer << 6) | chars.indexOf(clean.charAt(i));
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
      buffer &= (1 << bits) - 1;
    }
  }
  return out;
}

function unseal(payload) {
  const bytes = base64urlToBytes(payload);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] ^ ((XOR_BASE + (i % XOR_PERIOD)) & 0xff));
  }
  let text;
  try {
    text = decodeURIComponent(escape(binary));
  } catch (e) {
    text = binary;
  }
  return JSON.parse(text);
}

function langCodeOf(label) {
  const first = String(label || '').toLowerCase().replace(/\(.*$/, '').replace(/ - .*$/, '').trim().split(/[\s,/]+/)[0];
  return LANG_CODES[first] || undefined;
}

function resolveUrl(rel, base) {
  if (/^https?:\/\//i.test(rel)) return rel;
  const origin = (/^https?:\/\/[^/]+/i.exec(base) || [''])[0];
  if (rel.charAt(0) === '/') return origin + rel;
  return base.replace(/[?#].*$/, '').replace(/[^/]*$/, '') + rel;
}

function firstUri(playlist) {
  const lines = String(playlist || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line && line.charAt(0) !== '#') return line;
  }
  return '';
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.detailCache = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchResults(request, metadata) {
    const query = String((request && request.title) || '').trim();
    const page = (metadata && metadata.page) || 1;
    if (query) return this.search(query, page);
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    return this.browse(feed, page);
  }

  async browse(feed, page) {
    let media = null;
    try {
      let json = await this.json(`${DB}?api=cards&type=${feed.id}&page=${page}&limit=${PAGE_SIZE}`);
      if (page === 1 && json && json.success && Array.isArray(json.media) && json.media.length === 0) {
        json = await this.json(`${DB}?api=cards&type=${feed.id}&page=${page}&limit=${PAGE_SIZE}&r=1`);
      }
      if (json && json.success && Array.isArray(json.media)) media = json.media;
    } catch (e) {
      console.error('AniXo cards failed, asking AniList instead:', e && e.message);
    }
    let more;
    if (media) {
      more = media.length >= PAGE_SIZE && page < MAX_CARD_PAGES;
    } else {
      const listed = await this.aniList(feed, page);
      media = listed.media;
      more = listed.more;
    }
    const results = media.map((m) => this.toResult(m)).filter(Boolean);
    return { results, metadata: more ? { page: page + 1 } : undefined };
  }

  async aniList(feed, page) {
    const status = feed.status ? ',status:' + feed.status : '';
    const q = `query($page:Int){Page(page:$page,perPage:${PAGE_SIZE}){pageInfo{hasNextPage}media(type:ANIME,isAdult:false,sort:${feed.sort}${status}){id title{romaji english} coverImage{medium large} format status episodes genres isAdult}}}`;
    const json = await this.graphql(q, { page });
    const pageData = (json.data && json.data.Page) || {};
    return { media: pageData.media || [], more: !!(pageData.pageInfo && pageData.pageInfo.hasNextPage) };
  }

  async search(query, page) {
    const q = `query($page:Int,$search:String){Page(page:$page,perPage:20){pageInfo{hasNextPage}media(type:ANIME,search:$search,isAdult:false,sort:SEARCH_MATCH){id title{romaji english} coverImage{medium large} format status episodes genres isAdult}}}`;
    let current = page;
    for (let attempt = 0; attempt < 3; attempt++) {
      const json = await this.graphql(q, { page: current, search: query });
      const pageData = (json.data && json.data.Page) || {};
      let media = pageData.media || [];
      if (media.length) {
        try {
          const tracks = await this.tracks(media.map((m) => m.id));
          media = media.filter((m) => {
            const t = tracks[String(m.id)];
            return t && (t.sub > 0 || t.dub > 0);
          });
        } catch (e) {
          console.error('AniXo tracks lookup failed:', e && e.message);
        }
      }
      const more = !!(pageData.pageInfo && pageData.pageInfo.hasNextPage);
      const results = media.map((m) => this.toResult(m)).filter(Boolean);
      if (results.length || !more || attempt === 2) {
        return { results, metadata: more ? { page: current + 1 } : undefined };
      }
      current++;
    }
    return { results: [], metadata: undefined };
  }

  async tracks(ids) {
    const json = await this.json(`${DB}?api=tracks_batch&ids=${ids.join(',')}&type=ani`);
    return (json && json.success && json.data) || {};
  }

  toResult(m) {
    if (!m || !m.id) return null;
    const title = pickTitle(m.title);
    if (!title) return null;
    const cover = m.coverImage || {};
    const genres = Array.isArray(m.genres) ? m.genres : [];
    return {
      mangaId: String(m.id),
      title,
      image: cover.medium || cover.large || cover.extraLarge || undefined,
      tags: genres.length ? genres.slice(0, 5) : undefined,
      ageRating: ageRatingOf(genres, m.isAdult),
      webURL: `${WEB}/watch/${m.id}`,
      medium: 'anime',
    };
  }

  async detail(mangaId) {
    const id = String(mangaId || '').replace(/[^0-9]/g, '');
    if (!id) throw new Error('AniXo: bad title id');
    const hit = this.detailCache.get(id);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
    let value = null;
    try {
      const d = await this.json(`${DB}?api=detail&id=${id}`);
      if (d && d.anilist_id) {
        value = {
          id,
          title: String(d.title_english || d.title_romaji || d.title_native || ''),
          alt: [d.title_romaji, d.title_native].concat(Array.isArray(d.synonyms) ? d.synonyms : []).filter((x) => x && x !== (d.title_english || d.title_romaji)),
          description: cleanText(d.description),
          image: bigCover(d.cover_image),
          banner: d.banner_image || undefined,
          genres: Array.isArray(d.genres) ? d.genres : [],
          isAdult: false,
          status: d.status,
          format: d.format,
          episodes: Number(d.episodes) || 0,
          nextEp: Number(d.next_air_ep) || 0,
          sub: Number(d.anikoto_sub) || 0,
          dub: Number(d.anikoto_dub) || 0,
        };
      }
    } catch (e) {
      console.error('AniXo detail failed, asking AniList instead:', e && e.message);
    }
    if (!value) value = await this.detailFromAniList(id);
    this.detailCache.set(id, { at: Date.now(), value });
    return value;
  }

  async detailFromAniList(id) {
    const q = `query($id:Int){Media(id:$id,type:ANIME){id title{romaji english native} synonyms description(asHtml:false) coverImage{large} bannerImage format status episodes genres isAdult nextAiringEpisode{episode}}}`;
    const json = await this.graphql(q, { id: Number(id) });
    const m = json.data && json.data.Media;
    if (!m) throw new Error('AniXo: title not found');
    let sub = 0;
    let dub = 0;
    try {
      const t = (await this.tracks([id]))[id];
      if (t) {
        sub = Number(t.sub) || 0;
        dub = Number(t.dub) || 0;
      }
    } catch (e) {
      console.error('AniXo tracks lookup failed:', e && e.message);
    }
    return {
      id,
      title: pickTitle(m.title),
      alt: [m.title && m.title.romaji, m.title && m.title.native].concat(m.synonyms || []).filter((x) => x && x !== pickTitle(m.title)),
      description: cleanText(m.description),
      image: m.coverImage && m.coverImage.large,
      banner: m.bannerImage || undefined,
      genres: m.genres || [],
      isAdult: !!m.isAdult,
      status: m.status,
      format: m.format,
      episodes: Number(m.episodes) || 0,
      nextEp: m.nextAiringEpisode ? Number(m.nextAiringEpisode.episode) || 0 : 0,
      sub,
      dub,
    };
  }

  async getMangaDetails(mangaId) {
    const d = await this.detail(mangaId);
    const seen = {};
    const alt = d.alt.filter((x) => {
      const k = String(x);
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });
    return {
      mangaInfo: {
        title: d.title,
        image: d.image || undefined,
        banner: d.banner,
        desc: d.description || undefined,
        status: statusOf(d.status),
        tags: d.genres,
        ageRating: ageRatingOf(d.genres, d.isAdult),
        altTitles: alt.length ? alt.slice(0, 8) : undefined,
        webURL: `${WEB}/watch/${d.id}`,
        medium: 'anime',
      },
    };
  }

  async getChapters(mangaId) {
    const d = await this.detail(mangaId);
    let total = d.sub || d.dub;
    if (!total) {
      throw new Error('AniXo has no stream source for this title (the site only streams titles of its Anikoto library)');
    }
    const episodes = [];
    for (let n = total; n >= 1; n--) {
      episodes.push({ id: String(n), chapterId: String(n), name: `Episode ${n}`, number: n });
    }
    return episodes;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async getVideos(mangaId, chapterId) {
    const id = String(mangaId || '').replace(/[^0-9]/g, '');
    const episode = parseInt(String(chapterId || ''), 10);
    if (!id || !episode || episode < 1) throw new Error('AniXo: bad episode id');

    let dubCount = 0;
    try {
      dubCount = (await this.detail(id)).dub;
    } catch (e) {
      dubCount = 0;
    }
    const tracks = ['sub'];
    if (dubCount >= episode) tracks.push('dub');

    const asks = [];
    tracks.forEach((track) => [1, 2].forEach((server) => asks.push({ track, server })));

    const claimed = {};
    const entries = [];
    let fatal = null;
    let refused = 0;
    await new Promise((resolve) => {
      let pending = asks.length;
      let timer = null;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        resolve();
      };
      asks.forEach((ask) => {
        this.candidate(id, episode, ask, claimed)
          .then((entry) => {
            if (entry === false) refused++;
            else if (entry) {
              entries.push(entry);
              if (!timer && !finished) timer = setTimeout(finish, GRACE_MS);
            }
          })
          .catch((e) => {
            fatal = fatal || e;
          })
          .then(() => {
            pending--;
            if (pending === 0) finish();
          });
      });
    });
    if (!entries.length) {
      if (fatal) throw fatal;
      if (refused) {
        throw new Error(`AniXo has no playable stream for episode ${episode} yet (${refused} server answer(s), none gave video)`);
      }
      throw new Error(`AniXo has no stream for episode ${episode} yet (VidCloud returned no source for sub${tracks.length > 1 ? ' or dub' : ''})`);
    }
    const rank = (e) => (e.quality === 'Auto Sub' ? 0 : 10) + (e.server === 'Sora' ? 0 : e.server === 'Zexy' ? 1 : 2);
    entries.sort((a, b) => rank(a) - rank(b));
    return entries;
  }

  async candidate(id, episode, ask, claimed) {
    let data;
    try {
      data = await this.sources(id, episode, ask.server, ask.track);
    } catch (e) {
      if (e && (e.kind === 'blocked' || e.kind === 'challenge' || /allowed hosts/i.test(String(e.message)))) throw e;
      return null;
    }
    const src = data && data.sources && data.sources[0];
    if (!src || !src.file) return null;
    const name = String(src.label || (data.server === 2 ? 'Zexy' : 'Sora'));
    const key = ask.track + '|' + name;
    if (claimed[key]) return null;
    claimed[key] = true;
    if ((await this.verify(src.file)) === false) return false;
    const entry = { url: src.file, quality: ask.track === 'dub' ? 'Auto Dub' : 'Auto Sub', server: name };
    const subs = this.subtitlesOf(data);
    if (subs.length) entry.subtitles = subs;
    const intro = this.range(data.intro);
    if (intro) entry.intro = intro;
    const outro = this.range(data.outro);
    if (outro) entry.outro = outro;
    return entry;
  }

  async sources(id, episode, server, track) {
    const json = await this.json(`${VC}/embed-2/v3/e-1/getSources?id=${id}-${episode}-${server}-${track}`);
    if (json && json.encrypted && typeof json.data === 'string') return unseal(json.data);
    if (json && json.sources) return json;
    return null;
  }

  range(r) {
    if (!r) return null;
    const start = Number(r.start);
    const end = Number(r.end);
    if (!isFinite(start) || !isFinite(end) || end <= start) return null;
    return { start: Math.round(start * 1000), end: Math.round(end * 1000) };
  }

  subtitlesOf(data) {
    const out = [];
    const list = (data && data.tracks) || [];
    for (let i = 0; i < list.length && out.length < MAX_SUBTITLES; i++) {
      const t = list[i];
      if (!t || !t.file || (t.kind && String(t.kind).toLowerCase() !== 'captions')) continue;
      const label = String(t.label || 'Subtitles');
      const sub = { url: t.file, label };
      const code = langCodeOf(label);
      if (code) sub.language = code;
      out.push(sub);
    }
    out.sort((a, b) => (a.language === 'en' ? 0 : 1) - (b.language === 'en' ? 0 : 1));
    return out;
  }

  async verify(masterUrl) {
    try {
      const master = await this.raw(masterUrl);
      if (master.status !== 200 || !/^\s*#EXTM3U/.test(String(master.data))) return false;
      let listUrl = masterUrl;
      let list = String(master.data);
      if (list.indexOf('#EXT-X-STREAM-INF') !== -1) {
        listUrl = resolveUrl(firstUri(list), masterUrl);
        const variant = await this.raw(listUrl);
        if (variant.status !== 200) return false;
        list = String(variant.data);
      }
      const segs = [];
      list.split('\n').forEach((line) => {
        const t = line.trim();
        if (t && t.charAt(0) !== '#') segs.push(t);
      });
      if (!segs.length) return false;
      const picks = [segs[0], segs[Math.floor(segs.length / 2)], segs[segs.length - 1]];
      const parts = await Promise.all(picks.map((p) => this.raw(resolveUrl(p, listUrl), { Range: 'bytes=0-1023' })));
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].status !== 200 && parts[i].status !== 206) return false;
        const body = String(parts[i].data);
        if (/^Upstream chunk error|^Missing stream|^<!doctype|^<html/i.test(body.slice(0, 40))) return false;
        if (body.length < 188) return false;
      }
      return true;
    } catch (e) {
      if (e && (e.kind === 'blocked' || e.kind === 'challenge' || /allowed hosts/i.test(String(e.message)))) throw e;
      return null;
    }
  }

  async raw(url, extraHeaders) {
    return this.requests.schedule(
      App.createRequest({
        url,
        method: 'GET',
        headers: Object.assign({ 'User-Agent': UA, Accept: '*/*' }, extraHeaders || {}),
      })
    );
  }

  async json(url) {
    const response = await this.raw(url, { Accept: 'application/json' });
    const body = String(response.data || '');
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`AniXo: HTTP ${response.status} from ${(/^https?:\/\/([^/]+)/.exec(url) || [])[1]}: ${body.slice(0, 120)}`);
    }
    try {
      return typeof response.data === 'object' && response.data ? response.data : JSON.parse(body);
    } catch (e) {
      throw new Error(`AniXo: not JSON from ${(/^https?:\/\/([^/]+)/.exec(url) || [])[1]}: ${body.slice(0, 80)}`);
    }
  }

  async graphql(query, variables) {
    const response = await this.requests.schedule(
      App.createRequest({
        url: ANILIST,
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables }),
      })
    );
    const body = String(response.data || '');
    if (response.status === 429) throw new Error('AniXo: AniList is rate limiting (HTTP 429), try again in a minute: ' + body.slice(0, 100));
    if (response.status < 200 || response.status >= 300) throw new Error(`AniXo: AniList HTTP ${response.status}: ${body.slice(0, 120)}`);
    let json;
    try {
      json = JSON.parse(body);
    } catch (e) {
      throw new Error('AniXo: AniList answered something that is not JSON: ' + body.slice(0, 80));
    }
    if (json.errors && json.errors.length) throw new Error('AniXo: AniList error: ' + String(json.errors[0].message || '').slice(0, 120));
    return json;
  }
}

module.exports = { Source };
