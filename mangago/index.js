const SITE_BASE = 'https://www.mangago.me';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEED_URLS = {
  popular: (page) => `${SITE_BASE}/genre/all/${page}/?f=1&o=1&sortby=view&e=`,
  latest: (page) => `${SITE_BASE}/genre/all/${page}/?f=1&o=1&sortby=update_date&e=`,
  new: (page) => `${SITE_BASE}/list/new/all/${page}/`,
  updates: (page) => `${SITE_BASE}/list/latest/all/${page}/`,
};

const GENRE_SORTBY = { popular: 'view', latest: 'update_date' };
const GENRE_SORTBY_DEFAULT = 'view';

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

function normalizeWhitespace(str) {
  return (str || '').replace(/\s+/g, ' ').trim();
}

function normalizeLine(str) {
  return (str || '').replace(/[ \t]+/g, ' ').trim();
}

function extractDesc(box) {
  if (!box || box.length === 0) return '';
  const clone = box.clone();
  clone.find('br').replaceWith('\n');
  const raw = clone.text();
  const lines = raw.split('\n').map(normalizeLine);

  const collapsed = [];
  let prevBlank = false;
  for (const line of lines) {
    const isBlank = line === '';
    if (isBlank && prevBlank) continue;
    collapsed.push(line);
    prevBlank = isBlank;
  }
  while (collapsed.length && collapsed[0] === '') collapsed.shift();
  while (collapsed.length && collapsed[collapsed.length - 1] === '') collapsed.pop();
  return collapsed.join('\n');
}

const AES_SBOX = [
  0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
  0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
  0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
  0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
  0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
  0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
  0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
  0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
  0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
  0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
  0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
  0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
  0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
  0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
  0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
  0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16,
];
const AES_INV_SBOX = new Array(256);
for (let i = 0; i < 256; i++) AES_INV_SBOX[AES_SBOX[i]] = i;
const AES_RCON = [0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80,0x1b,0x36,0x6c,0xd8,0xab,0x4d];

function gmul(a, b) {
  let p = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 1) p ^= a;
    const hiBitSet = a & 0x80;
    a = (a << 1) & 0xff;
    if (hiBitSet) a ^= 0x1b;
    b >>= 1;
  }
  return p;
}

function aesKeyExpansion(key) {
  const Nk = key.length / 4;
  const Nr = Nk + 6;
  const w = new Array((Nr + 1) * 4);
  for (let i = 0; i < Nk; i++) w[i] = [key[4*i], key[4*i+1], key[4*i+2], key[4*i+3]];
  for (let i = Nk; i < w.length; i++) {
    let temp = w[i-1].slice();
    if (i % Nk === 0) {
      temp = [temp[1], temp[2], temp[3], temp[0]];
      temp = temp.map((b) => AES_SBOX[b]);
      temp[0] ^= AES_RCON[i / Nk - 1];
    } else if (Nk > 6 && i % Nk === 4) {
      temp = temp.map((b) => AES_SBOX[b]);
    }
    w[i] = w[i-Nk].map((b, idx) => b ^ temp[idx]);
  }
  const roundKeys = [];
  for (let r = 0; r <= Nr; r++) {
    const rk = [];
    for (let c = 0; c < 4; c++) rk.push(...w[r*4+c]);
    roundKeys.push(rk);
  }
  return { roundKeys, Nr };
}

function aesAddRoundKey(state, roundKey) {
  for (let i = 0; i < 16; i++) state[i] ^= roundKey[i];
}
function aesInvSubBytes(state) {
  for (let i = 0; i < 16; i++) state[i] = AES_INV_SBOX[state[i]];
}
function aesInvShiftRows(state) {
  const s = state.slice();
  for (let row = 1; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      state[col*4+row] = s[((col - row + 4) % 4)*4+row];
    }
  }
}
function aesInvMixColumns(state) {
  for (let col = 0; col < 4; col++) {
    const a0 = state[col*4+0], a1 = state[col*4+1], a2 = state[col*4+2], a3 = state[col*4+3];
    state[col*4+0] = gmul(a0,0x0e) ^ gmul(a1,0x0b) ^ gmul(a2,0x0d) ^ gmul(a3,0x09);
    state[col*4+1] = gmul(a0,0x09) ^ gmul(a1,0x0e) ^ gmul(a2,0x0b) ^ gmul(a3,0x0d);
    state[col*4+2] = gmul(a0,0x0d) ^ gmul(a1,0x09) ^ gmul(a2,0x0e) ^ gmul(a3,0x0b);
    state[col*4+3] = gmul(a0,0x0b) ^ gmul(a1,0x0d) ^ gmul(a2,0x09) ^ gmul(a3,0x0e);
  }
}
function aesDecryptBlock(block, roundKeys, Nr) {
  const state = block.slice();
  aesAddRoundKey(state, roundKeys[Nr]);
  for (let round = Nr - 1; round >= 1; round--) {
    aesInvShiftRows(state);
    aesInvSubBytes(state);
    aesAddRoundKey(state, roundKeys[round]);
    aesInvMixColumns(state);
  }
  aesInvShiftRows(state);
  aesInvSubBytes(state);
  aesAddRoundKey(state, roundKeys[0]);
  return state;
}

function aesCbcDecryptZeroPad(ciphertext, key, iv) {
  const { roundKeys, Nr } = aesKeyExpansion(Array.from(key));
  const out = new Uint8Array(ciphertext.length);
  let prevBlock = Array.from(iv);
  for (let off = 0; off + 16 <= ciphertext.length; off += 16) {
    const block = Array.from(ciphertext.slice(off, off + 16));
    const decrypted = aesDecryptBlock(block, roundKeys, Nr);
    for (let i = 0; i < 16; i++) out[off + i] = decrypted[i] ^ prevBlock[i];
    prevBlock = block;
  }
  let end = out.length;
  while (end > 0 && out[end - 1] === 0) end--;
  return out.slice(0, end);
}

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = {};
for (let i = 0; i < B64_ALPHABET.length; i++) B64_LOOKUP[B64_ALPHABET[i]] = i;

function base64ToBytes(b64) {
  const clean = (b64 || '').replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = [];
  for (let i = 0; i < clean.length; i += 4) {
    const e0 = B64_LOOKUP[clean[i]] || 0;
    const e1 = B64_LOOKUP[clean[i+1]] || 0;
    const e2 = clean[i+2] !== undefined ? B64_LOOKUP[clean[i+2]] : undefined;
    const e3 = clean[i+3] !== undefined ? B64_LOOKUP[clean[i+3]] : undefined;
    bytes.push((e0 << 2) | (e1 >> 4));
    if (e2 !== undefined) bytes.push(((e1 & 0x0f) << 4) | (e2 >> 2));
    if (e3 !== undefined) bytes.push(((e2 & 0x03) << 6) | e3);
  }
  return new Uint8Array(bytes);
}

function hexToBytes(hex) {
  const clean = hex.length % 2 === 0 ? hex : '0' + hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

function bytesToUtf8(bytes) {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i++];
    if (b0 < 0x80) {
      out += String.fromCharCode(b0);
    } else if ((b0 >> 5) === 0b110 && i < bytes.length) {
      const b1 = bytes[i++];
      out += String.fromCharCode(((b0 & 0x1f) << 6) | (b1 & 0x3f));
    } else if ((b0 >> 4) === 0b1110 && i + 1 < bytes.length) {
      const b1 = bytes[i++], b2 = bytes[i++];
      out += String.fromCharCode(((b0 & 0x0f) << 12) | ((b1 & 0x3f) << 6) | (b2 & 0x3f));
    } else {
      out += String.fromCharCode(b0);
    }
  }
  return out;
}

function sojsonV4Decode(jsf) {
  if (!jsf || jsf.indexOf("['sojson.v4']") !== 0) return '';
  const slice = jsf.substring(240, jsf.length - 59);
  const tokens = slice.split(/[a-zA-Z]+/);
  let out = '';
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t) continue;
    const code = parseInt(t, 10);
    if (!isNaN(code)) out += String.fromCharCode(code);
  }
  return out;
}

function findHexEncodedVariable(js, name) {
  const re = new RegExp('var ' + name + '\\s*=\\s*CryptoJS\\.enc\\.Hex\\.parse\\("([0-9a-zA-Z]+)"\\)');
  const m = js.match(re);
  return m ? m[1] : '';
}

function unscrambleImageList(imageList, chapterJs) {
  const locMatches = chapterJs.match(/str\.charAt\(\s*\d+\s*\)/g) || [];
  const keyLocations = [];
  const seen = {};
  for (const m of locMatches) {
    const n = parseInt(m.match(/\d+/)[0], 10);
    if (!seen[n]) { seen[n] = true; keyLocations.push(n); }
  }
  if (keyLocations.length === 0) return imageList;

  const unscrambleKey = keyLocations.map((loc) => parseInt(imageList.charAt(loc), 10));
  if (unscrambleKey.some((n) => isNaN(n))) return imageList;

  const chars = imageList.split('');
  keyLocations.forEach((loc, idx) => { chars.splice(loc - idx, 1); });

  let s = chars;
  const reversedKeys = unscrambleKey.slice().reverse();
  for (const key of reversedKeys) {
    for (let i = s.length - 1; i >= key; i--) {
      if (i % 2 !== 0) {
        const tmp = s[i - key];
        s[i - key] = s[i];
        s[i] = tmp;
      }
    }
  }
  return s.join('');
}

function mapStatus(raw) {
  const s = (raw || '').toLowerCase();
  if (s.indexOf('ongoing') !== -1) return 'ONGOING';
  if (s.indexOf('completed') !== -1 || s.indexOf('ended') !== -1) return 'COMPLETED';
  if (s.indexOf('hiatus') !== -1) return 'HIATUS';
  if (s.indexOf('cancel') !== -1 || s.indexOf('dropped') !== -1) return 'CANCELLED';
  return 'UNKNOWN';
}

function parseChapterNumber(name) {
  const m = (name || '').match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

function imageFromEl($, img) {
  if (!img || img.length === 0) return '';
  let src =
    img.attr('data-cfsrc') ||
    img.attr('data-src') ||
    img.attr('data-lazy-src') ||
    '';
  if (!src) {
    const srcset = img.attr('srcset');
    if (srcset) src = srcset.split(',')[0].trim().split(/\s+/)[0] || '';
  }
  if (!src) src = img.attr('src') || '';
  src = src.trim();
  if (src && src.indexOf('data:image') === 0) return '';
  if (src && src.indexOf('http') !== 0) {
    src = src.indexOf('/') === 0 ? `${SITE_BASE}${src}` : `${SITE_BASE}/${src}`;
  }
  return src;
}

function extractMangaId(href) {
  const m = (href || '').match(/\/read-manga\/([^/?#]+)/);
  return m ? m[1] : '';
}

function extractChapterPath(href, mangaId) {
  const escaped = mangaId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('/read-manga/' + escaped + '/(.+?)/pg-\\d+/?(?:$|[?#])');
  const m = (href || '').match(re);
  if (m) return m[1];
  const re2 = new RegExp('/read-manga/' + escaped + '/(.+?)/?(?:$|[?#])');
  const m2 = (href || '').match(re2);
  return m2 ? m2[1] : '';
}

function parseMangaListPage($) {
  const results = [];
  $('.thm-effect').each((_, el) => {
    const card = $(el);
    const href = card.attr('href') || '';
    const mangaId = extractMangaId(href);
    if (!mangaId) return;
    const title = normalizeWhitespace(card.attr('title') || card.find('img').first().attr('alt') || '');
    if (!title) return;
    const image = imageFromEl($, card.find('img').first());
    results.push({
      mangaId,
      title,
      image,
      webURL: `${SITE_BASE}/read-manga/${mangaId}/`,
      medium: 'comics',
    });
  });
  return results;
}

function hasNextPage($) {
  return $('.current+li > a').length > 0;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'popular', name: 'Popular' },
      { id: 'latest', name: 'Latest Updates' },
      { id: 'new', name: 'New Manga' },
      { id: 'updates', name: 'Recently Updated' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/genre/all/`);
      const $ = cheerio.load(html);
      const tags = [];
      const seen = {};
      $('#genre_panel .genre_select_div[_id]').each((_, el) => {
        const id = $(el).attr('_id') || '';
        if (!id || seen[id]) return;
        seen[id] = true;
        const label = normalizeWhitespace($(el).text()).replace(/\s*\[\d+\]\s*$/, '');
        if (label) tags.push({ id, label });
      });
      return tags;
    } catch (e) {
      console.error('MangaGo getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium === 'novel') return { results: [] };

    const query = (request && request.title) || '';
    const feed = (request && request.feed) || 'popular';
    const includedTags = (request && request.includedTags) || [];
    const excludedTags = (request && request.excludedTags) || [];
    const page = (metadata && metadata.page) || 1;

    let url;
    if (query) {
      url = `${SITE_BASE}/r/l_search?${qs({ name: query, page })}`;
    } else if (includedTags.length > 0) {
      const included = includedTags.map((t) => encodeURIComponent(t.id)).join(',');
      const excluded = excludedTags.map((t) => encodeURIComponent(t.id)).join(',');
      const sortby = GENRE_SORTBY[feed] || GENRE_SORTBY_DEFAULT;
      url = `${SITE_BASE}/genre/${included}/${page}/?f=1&o=1&sortby=${sortby}&e=${excluded}`;
    } else {
      const build = FEED_URLS[feed] || FEED_URLS.popular;
      url = build(page);
    }

    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const results = parseMangaListPage($);
    const hasNext = results.length > 0 && hasNextPage($);
    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/read-manga/${encodeURIComponent(mangaId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const title = normalizeWhitespace($('.w-title h1').first().text()) || mangaId;
    const info = $('#information');
    const image = imageFromEl($, info.find('img').first());

    let desc = extractDesc(info.find('.manga_summary').first());

    let author;
    let status = 'UNKNOWN';
    const tags = [];

    info.find('.manga_info li, .manga_right tr').each((_, el) => {
      const row = $(el);
      const label = normalizeWhitespace(row.find('b, label').first().text()).toLowerCase();
      if (!label) return;

      if (label.indexOf('alternative') === 0) {
        const raw = normalizeWhitespace(row.text()).replace(/^alternative:?/i, '').trim();
        if (raw) desc = desc ? `${desc}\n\nAlternative Names: ${raw}` : `Alternative Names: ${raw}`;
      } else if (label.indexOf('status') === 0) {
        status = mapStatus(row.find('span').first().text());
      } else if (label.indexOf('author') === 0) {
        const names = row.find('a').map((_i, a) => normalizeWhitespace($(a).text())).get().filter(Boolean);
        if (names.length) author = names.join(', ');
      } else if (label.indexOf('genre') === 0) {
        row.find('a').each((_i, a) => {
          const g = normalizeWhitespace($(a).text());
          if (g) tags.push(g);
        });
      }
    });

    return {
      mangaInfo: {
        title,
        image,
        author,
        desc,
        status,
        tags,
        webURL: url,
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    const url = `${SITE_BASE}/read-manga/${encodeURIComponent(mangaId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const chapters = [];
    const seen = {};
    $('#chapter_table > tbody > tr, #raws_table > tbody > tr, table.uk-table > tbody > tr').each((_, el) => {
      const row = $(el);
      const link = row.find('a.chico').first();
      const href = link.attr('href') || '';
      if (!href) return;

      const chapterPath = extractChapterPath(href, mangaId);
      if (!chapterPath || seen[chapterPath]) return;
      seen[chapterPath] = true;

      const name = normalizeWhitespace(link.text());
      if (!name) return;

      const group = normalizeWhitespace(row.find('td.no a').first().text()) || undefined;
      const dateText = normalizeWhitespace(row.find('td:last-child').text());
      const time = Date.parse(dateText);

      const chapter = {
        id: chapterPath,
        chapterId: chapterPath,
        name,
        number: parseChapterNumber(name),
        group,
      };
      if (!isNaN(time)) chapter.time = time;
      chapters.push(chapter);
    });
    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    const firstPageUrl = `${SITE_BASE}/read-manga/${encodeURIComponent(mangaId)}/${chapterId}/pg-1/`;
    const html = await this.requestHTML(firstPageUrl);

    const totalPagesMatch = html.match(/total_pages\s*=\s*(\d+)/);
    const totalPages = totalPagesMatch ? parseInt(totalPagesMatch[1], 10) : 0;

    let pages = await this.decodeChapterImages(html);

    if (totalPages > 0 && (pages.length < totalPages || pages.some((p) => !p))) {
      const merged = pages.slice();
      for (let i = merged.length; i < totalPages; i++) merged.push('');
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        if (merged[pageNum - 1]) continue;
        try {
          const pageUrl = `${SITE_BASE}/read-manga/${encodeURIComponent(mangaId)}/${chapterId}/pg-${pageNum}/`;
          const pageHtml = pageNum === 1 ? html : await this.requestHTML(pageUrl);
          const pageImages = await this.decodeChapterImages(pageHtml);
          if (pageImages[pageNum - 1]) merged[pageNum - 1] = pageImages[pageNum - 1];
        } catch (e) {
          console.warn(`MangaGo: failed to resolve page ${pageNum}: ` + (e && e.message));
        }
      }
      const missing = [];
      for (let i = 0; i < totalPages; i++) if (!merged[i]) missing.push(i + 1);
      if (missing.length) {
        throw new Error(
          `MangaGo getChapterDetails: ${missing.length} of ${totalPages} pages of ` +
            `${mangaId}/${chapterId} could not be decoded (pages ${missing.join(', ')})`,
        );
      }
      pages = merged;
    }

    return { id: chapterId, mangaId, pages };
  }

  async decodeChapterImages(html) {
    const imgsrcsMatch = html.match(/var imgsrcs\s*=\s*'([a-zA-Z0-9+=/]+)'/);
    if (!imgsrcsMatch) return [];

    const chapterJsMatch = html.match(/src="([^"]*chapter\.js[^"]*)"/);
    if (!chapterJsMatch) return [];
    let chapterJsUrl = chapterJsMatch[1];
    if (chapterJsUrl.indexOf('http') !== 0) {
      chapterJsUrl = chapterJsUrl.indexOf('//') === 0 ? `https:${chapterJsUrl}` : `${SITE_BASE}${chapterJsUrl}`;
    }

    const chapterJsRaw = await this.requestHTML(chapterJsUrl);
    const chapterJs = sojsonV4Decode(chapterJsRaw);
    if (!chapterJs) return [];

    const keyHex = findHexEncodedVariable(chapterJs, 'key');
    const ivHex = findHexEncodedVariable(chapterJs, 'iv');
    if (!keyHex || !ivHex) return [];

    const encrypted = base64ToBytes(imgsrcsMatch[1]);
    const decrypted = aesCbcDecryptZeroPad(encrypted, hexToBytes(keyHex), hexToBytes(ivHex));
    let imageList = bytesToUtf8(decrypted);
    imageList = unscrambleImageList(imageList, chapterJs);

    return imageList
      .split(',')
      .map((u) => u.trim())
      .map((u) => (u.indexOf('http://') === 0 ? `https://${u.slice(7)}` : u));
  }

  async requestHTML(url) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.data;
  }
}

module.exports = { Source };
