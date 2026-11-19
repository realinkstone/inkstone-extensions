const SITE = 'https://k-drama.in';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const PLAYER = 'https://vidly.pro';
const SEAL_KEY = 'vY7#qL2!mZ9@wK4$';
const ORIGINAL_AUDIO = ['original', 'korean', 'chinese', 'mandarin', 'cantonese', 'japanese', 'thai'];
const SERVER_LIMIT_MS = 12000;

const FEEDS = [
  { id: 'kdrama', name: 'K-Dramas', type: 'kdrama', sort: 'popular' },
  { id: 'kdrama-new', name: 'New K-Dramas', type: 'kdrama', sort: 'newest' },
  { id: 'cdrama', name: 'C-Dramas', type: 'cdrama', sort: 'popular' },
  { id: 'jdrama', name: 'J-Dramas', type: 'jdrama', sort: 'popular' },
  { id: 'thai', name: 'Thai Dramas', type: 'thai', sort: 'popular' },
  { id: 'movies', name: 'Movies', type: 'movie', sort: 'popular' },
];

const GENRES = [
  ['10749', 'Romance'], ['35', 'Comedy'], ['10759', 'Action & Adventure'], ['9648', 'Mystery'], ['18', 'Drama'], ['14', 'Fantasy'], ['80', 'Crime'],
];

const ASIAN = ['ko', 'zh', 'cn', 'ja', 'th', 'tl', 'vi', 'id'];

const LANGUAGES = {
  english: 'en', arabic: 'ar', chinese: 'zh', danish: 'da', dutch: 'nl', finnish: 'fi', 'français': 'fr', french: 'fr', german: 'de', hindi: 'hi', indonesia: 'id', indonesian: 'id',
  italian: 'it', japanese: 'ja', khmer: 'km', korean: 'ko', malay: 'ms', polish: 'pl', 'português': 'pt', portuguese: 'pt', russian: 'ru', 'español': 'es', spanish: 'es', thai: 'th',
  turkish: 'tr', vietnamese: 'vi', 'ไทย': 'th', 'tiếng việt': 'vi',
  'اَلْعَرَبِيَّةُ': 'ar', 'বাংলা': 'bn', filipino: 'fil', tagalog: 'fil', 'هَرْشٜن هَوْس': 'ha', 'ਪੰਜਾਬੀ': 'pa', 'русский': 'ru', kiswahili: 'sw', swahili: 'sw', 'اُردُو': 'ur', '中文': 'zh',
  'हिन्दी': 'hi', 'українська': 'uk', deutsch: 'de', italiano: 'it', 'ภาษาไทย': 'th', hebrew: 'he', czech: 'cs', greek: 'el', hungarian: 'hu', norwegian: 'no', romanian: 'ro', swedish: 'sv',
};

function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function parseId(mangaId) {
  const m = /^(tv|movie)~(\d+)$/.exec(String(mangaId || ''));
  if (!m) throw new Error('Kat Drama: unknown title id ' + mangaId);
  return { kind: m[1], tmdb: m[2] };
}

function thumb(url) {
  return String(url || '').replace('/t/p/w500/', '/t/p/w342/');
}

function languageCode(name) {
  return LANGUAGES[clean(name).toLowerCase()] || clean(name);
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function within(ms, promise) {
  return new Promise((resolve, reject) => {
    let done = false;
    setTimeout(() => {
      if (!done) {
        done = true;
        reject(new Error('timed out'));
      }
    }, ms);
    promise.then(
      (value) => {
        if (!done) {
          done = true;
          resolve(value);
        }
      },
      (error) => {
        if (!done) {
          done = true;
          reject(error);
        }
      }
    );
  });
}

function base64urlBytes(text) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const bytes = [];
  let bits = 0;
  let acc = 0;
  for (let i = 0; i < text.length; i++) {
    let v = alphabet.indexOf(text.charAt(i));
    if (v < 0) {
      const c = text.charAt(i);
      if (c === '+') v = 62;
      else if (c === '/') v = 63;
      else continue;
    }
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acc >> bits) & 255);
      acc &= (1 << bits) - 1;
    }
  }
  return bytes;
}

function utf8Text(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i++];
    let cp;
    if (b < 128) cp = b;
    else if (b < 224) cp = ((b & 31) << 6) | (bytes[i++] & 63);
    else if (b < 240) {
      cp = ((b & 15) << 12) | ((bytes[i] & 63) << 6) | (bytes[i + 1] & 63);
      i += 2;
    } else {
      cp = ((b & 7) << 18) | ((bytes[i] & 63) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63);
      i += 3;
    }
    if (cp > 0xffff) {
      cp -= 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 1023));
    } else out += String.fromCharCode(cp);
  }
  return out;
}

function unseal(sealed) {
  if (String(sealed).indexOf('v1.') !== 0) throw new Error('Kat Drama: the stream list is not in the format this source knows');
  const all = base64urlBytes(String(sealed).slice(3));
  const nonce = all.slice(0, 12);
  const body = all.slice(12);
  const seeds = [];
  for (let n = 0; n < 4; n++) {
    let h = (0x811c9dc5 ^ Math.imul(0x9e3779b9, n)) >>> 0;
    for (let i = 0; i < SEAL_KEY.length; i++) h = Math.imul(h ^ SEAL_KEY.charCodeAt(i), 0x1000193) >>> 0;
    for (let i = 0; i < nonce.length; i++) h = Math.imul(h ^ nonce[i], 0x1000193) >>> 0;
    seeds.push(h);
  }
  let a = seeds[0];
  let b = seeds[1];
  let c = seeds[2];
  let d = seeds[3];
  let word = 0;
  for (let t = 0; t < body.length; t++) {
    if ((t & 3) === 0) {
      c >>>= 0;
      d >>>= 0;
      a >>>= 0;
      b >>>= 0;
      let x = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (((c << 21) | (c >>> 11)) + (x = (x + (d = (d + 1) | 0)) | 0)) | 0;
      word = x >>> 0;
    }
    body[t] ^= (word >>> ((t & 3) * 8)) & 255;
  }
  return JSON.parse(utf8Text(body));
}

function flightOf(html) {
  const pieces = [];
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      pieces.push(JSON.parse('"' + m[1] + '"'));
    } catch (e) {
    }
  }
  return pieces.join('');
}

function sealedOf(all) {
  const inline = /"sealed":"(v1\.[A-Za-z0-9_+\/=-]+)"/.exec(all);
  if (inline) return inline[1];
  const ref = /"sealed":"\$([0-9a-f]+)"/.exec(all);
  if (!ref) return null;
  const chunk = new RegExp('(?:^|\\n)' + ref[1] + ':T([0-9a-f]+),').exec(all);
  if (!chunk) return null;
  return all.substr(chunk.index + chunk[0].length, parseInt(chunk[1], 16));
}

function tokenOf(all) {
  const m = /"token":"([^"]+)"/.exec(all);
  return m ? m[1] : '';
}

function playable(list) {
  return Array.isArray(list) ? list.filter((s) => s && /^https?:\/\//.test(String(s.url || ''))) : [];
}

function audioRank(st) {
  const l = clean(st.language).toLowerCase();
  if (!l || ORIGINAL_AUDIO.indexOf(l) >= 0) return 0;
  if (l === 'english') return 1;
  return / sub$/.test(l) ? 3 : 2;
}

function heightOf(st) {
  return parseInt(String(st.quality || '').replace(/\D/g, ''), 10) || 0;
}

function subtitleFormat(url) {
  const m = /\.(srt|vtt)(?:[?#]|$)/i.exec(String(url || ''));
  return m ? m[1].toLowerCase() : undefined;
}

function videoOf(st, server) {
  const lang = clean(st.language);
  const parts = [];
  if (lang) {
    const hard = /^(.*?)\s+sub$/i.exec(lang);
    if (hard) parts.push(`Original audio, Hardsub ${hard[1]}`);
    else if (/^original$/i.test(lang)) parts.push('Original audio');
    else if (ORIGINAL_AUDIO.indexOf(lang.toLowerCase()) >= 0) parts.push(`${lang} audio`);
    else if (/^english$/i.test(lang)) parts.push('English audio');
    else parts.push(`${lang} audio Dub`);
  }
  const quality = clean(st.quality);
  if (quality) parts.push(quality);
  const subs = [];
  const used = new Set();
  (Array.isArray(st.subtitles) ? st.subtitles : []).forEach((t) => {
    if (!t || !/^https?:\/\//.test(String(t.url || ''))) return;
    const base = clean(t.label || t.lang) || 'Subtitles';
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} ${n}`;
    used.add(name.toLowerCase());
    const code = clean(t.lang);
    const entry = { url: t.url, label: name, language: /^[a-z]{2,3}$/.test(code) ? (code === 'iw' ? 'he' : code) : languageCode(base) };
    const format = subtitleFormat(t.url);
    if (format) entry.format = format;
    subs.push(entry);
  });
  const ordered = subs.filter((t) => t.language === 'en').concat(subs.filter((t) => t.language !== 'en'));
  if (ordered.length) {
    const english = ordered.some((t) => t.language === 'en');
    parts.push(ordered.length <= 3 ? 'Softsub: ' + ordered.map((t) => t.label).join(', ') : english ? `Softsub: English and ${ordered.length - 1} more` : `Softsub: ${ordered.length} languages`);
  }
  const video = { url: st.url, quality: parts.join(', ') || 'Auto', type: 'hls', server, headers: { Referer: `${PLAYER}/`, Origin: PLAYER } };
  if (ordered.length) video.subtitles = ordered;
  return video;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map((g) => ({ id: g[0], label: g[1] }));
  }

  async getSearchResults(request, metadata) {
    const query = clean(request && request.title);
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    const page = (metadata && metadata.page) || 1;

    if (query) {
      const data = JSON.parse(await this.text(`${SITE}/api.php?action=search&q=${encodeURIComponent(query)}`, 'application/json'));
      const results = [];
      const seen = new Set();
      for (const r of Array.isArray(data && data.results) ? data.results : []) {
        if (!r || (r.media_type !== 'tv' && r.media_type !== 'movie') || !r.id) continue;
        const title = clean(r.name || r.title);
        const mangaId = `${r.media_type}~${r.id}`;
        if (!title || seen.has(mangaId)) continue;
        seen.add(mangaId);
        const card = { mangaId, title, image: r.poster_path ? `https://image.tmdb.org/t/p/w342${r.poster_path}` : '', medium: 'anime' };
        const year = String(r.first_air_date || r.release_date || '').slice(0, 4);
        if (year) card.summary = year;
        if (r.adult === true || r.softcore === true) card.ageRating = 18;
        card.asian = ASIAN.indexOf(String(r.original_language)) >= 0;
        results.push(card);
      }
      const ordered = results.filter((c) => c.asian).concat(results.filter((c) => !c.asian));
      ordered.forEach((c) => delete c.asian);
      return { results: ordered };
    }

    let url = `${SITE}/explore?type=${feed.type}&sort=${feed.sort}&page=${page}`;
    const genre = included.length && included[0] && included[0].id ? String(included[0].id) : '';
    if (genre) url += `&genre=${encodeURIComponent(genre)}`;
    const $ = cheerio.load(await this.text(url));
    const results = [];
    const seen = new Set();
    $('.cineapse-movie-card, a[href^="/detail/"]').each((i, el) => {
      const card = $(el);
      const m = /\/detail\/(tv|movie)\/(?:[a-z0-9-]*?-)?(\d+)/i.exec(card.attr('href') || card.attr('onclick') || '');
      if (!m) return;
      const mangaId = `${m[1].toLowerCase()}~${m[2]}`;
      const img = card.find('img').first();
      const title = clean(img.attr('alt'));
      if (!title || seen.has(mangaId)) return;
      seen.add(mangaId);
      const out = { mangaId, title, image: thumb(img.attr('src')), medium: 'anime' };
      const year = (/\b(19|20)\d{2}\b/.exec(card.text()) || [])[0];
      if (year) out.summary = year;
      results.push(out);
    });
    const pages = (/Page\s+(\d+)\s+of\s+(\d+)/i.exec($('body').text()) || []).slice(1).map(Number);
    return { results, metadata: pages.length === 2 && pages[0] < pages[1] ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const { kind, tmdb } = parseId(mangaId);
    const $ = cheerio.load(await this.text(`${SITE}/detail/${kind}/${tmdb}`));
    const h1 = $('h1').first();
    const title = clean(h1.text());
    if (!title) throw new Error('Kat Drama: title not found');
    const block = h1.parent();
    const chips = block.find('span').map((i, e) => clean($(e).text())).get().filter(Boolean);
    const year = chips.find((c) => /^(19|20)\d{2}$/.test(c));
    const genres = chips.filter((c) => !/^(Drama Series|Movie|TV Series)$/i.test(c) && !/^(19|20)\d{2}$/.test(c) && !/^\d+(\.\d+)?$/.test(c) && c.length < 28);
    const text = clean($('body').text());
    const info = {
      title,
      image: clean($('meta[property="og:image"]').attr('content')),
      desc: clean(h1.nextAll('p').first().text()) || undefined,
      author: year || undefined,
      status: /Completed Series/i.test(text) ? 'COMPLETED' : /\b(Ongoing|Currently Airing)\b/i.test(text) ? 'ONGOING' : 'UNKNOWN',
      tags: genres,
      webURL: `${SITE}/detail/${kind}/${tmdb}`,
      medium: 'anime',
    };
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const { kind, tmdb } = parseId(mangaId);
    if (kind === 'movie') return [{ id: '1:1', chapterId: '1:1', name: 'Full movie', number: 1 }];
    const first = cheerio.load(await this.text(`${SITE}/detail/tv/${tmdb}`));
    const seasons = [];
    first('a[href*="?season="]').each((i, e) => {
      const n = Number((/season=(\d+)/.exec(first(e).attr('href') || '') || [])[1]);
      if (Number.isFinite(n) && n >= 0 && seasons.indexOf(n) < 0) seasons.push(n);
    });
    if (!seasons.length) seasons.push(1);
    const rows = [];
    for (const season of seasons) {
      const $ = season === 1 && seasons.length === 1 ? first : cheerio.load(await this.text(`${SITE}/detail/tv/${tmdb}?season=${season}`));
      const seen = new Set();
      $('a[href*="download=1"]').each((i, a) => {
        const n = (/-episode-(\d+(?:\.\d+)?)/.exec($(a).attr('href') || '') || [])[1];
        if (n === undefined || seen.has(n)) return;
        seen.add(n);
        const card = $(a).closest('.ep-card');
        let m;
        if (card.length && card.find('.ep-card__date').length) {
          m = [null, null, clean(card.find('.ep-card__title').first().text()), clean(card.find('.ep-card__date').first().text())];
        } else {
          let row = $(a).parent();
          for (let up = 0; up < 3 && !/^EP\s*\d/i.test(clean(row.text())); up++) row = row.parent();
          const text = clean(row.text()).replace(/\s*Download\s*$/i, '');
          m = /^EP\s*(\d+(?:\.\d+)?)\s+(.*?)\s*(\d{4}-\d{2}-\d{2})?$/i.exec(text) || [];
        }
        const number = Number(n);
        const title = clean(m[2]);
        const row2 = { id: `${season}:${n}`, chapterId: `${season}:${n}`, name: title && !/^Episode\s+\d+$/i.test(title) ? `Episode ${number}: ${title}` : `Episode ${number}`, number, season };
        if (title && !/^Episode\s+\d+$/i.test(title)) row2.title = title;
        const t = Date.parse(m[3] || '');
        if (Number.isFinite(t)) row2.time = t;
        if (Number.isFinite(t) && t > Date.now() + 36 * 3600 * 1000) return;
        rows.push(row2);
      });
    }
    if (!rows.length) throw new Error('Kat Drama has no episodes for this title yet');
    rows.sort((a, b) => b.season - a.season || b.number - a.number);
    const many = new Set(rows.map((r) => r.season)).size > 1;
    return rows.map((r) => {
      const out = { id: r.id, chapterId: r.chapterId, name: r.name, number: r.number };
      if (r.title) out.title = r.title;
      if (r.time !== undefined) out.time = r.time;
      if (many) {
        out.season = String(r.season);
        out.seasonName = `Season ${r.season}`;
      }
      return out;
    });
  }

  async getVideos(mangaId, chapterId) {
    const { kind, tmdb } = parseId(mangaId);
    const m = /^(\d+):(\d+(?:\.\d+)?)$/.exec(String(chapterId));
    if (!m) throw new Error('Kat Drama: unknown episode id ' + chapterId);
    const path = kind === 'movie' ? `/movie/${tmdb}` : `/tv/${tmdb}/${m[1]}/${m[2]}`;

    let payload = null;
    let token = '';
    let failure = null;
    const fresh = Date.now().toString(36);
    for (let attempt = 0; attempt < 3; attempt++) {
      let page;
      try {
        page = await this.playerText(`${PLAYER}${path}${attempt ? `?r=${fresh}${attempt}` : ''}`);
      } catch (e) {
        if (e && e.kind === 'challenge') throw e;
        failure = e;
        if (/HTTP 404/.test(String(e && e.message))) break;
        continue;
      }
      const flight = flightOf(page);
      const sealed = sealedOf(flight);
      let found = null;
      if (sealed) {
        try {
          found = unseal(sealed);
        } catch (e) {
          found = null;
        }
      }
      if (found) {
        payload = found;
        token = tokenOf(flight);
        if (Array.isArray(found.streams) && found.streams.length) break;
      }
    }
    if (!payload) {
      if (failure && !/HTTP 404/.test(String(failure.message))) throw failure;
      throw new Error('Kat Drama has no stream for this episode yet. A new episode can take a few hours, try again later.');
    }

    const label = (id, name) => clean(name) || (id ? String(id).charAt(0).toUpperCase() + String(id).slice(1) : 'Kat Drama');
    const defaultId = payload.provider && payload.provider.id;
    const videos = playable(payload.streams).map((st, i) => ({ st, i, server: label(defaultId, payload.provider && payload.provider.label) }));
    const others = (Array.isArray(payload.servers) ? payload.servers : []).filter((x) => x && x.id && x.id !== defaultId);
    const answers = token
      ? await Promise.all(others.map((x) => within(SERVER_LIMIT_MS, this.otherServer(kind, tmdb, x.id, token, m[1], m[2])).then((list) => ({ x, list }), (error) => ({ x, error }))))
      : [];
    const groups = [{ list: videos }];
    answers.forEach((a) => {
      if (a.list && a.list.length) groups.push({ list: a.list.map((st, i) => ({ st, i, server: label(a.x.id, a.x.label) })) });
    });
    const out = [];
    groups.forEach((g) => {
      g.list.sort((x, y) => audioRank(x.st) - audioRank(y.st) || heightOf(y.st) - heightOf(x.st) || x.i - y.i);
      g.list.forEach((e) => out.push(videoOf(e.st, e.server)));
    });
    if (!out.length) {
      const challenged = answers.find((a) => a.error && a.error.kind === 'challenge');
      if (challenged) throw challenged.error;
      throw new Error('Kat Drama has no stream for this episode yet. A new episode can take a few hours, try again later.');
    }
    return out;
  }

  async otherServer(kind, tmdb, provider, token, season, episode) {
    let url = `${PLAYER}/api/sources?kind=${kind}&provider=${encodeURIComponent(provider)}&t=${encodeURIComponent(token)}&tmdb=${tmdb}`;
    if (kind === 'tv') url += `&s=${season}&e=${episode}`;
    const body = unseal((await this.playerText(url, 'text/plain,*/*')).trim());
    return playable(body && body.streams);
  }

  async playerText(url, accept) {
    let response = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const target = attempt ? `${url}${url.indexOf('?') >= 0 ? '&' : '?'}r=${attempt}` : url;
      let last = null;
      for (let again = 0; again < 2; again++) {
        try {
          response = await this.requests.schedule(App.createRequest({ url: target, method: 'GET', headers: { 'User-Agent': UA, Accept: accept || 'text/html,application/xhtml+xml' } }));
          last = null;
          break;
        } catch (e) {
          if (e && e.kind === 'challenge') throw e;
          last = e;
        }
      }
      if (last) throw last;
      if (response.status !== 429 && (response.status < 502 || response.status > 504)) break;
      if (attempt < 2) await pause(700 * (attempt + 1));
    }
    if (response.status === 404) throw new Error('Kat Drama: not found (HTTP 404)');
    if (response.status < 200 || response.status >= 300) throw new Error(`Kat Drama: HTTP ${response.status}`);
    return String(response.data || '');
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async text(url, accept) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { 'User-Agent': UA, Accept: accept || 'text/html,application/xhtml+xml' } }));
    if (response.status === 404) throw new Error('Kat Drama: not found (HTTP 404)');
    if (response.status < 200 || response.status >= 300) throw new Error(`Kat Drama: HTTP ${response.status}`);
    return String(response.data || '');
  }
}

module.exports = { Source };
