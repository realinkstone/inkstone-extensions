const SITE_BASE = 'https://anime-sama.to';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function mapStatus(text) {
  const s = (text || '').toLowerCase();
  if (s.includes('cours')) return 'ONGOING';
  if (s.includes('termin') || s.includes('complet') || s.includes('fini')) return 'COMPLETED';
  if (s.includes('pause') || s.includes('hiatus')) return 'HIATUS';
  if (s.includes('annul') || s.includes('abandon') || s.includes('arrêt') || s.includes('arret')) return 'CANCELLED';
  return 'UNKNOWN';
}

function masterSlugFromHref(href) {
  const parts = (href || '').split('/').filter(Boolean);
  const idx = parts.indexOf('catalogue');
  if (idx === -1 || idx + 1 >= parts.length) return '';
  return parts[idx + 1].trim();
}

function hasNextPage(html, currentPage) {
  const start = html.indexOf('id="list_pagination"');
  if (start === -1) return false;
  const navEnd = html.indexOf('</nav>', start);
  const end = navEnd === -1 ? html.indexOf('</div>', start) : navEnd;
  const section = html.slice(start, end === -1 ? html.length : end);
  if (/rel="next"/.test(section)) return true;
  let max = 0;
  const re = /page=(\d+)/g;
  let m;
  while ((m = re.exec(section)) !== null) {
    const n = parseInt(m[1], 10);
    if (n > max) max = n;
  }
  return max > currentPage;
}

function fieldValue($, labels) {
  const wanted = Array.isArray(labels) ? labels : [labels];
  let found = '';
  $('dl.oe-infos').each((_, dl) => {
    if (found) return;
    const heading = cleanText($(dl).prev('.oe-sous-titre').text());
    if (/^anime/i.test(heading)) return;
    $(dl)
      .find('dt')
      .each((__, dt) => {
        if (found) return;
        if (wanted.includes(cleanText($(dt).text()))) {
          found = cleanText($(dt).next('dd').text());
        }
      });
  });
  return found;
}

function parseCatalogCards($) {
  const results = [];
  const seen = new Set();
  $('.as-carte').each((_, el) => {
    const card = $(el);
    const mangaId = masterSlugFromHref(card.attr('data-url') || card.find('a').first().attr('href'));
    if (!mangaId || seen.has(mangaId)) return;

    const title = cleanText(card.find('.as-carte-titre').first().text()) || cleanText(card.attr('data-nom'));
    if (!title) return;

    const image = (card.find('.as-carte-image img').first().attr('src') || card.attr('data-img') || '').trim();
    if (!image) return;

    const badges = cleanText(card.find('.as-badge').text());
    if (badges && !/Scans|Webtoon|Manga/.test(badges)) return;

    seen.add(mangaId);
    results.push({
      mangaId,
      title,
      image,
      webURL: `${SITE_BASE}/catalogue/${mangaId}/`,
      medium: 'comics',
    });
  });
  return results;
}

function parseLatestScanCards($) {
  const results = [];
  const seen = new Set();
  $('#containerAjoutsScans .as-carte').each((_, el) => {
    const card = $(el);
    const mangaId = masterSlugFromHref(card.attr('data-url') || card.find('a').first().attr('href'));
    if (!mangaId || seen.has(mangaId)) return;

    const title = cleanText(card.find('.as-carte-titre').first().text()) || cleanText(card.attr('data-nom'));
    if (!title) return;

    const image = (card.find('.as-carte-image img').first().attr('src') || card.attr('data-img') || '').trim();
    if (!image) return;

    seen.add(mangaId);

    const manga = {
      mangaId,
      title,
      image,
      webURL: `${SITE_BASE}/catalogue/${mangaId}/`,
      medium: 'comics',
    };

    const chapterText = cleanText(card.find('.as-carte-info > span:not(.as-carte-temps)').first().text());
    const numbers = chapterText.match(/\d+(?:\.\d+)?/g);
    if (numbers) manga.chapters = parseFloat(numbers[numbers.length - 1]);

    results.push(manga);
  });
  return results;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'latest', name: 'Latest' },
      { id: 'catalogue', name: 'Catalogue' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/catalogue/`);
      const $ = cheerio.load(html);
      const tags = [];
      const seen = new Set();
      $('input[name="genre[]"]').each((_, el) => {
        const id = ($(el).attr('value') || '').trim();
        if (!id || seen.has(id)) return;
        seen.add(id);
        const label = cleanText($(el).closest('label').find('span').first().text()) || id;
        tags.push({ id, label });
      });
      return tags;
    } catch (e) {
      console.error('Anime-Sama getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') {
      return { results: [] };
    }

    const query = ((request && request.title) || '').trim();
    const feed = (request && request.feed) || 'latest';
    const includedTags = (request && request.includedTags) || [];
    const page = (metadata && metadata.page) || 1;

    if (!query && feed === 'latest') {
      const html = await this.requestHTML(`${SITE_BASE}/`);
      const $ = cheerio.load(html);
      const results = parseLatestScanCards($);
      return { results, metadata: undefined };
    }

    const params = ['type%5B0%5D=Scans'];
    if (query) params.push(`search=${encodeURIComponent(query)}`);
    includedTags.forEach((t, i) => {
      if (t && t.id) params.push(`genre%5B${i}%5D=${encodeURIComponent(t.id)}`);
    });
    params.push(`page=${page}`);

    const url = `${SITE_BASE}/catalogue/?${params.join('&')}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const results = parseCatalogCards($);
    const hasNext = results.length > 0 && hasNextPage(html, page);

    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/catalogue/${encodeURIComponent(mangaId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const title = cleanText($('h1#titreOeuvre, h1.oe-titre').first().text()) || mangaId;
    const image = ($('meta[property="og:image"]').first().attr('content') || '').trim();

    const status = mapStatus(fieldValue($, 'Statut'));
    const author = fieldValue($, ['Auteur', 'Auteurs']);

    const desc = cleanText($('#synopsisText').text());

    const tags = [];
    $('.oe-genres .genre-pill').each((_, el) => {
      const t = cleanText($(el).text());
      if (t) tags.push(t);
    });

    const mangaInfo = {
      title,
      image,
      desc,
      status,
      tags,
      webURL: url,
      medium: 'comics',
    };
    if (author) mangaInfo.author = author;

    return { mangaInfo };
  }

  async resolveScanInfo(mangaId) {
    const masterUrl = `${SITE_BASE}/catalogue/${encodeURIComponent(mangaId)}/`;
    const masterHtml = await this.requestHTML(masterUrl);
    const scriptText = masterHtml.replace(/\/\*[\s\S]*?\*\//g, '');
    const editionMatch = scriptText.match(/panneauScan\(\s*"([^"]*)"\s*,\s*"([^"]*)"\s*\)/);
    if (!editionMatch) {
      throw new Error(`Anime-Sama: no scan edition found for "${mangaId}"`);
    }
    const scanPath = editionMatch[2];

    const scanUrl = `${SITE_BASE}/catalogue/${encodeURIComponent(mangaId)}/${scanPath}/`;
    const scanHtml = await this.requestHTML(scanUrl);
    const titleMatch = scanHtml.match(/<h([1-6]) id="titreOeuvre"[^>]*>([\s\S]*?)<\/h\1>/);
    const nomOeuvre = titleMatch ? titleMatch[2] : '';
    if (!nomOeuvre) {
      throw new Error(`Anime-Sama: could not read titreOeuvre for "${mangaId}"`);
    }

    return { nomOeuvre };
  }

  async getChapters(mangaId) {
    const { nomOeuvre } = await this.resolveScanInfo(mangaId);
    const data = await this.requestJSON(
      `${SITE_BASE}/s2/scans/get_nb_chap_et_img.php?oeuvre=${encodeURIComponent(nomOeuvre)}`,
    );

    const numbers = Object.keys(data || {})
      .map((k) => parseInt(k, 10))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);

    return numbers.map((n) => ({
      id: String(n),
      chapterId: String(n),
      name: `Chapitre ${n}`,
      number: n,
    }));
  }

  async getChapterDetails(mangaId, chapterId) {
    const { nomOeuvre } = await this.resolveScanInfo(mangaId);
    const data = await this.requestJSON(
      `${SITE_BASE}/s2/scans/get_nb_chap_et_img.php?oeuvre=${encodeURIComponent(nomOeuvre)}`,
    );

    const nbImages = data ? data[chapterId] : undefined;
    if (!nbImages) {
      throw new Error(`Anime-Sama: chapter "${chapterId}" not found for "${mangaId}"`);
    }

    const pages = [];
    for (let i = 1; i <= nbImages; i++) {
      pages.push(`${SITE_BASE}/s2/scans/${encodeURIComponent(nomOeuvre)}/${chapterId}/${i}.jpg`);
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

  async requestJSON(url) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`);
    }
    return JSON.parse(response.data);
  }
}

module.exports = { Source };
