const SITE = 'https://archive.org';
const SEARCH = SITE + '/advancedsearch.php';
const META = SITE + '/metadata/';
const PAGE_SIZE = 24;
const MAX_PAGE = 416;

const CURATED = 'feature_films OR silent_films OR Film_Noir OR SciFi_Horror OR film_scifi OR Comedy_Films OR short_films OR cliffhangers';

const NOT_ENGLISH_QUERY =
  'NOT language:(spa OR spanish OR ger OR german OR tur OR turkish OR jpn OR japanese OR fre OR french OR ita OR italian OR pol OR polish OR chi OR chinese OR hindi OR hin OR hun OR rus OR russian OR dut OR dutch OR kor OR korean OR gre OR greek OR por OR portuguese OR per OR persian OR arm OR cat OR swe OR swedish OR tha OR geo OR fin OR finnish OR ind OR heb OR ara OR arabic OR cze OR dan OR nor OR rum OR ukr OR bul OR srp OR hrv OR vie OR tam OR tel OR ben OR urd OR mal OR lat OR yid OR fil OR tgl)';

const EXPLICIT_QUERY =
  'NOT subject:(porn OR pornography OR pornographic OR xxx OR hardcore OR softcore OR erotica OR erotic OR erotism OR nsfw OR "adult film" OR "adults only" OR fetish OR bdsm OR femdom OR giantess OR macrophilia OR hentai OR "stag film" OR stag OR stripper OR strippers OR striptease OR sexploitation OR sexploition OR sexploit* OR nudist OR naturist OR nudie OR nudies OR nudity OR nude OR "peep show" OR peepshow OR orgy OR "blue movie" OR "blue movies" OR sexy) AND NOT title:(porn OR xxx OR sex OR sexy OR sexual OR nude OR erotic OR hardcore OR fetish OR hentai OR nudist OR nudity OR stripper OR strippers OR striptease OR nudie OR orgy OR naturist OR "peep show" OR "gang bang" OR gangbang OR bukkake OR blowjob OR cumshot OR milf OR handjob)';

const PLAYABLE_QUERY = 'format:("MPEG4" OR "h.264" OR "h.264 IA" OR "512Kb MPEG4") AND NOT access-restricted-item:true';

const FEEDS = [
  { id: 'popular', name: 'Popular Films', collections: CURATED, sort: 'downloads desc' },
  { id: 'feature', name: 'Feature Films', collections: 'feature_films', sort: 'downloads desc' },
  { id: 'silent', name: 'Silent Films', collections: 'silent_films', sort: 'downloads desc' },
  { id: 'noir', name: 'Film Noir', collections: 'Film_Noir', sort: 'downloads desc' },
  { id: 'scifi', name: 'Sci-Fi and Horror', collections: 'SciFi_Horror OR film_scifi', sort: 'downloads desc' },
  { id: 'comedy', name: 'Comedy Films', collections: 'Comedy_Films', sort: 'downloads desc' },
  { id: 'shorts', name: 'Short Films', collections: 'short_films', sort: 'downloads desc' },
  { id: 'serials', name: 'Cliffhanger Serials', collections: 'cliffhangers', sort: 'downloads desc' },
  {
    id: 'publicdomain',
    name: 'Public Domain',
    collections: CURATED,
    sort: 'downloads desc',
    extra: 'licenseurl:(*publicdomain* OR *zero*)',
  },
];

const GENRES = {
  comedy: ['Comedy', 'subject:(comedy OR comedies OR slapstick OR farce)'],
  drama: ['Drama', 'subject:(drama OR melodrama)'],
  horror: ['Horror', 'subject:(horror OR "monster movie" OR zombies OR vampire OR haunted)'],
  scifi: ['Sci-Fi', 'subject:("science fiction" OR sci-fi OR scifi OR robot OR aliens OR "outer space")'],
  western: ['Western', 'subject:(western OR cowboy OR cowboys OR "wild west")'],
  crime: ['Crime', 'subject:(crime OR gangster OR "film noir" OR detective OR mystery)'],
  war: ['War', 'subject:(war OR "world war" OR wwii OR military OR propaganda)'],
  romance: ['Romance', 'subject:(romance OR "love story" OR romantic)'],
  adventure: ['Adventure', 'subject:(adventure OR jungle OR pirates OR serial)'],
  musical: ['Musical', 'subject:(musical OR music OR songs OR "big band")'],
  animation: ['Animation', 'subject:(animation OR animated OR cartoon OR cartoons)'],
  documentary: ['Documentary', 'subject:(documentary OR newsreel OR "educational film")'],
  family: ['Family', 'subject:(family OR children OR kids OR "fairy tale")'],
  thriller: ['Thriller', 'subject:(thriller OR suspense OR spy)'],
};

const CORE_WORDS = /\b(porn\w*|xxx|hardcore|softcore|erotica|erotic\w*|nsfw|adults?[- ]only|adult films?|blue movies?|stag films?|sexploit\w*|nudist\w*|naturist\w*|nudie\w*|fetish\w*|bdsm|femdom|hentai|orgy|incest|giantess|macrophilia|gang ?bang\w*|bukkake|blowjob\w*|cumshot\w*|milf|handjob\w*|anal sex|oral sex|dildo\w*|masturbat\w*)\b/i;
const NUDITY_WORDS = /\b(nude|nudity|strippers?|striptease|peep ?show)\b/i;
const MILD_HEAD_WORDS = /\b(sex|sexy|sexual\w*|naked|topless|burlesque|lingerie|prostitut\w*|brothel|rape[ds]?|seduc\w*|exploitation|grindhouse|bikini(?! atoll)|gore|gory|splatter|slasher|torture|molest\w*|pedophil\w*|concentration camps?|holocaust|genocide|atrocit\w*|massacre|serial killers?|giallo|video nasty|cannibal\w*|necrophil\w*|snuff|sadis\w*|masochis\w*|mutilat\w*|decapitat\w*)\b/i;
const MILD_BODY_WORDS = /\b(sexual\w*|topless|prostitut\w*|brothel|rape[ds]?|torture|gore|gory|splatter|slasher|molest\w*|pedophil\w*|concentration camps?|genocide|atrocit\w*|serial killers?|giallo|video nasty|cannibal\w*|necrophil\w*|snuff|sadis\w*|masochis\w*|mutilat\w*|decapitat\w*)\b/i;

function clean(text) {
  return String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
}

function first(value) {
  return Array.isArray(value) ? first(value[0]) : clean(value);
}

function listOf(value, split) {
  const out = [];
  for (const v of Array.isArray(value) ? value : [value]) {
    const text = clean(v);
    if (!text) continue;
    for (const part of split ? text.split(/\s*;\s*/) : [text]) if (clean(part)) out.push(clean(part));
  }
  return out;
}

function plain(html) {
  const raw = Array.isArray(html) ? html.join('\n\n') : String(html == null ? '' : html);
  if (!raw) return '';
  const $ = cheerio.load(`<div>${raw.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '\n\n')}</div>`);
  return $('div')
    .first()
    .text()
    .split('\n')
    .map((l) => clean(l))
    .filter(Boolean)
    .join('\n\n');
}

function declaredAge(text) {
  const m = /age rating\s*:\s*([A-Za-z0-9+-]+)/i.exec(String(text || ''));
  if (!m) return undefined;
  const code = m[1].toUpperCase();
  if (/^(R\+|NC-?17|X|XXX|18\+?|ADULT|AO)$/.test(code)) return 18;
  if (/^(R|M|MA|MA15\+?|TV-?MA|16\+?|17\+?|15\+?)$/.test(code)) return 16;
  return 0;
}

function ageOf(title, subjects, description) {
  const bare = !clean(description) && !(subjects && subjects.length);
  if (bare) return undefined;
  const head = `${title || ''} ${(subjects || []).join(' ; ')}`;
  const body = String(description || '').slice(0, 1500);
  let age = 0;
  if (CORE_WORDS.test(head) || NUDITY_WORDS.test(head) || CORE_WORDS.test(body)) age = 18;
  else if (MILD_HEAD_WORDS.test(head) || MILD_BODY_WORDS.test(body) || NUDITY_WORDS.test(body)) age = 16;
  const said = declaredAge(body);
  return said !== undefined && said > age ? said : age;
}

function yearOf(value) {
  const m = /(\d{4})/.exec(first(value));
  return m && Number(m[1]) >= 1850 && Number(m[1]) <= 2100 ? m[1] : '';
}

function runtimeOf(value) {
  const t = first(value);
  let m = /^(\d+):(\d{2}):(\d{2})/.exec(t);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /^(\d+)\s*(?:min|minutes|m)\b/i.exec(t);
  if (m) return Number(m[1]);
  m = /^(\d{1,3}):(\d{2})$/.exec(t);
  return m && Number(m[1]) > 0 ? Number(m[1]) : 0;
}

function lengthText(minutes) {
  if (!(minutes > 0)) return '';
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes} min`;
}

function encodePath(name) {
  return String(name).split('/').map(encodeURIComponent).join('/');
}

function idOf(mangaId) {
  const id = String(mangaId || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) throw new Error('Internet Archive: unknown item id ' + mangaId);
  return id;
}

const FORMAT_RANK = { 'h.264': 1, 'h.264 IA': 2, 'h.264 HD': 2, MPEG4: 3, '512Kb MPEG4': 4 };

function stemOf(name) {
  return String(name).replace(/(\.ia|_512kb)?\.(mp4|m4v)$/i, '');
}

function groupsOf(files) {
  const map = new Map();
  for (const f of Array.isArray(files) ? files : []) {
    if (!f || typeof f.name !== 'string' || !/\.(mp4|m4v)$/i.test(f.name) || FORMAT_RANK[f.format] === undefined) continue;
    if (/^__ia_|\.thumbs\//.test(f.name)) continue;
    const stem = stemOf(f.name);
    if (!map.has(stem)) map.set(stem, []);
    map.get(stem).push(f);
  }
  const groups = [];
  for (const [stem, list] of map) {
    list.sort((a, b) => FORMAT_RANK[a.format] - FORMAT_RANK[b.format]);
    groups.push({ stem, files: list });
  }
  const key = (s) => s.replace(/\d+/g, (d) => d.padStart(8, '0')).toLowerCase();
  groups.sort((a, b) => (key(a.stem) < key(b.stem) ? -1 : key(a.stem) > key(b.stem) ? 1 : 0));
  return groups;
}

const LANGS = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', ru: 'Russian', nl: 'Dutch', sv: 'Swedish', ja: 'Japanese', zh: 'Chinese' };

class Source {
  constructor() {
    this.requests = App.createRequestManager();
    this.items = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return Object.keys(GENRES).map((id) => ({ id, label: GENRES[id][0] }));
  }

  async get(url) {
    let response = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const target = attempt ? `${url}${url.indexOf('?') >= 0 ? '&' : '?'}r=${Date.now()}` : url;
      try {
        response = await this.requests.schedule(App.createRequest({ url: target, method: 'GET', headers: { Accept: 'application/json' } }));
      } catch (e) {
        if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
        if (attempt === 1) throw e;
        continue;
      }
      if (response.status !== 429 && (response.status < 500 || response.status > 504 || response.status === 507)) break;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    return response;
  }

  async json(url) {
    const response = await this.get(url);
    if (response.status === 404) throw new Error('Internet Archive: not found (HTTP 404)');
    if (response.status < 200 || response.status >= 300) throw new Error(`Internet Archive: HTTP ${response.status}`);
    try {
      return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    } catch (e) {
      throw new Error('Internet Archive answered something that is not JSON');
    }
  }

  async page(q, sort, page) {
    if (page > MAX_PAGE) return { docs: [], more: false };
    const fields = ['identifier', 'title', 'year', 'date', 'runtime', 'subject', 'description', 'creator', 'downloads'];
    const url =
      `${SEARCH}?q=${encodeURIComponent(q)}&${fields.map((f) => `fl%5B%5D=${f}`).join('&')}&sort%5B%5D=${encodeURIComponent(sort)}&rows=${PAGE_SIZE}&page=${page}&output=json`;
    const response = await this.get(url);
    if (response.status === 507) return { docs: [], more: false };
    if (response.status < 200 || response.status >= 300) throw new Error(`Internet Archive: HTTP ${response.status}`);
    let data;
    try {
      data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    } catch (e) {
      throw new Error('Internet Archive answered something that is not JSON');
    }
    const found = data && data.response ? data.response : {};
    const docs = Array.isArray(found.docs) ? found.docs : [];
    return { docs, more: docs.length > 0 && page * PAGE_SIZE < Math.min(Number(found.numFound) || 0, PAGE_SIZE * MAX_PAGE) };
  }

  card(doc) {
    const id = first(doc.identifier);
    const title = first(doc.title);
    if (!id || !title || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) return null;
    const subjects = listOf(doc.subject, true);
    const age = ageOf(title, subjects, plain(doc.description));
    if (age === undefined) return null;
    const year = yearOf(doc.year) || yearOf(doc.date);
    const length = lengthText(runtimeOf(doc.runtime));
    const out = { mangaId: id, title, image: `${SITE}/services/img/${encodeURIComponent(id)}`, ageRating: age, medium: 'anime' };
    const bits = [year, length].filter(Boolean);
    if (bits.length) out.summary = bits.join(', ');
    if (year) out.year = year;
    const author = listOf(doc.creator, false).join(', ');
    if (author) out.author = author;
    if (subjects.length) out.tags = subjects.slice(0, 6);
    return out;
  }

  async fill(q, sort, page) {
    const results = [];
    const seen = new Set();
    let more = true;
    for (let fetched = 0; more && results.length < 10 && fetched < 3; fetched++) {
      let batch;
      try {
        batch = await this.page(q, sort, page);
      } catch (e) {
        if (results.length) break;
        throw e;
      }
      for (const doc of batch.docs) {
        const card = this.card(doc);
        if (card && !seen.has(card.mangaId)) {
          seen.add(card.mangaId);
          results.push(card);
        }
      }
      more = batch.more;
      if (more) page += 1;
    }
    return { results, metadata: more ? { page } : undefined };
  }

  async getSearchResults(request, metadata) {
    const query = clean(request && request.title);
    const page = Math.max(1, (metadata && metadata.page) || 1);
    const feed = FEEDS.find((f) => f.id === ((request && request.feed) || FEEDS[0].id)) || FEEDS[0];
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const genre = included.length ? GENRES[String(included[0].id || included[0])] : null;
    const parts = ['mediatype:movies', `collection:(${feed.collections})`, NOT_ENGLISH_QUERY, EXPLICIT_QUERY, PLAYABLE_QUERY];
    if (feed.extra) parts.push(feed.extra);
    if (genre) parts.push(genre[1]);
    let sort = feed.sort;
    if (query) {
      const words = query
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean)
        .slice(0, 8);
      if (!words.length) return { results: [], metadata: undefined };
      const all = words.join(' AND ');
      parts.push(`(title:(${all}) OR creator:(${all}) OR subject:(${all}))`);
      sort = 'downloads desc';
    }
    return this.fill(parts.join(' AND '), sort, page);
  }

  async item(id) {
    const hit = this.items.get(id);
    if (hit && Date.now() - hit.at < 60000) return hit.value;
    const value = await this.json(META + encodeURIComponent(id));
    if (!value || !value.metadata || value.is_dark) throw new Error('Internet Archive: this item is not available (removed or dark)');
    if (first(value.metadata.mediatype) !== 'movies') throw new Error('Internet Archive: this item is not a film');
    if (/^true$/i.test(first(value.metadata['access-restricted-item']))) throw new Error('Internet Archive: this film can only be borrowed on archive.org');
    this.items.set(id, { at: Date.now(), value });
    if (this.items.size > 20) this.items.delete(this.items.keys().next().value);
    return value;
  }

  async getMangaDetails(mangaId) {
    const id = idOf(mangaId);
    const { metadata: m } = await this.item(id);
    const title = first(m.title);
    if (!title) throw new Error('Internet Archive: title not found');
    const subjects = listOf(m.subject, true);
    const desc = plain(m.description);
    const age = ageOf(title, subjects, desc);
    const license = first(m.licenseurl);
    const publicDomain = /publicdomain|\/zero\//i.test(license);
    const tags = subjects.slice(0, 14);
    if (publicDomain) tags.push('Public Domain');
    const makers = listOf(m.director, false).concat(listOf(m.creator, false)).filter((v, i, a) => a.indexOf(v) === i);
    const info = {
      title,
      image: `${SITE}/services/img/${encodeURIComponent(id)}`,
      desc: desc ? desc.slice(0, 3000) : undefined,
      author: makers.length ? makers.slice(0, 3).join(', ') : undefined,
      status: 'COMPLETED',
      completed: true,
      tags,
      webURL: `${SITE}/details/${encodeURIComponent(id)}`,
      medium: 'anime',
      ageRating: age === undefined ? 16 : age,
    };
    const year = yearOf(m.year) || yearOf(m.date);
    if (year) info.year = year;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const id = idOf(mangaId);
    const { files } = await this.item(id);
    const groups = groupsOf(files);
    if (!groups.length) throw new Error('Internet Archive has no video file the Apple player can play for this item (only Ogg, Matroska or MPEG-2 files)');
    const rows = groups.map((g, at) => {
      const best = g.files[0];
      const seconds = Math.round(Number(best.length));
      const row = {
        id: g.stem,
        chapterId: g.stem,
        name: groups.length === 1 ? 'Full movie' : clean(best.title) || clean(g.stem.replace(/[_]+/g, ' ')) || `Part ${at + 1}`,
        number: at + 1,
      };
      if (seconds >= 1 && seconds < 86400) row.duration = seconds;
      return row;
    });
    rows.reverse();
    return rows;
  }

  async getVideos(mangaId, chapterId) {
    const id = idOf(mangaId);
    const { files } = await this.item(id);
    const groups = groupsOf(files);
    const group = groups.find((g) => g.stem === chapterId) || (groups.length === 1 ? groups[0] : null);
    if (!group) throw new Error('Internet Archive: this part is no longer in the item');
    const base = `${SITE}/download/${encodeURIComponent(id)}/`;
    const subtitles = [];
    for (const f of Array.isArray(files) ? files : []) {
      if (!f || typeof f.name !== 'string' || !/\.(srt|vtt)$/i.test(f.name)) continue;
      if (/\.asr\.(srt|vtt)$/i.test(f.name)) continue;
      const sameStem = f.name.indexOf(group.stem + '.') === 0 || f.name.indexOf(group.stem + '_') === 0;
      if (!sameStem && groups.length > 1) continue;
      const code = (/[._-]([a-z]{2})\.(?:srt|vtt)$/i.exec(f.name) || [])[1];
      const language = (code || 'en').toLowerCase();
      subtitles.push({ url: base + encodePath(f.name), label: LANGS[language] || 'Subtitles', language, format: /\.vtt$/i.test(f.name) ? 'vtt' : 'srt' });
    }
    const tracks = subtitles.slice(0, 6);
    const videos = [];
    const seen = new Set();
    for (const f of group.files) {
      const height = parseInt(f.height, 10);
      const label = height > 0 ? `${height}p` : 'Auto';
      if (seen.has(label)) continue;
      seen.add(label);
      const video = { url: base + encodePath(f.name), quality: label, server: 'Archive', type: 'mp4' };
      if (tracks.length) video.subtitles = tracks;
      videos.push(video);
    }
    if (!videos.length) throw new Error('Internet Archive: no playable video in this part');
    return videos;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }
}

module.exports = { Source };
