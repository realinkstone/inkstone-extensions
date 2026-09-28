const SITE_BASE = 'https://yurimanga.net';

const PAGE_BATCH = 6;

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const PAGE_SIZE = 40;

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function mangaIdFromHref(href) {
  return (href || '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
}

function readerUrl(mangaId, page) {
  return `${SITE_BASE}/${encodeURIComponent(mangaId)}/${page}`;
}

function detailUrl(mangaId) {
  return `${SITE_BASE}/${encodeURIComponent(mangaId)}/`;
}

function isSoft404($) {
  return /^yurimanga\.net\s*::\s*404\s*not\s*found$/i.test(cleanText($('title').first().text()));
}

function pageImageSrc($) {
  const found = $('img')
    .toArray()
    .map((el) => ($(el).attr('src') || '').trim())
    .find((src) => /^https?:\/\/files\.yurimanga\.net\//i.test(src));
  return found || '';
}

function textOfNodes($, nodes) {
  return nodes.map((n) => $(n).text()).join('');
}

function parseReaderInfo($) {
  const span = $('span.tekst').first();
  const segments = [[]];
  span.contents().each((_, node) => {
    if (node.type === 'tag' && node.name === 'br') {
      segments.push([]);
    } else {
      segments[segments.length - 1].push(node);
    }
  });

  const title = cleanText(
    textOfNodes($, segments[0] || []).replace(/^\s*You are reading:\s*/i, ''),
  );

  const pageInfoText = cleanText(textOfNodes($, segments[1] || []));
  const totalMatch = pageInfoText.match(/out of\s+(\d+)/i);
  const totalPages = totalMatch ? parseInt(totalMatch[1], 10) : 1;

  const descText = cleanText(textOfNodes($, segments[2] || []));
  let desc = '';
  if (
    descText &&
    !/^Sorry but this doesnt have a description yet/i.test(descText) &&
    !/^View this manga/i.test(descText)
  ) {
    desc = descText;
  }

  const warnText = cleanText(textOfNodes($, segments[3] || []));
  const isAdult = /adult content/i.test(warnText);

  return { title, totalPages, desc, isAdult };
}

function toPartialManga(entry) {
  const manga = {
    mangaId: entry.mangaId,
    title: entry.title,
    webURL: detailUrl(entry.mangaId),
    medium: 'comics',
    chapters: 1,
  };
  if (entry.isAdult) manga.tags = ['Adult'];
  return manga;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'popular', name: 'Most Viewed' },
      { id: 'popular_adult', name: 'Most Viewed (18+)' },
      { id: 'all', name: 'All (A-Z)' },
    ];
  }

  getSearchTags() {
    return [{ id: 'adult', label: 'Adult (18+)' }];
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium === 'novel') return { results: [] };

    const query = ((request && request.title) || '').trim();
    const feed = (request && request.feed) || 'popular';
    const includedTags = (request && request.includedTags) || [];
    const excludedTags = (request && request.excludedTags) || [];
    const wantAdultOnly = includedTags.some((t) => t && t.id === 'adult');
    const wantNoAdult = excludedTags.some((t) => t && t.id === 'adult');

    if (query || feed === 'all' || wantAdultOnly || wantNoAdult) {
      const page = (metadata && metadata.page) || 1;
      let list = await this.getCatalog();

      if (query) {
        const q = query.toLowerCase();
        list = list.filter((entry) => entry.title.toLowerCase().includes(q));
      }
      if (wantAdultOnly) list = list.filter((entry) => entry.isAdult);
      if (wantNoAdult) list = list.filter((entry) => !entry.isAdult);

      const start = (page - 1) * PAGE_SIZE;
      const pageItems = list.slice(start, start + PAGE_SIZE);
      const hasNext = start + PAGE_SIZE < list.length;

      return {
        results: pageItems.map(toPartialManga),
        metadata: pageItems.length > 0 && hasNext ? { page: page + 1 } : undefined,
      };
    }

    if (metadata && metadata.page) return { results: [], metadata: undefined };

    const homeList = await this.getHomeList(feed === 'popular_adult' ? 'adult' : 'popular');
    return { results: homeList.map(toPartialManga), metadata: undefined };
  }

  async getCatalog() {
    const html = await this.requestHTML(`${SITE_BASE}/mangalist/`);
    const $ = cheerio.load(html);

    const results = [];
    const seen = new Set();
    $('a.entries[href]').each((_, el) => {
      const $a = $(el);
      const mangaId = mangaIdFromHref($a.attr('href'));
      if (!mangaId || seen.has(mangaId)) return;
      seen.add(mangaId);

      const isAdult = /Not suitable for work \(18\+\)/i.test($a.next('span.entries').text());

      results.push({ mangaId, title: mangaId.replace(/_/g, ' '), isAdult });
    });
    return results;
  }

  async getHomeList(kind) {
    const html = await this.requestHTML(SITE_BASE);
    const $ = cheerio.load(html);
    const lists = $('ul[style="font-size: 10pt;"]');
    const target = kind === 'adult' ? lists.eq(1) : lists.eq(0);

    const results = [];
    const seen = new Set();
    target.find('a').each((_, el) => {
      const mangaId = mangaIdFromHref($(el).attr('href'));
      if (!mangaId || seen.has(mangaId)) return;
      seen.add(mangaId);
      results.push({ mangaId, title: mangaId.replace(/_/g, ' '), isAdult: kind === 'adult' });
    });
    return results;
  }

  async getMangaDetails(mangaId) {
    const url = readerUrl(mangaId, 1);
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    if (isSoft404($)) throw new Error(`Yurimanga: no such entry "${mangaId}"`);

    const info = parseReaderInfo($);
    const image = pageImageSrc($);

    return {
      mangaInfo: {
        title: info.title || mangaId.replace(/_/g, ' '),
        image,
        desc: info.desc,
        status: 'UNKNOWN',
        tags: info.isAdult ? ['Adult'] : [],
        webURL: detailUrl(mangaId),
        medium: 'comics',
        chapters: 1,
      },
    };
  }

  async getChapters(mangaId) {
    return [{ id: mangaId, chapterId: mangaId, name: 'Read Online', number: 1 }];
  }

  async getChapterDetails(mangaId, chapterId) {
    const firstUrl = readerUrl(mangaId, 1);
    const firstHtml = await this.requestHTML(firstUrl);
    const $first = cheerio.load(firstHtml);
    if (isSoft404($first)) throw new Error(`Yurimanga: no such entry "${mangaId}"`);

    const info = parseReaderInfo($first);
    const totalPages = info.totalPages > 0 ? info.totalPages : 1;

    const pages = new Array(totalPages).fill('');
    pages[0] = pageImageSrc($first);

    let pending = [];
    for (let p = 2; p <= totalPages; p++) pending.push(p);

    for (let round = 0; round < 2 && pending.length; round += 1) {
      const width = round === 0 ? PAGE_BATCH : 1;
      const failed = [];
      for (let i = 0; i < pending.length; i += width) {
        await Promise.all(
          pending.slice(i, i + width).map(async (p) => {
            try {
              const html = await this.requestHTML(readerUrl(mangaId, p));
              const $page = cheerio.load(html);
              const src = pageImageSrc($page);
              if (!src) throw new Error(`no page image found on ${readerUrl(mangaId, p)}`);
              pages[p - 1] = src;
            } catch (e) {
              console.error(`Yurimanga getChapterDetails page ${p} failed: ` + (e && e.message));
              failed.push(p);
            }
          }),
        );
      }
      pending = failed.sort((a, b) => a - b);
    }

    const missing = [];
    for (let i = 0; i < pages.length; i += 1) if (!pages[i]) missing.push(i + 1);
    if (missing.length) {
      throw new Error(
        `Yurimanga: ${missing.length} of ${totalPages} pages of ${mangaId}/${chapterId} ` +
          `could not be loaded after a retry (pages ${missing.join(', ')})`
      );
    }

    return { id: chapterId, mangaId, pages };
  }

  async requestHTML(url) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA },
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.data;
  }
}

module.exports = { Source };
