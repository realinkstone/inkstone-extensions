const SITE = 'https://dramahood.mom';
const API = 'https://new.vidnest.fun';
const SECURE_KEY = 'K3p8vQ2mX9rL5wZ0fN7bG1sH4tJ6dC9_y8S3wM1nQ5pL2';
const VIDRIFT = 'https://vidrift-cf.money-1.workers.dev';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const EMBEDS = [
  { name: 'Vidmoly', test: /(^|\.)vidmoly\.(org|biz|net|to|me)$/i },
  { name: 'Streamtape', test: /(^|\.)(streamtape\.(com|to|net|xyz)|streamta\.pe)$/i },
  { name: 'MixDrop', test: /(^|\.)(mixdrop\.[a-z]+|mxdrop\.[a-z]+)$/i },
];

const FEEDS = [
  { id: 'latest', name: 'Latest', path: '/series/' },
  { id: 'south-korea', name: 'South Korea', path: '/country/south-korea/' },
  { id: 'china', name: 'China', path: '/country/china/' },
  { id: 'thailand', name: 'Thailand', path: '/country/thailand/' },
  { id: 'japan', name: 'Japan', path: '/country/japan/' },
  { id: 'hong-kong', name: 'Hong Kong', path: '/country/hong-kong/' },
];

const LANGUAGES = {
  en: 'English', zh: 'Chinese', ko: 'Korean', ja: 'Japanese', th: 'Thai', vi: 'Vietnamese', id: 'Indonesian', ms: 'Malay', es: 'Spanish',
  pt: 'Portuguese', fr: 'French', de: 'German', it: 'Italian', ru: 'Russian', ar: 'Arabic', tr: 'Turkish', hi: 'Hindi', pl: 'Polish',
  nl: 'Dutch', sv: 'Swedish', da: 'Danish', fi: 'Finnish', no: 'Norwegian', cs: 'Czech', sk: 'Slovak', hu: 'Hungarian', ro: 'Romanian',
  el: 'Greek', he: 'Hebrew', uk: 'Ukrainian', bg: 'Bulgarian', hr: 'Croatian', fil: 'Filipino', ta: 'Tamil', te: 'Telugu',
};

const LANGUAGE_ALIASES = {
  eng: 'en', english: 'en', chi: 'zh', zho: 'zh', chinese: 'zh', kor: 'ko', korean: 'ko', jpn: 'ja', japanese: 'ja', tha: 'th', thai: 'th',
  vie: 'vi', vietnamese: 'vi', ind: 'id', indonesian: 'id', may: 'ms', msa: 'ms', malay: 'ms', spa: 'es', spanish: 'es', por: 'pt', portuguese: 'pt',
  fre: 'fr', fra: 'fr', french: 'fr', ger: 'de', deu: 'de', german: 'de', ita: 'it', italian: 'it', rus: 'ru', russian: 'ru', ara: 'ar', arabic: 'ar',
  tur: 'tr', turkish: 'tr', hin: 'hi', hindi: 'hi', pol: 'pl', polish: 'pl', dut: 'nl', nld: 'nl', dutch: 'nl', swe: 'sv', swedish: 'sv', dan: 'da',
  danish: 'da', fin: 'fi', finnish: 'fi', nor: 'no', nob: 'no', norwegian: 'no', cze: 'cs', ces: 'cs', czech: 'cs', slo: 'sk', slk: 'sk', slovak: 'sk',
  hun: 'hu', hungarian: 'hu', rum: 'ro', ron: 'ro', romanian: 'ro', gre: 'el', ell: 'el', greek: 'el', heb: 'he', hebrew: 'he', ukr: 'uk', ukrainian: 'uk',
  bul: 'bg', bulgarian: 'bg', hrv: 'hr', croatian: 'hr', fil: 'fil', filipino: 'fil', tam: 'ta', tamil: 'ta', tel: 'te', telugu: 'te',
};

function cleanText(text) {
  return String(text || '')
    .replace(/­/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(text) {
  return String(text || '')
    .replace(/&#0*(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function stripTags(html) {
  return cleanText(decodeEntities(String(html || '').replace(/<[^>]*>/g, ' ')));
}

function absolute(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  return SITE + (u.charAt(0) === '/' ? '' : '/') + u;
}

function slugOf(href) {
  const path = String(href || '').replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
  const parts = path.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

function detailUrlOf(mangaId) {
  return `${SITE}/series/${encodeURIComponent(mangaId)}/`;
}

function episodeUrlOf(chapterId) {
  return `${SITE}/${encodeURIComponent(chapterId)}/`;
}

function mapStatus(text) {
  const s = String(text || '').toLowerCase();
  if (s.indexOf('ongoing') !== -1) return 'ONGOING';
  if (s.indexOf('complet') !== -1) return 'COMPLETED';
  return 'UNKNOWN';
}

function coverOf(img) {
  if (!img || img.length === 0) return '';
  const url = img.attr('data-original') || img.attr('data-src') || img.attr('src') || '';
  return /^data:/.test(url) ? '' : absolute(url);
}

function parseCards($) {
  const results = [];
  const seen = new Set();
  $('ul.list-episode-item li').each((_, el) => {
    const card = $(el);
    const link = card.find('a.img').first();
    const href = link.attr('href') || '';
    if (!/\/series\/[^/]+/.test(href)) return;
    const mangaId = slugOf(href);
    if (!mangaId || seen.has(mangaId)) return;
    const title = cleanText(card.find('h3.title').first().text()) || cleanText(link.attr('title'));
    if (!title) return;
    seen.add(mangaId);
    results.push({ mangaId, title, image: coverOf(card.find('img').first()), medium: 'anime', webURL: detailUrlOf(mangaId) });
  });
  return results;
}

function hasNext($, useRelNext) {
  return useRelNext ? $('link[rel="next"]').length > 0 : $('.pagination a.next').length > 0;
}

const SUGGESTIVE = /\b(sex\w*|steamy|naked|nude|erotic\w*|seduc\w*|one-night stand|vanilla|lust\w*|affair|intimate lessons)\b/i;

function ratingOf(genres, text) {
  if ((genres || []).some((g) => /^mature$/i.test(String(g)))) return 18;
  return SUGGESTIVE.test(String(text || '')) ? 16 : 0;
}

function randomNonce() {
  const words = [];
  for (let i = 0; i < 4; i++) words.push(Math.floor(Math.random() * 4294967296) | 0);
  return CryptoJS.enc.Base64.stringify(CryptoJS.lib.WordArray.create(words, 16))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function openEnvelope(envelope) {
  if (!envelope || envelope.v !== 2 || !envelope.d) return envelope;
  const key = CryptoJS.SHA256(String(envelope.n) + '|' + SECURE_KEY);
  let b64 = String(envelope.d).replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const raw = CryptoJS.enc.Base64.parse(b64);
  const bodyBytes = raw.sigBytes - 28;
  if (bodyBytes <= 0) throw new Error('the player answer is too short');
  const iv = CryptoJS.lib.WordArray.create(raw.words.slice(0, 3).concat([2]), 16);
  const body = CryptoJS.lib.WordArray.create(raw.words.slice(3, 3 + Math.ceil(bodyBytes / 4)), bodyBytes);
  const plain = CryptoJS.AES.decrypt({ ciphertext: body }, key, { iv, mode: CryptoJS.mode.CTR, padding: CryptoJS.pad.NoPadding });
  return JSON.parse(plain.toString(CryptoJS.enc.Utf8));
}

function languageCode(label) {
  const s = String(label || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim();
  return LANGUAGE_ALIASES[s] || (LANGUAGES[s] ? s : '');
}

function buildSubtitles(list, toAddress) {
  const tracks = [];
  const used = new Map();
  (Array.isArray(list) ? list : []).forEach((s) => {
    if (!s || !s.url || /forced/i.test(String(s.lang))) return;
    const code = languageCode(s.lang);
    const name = LANGUAGES[code] || cleanText(String(s.lang).replace(/\(.*?\)/g, '')) || 'Subtitles';
    const sdh = /sdh/i.test(String(s.lang));
    const seen = (used.get(code || name) || 0) + 1;
    used.set(code || name, seen);
    let label = name;
    if (sdh) label += ' (SDH)';
    else if (seen > 1) label += ' ' + seen;
    tracks.push({ url: toAddress(s.url), label, language: code || name.toLowerCase().slice(0, 2), isEnglish: code === 'en' });
  });
  const english = tracks.filter((t) => t.isEnglish);
  const rest = tracks.filter((t) => !t.isEnglish);
  return english.concat(rest).map((t) => ({ url: t.url, label: t.label, language: t.language }));
}

function softLabel(subtitles) {
  const names = [];
  subtitles.forEach((t) => {
    if (names.indexOf(t.label) === -1) names.push(t.label);
  });
  if (!names.length) return '';
  return names.length <= 3 ? ', Softsub: ' + names.join(', ') : `, Softsub: ${names[0]} and ${names.length - 1} more`;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.pages = new Map();
    this.index = null;
    this.genreTags = null;
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    try {
      if (!this.genreTags) {
        const genres = await this.requestJSON(`${SITE}/wp-json/wp/v2/genres?per_page=100&_fields=name,slug,count`);
        this.genreTags = (Array.isArray(genres) ? genres : [])
          .filter((g) => g && g.slug && g.name && g.count > 0)
          .map((g) => ({ id: String(g.slug), label: cleanText(decodeEntities(g.name)) }));
      }
      return this.genreTags;
    } catch (e) {
      console.error('Dramahood getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async ratingIndex() {
    if (this.index) return this.index;
    const index = new Map();
    const titles = new Map();
    try {
      const genres = await this.requestJSON(`${SITE}/wp-json/wp/v2/genres?per_page=100&_fields=id,name`);
      const names = new Map();
      (Array.isArray(genres) ? genres : []).forEach((g) => names.set(g.id, decodeEntities(g.name)));
      for (let page = 1; page <= 10; page++) {
        const rows = await this.requestJSON(`${SITE}/wp-json/wp/v2/series?per_page=100&page=${page}&_fields=slug,title,content,genres`);
        if (!Array.isArray(rows) || !rows.length) break;
        rows.forEach((row) => {
          if (!row || !row.slug) return;
          const text = stripTags(row.content && row.content.rendered);
          index.set(row.slug, ratingOf((row.genres || []).map((id) => names.get(id)), text));
          titles.set(row.slug, decodeEntities(row.title && row.title.rendered));
        });
        if (rows.length < 100) break;
      }
      const group = new Map();
      titles.forEach((title, slug) => {
        const key = title.toLowerCase().replace(/\(\s*(?:19|20)\d\d\s*\)/g, ' ').replace(/[^a-z0-9]+/g, '');
        if (!key) return;
        group.set(key, Math.max(group.get(key) || 0, index.get(slug) || 0));
      });
      titles.forEach((title, slug) => {
        const key = title.toLowerCase().replace(/\(\s*(?:19|20)\d\d\s*\)/g, ' ').replace(/[^a-z0-9]+/g, '');
        if (key && group.has(key)) index.set(slug, group.get(key));
      });
    } catch (e) {
      if (e && e.kind === 'challenge') throw e;
      console.error('Dramahood could not read the rating index: ' + (e && e.message));
    }
    if (index.size) this.index = index;
    return index;
  }

  async rate(results) {
    const index = await this.ratingIndex();
    for (const r of results) {
      let rating = index.get(r.mangaId);
      if (rating === undefined) {
        try {
          rating = (await this.getMangaDetails(r.mangaId)).mangaInfo.ageRating;
        } catch (e) {
          if (e && e.kind === 'challenge') throw e;
          rating = 16;
        }
        if (this.index && typeof rating === 'number') this.index.set(r.mangaId, rating);
      }
      r.ageRating = rating;
    }
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const tags = ((request && request.includedTags) || []).filter((t) => t && t.id);
    const feedId = (request && request.feed) || FEEDS[0].id;
    const page = (metadata && metadata.page) || 1;

    let url;
    let useRelNext = false;
    if (query) {
      url = page > 1 ? `${SITE}/page/${page}/?s=${encodeURIComponent(query)}&type=movies` : `${SITE}/?s=${encodeURIComponent(query)}&type=movies`;
    } else if (tags.length) {
      url = `${SITE}/genres/${encodeURIComponent(tags[0].id)}/${page > 1 ? `page/${page}/` : ''}`;
    } else {
      const feed = FEEDS.find((f) => f.id === feedId) || FEEDS[0];
      useRelNext = feed.path === '/series/';
      url = `${SITE}${feed.path}${page > 1 ? `page/${page}/` : ''}`;
    }

    let html;
    try {
      html = await this.requestHTML(url);
    } catch (e) {
      if (page > 1 && !(e && e.kind === 'challenge')) return { results: [], metadata: undefined };
      throw e;
    }
    const $ = cheerio.load(html);
    const results = parseCards($);
    await this.rate(results);
    return { results, metadata: results.length > 0 && hasNext($, useRelNext) ? { page: page + 1 } : undefined };
  }

  async seriesPage(mangaId) {
    const key = String(mangaId);
    const cached = this.pages.get(key);
    if (cached && Date.now() - cached.at < 180000) return cached.promise;
    const promise = this.requestHTML(detailUrlOf(mangaId));
    this.pages.set(key, { at: Date.now(), promise });
    promise.catch(() => {
      if (this.pages.get(key) && this.pages.get(key).promise === promise) this.pages.delete(key);
    });
    return promise;
  }

  async getMangaDetails(mangaId) {
    const url = detailUrlOf(mangaId);
    const $ = cheerio.load(await this.seriesPage(mangaId));
    const info = $('.details .info').first();
    const title = cleanText(info.find('h1').first().text());
    if (!title) throw new Error('Dramahood has no series called ' + mangaId);
    const image = coverOf($('.details .img img').first()) || absolute($('meta[property="og:image"]').attr('content'));

    const field = (label) => {
      let found = null;
      info.find('p').each((_, p) => {
        const node = $(p);
        const name = cleanText(node.find('span').first().text()).replace(/:$/, '');
        if (name.toLowerCase() === label.toLowerCase()) {
          found = node;
          return false;
        }
      });
      return found;
    };
    const textOf = (label) => {
      const node = field(label);
      if (!node) return '';
      const clone = node.clone();
      clone.find('span').first().remove();
      return cleanText(clone.text());
    };

    let desc = '';
    info.find('p').each((_, p) => {
      if (cleanText($(p).find('span').first().text()).toLowerCase() === 'description:') {
        desc = cleanText($(p).next('p').text());
        return false;
      }
    });

    const tags = [];
    const genres = field('Genre');
    if (genres) {
      genres.find('a').each((_, a) => {
        const t = cleanText($(a).text());
        if (t && tags.indexOf(t) === -1) tags.push(t);
      });
    }
    const country = textOf('Country');
    if (country && tags.indexOf(country) === -1) tags.push(country);

    const status = mapStatus(textOf('Status'));
    const result = {
      title,
      image,
      desc,
      status,
      completed: status === 'COMPLETED',
      tags,
      webURL: url,
      medium: 'anime',
      ageRating: ratingOf(tags, desc),
    };
    const other = textOf('Other name');
    if (other) result.altTitles = other.split(/\s*,\s*/).filter(Boolean);
    const network = textOf('Original Network');
    if (network) result.author = network;
    const year = /\((\d{4})\)/.exec(title);
    if (year) result.releaseDate = year[1];

    const cast = [];
    $('.slider-star .item').each((_, el) => {
      const name = cleanText($(el).find('h3.title').first().text());
      if (name && cast.length < 30) cast.push({ name });
    });
    if (cast.length) result.cast = cast;
    return { mangaInfo: result };
  }

  async getChapters(mangaId) {
    const $ = cheerio.load(await this.seriesPage(mangaId));
    const seriesTitle = cleanText($('.details .info h1').first().text());
    const rows = [];
    const seen = new Set();
    $('ul.list-episode-item-2.all-episode li').each((_, el) => {
      const link = $(el).find('a').first();
      const id = slugOf(link.attr('href'));
      if (!id || seen.has(id)) return;
      seen.add(id);
      const full = cleanText($(el).find('h3.title').first().text());
      const number = /episode\s*(\d+(?:\.\d+)?)/i.exec(full) || /episode-(\d+)/i.exec(id);
      let name = full;
      if (seriesTitle && full.toLowerCase().indexOf(seriesTitle.toLowerCase()) === 0) name = cleanText(full.slice(seriesTitle.length));
      const tail = /\b(episode\s*\d.*)$/i.exec(name || full);
      if (tail) name = cleanText(tail[1]);
      const row = { id, chapterId: id, name: name || full || id };
      if (number) row.number = parseFloat(number[1]);
      rows.push(row);
    });
    if (!rows.length) throw new Error('Dramahood lists no episodes for this title yet');
    return rows;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async playerOf(chapterId) {
    const epUrl = episodeUrlOf(chapterId);
    const $ = cheerio.load(await this.requestHTML(epUrl));
    let embed = '';
    $('iframe').each((_, f) => {
      const src = absolute($(f).attr('src') || $(f).attr('data-src') || '');
      if (!embed && src) embed = src;
    });
    if (!embed) throw new Error('Dramahood shows no player for this episode yet');
    const m = /^https?:\/\/(?:www\.)?vidnest\.fun\/tv\/(\d+)\/(\d+)\/(\d+)/i.exec(embed);
    if (m) return { kind: 'vidnest', tmdb: m[1], season: m[2], episode: m[3] };
    if (/^https?:\/\/(?:www\.)?zumivids\.com\/embed\//i.test(embed)) return { kind: 'zumivids', url: embed, referer: epUrl };
    const host = (/^https?:\/\/([^/]+)/i.exec(embed) || [])[1] || 'another site';
    throw new Error('Dramahood plays this episode on ' + host + ', a player this extension does not read');
  }

  async fromZumivids(player) {
    const $ = cheerio.load(await this.requestHTML(player.url, player.referer));
    const servers = [];
    $('.server-item').each((_, el) => {
      const url = absolute($(el).attr('data-video') || '');
      if (url && servers.indexOf(url) === -1) servers.push(url);
    });
    if (!servers.length) throw new Error('Dramahood lists no server for this episode yet');
    const videos = [];
    const embeds = [];
    let vidmolyDone = false;
    for (const url of servers) {
      const host = (/^https?:\/\/([^/]+)/i.exec(url) || [])[1] || '';
      const known = EMBEDS.find((e) => e.test.test(host));
      if (known && known.name === 'Vidmoly' && !vidmolyDone) {
        const video = await this.vidmoly(url, player.url);
        if (video) {
          videos.push(video);
          vidmolyDone = true;
          continue;
        }
      }
      embeds.push({ url, type: 'embed', quality: known ? known.name : host, server: known ? known.name : host });
    }
    return videos.concat(embeds);
  }

  async vidmoly(url, referer) {
    try {
      const html = await this.requestHTML(url.replace(/^http:/, 'https:'), referer);
      const master = (/sources:\s*\[\s*\{\s*file:\s*'([^']+)'/.exec(html) || [])[1];
      if (!master || !/^https?:\/\//.test(master)) return null;
      const subtitles = [];
      const re = /\{\s*file:\s*'([^']+)'\s*,\s*label:\s*'([^']*)'\s*,\s*kind:\s*'captions'/g;
      let m;
      while ((m = re.exec(html))) {
        const label = cleanText(m[2]) || 'Subtitles';
        subtitles.push({ url: absolute(m[1]), label, language: languageCode(label) || label.slice(0, 2).toLowerCase() });
      }
      const video = { url: master, type: 'hls', quality: subtitles.length ? 'Auto' + softLabel(subtitles) : 'Auto Hardsub English', server: 'Vidmoly' };
      if (subtitles.length) video.subtitles = subtitles;
      return video;
    } catch (e) {
      if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
      return null;
    }
  }

  async askVidnest(server, player) {
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      let response;
      try {
        response = await this.requests.schedule(
          App.createRequest({ url: `${API}/${server}/tv/${player.tmdb}/${player.season}/${player.episode}?_n=${randomNonce()}`, method: 'GET', headers: { Accept: 'application/json' } }),
        );
      } catch (e) {
        if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
        last = e;
        continue;
      }
      if (response.status === 200) {
        let envelope;
        try {
          envelope = JSON.parse(response.data);
        } catch (e) {
          last = new Error('vidnest answered a page that is not data');
          continue;
        }
        return openEnvelope(envelope);
      }
      last = new Error('vidnest ' + server + ' HTTP ' + response.status);
      if (response.status < 500) break;
    }
    throw last || new Error('vidnest ' + server + ' did not answer');
  }

  async fromFlixhq(player) {
    const data = await this.askVidnest('flixhq', player);
    if (!data || data.status !== 'success' || !data.url) throw new Error('flixhq has no stream');
    const subtitles = buildSubtitles(data.subtitles, (u) => u);
    return { url: String(data.url), type: /mp4/i.test(String(data.type)) ? 'mp4' : 'hls', quality: String(data.quality || 'Auto'), subtitles, server: 'Beta' };
  }

  async fromOnehd(player) {
    const data = await this.askVidnest('onehd', player);
    const stream = data && Array.isArray(data.streams) ? data.streams.find((s) => s && s.url && /hls/i.test(String(s.type))) : null;
    if (!stream) throw new Error('onehd has no stream');
    const toAddress = (u) => (/^https?:\/\//i.test(String(u)) ? String(u) : VIDRIFT + (String(u).charAt(0) === '/' ? '' : '/') + u);
    const subtitles = buildSubtitles(data.subtitles, toAddress);
    const english = subtitles.find((t) => t.language === 'en');
    if (!english) throw new Error('onehd has no English subtitles');
    const check = await this.requests.schedule(App.createRequest({ url: english.url, method: 'GET', headers: { Accept: '*/*' } }));
    if (check.status !== 200 || String(check.data || '').indexOf('WEBVTT') !== 0) throw new Error('onehd English subtitles do not answer');
    return { url: toAddress(stream.url), type: 'hls', quality: String(stream.quality || 'Auto'), subtitles, server: 'Alfa' };
  }

  async getVideos(mangaId, chapterId) {
    const player = await this.playerOf(chapterId);
    if (player.kind === 'zumivids') {
      const list = await this.fromZumivids(player);
      if (!list.length) throw new Error('Dramahood: no usable server for this episode');
      return list;
    }
    const primary = this.fromFlixhq(player).then((v) => v, (e) => ({ error: e }));
    const secondary = this.fromOnehd(player).then((v) => v, (e) => ({ error: e }));
    const first = await primary;
    let second;
    if (first.error) second = await secondary;
    else {
      let timer = null;
      second = await Promise.race([
        secondary,
        new Promise((resolve) => {
          timer = setTimeout(() => resolve(null), 2500);
        }),
      ]);
      if (timer && typeof clearTimeout === 'function') clearTimeout(timer);
    }
    const answers = [first].concat(second ? [second] : []);
    const errors = [];
    const videos = [];
    answers.forEach((a) => {
      if (a && a.error) {
        errors.push(a.error);
        return;
      }
      const hasEnglish = a.subtitles.some((t) => t.language === 'en');
      const video = { url: a.url, quality: a.quality + softLabel(a.subtitles), type: a.type, server: a.server };
      if (a.subtitles.length) video.subtitles = a.subtitles;
      videos.push({ video, hasEnglish });
    });
    for (const e of errors) if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
    if (!videos.length) {
      throw new Error('Dramahood has no stream for this episode yet (' + errors.map((e) => cleanText(e && e.message)).join('; ') + ')');
    }
    videos.sort((a, b) => Number(b.hasEnglish) - Number(a.hasEnglish));
    return videos.map((x) => x.video);
  }

  async send(request) {
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await this.requests.schedule(App.createRequest(request));
      } catch (e) {
        if (e && e.kind === 'challenge') throw e;
        last = e;
      }
    }
    throw last;
  }

  async requestHTML(url, referer) {
    const headers = { 'User-Agent': UA };
    if (referer) headers.Referer = referer;
    const response = await this.send({ url, method: 'GET', headers });
    if (response.status < 200 || response.status >= 300) throw new Error(`Dramahood HTTP ${response.status}`);
    return String(response.data || '');
  }

  async requestJSON(url) {
    const response = await this.send({ url, method: 'GET', headers: { Accept: 'application/json' } });
    if (response.status < 200 || response.status >= 300) throw new Error(`Dramahood HTTP ${response.status}`);
    try {
      return JSON.parse(response.data);
    } catch (e) {
      throw new Error('Dramahood answered a page that is not data');
    }
  }
}

module.exports = { Source };
