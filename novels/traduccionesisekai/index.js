const SITE = 'https://traduccionesisekai.blogspot.com';

const NOVELS = [
  { mangaId: 'rezero-kara-hajimeru-isekai-seikatsu', title: 'Re:Zero Kara Hajimeru Isekai Seikatsu (Web Novel)', image: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhKCuxVJ_Iu5ZgmJdo44W072YnaD9bdO1yU3tF2GvBBYMELOP21HScK4-J5N_ws_9BHLNONgg1mGvwBKwG8Nlf3KWh6n_rwM1wM4msGgSf8i6oC33blEr1Dx8kvkuCI_dnVqwuxJebjqu98sLvVzrXV-iPVqddQOECLk8JU22CBuyYSsVYS29d9wFn24Aw/s16000/rezero.png', medium: 'novel' },
  { mangaId: 'extras-y-e', title: 'Extras y especiales de Re:Zero', image: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEi8SDj-QPWM1pQ9eFO76XhLSWOxyeqyzF1W9XYlIZtuKdpjYKc7EFf5Qt6ppwpIaSIqGTBVfF1rQDuge99-I2o3EdW5xB8bYTLmkuTJ7b5GVbt2d-Bdc9irG37vgvLEzZUcuFQuYao91Ng/s1600/Cool.jpg', medium: 'novel' },
  { mangaId: 'classroom-of-elite', title: 'Classroom of the Elite', image: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjsWBI-kx4s89ePG9tY3eiFLXMxjfnepG4qkDweNCKmSftVAuouibLCr3p9Cx8DDXNZzVoCEL9PWFZFfgVbECiQtf4XQJ05soyOIvN8a0hYUVNZhe6yoj7TAyqWyd3VyS8Fx0dhqJHO9gk/s1600/1217321-0-q80.jpg', medium: 'novel' },
  { mangaId: 'la-diosa-del-bano', title: 'La Diosa del Baño', image: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjSkkYTGBT88Qp1Y8ux2wQvWOiKvROd-EawuvqP-RFrmmM4ChCN5UBz96lboXFvsJlQbSotOGAoyly1uHvt_kGKDmbNG_KT9wlQLKbIFcP8TCvsMU7E0AhY55Jg8CQN7IQvR0Y1oVFAPZo/s1600/Portada2.jpg' },
  { mangaId: 'kono-subarashii-sekai-ni-shukufuku-o', title: 'Konosuba (PDF)', image: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEigxXUfhrW5Q5YK1LFoa35ajvgW-tI_TfDvoDhqkSbQAU6lCiTeXD3VsayA3gVqAY05xabNFzkxL1leuPsARXp62duIbsaBO0cuc-NWiTfzZqmbujnn25iatEhR10aBQABriVN6LW7vpVs/s1600/konosuba2.png' },
  { mangaId: 'overlord', title: 'Overlord (PDF)', image: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjvockoUj7AzKc_f3E32nJh0SW0Lbss8XwnVNoN0AUx1BDAwqgOAZCu7r1IgMNT86DUb-E0Xa3c1hN4dhMJ_DBex-zrYwv8CTCQctKPEsIHfr1yKz-rbrGx8zCPYdzFMIquNcmlATcYxvQ/s1600/Overlord+Anime+Characters.jpg' },
  { mangaId: 'tensei-shitara-slime-datta-ken', title: 'Tensei Shitara Slime Datta Ken (PDF)', image: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgKtIqX_5-VCBYS5ZXusWMEW7qb-C0PYFSs4vqGkIlr5yQdu234_g72Oy7QPbvqj45Bj2ZbW2wB87WL8nPkS26i9tRztuZbGc16zR-8YBIPLpm4yyH7H6J8wg9GkVl6vRt49oBpY7kak_E/s1600/tensei-shitara-slime-datta-ken.jpg' },
  { mangaId: 'no-game-no-life', title: 'No Game No Life (PDF)', image: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjBVYdX50u9scZ6_31A_YD4cHz6xdf7L59Zc07SKNfg_aDn10HDfasw6cJwtL5UsnUAO-Snbca7DctYG0DVJSe_h38U2dNesrkRMh05l5mCU3oPgCGZiTkChmZF8aVEzJ5auif_1WKXKjk/s1600/No-Game-No-Life-Anime-Visual.jpg' },
  { mangaId: 'seirei-tsukai-no-bladedance', title: 'Seirei Tsukai no Bladedance (PDF)', image: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjRwj3InpfEt9zvTqax5WaBp5-6fKIR8ZW5GaBzYvzk8ME1rZTSryVKVApfnnpBHlm5sC2AXVVyRQeDIYBgxXVElTCINSkoyjAahAOI6zqiX7Qi7644tT9iUV5gbzGkhj2wIWll2jSgidg/s640/STnBD_Nimura_Yuuji_visual.jpg' },
  { mangaId: 'mondaiji-tachi-ga-isekai-kara-kuru', title: 'Mondaiji-tachi ga Isekai kara Kuru Sou Desu yo? (PDF)', image: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhIxyp9-k_WgoewWrPcmVDG0lJMuwb8Z2BAViV0-my-WV4TmzoaGG7dR9rJfoIVK9lYtV_3Bw-5aUjo1B7SpJAAEqYdPSn3a7vpQPVuYmMThSVbNnqQwN_cPOBKBaD8GrTG6NF9ZFl_fVA/s640/Mondaiji_cover.jpg' },
];

function chapterPath(href) {
  const match = /traduccionesisekai\.blogspot\.[a-z.]+\/((?:\d{4}\/\d{2}|p)\/[^?#"]+\.html)/.exec(href || '');
  return match ? match[1] : null;
}

function driveIdOf(href) {
  const match = /drive\.google\.com\/(?:open\?id=|file\/d\/|uc\?(?:export=download&(?:amp;)?)?id=)([\w-]{20,})/.exec(href || '');
  return match ? match[1] : null;
}

function dateOf(path) {
  const match = /^(\d{4})\/(\d{2})\//.exec(path);
  return match ? Date.UTC(+match[1], +match[2] - 1, 1) : undefined;
}

function pageUrl(mangaId) {
  return `${SITE}/p/${mangaId}.html`;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 2 } });
  }

  getSourceFeeds() {
    return [{ id: 'novels', name: 'Novels' }];
  }

  async getSearchResults(request) {
    if (request && request.medium && request.medium !== 'novel') return { results: [] };
    const query = ((request && request.title) || '').trim().toLowerCase();
    return { results: NOVELS.filter((novel) => !query || novel.title.toLowerCase().includes(query)) };
  }

  async getMangaDetails(mangaId) {
    const novel = NOVELS.find((item) => item.mangaId === mangaId);
    if (!novel) throw new Error('Traducciones Isekai: unknown novel');
    return {
      mangaInfo: {
        title: novel.title,
        image: novel.image,
        desc: 'Traducción al español de Traducciones Isekai.',
        status: 'ONGOING',
        tags: [],
        webURL: pageUrl(mangaId),
        medium: 'novel',
      },
    };
  }

  async getChapters(mangaId) {
    const $ = cheerio.load(await this.get(pageUrl(mangaId)));
    const chapters = [];
    const seen = new Set();
    $('.post-body a[href]').each((i, el) => {
      const chapterId = chapterPath($(el).attr('href'));
      const name = $(el).text().replace(/\s+/g, ' ').trim();
      if (!chapterId || !name || seen.has(chapterId)) return;
      seen.add(chapterId);
      chapters.push({ id: chapterId, chapterId, name, time: dateOf(chapterId) });
    });
    $('.post-body a[href]').each((i, el) => {
      const file = driveIdOf($(el).attr('href'));
      const name = $(el).text().replace(/\s+/g, ' ').trim();
      if (!file || !name || seen.has(file)) return;
      seen.add(file);
      chapters.push({ id: `drive~${file}`, chapterId: `drive~${file}`, name });
    });
    return chapters.map((chapter, i) => ({ ...chapter, number: i + 1 })).reverse();
  }

  async getChapterDetails(mangaId, chapterId) {
    if (chapterId.startsWith('drive~')) {
      const file = chapterId.slice('drive~'.length);
      const url = `https://drive.usercontent.google.com/download?id=${file}&export=download&confirm=t`;
      return { id: chapterId, mangaId, pages: [], text: `Este capítulo es un libro en PDF, que este lector todavía no abre. Puedes descargarlo aquí: ${url}`, book: { url } };
    }
    const $ = cheerio.load(await this.get(`${SITE}/${chapterId}`));
    const body = $('.post-body').first();
    const picture = (img) => {
      const src = ($(img).attr('src') || '').trim();
      return /^https:\/\/blogger\.googleusercontent\.com\/img\//.test(src) ? `\n![](${src})\n` : '';
    };
    body.find('table.tr-caption-container').each((i, el) => {
      $(el).replaceWith($(el).find('img').map((j, img) => picture(img)).get().join(''));
    });
    body.find('img').each((i, el) => {
      $(el).replaceWith(picture(el));
    });
    body.find('script, style, noscript, ins').remove();
    body.find('br').replaceWith('\n');
    body.find('p, div, h1, h2, h3, h4, li, blockquote').append('\n');
    const paragraphs = body
      .text()
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter((line) => line && !/^(anterior|siguiente|índice)(\s*\/\/\s*(anterior|siguiente|índice))*$/i.test(line));
    if (!paragraphs.length) throw new Error('Traducciones Isekai: the chapter has no text');
    return { id: chapterId, mangaId, pages: [], text: paragraphs.join('\n\n') };
  }

  async get(url) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { Accept: 'text/html' } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`Traducciones Isekai: HTTP ${response.status} from ${url}`);
    return String(response.data);
  }
}

module.exports = { Source };
