const API = 'https://api3.devcorp.me/';
const SITE = 'https://onetouchtv.xyz';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const KEY_TEXT = 'im72charPasswordofdInitVectorStm';

const FEEDS = [
  { id: 'popular', name: 'Popular Dramas' },
  { id: 'movies', name: 'Movies' },
  { id: 'recent', name: 'Latest' },
  { id: 'week', name: 'Top This Week' },
  { id: 'month', name: 'Top This Month' },
];

const SERVERS = { loklok: 'Loklok', 'myasiantv.es': 'MyAsianTV', moviebox: 'MovieBox' };
const KIND_ORDER = { hls: 0, mp4: 1, dash: 2 };

const LANGUAGES = {
  english: 'en', arabic: 'ar', chinese: 'zh', indonesian: 'id', japanese: 'ja', khmer: 'km', korean: 'ko', malay: 'ms', thai: 'th', vietnamese: 'vi', french: 'fr', spanish: 'es',
  portuguese: 'pt', russian: 'ru', turkish: 'tr', hindi: 'hi', burmese: 'my', filipino: 'fil', tagalog: 'fil', bengali: 'bn', german: 'de', italian: 'it',
};

function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function title(text) {
  return clean(text).replace(/\b\w/g, (c) => c.toUpperCase());
}

function decrypt(raw) {
  const b64 = String(raw || '').trim().split('@').join('+').split('-_.').join('/');
  const key = CryptoJS.enc.Utf8.parse(KEY_TEXT);
  const iv = CryptoJS.enc.Utf8.parse(KEY_TEXT.slice(0, 16));
  let text = '';
  try {
    text = CryptoJS.AES.decrypt({ ciphertext: CryptoJS.enc.Base64.parse(b64) }, key, { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }).toString(CryptoJS.enc.Utf8);
  } catch (e) {
    text = '';
  }
  if (!text) throw new Error('OneTouchTV answered something this extension cannot read (the app key may have changed)');
  return JSON.parse(text);
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ageOf(genres, tags) {
  const g = (Array.isArray(genres) ? genres : []).map((x) => String(x).toLowerCase());
  const t = (Array.isArray(tags) ? tags : []).map((x) => String(x).toLowerCase());
  if (g.indexOf('mature') >= 0 || t.some((x) => /nudity|sexual|erotic/.test(x))) return 18;
  return undefined;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 2 } });
    this.details = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return [];
  }

  async api(path, fresh) {
    let response = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const url = `${API}${path}${fresh || attempt ? `${path.indexOf('?') >= 0 ? '&' : '?'}r=${Date.now()}${attempt}` : ''}`;
      response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { 'User-Agent': UA, Accept: '*/*' } }));
      if (response.status !== 429) break;
      if (attempt === 0) await pause(10500);
    }
    if (response.status === 404) throw new Error('OneTouchTV: not found (HTTP 404)');
    if (response.status === 429) throw new Error('OneTouchTV is limiting requests right now (HTTP 429). Wait a few seconds and try again.');
    if (response.status < 200 || response.status >= 300) throw new Error(`OneTouchTV: HTTP ${response.status}`);
    const body = decrypt(response.data);
    if (body && body.success === false) throw new Error(`OneTouchTV: ${clean(body.status) || 'not found'}`);
    return body && body.result;
  }

  async detail(mangaId) {
    const hit = this.details.get(mangaId);
    if (hit && Date.now() - hit.at < 60000) return hit.value;
    const value = await this.api(`web/vod/${encodeURIComponent(mangaId)}/detail`);
    this.details.set(mangaId, { at: Date.now(), value });
    if (this.details.size > 40) this.details.delete(this.details.keys().next().value);
    return value;
  }

  card(item) {
    if (!item || !item.id) return null;
    const name = clean(item.title);
    if (!name) return null;
    const out = { mangaId: String(item.id), title: name, image: /^https?:\/\//.test(String(item.image || '')) ? item.image : '', medium: 'anime' };
    const bits = [item.country ? title(item.country) : '', item.type === 'movie' ? 'Movie' : '', item.status === 'upcoming' ? 'Upcoming' : '', item.year || ''].filter(Boolean);
    if (bits.length) out.summary = bits.join(', ');
    return out;
  }

  async getSearchResults(request, metadata) {
    const query = clean(request && request.title);
    const feed = (request && request.feed) || FEEDS[0].id;
    let page = (metadata && metadata.page) || 1;
    const asList = (list) => (Array.isArray(list) ? list : list && typeof list === 'object' ? Object.values(list) : []);
    const results = [];
    const seen = new Set();
    const take = (items, keepUpcoming) => {
      for (const item of items) {
        const card = this.card(item);
        if (!card || seen.has(card.mangaId) || (!keepUpcoming && item.status === 'upcoming')) continue;
        seen.add(card.mangaId);
        results.push(card);
      }
    };
    const fetchPage = async (path) => {
      try {
        return asList(await this.api(path));
      } catch (e) {
        if (/404|not found/i.test(String(e.message))) return [];
        throw e;
      }
    };
    if (query) {
      const items = await fetchPage(`vod/search?page=${page}&keyword=${encodeURIComponent(query)}`);
      take(items, true);
      return { results, metadata: items.length >= 30 ? { page: page + 1 } : undefined };
    }
    if (feed === 'recent') {
      take(asList((await this.api('vod/home')).recents), false);
      return { results, metadata: undefined };
    }
    if (feed === 'week' || feed === 'month') {
      take(asList((await this.api('vod/top'))[feed]), false);
      return { results, metadata: undefined };
    }
    const path = feed === 'movies' ? 'vod/movie' : 'vod/popular';
    let more = true;
    for (let n = 0; n < 5 && more && results.length < 18; n++) {
      let items;
      try {
        items = await fetchPage(`${path}?page=${page}`);
      } catch (e) {
        if (results.length) break;
        throw e;
      }
      take(items, false);
      more = items.length >= 30;
      if (!more) break;
      page += 1;
    }
    return { results, metadata: more ? { page } : undefined };
  }

  async getMangaDetails(mangaId) {
    const r = await this.detail(mangaId);
    if (!r || !r.title) throw new Error('OneTouchTV: title not found');
    const genres = (Array.isArray(r.genres) ? r.genres : []).map(title).filter(Boolean);
    const state = String(r.status || '').toLowerCase();
    const names = (Array.isArray(r.actors) ? r.actors : []).map((a) => clean(typeof a === 'string' ? a : a && (a.name || a.title))).filter(Boolean).slice(0, 6);
    const info = {
      title: clean(r.title),
      image: /^https?:\/\//.test(String(r.poster || r.image || '')) ? r.poster || r.image : '',
      desc: clean(r.description) || undefined,
      author: names.length ? names.join(', ') : undefined,
      status: state === 'completed' ? 'COMPLETED' : state === 'ongoing' ? 'ONGOING' : 'UNKNOWN',
      tags: genres,
      webURL: `${SITE}/detail/${encodeURIComponent(mangaId)}`,
      medium: 'anime',
    };
    const alt = Array.isArray(r.otherTitles) ? r.otherTitles.map(clean).filter((t) => t && t !== info.title).slice(0, 3) : [];
    if (alt.length) info.desc = `${info.desc || ''}${info.desc ? '\n\n' : ''}Also known as: ${alt.join(' | ')}`;
    const age = ageOf(r.genres, r.tags);
    if (age !== undefined) info.ageRating = age;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const r = await this.detail(mangaId);
    const list = Array.isArray(r && r.episodes) ? r.episodes : [];
    const rows = [];
    const seen = new Set();
    for (const e of list) {
      if (!e || e.playId === undefined || (e.lockContentDetails && e.lockContentDetails.lockContent === true)) continue;
      const id = String(e.playId);
      if (seen.has(id)) continue;
      seen.add(id);
      const number = Number(e.episode);
      const row = { id, chapterId: id, name: Number.isFinite(number) ? `Episode ${number}` : `Episode ${clean(e.episode) || id}` };
      if (Number.isFinite(number)) row.number = number;
      rows.push(row);
    }
    if (!rows.length) {
      const locked = list.some((e) => e && e.lockContentDetails && e.lockContentDetails.lockContent === true);
      if (locked) throw new Error('OneTouchTV has these episodes only in its own app');
      if (r && r.status === 'upcoming') throw new Error('OneTouchTV lists this title as upcoming, so it has no episodes yet');
      throw new Error(r && r.type === 'movie' ? 'OneTouchTV lists this movie but has no file for it' : 'OneTouchTV has no episodes for this title yet');
    }
    rows.sort((a, b) => (b.number || 0) - (a.number || 0));
    return rows;
  }

  async getVideos(mangaId, chapterId) {
    const path = `web/vod/${encodeURIComponent(mangaId)}/episode/${encodeURIComponent(chapterId)}`;
    let dead = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      let r;
      try {
        r = await this.api(path, attempt > 0);
      } catch (e) {
        if (/404|not found/i.test(String(e.message))) continue;
        throw e;
      }
      const videos = this.streamsOf(r);
      if (!videos.length) continue;
      const checks = await Promise.all(videos.map((v) => this.playable(v)));
      const alive = videos.filter((v, i) => checks[i]).sort((a, b) => KIND_ORDER[a.type] - KIND_ORDER[b.type]);
      if (alive.length) return alive;
      dead = true;
    }
    if (dead) throw new Error('OneTouchTV: the stream host of this episode does not answer, so it cannot play right now. Try again later.');
    throw new Error('OneTouchTV has no stream for this episode yet (or it is only in its own app). A new episode can take a few hours, try again later.');
  }

  streamsOf(r) {
    const subtitles = [];
    const used = new Set();
    for (const t of Array.isArray(r && r.track) ? r.track : []) {
      const file = clean(t && t.file);
      if (!/^https?:\/\//.test(file) || (t.kind && String(t.kind) !== 'captions' && String(t.kind) !== 'subtitles')) continue;
      const base = clean(t.name) || 'Subtitles';
      let label = base;
      for (let n = 2; used.has(label.toLowerCase()); n++) label = `${base} ${n}`;
      used.add(label.toLowerCase());
      const code = clean(t.code);
      subtitles.push({ url: file, label, language: /^[a-z]{2,3}$/i.test(code) ? code.toLowerCase() : LANGUAGES[base.toLowerCase()] || base, format: 'vtt' });
    }
    const ordered = subtitles.filter((s) => s.language === 'en').concat(subtitles.filter((s) => s.language !== 'en'));
    const videos = [];
    const taken = new Set();
    for (const s of Array.isArray(r && r.sources) ? r.sources : []) {
      if (!s || !/^https?:\/\//.test(String(s.url || '')) || taken.has(s.url)) continue;
      taken.add(s.url);
      const shown = ordered.slice(0, 3).map((t) => t.label);
      const kind = String(s.type || '').toLowerCase();
      const video = {
        url: s.url,
        quality: `Auto, Softsub${shown.length ? `: ${shown.join(', ')}${ordered.length > 3 ? ` and ${ordered.length - 3} more` : ''}` : ''}`,
        type: kind === 'dash' || /\.mpd(\?|$)/i.test(s.url) ? 'dash' : kind === 'mp4' || /\.mp4(\?|$)/i.test(s.url) ? 'mp4' : 'hls',
        server: SERVERS[clean(s.name).toLowerCase()] || (clean(s.name) ? title(s.name) : 'OneTouchTV'),
      };
      if (ordered.length) video.subtitles = ordered;
      videos.push(video);
    }
    return videos;
  }

  async playable(video) {
    const absolute = (ref, base) => {
      if (/^https?:\/\//i.test(ref)) return ref;
      const origin = (/^(https?:\/\/[^/]+)/i.exec(base) || [])[1] || '';
      if (ref.charAt(0) === '/') return origin + ref;
      return base.replace(/[?#].*$/, '').replace(/[^/]*$/, '') + ref;
    };
    const bytes = async (target) => {
      const seg = await this.requests.schedule(App.createRequest({ url: target, method: 'GET', headers: { 'User-Agent': UA, Range: 'bytes=0-1023', Accept: '*/*' } }));
      return seg.status >= 200 && seg.status < 400;
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (video.type === 'mp4') return await bytes(video.url);
        let target = video.url;
        for (let depth = 0; depth < 3; depth++) {
          const res = await this.requests.schedule(App.createRequest({ url: target, method: 'GET', headers: { 'User-Agent': UA, Accept: '*/*' } }));
          if (res.status < 200 || res.status >= 300) return false;
          const text = String(res.data || '');
          if (video.type === 'dash') {
            if (text.indexOf('<MPD') < 0) return false;
            const init = /initialization="([^"]+)"/.exec(text);
            if (!init) return true;
            const rep = /<Representation[^>]*\bid="([^"]+)"/.exec(text);
            return await bytes(absolute(init[1].split('&amp;').join('&').split('$RepresentationID$').join(rep ? rep[1] : '0'), target));
          }
          if (text.indexOf('#EXTM3U') < 0) return false;
          const line = text.split('\n').map((l) => l.trim()).find((l) => l && l.charAt(0) !== '#');
          if (!line) return false;
          const next = absolute(line, target);
          if (text.indexOf('#EXT-X-STREAM-INF') >= 0) {
            target = next;
            continue;
          }
          return await bytes(next);
        }
        return false;
      } catch (e) {
      }
    }
    return false;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }
}

module.exports = { Source };
