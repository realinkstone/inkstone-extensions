const SITE = 'https://anizone.to';

const FEEDS = [
  { id: 'added', name: 'Recently Added', sort: 'added-desc' },
  { id: 'release', name: 'Newest', sort: 'release-desc' },
  { id: 'az', name: 'A to Z', sort: 'title-asc' },
];

function htmlDecode(text) {
  return String(text || '')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function embeddedValues(html) {
  const out = [];
  const pattern = /JSON\.parse\('((?:[^'\\]|\\.)*)'\)/g;
  let match;
  while ((match = pattern.exec(html))) {
    try {
      out.push(JSON.parse(JSON.parse('"' + match[1].replace(/\\'/g, "'") + '"')));
    } catch (e) {
    }
  }
  return out;
}

function firstList(html, key) {
  return embeddedValues(html).find((value) => Array.isArray(value) && value.length && value[0] && value[0][key] !== undefined) || [];
}

function cursorOf(html) {
  const match = /nextCursor:\s*'([^']*)'/.exec(html);
  return match ? match[1] : null;
}

function snapshotOf(html, name) {
  const pattern = /wire:snapshot="([^"]+)"/g;
  let match;
  while ((match = pattern.exec(html))) {
    const snapshot = htmlDecode(match[1]);
    if (snapshot.indexOf('"name":"' + name + '"') !== -1) return snapshot;
  }
  return null;
}

function cookiesOf(headers) {
  if (!headers) return '';
  let raw = headers['set-cookie'] || headers['Set-Cookie'] || '';
  if (Array.isArray(raw)) raw = raw.join(', ');
  return String(raw)
    .split(/,\s*(?=[A-Za-z0-9_.-]+=)/)
    .map((part) => part.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

function toTitle(item) {
  return {
    mangaId: item.slug,
    title: item.main_title || item.slug,
    image: item.cover,
    status: item.is_ongoing ? 'ONGOING' : 'COMPLETED',
    tags: [item.type].filter(Boolean),
    medium: 'anime',
  };
}

function episodeName(item) {
  const names = item.title_list && typeof item.title_list === 'object' ? item.title_list : {};
  return names['1'] || names['5'] || Object.keys(names).map((k) => names[k]).find(Boolean) || '';
}

function toEpisode(item) {
  const number = parseFloat(item.slug);
  const name = episodeName(item);
  const time = item.air_date ? Date.parse(item.air_date + 'T00:00:00Z') : NaN;
  return {
    id: String(item.slug),
    chapterId: String(item.slug),
    name: name ? `Episode ${item.slug}: ${name}` : `Episode ${item.slug}`,
    number: Number.isFinite(number) ? number : undefined,
    time: Number.isFinite(time) ? time : undefined,
  };
}

function cueTimes(vtt) {
  const cues = [];
  const pattern = /(\d+):(\d+):(\d+)\.(\d+)\s*-->\s*(\d+):(\d+):(\d+)\.(\d+)\s*\n([^\n]*)/g;
  const ms = (h, m, s, f) => ((+h * 60 + +m) * 60 + +s) * 1000 + Math.round(+('0.' + f) * 1000);
  let match;
  while ((match = pattern.exec(vtt))) {
    cues.push({
      start: ms(match[1], match[2], match[3], match[4]),
      end: ms(match[5], match[6], match[7], match[8]),
      name: match[9].trim().toLowerCase(),
    });
  }
  const find = (words) => cues.find((cue) => words.some((word) => cue.name.indexOf(word) !== -1));
  const intro = find(['intro', 'opening']);
  const outro = find(['credits', 'outro', 'ending']);
  return {
    intro: intro && intro.end > intro.start ? { start: intro.start, end: intro.end } : undefined,
    outro: outro && outro.end > outro.start ? { start: outro.start, end: outro.end } : undefined,
  };
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 3 } });
  }

  getSourceFeeds() {
    return FEEDS.map((feed) => ({ id: feed.id, name: feed.name }));
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    const sort = query ? null : feed.sort;
    const pageUrl = query ? `${SITE}/anime?search=${encodeURIComponent(query)}` : `${SITE}/anime`;
    const cursor = metadata && metadata.cursor;
    let loaded;
    if (!cursor && !sort) {
      const page = await this.get(pageUrl);
      loaded = { items: firstList(page.html, 'main_title'), nextCursor: cursorOf(page.html) };
    } else {
      loaded = await this.loadPage(pageUrl, 'pages.anime-index', cursor || null, sort ? { sort } : {});
    }
    return {
      results: loaded.items.map(toTitle),
      metadata: loaded.nextCursor ? { cursor: loaded.nextCursor } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const page = await this.get(`${SITE}/anime/${encodeURIComponent(mangaId)}`);
    const $ = cheerio.load(page.html);
    const heading = $('h1').first();
    const facts = heading.next().find('span > span').map((i, el) => $(el).text().trim()).get();
    const synopsis = $('h3').filter((i, el) => $(el).text().trim() === 'Synopsis').first().next();
    synopsis.find('br').replaceWith('\n');
    const status = facts.find((f) => /^(ongoing|completed|finished|upcoming)$/i.test(f)) || '';
    const title = $('title').text().replace(/\s*[\u2014-]\s*AniZone\s*$/, '').trim();
    return {
      mangaInfo: {
        title: title || mangaId,
        image: $('img[src*="/images/anime/"]').first().attr('src'),
        desc: synopsis.text().replace(/\n{3,}/g, '\n\n').trim(),
        status: /ongoing/i.test(status) ? 'ONGOING' : /completed|finished/i.test(status) ? 'COMPLETED' : 'UNKNOWN',
        tags: $('a[href*="/tag/"]').map((i, el) => $(el).text().trim()).get().filter(Boolean),
        webURL: `${SITE}/anime/${mangaId}`,
        medium: 'anime',
      },
    };
  }

  async getChapters(mangaId) {
    const pageUrl = `${SITE}/anime/${encodeURIComponent(mangaId)}`;
    const page = await this.get(pageUrl);
    const episodes = firstList(page.html, 'air_date').slice();
    let cursor = cursorOf(page.html);
    const seen = new Set();
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      const next = await this.loadPage(pageUrl, 'pages.anime-detail', cursor, {}, page);
      episodes.push(...next.items);
      cursor = next.nextCursor;
    }
    const unique = new Map();
    for (const item of episodes) if (!unique.has(item.slug)) unique.set(item.slug, item);
    return Array.from(unique.values()).map(toEpisode).reverse();
  }

  async getVideos(mangaId, chapterId) {
    const page = await this.get(`${SITE}/anime/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}`);
    const player = /vidstackPlayer\(JSON\.parse\('((?:[^'\\]|\\.)*)'\)/.exec(page.html);
    if (!player) throw new Error('AniZone: the episode page has no player');
    const data = JSON.parse(JSON.parse('"' + player[1].replace(/\\'/g, "'") + '"'));
    if (!data.src) throw new Error('AniZone: the episode has no video yet');
    let skips = {};
    if (data.chapter) {
      try {
        const vtt = await this.requests.schedule(App.createRequest({ url: data.chapter, method: 'GET' }));
        if (vtt.status >= 200 && vtt.status < 300) skips = cueTimes(String(vtt.data).replace(/\r/g, ''));
      } catch (e) {
      }
    }
    return [
      {
        url: data.src,
        quality: 'Auto',
        headers: { Referer: `${SITE}/` },
        subtitles: (Array.isArray(data.subtitles) ? data.subtitles : [])
          .filter((s) => s && s.file)
          .map((s) => ({ url: s.file, label: s.title || s.language || 'Subtitles', language: s.language })),
        intro: skips.intro,
        outro: skips.outro,
      },
    ];
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async get(url) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { Accept: 'text/html' } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`AniZone: HTTP ${response.status}`);
    return { html: String(response.data), cookie: cookiesOf(response.headers) };
  }

  async loadPage(pageUrl, component, cursor, updates, known) {
    const page = known || (await this.get(pageUrl));
    const csrf = /data-csrf="([^"]+)"/.exec(page.html);
    const snapshot = snapshotOf(page.html, component);
    if (!csrf || !snapshot) throw new Error('AniZone: the page changed and has no list to page through');
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Livewire': 'true',
      'X-CSRF-TOKEN': csrf[1],
      Referer: pageUrl,
      Origin: SITE,
    };
    if (page.cookie) headers.Cookie = page.cookie;
    const response = await this.requests.schedule(
      App.createRequest({
        url: `${SITE}/livewire/update`,
        method: 'POST',
        headers,
        body: JSON.stringify({ _token: csrf[1], components: [{ snapshot, updates, calls: [{ path: '', method: 'loadPage', params: [cursor] }] }] }),
      })
    );
    if (response.status < 200 || response.status >= 300) throw new Error(`AniZone: HTTP ${response.status} while paging`);
    const json = JSON.parse(response.data);
    const component0 = json && json.components && json.components[0];
    const dispatches = (component0 && component0.effects && component0.effects.dispatches) || [];
    const loaded = dispatches.find((d) => d.name === 'items-loaded');
    const params = (loaded && loaded.params) || {};
    return { items: Array.isArray(params.items) ? params.items : [], nextCursor: params.hasMore ? params.nextCursor : null };
  }
}

module.exports = { Source };
