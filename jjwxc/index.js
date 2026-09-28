const SITE_BASE = 'https://www.jjwxc.net';
const API_BASE = 'https://android.jjwxc.net/androidapi';
const SEARCH_URL = 'https://www.jjwxc.net/search/search_ajax.php';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const LOCKED_CHAPTER_TEXT =
  '该章节为付费或未公开章节，暂无法在此阅读，请前往晋江文学城官网或官方App订阅解锁。\n\nThis chapter is a paid or not-yet-public JJWXC chapter and cannot be shown here. Read it on jjwxc.net or in the official JJWXC app.';

const GENRE_LABELS = {
  '0': 'All',
  '1': 'Romance',
  '2': 'Wuxia',
  '3': 'Fantasy',
  '4': 'Xianxia',
  '5': 'Games',
  '6': 'Legend (Chuanqi)',
  '7': 'Sci-Fi',
  '8': 'Fairy Tale',
  '9': 'Thriller',
  '10': 'Mystery',
  '16': 'Drama',
  '17': 'Light Novel',
  '18': 'Eastern Fanfic',
  '19': 'Western Fanfic',
  '20': 'Classical Fanfic',
  '21': 'Other Fanfic',
  '22': "Children's Songs",
  '23': 'Prose',
  '24': 'Fable',
  '25': 'Nursery Rhyme',
  '27': "Children's Novel",
};

const FEED_GENRES = ['0', '1', '2', '3', '4', '7', '9', '10', '16', '17'];

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

function cleanText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(text) {
  return String(text || '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function decodeEntitiesDeep(text) {
  return decodeEntities(decodeEntities(text));
}

function plainIntro(text) {
  return decodeEntitiesDeep(text)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map((line) => line.replace(/^[\s　]+/, '').replace(/[\s　]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseChineseCount(value) {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  const m = s.match(/^([\d,.]+)\s*(万|亿)?/);
  if (!m) return undefined;
  let n = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(n)) return undefined;
  if (m[2] === '万') n *= 10000;
  else if (m[2] === '亿') n *= 100000000;
  return Math.round(n);
}

function parseScore(value) {
  if (!value) return undefined;
  const m = String(value).match(/([\d.]+)/);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

function novelWebURL(novelId) {
  return `${SITE_BASE}/onebook.php?${qs({ novelid: novelId })}`;
}

function mapNovelInfo(info) {
  const novelId = String(info.novelId || '');
  const manga = {
    mangaId: novelId,
    title: cleanText(info.novelName) || novelId,
    image: info.novelCover || info.localImg || '',
    webURL: novelWebURL(novelId),
    medium: 'novel',
  };
  if (info.authorName) manga.author = cleanText(info.authorName);

  const introShort = plainIntro(info.novelIntroShort);
  const introFull = plainIntro(info.novelIntro);
  const summary = introFull || introShort;
  if (summary) manga.summary = summary;

  const tags = [];
  const seenTags = {};
  const addTag = (raw) => {
    const t = cleanText(raw);
    if (t && !seenTags[t]) {
      seenTags[t] = true;
      tags.push(t);
    }
  };
  String(info.novelClass || '')
    .split('-')
    .forEach(addTag);
  String(info.novelTags || '')
    .split(',')
    .forEach(addTag);
  if (tags.length > 0) manga.tags = tags;

  const step = String(info.novelStep || '');
  const status = step === '2' ? 'COMPLETED' : step === '1' ? 'ONGOING' : 'UNKNOWN';
  manga.status = status;
  manga.completed = status === 'COMPLETED';

  const chapters = Number(info.maxChapterId) || Number(info.novelChapterCount);
  if (Number.isFinite(chapters) && chapters > 0) manga.chapters = chapters;

  const rating = parseScore(info.novelReviewScore);
  if (rating !== undefined) manga.rating = rating;

  const views = parseChineseCount(info.novelbefavoritedcount);
  if (views !== undefined) manga.views = views;

  return manga;
}

const HYDRATE_POOL = 10;

async function settleInPool(items, worker, width) {
  const out = new Array(items.length);
  let next = 0;
  const lanes = Math.min(width, items.length);
  const runners = [];

  for (let lane = 0; lane < lanes; lane += 1) {
    runners.push(
      (async () => {
        for (;;) {
          const i = next;
          next += 1;
          if (i >= items.length) return;
          try {
            out[i] = { status: 'fulfilled', value: await worker(items[i]) };
          } catch (e) {
            out[i] = { status: 'rejected', reason: e };
          }
        }
      })()
    );
  }

  await Promise.all(runners);
  return out;
}

class Source {
  getSourceFeeds() {
    return FEED_GENRES.map((id) => ({ id, name: GENRE_LABELS[id] || id }));
  }

  async getSearchTags() {
    return Object.keys(GENRE_LABELS).map((id) => ({ id, label: GENRE_LABELS[id] }));
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') {
      return { results: [] };
    }

    const query = ((request && request.title) || '').trim();
    const page = (metadata && metadata.page) || 1;

    try {
      let novelIds = [];
      let hasMore = false;

      if (query) {
        if (page > 1) return { results: [] };
        const url = `${SEARCH_URL}?${qs({ action: 'search', keywords: query, type: 1 })}`;
        const data = await this.requestJSON(url);
        const rows = Array.isArray(data && data.data) ? data.data : [];
        novelIds = rows.map((r) => String(r.novelid)).filter(Boolean);
        hasMore = false;
      } else {
        const tagId = request && request.includedTags && request.includedTags[0] && request.includedTags[0].id;
        const lx = tagId || (request && request.feed) || '0';
        const url = `${SITE_BASE}/bookbase.php?${qs({ lx, page })}`;
        const html = await this.requestHTML(url);
        const seen = {};
        novelIds = [];
        const re = /novelid=(\d+)/g;
        let m;
        while ((m = re.exec(html))) {
          if (!seen[m[1]]) {
            seen[m[1]] = true;
            novelIds.push(m[1]);
          }
        }
        hasMore = novelIds.length > 0;
      }

      const settled = await settleInPool(novelIds, (id) => this.fetchNovelInfo(id), HYDRATE_POOL);

      const results = [];
      let lost = 0;
      for (const r of settled) {
        if (r.status === 'fulfilled' && r.value) {
          results.push(mapNovelInfo(r.value));
        } else {
          lost += 1;
          if (r.status === 'rejected') {
            console.error('JJWXC novel detail fetch failed:', r.reason);
          }
        }
      }
      if (lost) {
        console.warn(
          `JJWXC: ${lost} of ${novelIds.length} novel detail fetches failed, ` +
            `showing ${results.length} of ${novelIds.length} titles on page ${page}`
        );
      }

      const more = hasMore && lost === 0;
      return { results, metadata: more ? { page: page + 1 } : undefined };
    } catch (e) {
      console.error('JJWXC getSearchResults failed:', e);
      throw e;
    }
  }

  async getMangaDetails(mangaId) {
    const info = await this.fetchNovelInfo(mangaId);
    if (!info) {
      throw new Error('JJWXC: novel data not found (page structure may have changed)');
    }
    return { mangaInfo: mapNovelInfo(info) };
  }

  async getChapters(mangaId) {
    try {
      const url = `${API_BASE}/chapterlist?${qs({ novelId: mangaId })}`;
      const data = await this.requestJSON(url);
      const rows = Array.isArray(data && data.chapterlist) ? data.chapterlist : [];

      const nameById = {};
      rows.forEach((row) => {
        if (String(row.chaptertype) === '0' && row.chapterid) {
          const name = cleanText(row.chaptername);
          if (name) nameById[String(row.chapterid)] = name;
        }
      });

      let total = Number(data && data.count);
      if (!Number.isFinite(total) || total <= 0) {
        const info = await this.fetchNovelInfo(mangaId);
        total = (info && (Number(info.maxChapterId) || Number(info.novelChapterCount))) || 0;
      }

      const chapters = [];
      for (let i = 1; i <= total; i++) {
        const id = String(i);
        chapters.push({ id, chapterId: id, name: nameById[id] || `Chapter ${i}`, number: i });
      }
      return chapters;
    } catch (e) {
      console.error('JJWXC getChapters failed:', e);
      throw e;
    }
  }

  async getChapterDetails(mangaId, chapterId) {
    try {
      const url = `${API_BASE}/chaptercontent?${qs({ novelId: mangaId, chapterId })}`;
      const data = await this.requestJSON(url);
      const raw = data && typeof data.content === 'string' ? data.content : '';
      const text = raw ? decodeEntitiesDeep(raw) : LOCKED_CHAPTER_TEXT;
      return { id: chapterId, mangaId, pages: [], text };
    } catch (e) {
      console.error('JJWXC getChapterDetails failed:', e);
      throw e;
    }
  }

  async fetchNovelInfo(novelId) {
    const url = `${API_BASE}/novelbasicinfo?${qs({ novelId })}`;
    const data = await this.requestJSON(url);
    if (!data || !data.novelId) return null;
    return data;
  }

  async requestHTML(url) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`JJWXC HTTP ${response.status}`);
    }
    return response.data;
  }

  async requestJSON(url) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'application/json,text/plain' },
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`JJWXC HTTP ${response.status}`);
    }
    return JSON.parse(response.data);
  }
}

module.exports = { Source };
