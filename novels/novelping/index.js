const SITE = 'https://novelping.com';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const PARALLEL = 12;
const ENOUGH = 8;
const MAX_LIST_PAGES = 3;
const SEEN_KEPT = 120;

const FEEDS = [
  { id: 'updates', name: 'Latest Updates' },
  { id: 'hot', name: 'Hot' },
  { id: 'popular', name: 'Popular' },
  { id: 'complete', name: 'Completed' },
];

const GENRE_SLUGS = [
  'action', 'adventure', 'anime-&-comics', 'comedy', 'drama', 'eastern', 'fan-fic', 'fan-fiction', 'fantasy', 'game', 'gender-bender', 'general', 'harem', 'historical', 'horror',
  'isekai', 'josei', 'litrpg', 'magic', 'magical-realism', 'martial-arts', 'mature', 'mecha', 'military', 'modern-life', 'mystery', 'psychological', 'realistic', 'reincarnation',
  'romance', 'school-life', 'sci-fi', 'seinen', 'shoujo', 'shoujo-ai', 'shounen', 'shounen-ai', 'slice-of-life', 'smut', 'sports', 'supernatural', 'system', 'thriller', 'tragedy',
  'urban', 'video-games', 'war', 'wuxia', 'xianxia', 'xuanhuan', 'yaoi', 'yuri', 'adult', 'ecchi', 'lgbt+',
];

const GENRES_18 = ['smut'];
const GENRES_16 = ['adult', 'mature', 'ecchi'];
const TAG_18 = /^(r-?18|incest|[a-z-]*-incest|anal|rape|[a-z-]*-rape|bdsm|hentai|erotica|lemon|nsfw|porn[a-z-]*|explicit[a-z-]*|sex-slaves?|sexual-abuse|sexual-assault|sexual-content|sex-scenes?|graphic-sex[a-z-]*)$/;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '...', ldquo: '"', rdquo: '"', lsquo: "'", rsquo: "'", ndash: '-', mdash: '-' };

function decode(text) {
  return String(text || '')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => (ENTITIES[n.toLowerCase()] !== undefined ? ENTITIES[n.toLowerCase()] : m));
}

function oneLine(text) {
  return decode(String(text || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function enc(text) {
  return encodeURIComponent(String(text));
}

function piece(text) {
  const raw = String(text || '');
  try {
    return encodeURIComponent(decodeURIComponent(raw));
  } catch (e) {
    return encodeURIComponent(raw);
  }
}

function slugFromHref(href, marker) {
  const at = String(href || '').indexOf(marker);
  if (at < 0) return '';
  const rest = String(href).slice(at + marker.length).split(/[?#]/)[0];
  try {
    return decodeURIComponent(rest);
  } catch (e) {
    return rest;
  }
}

function labelOf(slug) {
  const words = String(slug).replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function mapStatus(text) {
  const s = String(text || '').toLowerCase();
  if (s.indexOf('ongoing') >= 0) return 'ONGOING';
  if (s.indexOf('complete') >= 0) return 'COMPLETED';
  if (s.indexOf('hiatus') >= 0) return 'HIATUS';
  if (s.indexOf('drop') >= 0 || s.indexOf('cancel') >= 0) return 'CANCELLED';
  return 'UNKNOWN';
}

function ageOf(genres, tags) {
  if (genres.some((g) => GENRES_18.indexOf(g) >= 0) || tags.some((t) => TAG_18.test(t))) return 18;
  if (genres.some((g) => GENRES_16.indexOf(g) >= 0)) return 16;
  return 0;
}

function pageGenres(html) {
  const out = [];
  const re = /<meta itemprop="genre" content="[^"]*\/novelping-genres\/([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) out.push(decode(m[1]).toLowerCase());
  return out;
}

function pageTags(html) {
  const out = [];
  const at = html.indexOf('class="tag-container');
  if (at < 0) return out;
  let end = html.indexOf('</div>', at);
  if (end < 0) end = Math.min(html.length, at + 20000);
  const re = /href="[^"]*\/tag\/([^"?#]+)"/g;
  const part = html.slice(at, end);
  let m;
  while ((m = re.exec(part))) out.push(slugFromHref('/tag/' + m[1], '/tag/').toLowerCase());
  return out;
}

function listSlice(html) {
  const mark = html.indexOf('class="list list-novel col-xs-12"');
  if (mark < 0) return '';
  const start = Math.max(0, html.lastIndexOf('<div', mark));
  let end = html.indexOf('pagination-container', mark);
  if (end < 0) end = html.length;
  return html.slice(start, end);
}

function cardImage(src) {
  const s = decode(src || '').trim();
  if (s.indexOf('/novel_80_113/') >= 0) return s.replace('/novel_80_113/', '/novel_164_245/');
  return s;
}

function parseCards(html) {
  const $ = cheerio.load(listSlice(html));
  const cards = [];
  const seen = new Set();
  $('.row').each((i, el) => {
    const link = $(el).find('h3.novel-title a').first();
    const slug = slugFromHref(link.attr('href'), '/book/');
    const title = oneLine(link.attr('title') || link.text());
    if (!slug || !title || seen.has(slug)) return;
    seen.add(slug);
    const card = {
      mangaId: slug,
      title,
      image: cardImage($(el).find('img').first().attr('src')),
      medium: 'novel',
      webURL: `${SITE}/book/${piece(slug)}`,
    };
    const author = oneLine($(el).find('.author').first().text());
    if (author) card.author = author;
    cards.push(card);
  });
  return cards;
}

function lastPage(html) {
  const at = html.indexOf('<li class="last');
  if (at < 0) return 1;
  const m = html.slice(at, at + 400).match(/[?&](?:amp;)?page(?:=|&#x3D;|&#61;)(\d+)/);
  return m ? Number(m[1]) : 1;
}

function describe($, root) {
  const rows = [];
  root.find('p').each((i, el) => {
    const t = oneLine($(el).text());
    if (t) rows.push(t);
  });
  if (!rows.length) return oneLine(root.text());
  let out = rows[0];
  for (let i = 1; i < rows.length; i++) {
    const open = !/[.!?\u2026"\u201d\u2019)\]]$/.test(out) || /^[\u2013\u2014-]|^[a-z]/.test(rows[i]);
    out += (open ? ' ' : '\n\n') + rows[i];
  }
  return out;
}

const BLOCKS = /^(p|div|blockquote|pre|h[1-6]|ul|ol|li|table|tr|section|article|center)$/;

function chapterText(html) {
  const mark = html.indexOf('id="chr-content"');
  if (mark < 0) return null;
  const start = Math.max(0, html.lastIndexOf('<div', mark));
  let end = html.indexOf('class="chr-end"', mark);
  if (end < 0) end = Math.min(html.length, mark + 600000);
  const $ = cheerio.load(html.slice(start, end));
  const root = $('#chr-content').first();
  if (!root.length) return null;
  root.find('script, style, iframe, noscript, ins, .free-support-top, [id^="bg-ssp"]').remove();
  root.find('[hidden], [style*="display:none"], [style*="display: none"], [style*="visibility:hidden"], [style*="visibility: hidden"]').remove();
  root.find('br').replaceWith('\n');
  const blocks = [];
  let inline = '';
  const flush = () => {
    const t = tidy(inline);
    if (t) blocks.push(t);
    inline = '';
  };
  const walk = (node) => {
    $(node)
      .contents()
      .each((i, el) => {
        if (el.type === 'text') {
          inline += el.data;
        } else if (el.type === 'tag') {
          if (el.name === 'hr') {
            flush();
            blocks.push('* * *');
          } else if (BLOCKS.test(el.name)) {
            flush();
            if (el.name === 'p' || el.name === 'pre' || /^h[1-6]$/.test(el.name) || el.name === 'li') {
              const t = tidy($(el).text());
              if (t) blocks.push(t);
            } else {
              walk(el);
              flush();
            }
          } else {
            inline += $(el).text();
          }
        }
      });
  };
  walk(root);
  flush();
  return blocks.join('\n\n');
}

function tidy(text) {
  return String(text || '')
    .replace(/[\u00a0\u2000-\u200a\u202f\u205f\u3000]/g, ' ')
    .replace(/[\u200b-\u200d\u2060\ufeff]/g, '')
    .split('\n')
    .map((line) => line.replace(/[ \t\r\f\v]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.ages = new Map();
    this.genres = null;
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async load(path) {
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      last = await this.requests.schedule(App.createRequest({ url: `${SITE}${path}`, method: 'GET', headers: { 'User-Agent': UA, Accept: 'text/html' } }));
      if (last.status < 502 || last.status > 504) return last;
    }
    return last;
  }

  async page(path) {
    const response = await this.load(path);
    if (response.status === 404) return null;
    if (response.status < 200 || response.status >= 300) throw new Error(`NovelPing: HTTP ${response.status}`);
    return String(response.data || '');
  }

  async getSearchTags() {
    if (!this.genres) {
      const found = [];
      const seen = new Set();
      try {
        const html = await this.page('/');
        const re = /<a[^>]*href="(?:https:\/\/novelping\.com)?\/novelping-genres\/([^"?#]+)"[^>]*>\s*([^<]+?)\s*<\/a>/g;
        let m;
        while (html && (m = re.exec(html))) {
          const slug = slugFromHref('/novelping-genres/' + decode(m[1]), '/novelping-genres/').toLowerCase();
          const label = oneLine(m[2]);
          if (slug && label && !seen.has(slug)) {
            seen.add(slug);
            found.push({ id: slug, label });
          }
        }
      } catch (e) {
        console.error('NovelPing genre list failed: ' + (e && e.message));
      }
      this.genres = found.length >= 20 ? found : GENRE_SLUGS.map((slug) => ({ id: slug, label: labelOf(slug) }));
    }
    return this.genres;
  }

  async ageOfTitle(slug) {
    if (this.ages.has(slug)) return this.ages.get(slug);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const html = await this.page(`/book/${piece(slug)}`);
        if (html) {
          const age = ageOf(pageGenres(html), pageTags(html));
          if (this.ages.size > 5000) this.ages.clear();
          this.ages.set(slug, age);
          return age;
        }
      } catch (e) {
        console.error('NovelPing rating read failed: ' + (e && e.message));
      }
    }
    return 16;
  }

  async rate(cards) {
    for (let i = 0; i < cards.length; i += PARALLEL) {
      const group = cards.slice(i, i + PARALLEL);
      const ages = await Promise.all(group.map((c) => this.ageOfTitle(c.mangaId)));
      group.forEach((c, n) => {
        c.ageRating = ages[n];
      });
    }
  }

  async listAddress(request, page) {
    const query = oneLine(request && request.title);
    const tags = (Array.isArray(request && request.includedTags) ? request.includedTags : []).map((t) => String((t && (t.id || t.label)) || t || '')).filter(Boolean);
    const paging = page > 1 ? `page=${page}` : '';
    if (query) return `/search?keyword=${enc(query)}${paging ? '&' + paging : ''}`;
    if (tags.length) {
      const known = await this.getSearchTags();
      const wanted = tags[0].toLowerCase();
      const hit = known.find((g) => g.id === wanted || g.label.toLowerCase() === wanted);
      const slug = hit ? hit.id : wanted.replace(/\s+/g, '-');
      return `/novelping-genres/${enc(slug)}${paging ? '?' + paging : ''}`;
    }
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    return `/sort/${feed.id}${paging ? '?' + paging : ''}`;
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') return { results: [] };
    let page = (metadata && metadata.page) || 1;
    const seen = new Set(Array.isArray(metadata && metadata.seen) ? metadata.seen : []);
    const cards = [];
    let more = false;
    for (let fetched = 0; fetched < MAX_LIST_PAGES; fetched++) {
      const html = await this.page(await this.listAddress(request, page));
      if (!html) {
        more = false;
        break;
      }
      const all = parseCards(html);
      all.forEach((c) => {
        if (!seen.has(c.mangaId)) {
          seen.add(c.mangaId);
          cards.push(c);
        }
      });
      more = all.length > 0 && page < lastPage(html);
      page++;
      if (!more || cards.length >= ENOUGH) break;
    }
    await this.rate(cards);
    return { results: cards, metadata: more ? { page, seen: Array.from(seen).slice(-SEEN_KEPT) } : undefined };
  }

  async getMangaDetails(mangaId) {
    const html = await this.page(`/book/${piece(mangaId)}`);
    if (!html) throw new Error('NovelPing: this title was not found (HTTP 404)');
    const start = html.indexOf('id="novel"');
    if (start < 0) throw new Error('NovelPing: the title page has no details (the layout changed?)');
    let end = html.indexOf('id="tab-chapters"', start);
    if (end < 0) end = Math.min(html.length, start + 90000);
    const $ = cheerio.load(html.slice(start, end));
    const title = oneLine($('.col-info-desc h3.title').first().text());
    if (!title) throw new Error('NovelPing: the title page has no name (the layout changed?)');
    const meta = {};
    $('ul.info-meta li').each((i, el) => {
      const key = oneLine($(el).find('h3').first().text()).replace(/:$/, '').toLowerCase();
      if (key) meta[key] = $(el);
    });
    const tags = [];
    if (meta.genre) {
      meta.genre.find('a').each((i, el) => {
        const t = oneLine($(el).text());
        if (t && tags.indexOf(t) < 0) tags.push(t);
      });
    }
    const slugs = pageGenres(html);
    const age = ageOf(slugs, pageTags(html));
    this.ages.set(mangaId, age);
    const status = mapStatus(meta.status ? oneLine(meta.status.text()) : '');
    const image = ($('meta[itemprop="image"]').attr('content') || $('.info-holder img').first().attr('src') || '').trim();
    const info = {
      title,
      image: decode(image),
      desc: describe($, $('#novel-description-content').first()) || undefined,
      status,
      tags,
      webURL: `${SITE}/book/${piece(mangaId)}`,
      medium: 'novel',
      completed: status === 'COMPLETED',
      ageRating: age,
    };
    const author = meta.author ? oneLine(meta.author.find('a').first().text() || meta.author.text().replace(/^[^:]*:/, '')) : '';
    if (author) info.author = author;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const response = await this.load(`/ajax/chapter-archive?novelId=${enc(mangaId)}`);
    if (response.status < 200 || response.status >= 300) throw new Error(`NovelPing: the chapter list answered HTTP ${response.status}`);
    const html = String(response.data || '');
    if (html.indexOf('data-chapter-item-template') < 0) throw new Error('NovelPing: the chapter list has an unexpected shape (the layout changed?)');
    const rows = /<li data-chapter-item data-chapter-id="([^"]*)"[^>]*>\s*<span[^>]*><\/span>\s*<a href="([^"]*)" title="([^"]*)"/g;
    const declared = (html.match(/<li data-chapter-item /g) || []).length;
    const chapters = [];
    const seen = new Set();
    let matched = 0;
    let m;
    while ((m = rows.exec(html))) {
      matched++;
      const id = decode(m[1]).trim() || slugFromHref(m[2], '/book/').split('/').slice(1).join('/');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      chapters.push({ id, chapterId: id, name: oneLine(m[3]) || `Chapter ${chapters.length + 1}`, number: chapters.length + 1 });
    }
    if (matched !== declared) throw new Error(`NovelPing: only ${matched} of ${declared} chapter rows could be read (the layout changed?)`);
    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    const html = await this.page(`/book/${piece(mangaId)}/${piece(chapterId)}`);
    if (!html) throw new Error('NovelPing: this chapter was not found (HTTP 404)');
    const text = chapterText(html);
    if (text === null) throw new Error('NovelPing: the chapter page has no text block (the chapter was removed or the layout changed)');
    if (!text) throw new Error('NovelPing has no text for this chapter yet');
    return { id: chapterId, mangaId, pages: [], text };
  }
}

module.exports = { Source };
