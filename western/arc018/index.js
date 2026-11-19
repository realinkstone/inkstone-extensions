const SITE = 'https://arc018.stream';
const SERVER = 'Vidmoly';

const FEEDS = [
  { id: 'movies', name: 'Movies', path: '/watch-movies-online/' },
  { id: 'series', name: 'TV Series', path: '/watch-series-online/' },
  { id: 'top', name: 'Top IMDb', path: '/top-imdb/' },
];

const GENRE_LABELS = {
  'action': 'Action', 'action-adventure': 'Action & Adventure', 'adventure': 'Adventure', 'animation': 'Animation', 'comedy': 'Comedy', 'crime': 'Crime',
  'documentary': 'Documentary', 'drama': 'Drama', 'family': 'Family', 'fantasy': 'Fantasy', 'history': 'History', 'horror': 'Horror', 'kids': 'Kids', 'music': 'Music',
  'mystery': 'Mystery', 'news': 'News', 'reality-show': 'Reality Show', 'romance': 'Romance', 'sci-fi': 'Sci-Fi', 'sci-fi-fantasy': 'Sci-Fi & Fantasy', 'soap': 'Soap',
  'talk-show': 'Talk Show', 'thriller': 'Thriller', 'tv-movie': 'TV Movie', 'war': 'War', 'war-politics': 'War & Politics', 'western': 'Western',
};

const LANGUAGE_CODES = {
  english: 'en', spanish: 'es', french: 'fr', german: 'de', italian: 'it', portuguese: 'pt', 'brazilian portuguese': 'pt', dutch: 'nl', danish: 'da', finnish: 'fi',
  norwegian: 'no', swedish: 'sv', polish: 'pl', russian: 'ru', turkish: 'tr', arabic: 'ar', hebrew: 'he', hindi: 'hi', indonesian: 'id', japanese: 'ja', korean: 'ko',
  chinese: 'zh', thai: 'th', vietnamese: 'vi', greek: 'el', hungarian: 'hu', czech: 'cs', romanian: 'ro', ukrainian: 'uk', bulgarian: 'bg', serbian: 'sr',
  croatian: 'hr', slovenian: 'sl', slovak: 'sk', malay: 'ms', persian: 'fa', bengali: 'bn', tamil: 'ta', telugu: 'te', catalan: 'ca', lithuanian: 'lt', latvian: 'lv',
  estonian: 'et', icelandic: 'is', albanian: 'sq', macedonian: 'mk', bosnian: 'bs',
};

const SUGGESTIVE = /\b(porn\w*|hentai|erotic\w*|nude\w*|naked|sex\w*|orgasm\w*|seduc\w*|lust\w*|prostitut\w*|brothel|incest\w*|fetish\w*|bdsm|softcore|hardcore|striptease)\b/i;

function cleanText(text) {
  return String(text === undefined || text === null ? '' : text).replace(/\s+/g, ' ').trim();
}

function plainText(text) {
  return String(text === undefined || text === null ? '' : text).replace(/[\r\t ]+\n/g, '\n').trim();
}

function absolute(url) {
  const raw = String(url || '').trim();
  if (!raw || raw.indexOf('data:') === 0) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.indexOf('//') === 0) return 'https:' + raw;
  return SITE + (raw.charAt(0) === '/' ? '' : '/') + raw;
}

function piece(text) {
  const raw = String(text || '');
  try {
    return encodeURIComponent(decodeURIComponent(raw));
  } catch (e) {
    return encodeURIComponent(raw);
  }
}

function idOfHref(href) {
  const m = /\/watch-(movie|series)\/([^/?#]+)/.exec(String(href || ''));
  return m ? (m[1] === 'movie' ? 'm:' : 's:') + m[2] : '';
}

function splitId(mangaId) {
  const m = /^([ms]):([^/?#\s]+)$/.exec(String(mangaId || ''));
  if (!m) throw new Error('arc018: unknown title id ' + mangaId);
  return { movie: m[1] === 'm', slug: m[2] };
}

function pageUrl(mangaId) {
  const t = splitId(mangaId);
  return `${SITE}/${t.movie ? 'watch-movie' : 'watch-series'}/${piece(t.slug)}/`;
}

function genreLabel(slug) {
  return GENRE_LABELS[slug] || slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function ageOfCertificate(raw) {
  const c = String(raw || '').toUpperCase().replace(/\s+/g, '');
  if (!c || c === 'NR' || c === 'UNRATED' || c === 'N/A' || c === '-') return undefined;
  if (/^(NC-?17|X|XXX|AO|R-?18|18\+?|18A|ADULT)$/.test(c)) return 18;
  if (/^(R|TV-?MA|MA|MA15\+?|15\+?|16\+?|17\+?|14A|M)$/.test(c)) return 16;
  if (/^(G|PG|PG-?13|TV-?Y7?(-FV)?|TV-?G|TV-?PG|TV-?14|U|UA|12A?|13\+?)$/.test(c)) return 0;
  return 16;
}

function ageOf(certificate, genres, text) {
  let age = ageOfCertificate(certificate);
  if (age === undefined) age = 0;
  if (age < 16 && (genres || []).indexOf('horror') !== -1) age = 16;
  if (age < 16 && SUGGESTIVE.test(String(text || ''))) age = 16;
  return age;
}

function readTitlePage(html) {
  const $ = cheerio.load(html);
  let ld = {};
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const j = JSON.parse($(el).contents().text());
      if (j && (j['@type'] === 'Movie' || j['@type'] === 'TVSeries')) ld = j;
    } catch (e) {
    }
  });
  const main = $('main').first();
  const info = {};
  info.title = cleanText(main.find('h2').first().text()) || cleanText(ld.name);
  const rated = /Rated:\s*([A-Za-z0-9+\-]+)/.exec(main.text());
  info.certificate = rated ? rated[1] : cleanText(ld.contentRating);
  info.genres = [];
  info.genreNames = [];
  main.find('a[rel="tag"][href*="/genre/"]').each((_, a) => {
    const slug = (/\/genre\/([^/]+)/.exec($(a).attr('href') || '') || [])[1];
    const name = cleanText($(a).text());
    if (slug && info.genres.indexOf(slug) === -1) info.genres.push(slug);
    if (name && info.genreNames.indexOf(name) === -1) info.genreNames.push(name);
  });
  const year = main.find('a[rel="tag"][href*="/year/"]').first().text();
  info.year = cleanText(year) || cleanText(ld.datePublished).slice(0, 4);
  info.countries = main.find('a[rel="tag"][href*="/country/"]').map((_, a) => cleanText($(a).text())).get();
  info.language = '';
  main.find('dt').each((_, dt) => {
    if (cleanText($(dt).text()).toLowerCase() === 'language') info.language = cleanText($(dt).next('dd').text());
  });
  info.desc = plainText(ld.description);
  info.image = absolute(ld.image) || absolute(main.find('#image_storage').attr('src'));
  const backdrop = $('meta[property="og:image"]').attr('content') || '';
  info.banner = /\/backdrops\//.test(backdrop) ? absolute(backdrop) : '';
  const badge = main.text();
  info.status = /Status:\s*Ongoing/i.test(badge) ? 'ONGOING' : /Status:\s*(Ended|Canceled|Cancelled)/i.test(badge) ? 'COMPLETED' : 'UNKNOWN';
  info.cast = [];
  main.find('[aria-label="Cast"] a[href*="/actor/"]').each((_, a) => {
    const name = cleanText($(a).text());
    const slug = (/\/actor\/([^/]+)/.exec($(a).attr('href') || '') || [])[1];
    if (name && info.cast.length < 30) info.cast.push({ name, slug });
  });
  info.token = $('section[aria-label="Video player"]').attr('data-token') || '';
  return info;
}

function parseCards($) {
  const results = [];
  const seen = new Set();
  $('a.block').each((_, a) => {
    const link = $(a);
    const mangaId = idOfHref(link.attr('href'));
    if (!mangaId || seen.has(mangaId)) return;
    const title = cleanText(link.find('h3').first().text()) || cleanText(link.find('img').first().attr('alt'));
    if (!title) return;
    seen.add(mangaId);
    const card = {
      mangaId,
      title,
      image: absolute(link.find('img').first().attr('src')),
      webURL: pageUrl(mangaId),
      medium: 'anime',
    };
    link.find('span').each((_, s) => {
      const t = cleanText($(s).text());
      if (/^(19|20)\d\d$/.test(t) && !card.releaseDate) card.releaseDate = t;
    });
    results.push(card);
  });
  return results;
}

function hostOf(url) {
  const m = /^https?:\/\/([^/:?#]+)/i.exec(String(url || ''));
  return m ? m[1].toLowerCase() : '';
}

function isVidmoly(url) {
  const h = hostOf(url);
  return /(^|\.)kaembed\.net$/.test(h) || /(^|\.)vidmoly\.(org|biz|net)$/.test(h);
}

function languageCodeOf(label) {
  const name = cleanText(String(label || '').split(/[-\[(]/)[0]).toLowerCase();
  return LANGUAGE_CODES[name] || '';
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.ages = new Map();
    this.pages = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return Object.keys(GENRE_LABELS).map((slug) => ({ id: slug, label: genreLabel(slug) }));
  }

  async send(request) {
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

  async text(url, headers) {
    const response = await this.send({ url, method: 'GET', headers: headers || {} });
    if (response.status === 404) throw Object.assign(new Error('arc018: not found (HTTP 404)'), { notFound: true });
    if (response.status < 200 || response.status >= 300) throw new Error('arc018: HTTP ' + response.status);
    return String(response.data || '');
  }

  titlePage(mangaId) {
    const kept = this.pages.get(mangaId);
    if (kept && Date.now() - kept.at < 300000) return kept.pending;
    const pending = this.text(pageUrl(mangaId));
    this.pages.set(mangaId, { at: Date.now(), pending });
    pending.catch(() => {
      if (this.pages.get(mangaId) && this.pages.get(mangaId).pending === pending) this.pages.delete(mangaId);
    });
    return pending;
  }

  async ageOfTitle(card) {
    if (this.ages.has(card.mangaId)) return this.ages.get(card.mangaId);
    try {
      const info = readTitlePage(await this.text(pageUrl(card.mangaId)));
      const age = ageOf(info.certificate, info.genres, card.title + ' ' + info.desc);
      this.ages.set(card.mangaId, age);
      return age;
    } catch (e) {
      console.error('arc018 certificate lookup failed for ' + card.mangaId + ': ' + (e && e.message));
      return undefined;
    }
  }

  async rate(results) {
    let next = 0;
    const worker = async () => {
      while (next < results.length) {
        const card = results[next++];
        card.ageRating = await this.ageOfTitle(card);
      }
    };
    await Promise.all(Array.from({ length: Math.min(8, results.length) }, worker));
    return results;
  }

  async getSearchResults(request, metadata) {
    const query = cleanText(request && request.title);
    const page = metadata && Number.isFinite(metadata.page) && metadata.page > 0 ? metadata.page : 1;
    const feedId = cleanText(request && request.feed);
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const tag = included.length ? cleanText(included[0] && (included[0].id || included[0])) : '';
    let url;
    if (query) {
      url = `${SITE}/search?keyword=${encodeURIComponent(query)}` + (page > 1 ? `&page=${page}` : '');
    } else if (/^actor:[A-Za-z0-9%._-]+$/.test(feedId)) {
      if (page > 1) return { results: [] };
      url = `${SITE}/actor/${piece(feedId.slice(6))}/`;
    } else if (tag && GENRE_LABELS[tag]) {
      url = `${SITE}/genre/${tag}/` + (page > 1 ? `page/${page}/` : '');
    } else {
      const feed = FEEDS.find((f) => f.id === feedId) || FEEDS[0];
      url = SITE + feed.path + (page > 1 ? `page/${page}/` : '');
    }
    let html;
    try {
      html = await this.text(url);
    } catch (e) {
      if (e && e.notFound) return { results: [] };
      throw e;
    }
    const $ = cheerio.load(html);
    const results = await this.rate(parseCards($));
    const more = results.length > 0 && $('nav[aria-label="Pagination"] a').filter((_, a) => /^next/i.test(cleanText($(a).text()))).length > 0;
    return more ? { results, metadata: { page: page + 1 } } : { results };
  }

  async getMangaDetails(mangaId) {
    const t = splitId(mangaId);
    const info = readTitlePage(await this.titlePage(mangaId));
    if (!info.title) throw new Error('arc018: title page not found');
    const notes = [];
    if (info.language && info.language.toLowerCase() !== 'english') notes.push(`Original language: ${info.language}, with English subtitles.`);
    if (info.countries.length) notes.push('Country: ' + info.countries.join(', ') + '.');
    const desc = [info.desc].concat(notes.length ? [notes.join(' ')] : []).filter(Boolean).join('\n\n');
    const age = ageOf(info.certificate, info.genres, info.title + ' ' + info.desc);
    this.ages.set(mangaId, age);
    const out = {
      title: info.title,
      image: info.image,
      desc,
      tags: info.genreNames,
      webURL: pageUrl(mangaId),
      medium: 'anime',
      ageRating: age,
      status: t.movie ? 'COMPLETED' : info.status,
    };
    if (info.banner) out.banner = info.banner;
    if (info.year) out.releaseDate = info.year;
    if (info.cast.length) out.cast = info.cast.map((c) => (c.slug ? { name: c.name, feed: 'actor:' + c.slug } : { name: c.name }));
    out.completed = out.status === 'COMPLETED';
    return { mangaInfo: out };
  }

  async getChapters(mangaId) {
    const t = splitId(mangaId);
    if (t.movie) return [{ id: 'movie', chapterId: 'movie', name: 'Full movie', number: 1 }];
    const $ = cheerio.load(await this.titlePage(mangaId));
    const rows = [];
    const seen = new Set();
    $('a[href*="/episode/"]').each((_, a) => {
      const m = /\/episode\/[^/]+\/(s(\d+)-e(\d+))\/?(?:[?#]|$)/.exec($(a).attr('href') || '');
      if (!m || seen.has(m[1])) return;
      seen.add(m[1]);
      rows.push({ id: m[1], season: parseInt(m[2], 10), number: parseInt(m[3], 10) });
    });
    if (!rows.length) throw new Error('arc018 lists no episodes for this series yet');
    rows.sort((a, b) => b.season - a.season || b.number - a.number);
    const many = new Set(rows.map((r) => r.season)).size > 1;
    return rows.map((r) => {
      const out = { id: r.id, chapterId: r.id, name: `Episode ${r.number}`, number: r.number };
      if (many) {
        out.season = String(r.season);
        out.seasonName = r.season === 0 ? 'Specials' : `Season ${r.season}`;
      }
      return out;
    });
  }

  async servers(mangaId, chapterId) {
    const t = splitId(mangaId);
    let url = pageUrl(mangaId);
    let field = 'players';
    if (!t.movie) {
      if (!/^s\d+-e\d+$/.test(String(chapterId || ''))) throw new Error('arc018: unknown episode id ' + chapterId);
      url = `${SITE}/episode/${piece(t.slug)}/${chapterId}/`;
      field = 'players_show';
    }
    const info = readTitlePage(await this.text(url));
    if (!info.token) throw new Error('arc018: this page has no player');
    const response = await this.send({
      url: `${SITE}/ajax/ajax.php`,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', Referer: url },
      body: `${field}=${encodeURIComponent(info.token)}`,
    });
    let list;
    try {
      list = JSON.parse(response.data);
    } catch (e) {
      list = null;
    }
    if (!Array.isArray(list)) throw new Error('arc018 gave no server list (HTTP ' + response.status + ')');
    return list.filter((s) => s && typeof s.link === 'string' && /^https?:\/\//i.test(s.link));
  }

  async readVidmoly(link, referer) {
    const page = await this.text(link, { Referer: referer });
    const source = /\bsources["']?\s*:\s*\[\s*\{\s*["']?file["']?\s*:\s*["']([^"'\s]+)["']/.exec(page);
    if (!source) throw new Error('the Vidmoly page has no stream');
    const master = source[1].replace(/\\\//g, '/');
    if (!/^https?:\/\//i.test(master)) throw new Error('the Vidmoly page has no stream address');
    const subtitles = [];
    const seen = new Set();
    (page.match(/\{[^{}]*\}/g) || []).forEach((block) => {
      if (!/\bkind["']?\s*:\s*["']captions["']/.test(block)) return;
      const file = /\bfile["']?\s*:\s*["']([^"']+)["']/.exec(block);
      const label = /\blabel["']?\s*:\s*["']([^"']*)["']/.exec(block);
      if (!file || !/^https?:\/\//i.test(file[1]) || seen.has(file[1])) return;
      seen.add(file[1]);
      const track = { url: file[1].replace(/\\\//g, '/'), label: cleanText(label && label[1]) || 'Subtitles' };
      track.language = languageCodeOf(track.label);
      subtitles.push(track);
    });
    subtitles.sort((a, b) => (b.language === 'en' ? 1 : 0) - (a.language === 'en' ? 1 : 0));
    return { master, subtitles: subtitles.slice(0, 40) };
  }

  async describe(master, subtitles) {
    let top = 0;
    try {
      const text = await this.text(master);
      (text.match(/RESOLUTION=\d+x(\d+)/g) || []).forEach((r) => {
        top = Math.max(top, parseInt(r.split('x')[1], 10) || 0);
      });
    } catch (e) {
      if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
    }
    const parts = [top ? `Auto up to ${top}p` : 'Auto'];
    const names = [];
    subtitles.forEach((s) => {
      const name = cleanText(String(s.label).split(/[-\[(]/)[0]);
      if (name && names.indexOf(name) === -1) names.push(name);
    });
    if (names.length) {
      const english = names.indexOf('English') !== -1;
      parts.push(names.length <= 3 ? 'Softsub: ' + names.join(', ') : english ? `Softsub: English and ${names.length - 1} more` : `Softsub: ${names.length} languages`);
    }
    return parts.join(', ');
  }

  async getVideos(mangaId, chapterId) {
    const list = await this.servers(mangaId, chapterId);
    const readable = list.filter((s) => isVidmoly(s.link));
    if (!readable.length) {
      const names = list.map((s) => cleanText(s.name)).filter(Boolean);
      throw new Error('arc018 lists no server that can be read here' + (names.length ? ' (' + names.join(', ') + ' ask the viewer for a picture check)' : ''));
    }
    const referer = SITE + '/';
    const answers = await Promise.all(
      readable.map(async (s) => {
        try {
          const found = await this.readVidmoly(s.link, referer);
          return { found };
        } catch (e) {
          if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
          return { error: e };
        }
      })
    );
    const videos = [];
    for (const a of answers) {
      if (!a.found) continue;
      const entry = { url: a.found.master, quality: await this.describe(a.found.master, a.found.subtitles), type: 'hls', server: SERVER };
      if (a.found.subtitles.length) entry.subtitles = a.found.subtitles;
      videos.push(entry);
    }
    if (!videos.length) {
      const failed = answers.find((a) => a.error);
      const why = failed && failed.error && failed.error.message ? failed.error.message : 'no stream';
      throw new Error(/not found|404/.test(why) ? 'Vidmoly no longer has this video on arc018' : 'arc018 gave no stream for this title (' + why + ')');
    }
    return videos;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }
}

module.exports = { Source };
