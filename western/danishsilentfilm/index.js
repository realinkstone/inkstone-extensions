const SITE = 'https://www.stumfilm.dk';
const BASE = SITE + '/en/stumfilm';
const FILM = BASE + '/streaming/film/';
const PAGE_SIZE = 24;
const CACHE_MS = 10 * 60 * 1000;

const FEEDS = [
  { id: 'english', name: 'English Intertitles' },
  { id: 'recent', name: 'Recently Added', page: 'films/all-titles' },
  { id: 'feature', name: 'Feature Films', page: 'films/feature-films' },
  { id: 'short', name: 'Short Films', page: 'films/short-films' },
  { id: 'incomplete', name: 'Incomplete Films', page: 'films/incomplete-films' },
  { id: 'oldest', name: 'Oldest First', page: 'films/all-titles' },
  { id: 'newest', name: 'Newest First', page: 'films/all-titles' },
];

const BLANK_TITLES = {
  '13345': 'Jernmixturen',
  '20925': 'Mirakeltjeneren',
  '14217': 'The Mystery of the Crown Jewels',
  '42790': 'Nordisk Films Co. Animation Film',
  '10860': 'Mockery',
  '13518': 'La Sylphide',
  '13516': "The Tarantella from 'Napoli'",
  '13517': "The Gypsy Dance from 'Il Trovatore'",
  '13519': 'Orpheus and Eurydice',
  '33011': 'On special commission',
};

const ENGLISH_TEXT = new Set([
  '10860', '12660', '13296', '14220', '16039', '19430', '20365', '20460', '32661', '33991', 'afgrunden', 'atlantis', 'balletdanserinden', 'ballettens-datter', 'cirkusdjaevlen',
  'den-hvide-slavehandels-sidste-offer', 'den-sorte-drom', 'den-sorte-haette', 'den-sorte-kansler', 'der-var-engang', 'det-hemmelighedsfulde-x', 'dr-nicholson-og-den-blaa-diamant',
  'evangeliemandens-liv', 'flugten-fra-seraillet', 'fra-fyrste-til-knejpevaert', 'fra-piazza-del-popolo', 'haevnens-nat', 'himmelskibet', 'ildfluen', 'jokeren', 'kaerlighedsvalsen',
  'klovnen', 'lasse-mansson-fra-skaane', 'lille-dorrit', 'nattens-datter-iv', 'ned-med-vaabnene', 'nedbrudte-nerver', 'pat-corner', 'praesidenten', 'solskinsdalen', 'tyvepak',
  'under-mollevingen', 'ved-faengslets-port', 'vennerne-fra-officersskolen', 'verdens-undergang',
]);

const EROTIC_FILMS = new Set([
  '12924', '15852', '20140', '20512', '32881', 'afgrunden', 'de-dodes-o', 'de-guldgravere', 'den-farlige-alder-0', 'den-hvide-slavehandels-sidste-offer', 'det-berygtede-hus',
  'ekspeditricen', 'elskovsleg', 'erdgeist', 'expressens-mysterium', 'flugten-fra-seraillet', 'hendes-aere', 'katastrofen-i-dokken', 'mod-lyset', 'rivalinder', 'rovedderkoppen',
  'stakkels-karin',
]);

const MATURE_WORDS = /\b(erotic\w*|nude|nudity|naked|brothel\w*|prostitut\w*|white slave\w*|rape[ds]?|sexual\w*)\b/i;

function clean(text) {
  return String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
}

function ageOf(key, genres, text) {
  if (EROTIC_FILMS.has(key)) return 16;
  if ((genres || []).some((g) => /erotic/i.test(g))) return 16;
  return MATURE_WORDS.test(String(text || '')) ? 16 : 0;
}

function keyOf(mangaId) {
  const key = String(mangaId || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(key)) throw new Error('Danish Silent Film: unknown title id ' + mangaId);
  return key;
}

function jsonAt(text, at) {
  let depth = 0;
  let inString = false;
  for (let i = at; i < text.length; i++) {
    const c = text.charAt(i);
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return JSON.parse(text.slice(at, i + 1));
  }
  throw new Error('Danish Silent Film: the player page holds no readable configuration');
}

function minutesOf(text) {
  const m = /(\d+)\s*min/i.exec(String(text || ''));
  return m ? parseInt(m[1], 10) : 0;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager();
    this.pages = new Map();
    this.films = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async get(url, headers, attempts) {
    let response = null;
    for (let attempt = 0; attempt < (attempts || 2); attempt++) {
      try {
        response = await this.requests.schedule(
          App.createRequest({ url: attempt ? `${url}${url.indexOf('?') >= 0 ? '&' : '?'}r=${Date.now()}` : url, method: 'GET', headers: Object.assign({ Accept: 'text/html,application/xhtml+xml' }, headers || {}) })
        );
      } catch (e) {
        if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
        if (attempt + 1 >= (attempts || 2)) throw e;
        continue;
      }
      if (response.status < 500 && response.status !== 429) break;
    }
    return response;
  }

  async html(url, headers) {
    const response = await this.get(url, headers);
    if (response.status === 404) throw new Error('Danish Silent Film: not found (HTTP 404)');
    if (response.status < 200 || response.status >= 300) throw new Error(`Danish Silent Film: HTTP ${response.status}`);
    return String(response.data || '');
  }

  async cards(pagePath) {
    const hit = this.pages.get(pagePath);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.cards;
    const $ = cheerio.load(await this.html(`${BASE}/${pagePath}`));
    const cards = [];
    const seen = new Set();
    $('.grid__item[data-year]').each((_, el) => {
      const item = $(el);
      const href = String(item.find('a.stumfilm-card').first().attr('href') || '');
      const m = /\/streaming\/film\/([^/?#]+)/.exec(href);
      if (!m) return;
      const key = decodeURIComponent(m[1]);
      if (seen.has(key)) return;
      const title = clean(item.attr('data-title')) || clean(item.find('.stumfilm-card__title').first().text()) || BLANK_TITLES[key] || '';
      if (!title) return;
      seen.add(key);
      const year = clean(item.attr('data-year'));
      cards.push({
        key,
        title,
        year: /^\d{4}$/.test(year) ? year : '',
        minutes: minutesOf(item.find('.stumfilm-card__time').first().text()),
        text: clean(item.find('.stumfilm-card__more__wrapper__text').first().text()),
        image: String(item.find('img.picture__image').first().attr('src') || ''),
      });
    });
    if (!cards.length) throw new Error('Danish Silent Film: the list page holds no films');
    this.pages.set(pagePath, { at: Date.now(), cards });
    return cards;
  }

  card(c) {
    const bits = ['Silent film'];
    if (c.year) bits.push(c.year);
    if (c.minutes) bits.push(`${c.minutes} min`);
    if (ENGLISH_TEXT.has(c.key)) bits.push('English text');
    const out = { mangaId: c.key, title: c.title, image: c.image, summary: bits.join(', '), ageRating: ageOf(c.key, null, `${c.title} ${c.text}`), medium: 'anime' };
    if (c.year) out.year = c.year;
    return out;
  }

  slice(list, page) {
    const start = (page - 1) * PAGE_SIZE;
    const results = list.slice(start, start + PAGE_SIZE).map((c) => this.card(c));
    return { results, metadata: start + PAGE_SIZE < list.length ? { page: page + 1 } : undefined };
  }

  async getSearchResults(request, metadata) {
    const query = clean(request && request.title).toLowerCase();
    const feedId = (request && request.feed) || FEEDS[0].id;
    const page = Math.max(1, (metadata && metadata.page) || 1);
    if (query) {
      const words = query.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
      const all = await this.cards('films/all-titles');
      const scored = [];
      for (const c of all) {
        const title = c.title.toLowerCase();
        const rest = `${c.text} ${c.year}`.toLowerCase();
        let score = 0;
        let ok = true;
        for (const w of words) {
          if (title.indexOf(w) >= 0) score += 2;
          else if (rest.indexOf(w) >= 0) score += 1;
          else {
            ok = false;
            break;
          }
        }
        if (ok) scored.push({ c, score });
      }
      scored.sort((a, b) => b.score - a.score);
      return this.slice(scored.map((s) => s.c), page);
    }
    const feed = FEEDS.find((f) => f.id === feedId) || FEEDS[0];
    if (feed.id === 'english') {
      const all = await this.cards('films/all-titles');
      return this.slice(all.filter((c) => ENGLISH_TEXT.has(c.key)), page);
    }
    let list = await this.cards(feed.page);
    if (feed.id === 'oldest' || feed.id === 'newest') {
      const sign = feed.id === 'oldest' ? 1 : -1;
      list = list.slice().sort((a, b) => sign * ((parseInt(a.year, 10) || 9999) - (parseInt(b.year, 10) || 9999)) || a.title.localeCompare(b.title));
    }
    return this.slice(list, page);
  }

  async film(key) {
    const hit = this.films.get(key);
    if (hit && Date.now() - hit.at < 60000) return hit.value;
    const html = await this.html(FILM + encodeURIComponent(key));
    const $ = cheerio.load(html);
    const title = clean($('h1.header__hero__title').first().text());
    if (!title) throw new Error('Danish Silent Film: title not found');
    const hero = clean($('.header__hero__text').first().text());
    const m = /^(.*?),\s*(\d{4}),\s*(\d+)\s*min/i.exec(hero);
    const credits = {};
    $('.credits__item').each((_, el) => {
      const label = clean($(el).find('.credits__title').first().text());
      const names = [];
      $(el).find('.credits__list__item').each((__, li) => {
        const t = clean($(li).text());
        if (t) names.push(t);
      });
      if (label) credits[label] = names;
    });
    const summary = $('.text__summary').first();
    summary.find('br').replaceWith('\n');
    const plot = String(summary.text() || '').split('\n').map((l) => clean(l)).filter(Boolean).join('\n\n');
    const embed = (() => {
      const raw = $('[data-video]').first().attr('data-video');
      if (!raw) return '';
      try {
        const v = JSON.parse(raw);
        return /^https:\/\/player\.vimeo\.com\/video\/\d+/.test(String(v.embed || '')) ? String(v.embed) : '';
      } catch (e) {
        return '';
      }
    })();
    const art = /dfi-dam\.qonqord\.cloud\/preview\/([\w-]+)\//.exec(html);
    const value = {
      key,
      title,
      director: m ? clean(m[1]) : '',
      year: m ? m[2] : '',
      minutes: m ? parseInt(m[3], 10) : minutesOf(hero),
      plot,
      genres: credits.Genre || [],
      countries: credits['Production country'] || [],
      companies: credits['Production companies'] || [],
      cast: credits.Appearances || [],
      keywords: credits.Keywords || [],
      embed,
      image: art ? `https://dfi-dam.qonqord.cloud/preview/${art[1]}/previews/maxWidth_800_maxHeight_800.jpg/*/${art[1]}_micr.jpg?authcred=R3Vlc3Q6R3Vlc3Q=` : '',
    };
    this.films.set(key, { at: Date.now(), value });
    if (this.films.size > 30) this.films.delete(this.films.keys().next().value);
    return value;
  }

  async getMangaDetails(mangaId) {
    const key = keyOf(mangaId);
    const f = await this.film(key);
    const tags = f.genres.concat(f.countries).filter(Boolean);
    const info = {
      title: f.title,
      image: f.image,
      desc: f.plot || undefined,
      author: f.director && !/^unknown$/i.test(f.director) ? f.director : undefined,
      status: 'COMPLETED',
      completed: true,
      tags,
      webURL: FILM + encodeURIComponent(key),
      medium: 'anime',
      ageRating: ageOf(key, f.genres, `${f.plot} ${f.keywords.join(' ')}`),
    };
    if (f.year) info.year = f.year;
    if (f.cast.length) info.cast = f.cast.slice(0, 20).map((name) => ({ name }));
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const key = keyOf(mangaId);
    const f = await this.film(key);
    if (!f.embed) throw new Error('Danish Silent Film lists this film with no video');
    const row = { id: 'film', chapterId: 'film', name: f.minutes ? `Full film (${f.minutes} min)` : 'Full film', number: 1 };
    if (f.minutes >= 1) row.duration = f.minutes * 60;
    return [row];
  }

  async player(embed) {
    const response = await this.get(embed, { Referer: SITE + '/', Accept: 'text/html' });
    if (response.status === 403 || response.status === 404) throw new Error(`Danish Silent Film: Vimeo does not give this film out (HTTP ${response.status})`);
    if (response.status < 200 || response.status >= 300) throw new Error(`Danish Silent Film: Vimeo answered HTTP ${response.status}`);
    const text = String(response.data || '');
    const at = text.indexOf('window.playerConfig = ');
    if (at < 0) throw new Error('Danish Silent Film: the Vimeo player page holds no configuration');
    return jsonAt(text, text.indexOf('{', at));
  }

  async getVideos(mangaId, chapterId) {
    const key = keyOf(mangaId);
    const f = await this.film(key);
    if (!f.embed) throw new Error('Danish Silent Film lists this film with no video');
    const config = await this.player(f.embed);
    const hls = config && config.request && config.request.files && config.request.files.hls;
    const cdns = hls && hls.cdns && typeof hls.cdns === 'object' ? hls.cdns : {};
    const names = Object.keys(cdns);
    if (!names.length) throw new Error('Danish Silent Film: Vimeo gave no stream for this film');
    names.sort((a, b) => (a === hls.default_cdn ? -1 : 0) - (b === hls.default_cdn ? -1 : 0));
    const subtitles = [];
    for (const t of Array.isArray(config.request.text_tracks) ? config.request.text_tracks : []) {
      if (!t || !/^https?:\/\//.test(String(t.url || '')) || /ai_generated/i.test(String(t.provenance || '')) || /autogen/i.test(String(t.lang || ''))) continue;
      subtitles.push({ url: String(t.url), label: clean(t.label) || String(t.lang || 'Subtitles'), language: String(t.lang || '').split('-')[0] || 'en' });
    }
    const videos = [];
    for (const name of names.slice(0, 2)) {
      const url = String((cdns[name] && (cdns[name].url || cdns[name].avc_url)) || '');
      if (!/^https:\/\/.+\.m3u8/.test(url)) continue;
      const video = { url, quality: 'Auto', server: /^akfire/.test(name) ? 'Vimeo Akamai' : /fastly/.test(name) ? 'Vimeo Fastly' : 'Vimeo' };
      if (subtitles.length) video.subtitles = subtitles;
      videos.push(video);
    }
    if (!videos.length) throw new Error('Danish Silent Film: Vimeo gave no playlist for this film');
    return videos;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }
}

module.exports = { Source };
