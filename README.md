# Inkstone

**Extension Registry.** Community-made extensions that add content to Boundless Reader and Sumizuri. Free and open source under the MIT license.

Each extension is one small JavaScript file that your app downloads and runs on your device (in a sandbox, in Boundless Reader).

The full catalog and docs live at [inkstone.web.app](https://inkstone.web.app). Questions or a broken extension? Come say hi on [Discord](https://discord.gg/6pX2XgFYcs).

## Add it to your app

<p align="center">
  <a href="https://inkstone.web.app/boundless"><img src="docs/assets/add-to-boundless.svg" alt="Add to Boundless" height="56"></a>
  &nbsp;
  <a href="https://inkstone.web.app/sumizuri"><img src="docs/assets/add-to-sumizuri.svg" alt="Add to Sumizuri" height="56"></a>
</p>

Tap a button on the device that has the app. It opens the app and asks you to confirm. Or paste this into Boundless Reader's extension settings, or into Sumizuri (Browse, then Repos, then Add a repo):

```
https://inkstone.web.app
```

Step by step guide: [inkstone.web.app/installation](https://inkstone.web.app/installation)

Nothing installs until you pick an extension, and removing one takes a tap.

## What's in here

```
comics/<id>/index.js       extensions for manga, manhwa and webtoons
novels/<id>/index.js       extensions for novels
mixed/<id>/index.js        extensions that do both
anime/<id>/index.js        anime extensions, for apps that play video such as Sumizuri
versioning.json            the list your app reads
docs/assets/               the Add to Boundless and Add to Sumizuri buttons
docs/BUILD_WITH_AI.md      have an AI assistant build one for you
docs/EXTENSIONS.md         how an extension works
docs/TESTING.md            check an extension works
docs/test-extension.mjs    the test script
docs/OPENSPEC.md           the spec-driven way, with OpenSpec
openspec/                  specs describing how extensions work
AGENTS.md                  instructions for AI coding assistants
```

## Build one with AI

Open this repo in Claude Code, Cursor, Codex or any coding assistant and tell it which site you want. It picks up [AGENTS.md](AGENTS.md) and follows [docs/BUILD_WITH_AI.md](docs/BUILD_WITH_AI.md). Or paste that guide into a chat.

Prefer to review a written plan before any code is written? This repo works with [OpenSpec](https://github.com/Fission-AI/OpenSpec). Run `openspec init`, then propose a change for your site. See [docs/OPENSPEC.md](docs/OPENSPEC.md).

## Extensions

198 extensions right now. Ratings are Safe, Mature or Adult, and some extensions also rate each title on its own.

Each extension lives in the folder for what it offers: `comics`, `novels`, `mixed` for those that do both, or `anime`. The site still serves every one at `inkstone.web.app/<id>/index.js`, so the folders change nothing in the apps.

### Comics

| Extension | Site | Language | Rating | Version |
| --- | --- | --- | --- | --- |
| [Akaza Scans](comics/akazascans/index.js) | akazascans.org | English | Safe | 1.0.0 |
| [Anikiga](comics/anikiga/index.js) | anikiga.com | Turkish | Safe | 1.0.0 |
| [Anime-Sama](comics/animesama/index.js) | anime-sama.to | French | Mature | 1.0.1 |
| [AnimeShinigami](comics/animeshinigami/index.js) | animeshinigami.com | Italian | Safe | 1.0.0 |
| [Anisa Scans](comics/anisascans/index.js) | anisascans.in | English | Safe | 1.0.0 |
| [Arena Scans](comics/arenascans/index.js) | arenascan.com | English | Mature | 1.0.0 |
| [Aster Scans](comics/asterscans/index.js) | asterscans.com | English | Safe | 1.0.0 |
| [AsuraScans](mixed/asurascans/index.js) | asurascans.com | English | Safe | 2.4.0 |
| [Athrea Scans](comics/athreascans/index.js) | athreascans.com | English | Adult | 1.0.0 |
| [Atsumaru](mixed/atsu/index.js) | atsu.moe | English | Mature | 1.0.1 |
| [BL village](comics/blvillage/index.js) | blvillage.com | Japanese | Adult | 1.1.1 |
| [Blue Solo](comics/bluesolo/index.js) | bluesolo.org | French | Safe | 1.0.0 |
| [Bun Manga](comics/bunmanga/index.js) | bunmanga.com | English | Safe | 1.0.0 |
| [Café com Yaoi](comics/cafcomyaoi/index.js) | cafecomyaoi.com.br | Brazilian Portuguese | Mature | 1.0.0 |
| [Chikari](mixed/chikari/index.js) | chikari.moe | English | Adult | 4.4.0 |
| [CManga](comics/cmanga/index.js) | cmangavn.com | Vietnamese | Adult | 1.0.0 |
| [Cocomic](comics/cocomic/index.js) | cocomic.co | English | Safe | 1.0.0 |
| [ComicFury](comics/comicfury/index.js) | comicfury.com | English | Adult | 1.0.0 |
| [ComicLand](comics/comicland/index.js) | comicland.org | English | Adult | 1.0.0 |
| [Decadence Scans](comics/decadencescans/index.js) | reader.decadencescans.com | English | Safe | 1.0.0 |
| [Dynasty Scans](comics/dynastyscans/index.js) | dynasty-scans.com | English | Mature | 1.0.0 |
| [Eva Scans](comics/evascans/index.js) | evascans.net | English | Safe | 1.0.0 |
| [EzManga](mixed/ezmanga/index.js) | ezmanga.org | English | Safe | 1.0.1 |
| [Flame Scans](comics/flamescans/index.js) | flamecomics.xyz | English | Safe | 1.0.0 |
| [Flash-Manga](comics/flashmanga/index.js) | flash-manga.net | Thai | Safe | 1.0.0 |
| [FMTEAM](comics/fmteam/index.js) | fmteam.fr | French | Safe | 1.0.0 |
| [GakaMangas](comics/gakamangas/index.js) | gakamangas.com | English | Safe | 1.0.0 |
| [GD Scans](comics/gdscans/index.js) | gdscans.com | English | Adult | 1.0.0 |
| [GhosToon](comics/ghostoon/index.js) | ghostoon.com | Turkish | Safe | 1.0.0 |
| [GlobalComix](comics/globalcomix/index.js) | globalcomix.com | English | Adult | 1.1.1 |
| [Grabber Zone](comics/grabberzone/index.js) | grabber.zone | English | Safe | 1.0.0 |
| [GTO The Great Site](comics/gtothegreatsite/index.js) | reader.gtothegreatsite.net | Italian | Mature | 1.0.0 |
| [Hades no Fansub](comics/hadesnofansub/index.js) | lectorhades.latamtoon.com | Spanish | Safe | 1.0.0 |
| [Hijala Scans](comics/hijala/index.js) | en-hijala.com | English | Safe | 1.0.0 |
| [HiperDEX](comics/hiperdex/index.js) | hiperdex.tv | English | Adult | 1.0.1 |
| [HiveToons](comics/hivetoon/index.js) | hivetoons.org | English | Adult | 1.1.0 |
| [Hot Cabaret Scan](comics/hotcabaretscan/index.js) | hotcabaretscan.com | Brazilian Portuguese | Mature | 1.0.0 |
| [Hunlight Comics](comics/hunlightcomics/index.js) | hunlightcomics.com | English | Safe | 1.0.0 |
| [Indomanhwa](comics/indomanhwa/index.js) | indomanhwa.com | Indonesian | Mature | 1.0.0 |
| [InkStory](comics/inkstory/index.js) | inkstory.net | Russian | Mature | 1.1.0 |
| [InManga](comics/inmanga/index.js) | inmanga.com | Spanish | Safe | 1.1.0 |
| [Inu Manga](comics/inumanga/index.js) | inu-manga.net | Thai | Mature | 1.0.0 |
| [Inventario Oculto](comics/inventariooculto/index.js) | inventariooculto.com | Spanish | Safe | 1.0.0 |
| [Kagane](comics/kagane/index.js) | kagane.org | English | Safe | 1.3.2 |
| [Kami Sama Explorer](comics/kamisamaexplorer/index.js) | leitor.kamisama.com.br | Brazilian Portuguese | Safe | 1.0.0 |
| [Kazoku Den](comics/kazokuden/index.js) | kazokuden.com | Spanish | Mature | 1.0.0 |
| [Keikomik](comics/keikomik/index.js) | keikomik.net | Indonesian | Adult | 1.0.0 |
| [Ken Scans](comics/kenscans/index.js) | kencomics.com | English | Mature | 1.0.0 |
| [Kingofshojo](comics/kingofshojo/index.js) | kingofshojo.com | English | Adult | 1.0.0 |
| [KlikManga](comics/klikmanga/index.js) | klikmanga.org | Indonesian | Safe | 1.0.0 |
| [KokoMangas](comics/kokomangas/index.js) | kokomangas.com | English | Adult | 1.0.0 |
| [Komikindo](comics/komikindo/index.js) | komikindo.ch | Indonesian | Adult | 1.0.1 |
| [Komiku](comics/komiku/index.js) | komiku.org | Indonesian | Adult | 1.0.0 |
| [Koreli Scans](comics/koreliscans/index.js) | nabicix.com | Turkish | Safe | 1.0.0 |
| [KSGroupScans](comics/ksgroupscans/index.js) | ksgroupscans.com | English | Mature | 1.0.0 |
| [KuManga](comics/kumanga/index.js) | kumanga.com | Spanish | Adult | 1.0.0 |
| [KunManga](comics/kunmanga/index.js) | kunmanga.com | English | Adult | 1.1.0 |
| [Lagoon Scans](comics/lagoonscans/index.js) | lagoonscans.com | English | Safe | 1.0.0 |
| [Lectormanga](comics/lectormanga/index.js) | lectormangass.net | Spanish | Adult | 1.2.1 |
| [LelManga](comics/lelmanga/index.js) | lelmanga.com | French | Adult | 1.0.0 |
| [Lelscans](comics/lelscans/index.js) | lelscans.net | French | Safe | 1.1.0 |
| [LHTranslation](comics/lhtranslation/index.js) | lhtranslation.net | English | Mature | 1.0.0 |
| [LupiTeam](comics/lupiteam/index.js) | lupiteam.net | Italian | Safe | 1.0.0 |
| [Madara Scans](comics/madarascans/index.js) | madarascans.net | English | Mature | 1.0.0 |
| [Magus Manga](comics/magusmanga/index.js) | magustoon.org | English | Safe | 1.0.0 |
| [Manga Demon](comics/mangademon/index.js) | demonicscans.org | English | Mature | 1.0.0 |
| [Manga District](comics/mangadistrict/index.js) | mangadistrict.com | English | Adult | 1.0.0 |
| [Manga Eclipse](comics/mangaeclipse/index.js) | mangaeclipse.com | English | Mature | 1.0.0 |
| [Manga Trend](comics/mangatrend/index.js) | mangatrend.org | English | Safe | 1.0.0 |
| [Manga-Corporation](comics/mangacorporation/index.js) | manga-corporation.com | French | Safe | 1.0.0 |
| [Manga-Scantrad](comics/mangascantrad/index.js) | manga-scantrad.io | French | Adult | 1.0.0 |
| [Mangabat](comics/mangabats/index.js) | mangabats.com | English | Adult | 1.0.0 |
| [MangaBuddy](comics/mangabuddy/index.js) | mangabuddy1.co.uk | English | Adult | 1.3.0 |
| [MangaDex](comics/mangadex/index.js) | mangadex.org | English | Safe | 1.2.0 |
| [MangaFire](comics/mangafire/index.js) | mangafire.to | English | Safe | 1.4.1 |
| [MangaFox](comics/mangafox/index.js) | fanfox.net | English | Adult | 1.0.0 |
| [MangaFreak](comics/mangafreak/index.js) | mangafreak.me | English | Adult | 1.0.1 |
| [MangaGo](comics/mangago/index.js) | mangago.me | English | Adult | 1.1.0 |
| [MangaHere](comics/mangahere/index.js) | mangahere.cc | English | Adult | 1.1.1 |
| [MangaHub](comics/mangahub/index.js) | mangahub.io | English | Adult | 1.0.0 |
| [MangaK](comics/mangak/index.js) | mangak.io | English | Mature | 1.0.0 |
| [Mangakakalot](comics/mangakakalot/index.js) | mangakakalot.gg | English | Adult | 1.2.0 |
| [MangaKatana](comics/mangakatana/index.js) | mangakatana.com | English | Adult | 1.1.3 |
| [MangaOwl](comics/mangaowl/index.js) | mangaowl.io | English | Adult | 1.0.0 |
| [Mangapill](comics/mangapill/index.js) | mangapill.com | English | Adult | 1.0.0 |
| [MangaPlaza](comics/mangaplaza/index.js) | mangaplaza.com | English | Adult | 1.1.1 |
| [MangaRead](comics/mangaread/index.js) | mangaread.org | English | Adult | 1.0.1 |
| [Mangasushi](comics/mangasushi/index.js) | mangasushi.org | English | Safe | 1.0.0 |
| [MangaToon](comics/mangatoon/index.js) | mangatoon.mobi | English | Mature | 1.2.0 |
| [MangaTown](comics/mangatown/index.js) | mangatown.com | English | Adult | 1.2.0 |
| [MangaWOW](comics/mangawow/index.js) | mangawow.org | Turkish | Mature | 1.0.0 |
| [Manhua Plus (.com)](comics/manhuapluscom/index.js) | manhuaplus.com | English | Mature | 1.0.0 |
| [ManhuaFast](comics/manhuafast/index.js) | manhuafast.net | English | Mature | 1.0.0 |
| [Manhuagui](comics/manhuagui/index.js) | m.manhuagui.com | Chinese | Adult | 1.0.1 |
| [ManhuaHot](comics/manhuahot/index.js) | manhuahot.com | English | Mature | 1.0.0 |
| [Manhuanext](comics/manhuanext/index.js) | manhuanext.com | English | Safe | 1.0.0 |
| [Manhuaplus](comics/manhuaplus/index.js) | manhuaplus.org | English | Safe | 1.0.0 |
| [Manhuaus](comics/manhuaus/index.js) | manhuaus.club | English | Mature | 1.0.0 |
| [ManhuaVN](comics/manhuavn/index.js) | manhuavn.top | Vietnamese | Adult | 1.2.0 |
| [Manhwa Reads](comics/manhwareads/index.js) | manhwareads.com | English | Mature | 1.0.0 |
| [Manhwa18](comics/manhwa18/index.js) | manhwa18.cc | English | Adult | 1.0.0 |
| [ManhwaBuddy](comics/manhwabuddy/index.js) | manhwabuddy.com | English | Adult | 1.0.0 |
| [ManhwaClan](comics/manhwaclan/index.js) | manhwaclan.com | English | Adult | 1.0.0 |
| [Manhwaddict](comics/manhwaddict/index.js) | manhwaddict.com | English | Adult | 1.0.0 |
| [ManhwaGalaxy](comics/manhwagalaxy/index.js) | manhwagalaxy.com | English | Adult | 1.0.0 |
| [ManhwaHQ](comics/manhwahq/index.js) | manhwahq.com | English | Adult | 1.0.1 |
| [ManhwaNex](comics/manhwanex/index.js) | manhwanex.com | English | Safe | 1.0.0 |
| [ManhwaOnline](comics/manhwaonline/index.js) | manhwaonline.org | English | Mature | 1.0.0 |
| [ManhwaTop](comics/manhwatop/index.js) | manhwatop.com | English | Adult | 1.0.0 |
| [MGeko](comics/mgeko/index.js) | mgeko.cc | English | Safe | 1.0.0 |
| [Mgread.io](comics/mangayy/index.js) | mgread.io | English | Mature | 2.0.0 |
| [MHScans](comics/mhscans/index.js) | mhscans.com | Spanish | Safe | 1.0.0 |
| [Monopoly Scan](comics/monopolyscan/index.js) | monopolymanhua.com | Spanish | Safe | 1.0.0 |
| [Natomanga](comics/natomanga/index.js) | natomanga.com | English | Adult | 1.2.0 |
| [Naver Webtoon](comics/navercomic/index.js) | comic.naver.com | Korean | Mature | 1.2.0 |
| [Nebulosa Scan](comics/nebulosascan/index.js) | nebulosascan.com | Brazilian Portuguese | Mature | 1.0.0 |
| [NetTruyen](comics/nettruyen/index.js) | nettruyenvia.com | Vietnamese | Adult | 1.0.0 |
| [Ngomik](comics/ngomik/index.js) | 02.ngomik.cc | Indonesian | Safe | 1.0.0 |
| [NirvanaManga](comics/nirvanamanga/index.js) | nirvanamanga.com | Turkish | Adult | 1.0.0 |
| [Nyx Scans](comics/nyxscans/index.js) | nyxscans.com | English | Safe | 1.0.0 |
| [Olympus Scanlation](comics/olympusscans/index.js) | olympusbiblioteca.com | Spanish | Adult | 1.0.3 |
| [Orion Scans](comics/orionscans/index.js) | orion-scans.com | English | Safe | 1.0.0 |
| [Phoenix Scans](comics/phoenixscans/index.js) | phoenixscans.com | Italian | Mature | 1.0.0 |
| [Qi Manga](mixed/qimanga/index.js) | qimanga.com | English | Safe | 1.1.1 |
| [Rackus](comics/rackus/index.js) | rackusreads.com | English | Safe | 1.0.0 |
| [Ragnarok Scanlation](comics/ragnarokscanlation/index.js) | ragnarokscanlation.org | Spanish | Safe | 1.0.0 |
| [Rakuen Translations](comics/rakuentranslations/index.js) | rakuentranslations.com | Spanish | Mature | 1.0.0 |
| [Raven Scans](comics/ravenscans/index.js) | ravenscans.org | English | Adult | 1.0.0 |
| [Rawkuma](comics/rawkuma/index.js) | rawkuma.net | Japanese | Adult | 1.0.1 |
| [ReManga](comics/remanga/index.js) | remanga.org | Russian | Adult | 1.2.1 |
| [Renascans](comics/renascans/index.js) | renascans.net | English | Safe | 1.0.0 |
| [RokariComics](comics/rokaricomics/index.js) | rokaricomics.com | English | Safe | 1.0.0 |
| [Rolia Scan](comics/roliascan/index.js) | roliascan.com | English | Mature | 1.0.0 |
| [Rüya Manga](comics/ryamanga/index.js) | ruyamanga2.com | Turkish | Safe | 1.0.0 |
| [S2Manga](comics/s2manga/index.js) | s2read.com | English | Safe | 1.0.0 |
| [SamuraiScan](comics/samuraiscan/index.js) | samurai.j5z.xyz | Spanish | Safe | 1.0.0 |
| [Sana Scans](comics/sanascans/index.js) | sanascans.com | English | Safe | 1.0.0 |
| [Scan-VF](comics/scanvf/index.js) | scan-vf.net | French | Safe | 1.0.0 |
| [Scythe Scans](comics/scythescans/index.js) | scythescans.com | English | Safe | 1.0.0 |
| [Serein Scan](comics/sereinscan/index.js) | sereinscan.net | Turkish | Safe | 1.0.0 |
| [Tapas](comics/tapas/index.js) | tapas.io | English | Mature | 1.2.0 |
| [Tarot Scans](comics/tarotscans/index.js) | tarotscans.com | Turkish | Safe | 1.0.0 |
| [TCB Scans](comics/tcbscans/index.js) | tcbonepiecechapters.com | English | Safe | 1.0.0 |
| [Thunder Scans](comics/thunderscans/index.js) | en-thunderscans.com | English | Mature | 1.0.0 |
| [Tilki Scans](comics/tilkiscans/index.js) | tilkiscans.com | Turkish | Mature | 1.1.0 |
| [ToonGod](comics/toongod/index.js) | toongod.org | English | Adult | 1.0.0 |
| [ToonGrab](comics/toongrab/index.js) | toongrab.com | English | Safe | 1.0.0 |
| [Toonily](comics/toonily/index.js) | toonily.com | English | Adult | 1.2.1 |
| [Toonizy](comics/toonizy/index.js) | toonizy.com | English | Safe | 1.0.0 |
| [Tortuga Ceviri](comics/tortugaceviri/index.js) | tortugaceviri.com | Turkish | Safe | 1.0.0 |
| [Tritinia Scans](comics/tritinia/index.js) | tritinia.org | English | Mature | 1.0.1 |
| [TruyenQQ](comics/truyenqq/index.js) | truyenqqgo.com | Vietnamese | Safe | 1.0.0 |
| [TruyenTini](comics/truyentini/index.js) | truyentini.net | Vietnamese | Safe | 1.0.0 |
| [TruyenTuoiTho](comics/truyentuoitho/index.js) | truyentuoitho.com | Vietnamese | Safe | 1.0.0 |
| [Tsundoku Traduções](comics/tsundokutradues/index.js) | tsundoku.com.br | Brazilian Portuguese | Safe | 1.0.0 |
| [Türkçe Manga Oku](comics/trkemangaoku/index.js) | trmangaoku.com | Turkish | Safe | 1.0.0 |
| [Turkmanga](comics/turkmanga/index.js) | turkmanga.org | Turkish | Adult | 1.0.0 |
| [TuttoAnimeManga](comics/tuttoanimemanga/index.js) | tuttoanimemanga.net | Italian | Mature | 1.0.0 |
| [Uchuujin Projects](comics/uchuujinprojects/index.js) | uchuujinmangas.com | Spanish | Mature | 1.0.0 |
| [UnderTranslations](comics/undertranslations/index.js) | undertranslations.com | Spanish | Mature | 1.0.0 |
| [Violet Scans](comics/violetscans/index.js) | violetmanga.com | English | Safe | 1.0.0 |
| [VIZ Manga](comics/viz/index.js) | viz.com | English | Mature | 1.0.0 |
| [Vortex Scans](comics/vortexscans/index.js) | vortexscans.org | English | Safe | 1.0.0 |
| [WaManga](comics/wamanga/index.js) | wamanga.ru | Russian | Adult | 1.2.0 |
| [WEBTOON](comics/webtoons/index.js) | webtoons.com | English | Safe | 1.0.0 |
| [Weeb Central](comics/weebcentral/index.js) | weebcentral.com | English | Adult | 1.0.0 |
| [YakshaComics](comics/yakshacomics/index.js) | yakshacomics.com | English | Safe | 1.0.0 |
| [Yuri-Online](comics/yurionline/index.js) | yuri-online.com | Spanish | Safe | 1.0.0 |
| [Yurimanga](comics/yurimanga/index.js) | yurimanga.net | English | Adult | 1.1.0 |
| [Zinmanga](comics/zinmanga/index.js) | zinmanga.net | English | Safe | 1.0.0 |
| [ZonaTMO.org](comics/zonatmoorg/index.js) | zonatmo.org | Spanish | Adult | 1.0.0 |
| [مانجا ليك](comics/mangalik/index.js) | mangalik.net | Arabic | Safe | 1.0.0 |

### Novels

| Extension | Site | Language | Rating | Version |
| --- | --- | --- | --- | --- |
| [17K Novel Network](novels/17k/index.js) | 17k.com | Chinese | Mature | 1.3.0 |
| [AsuraScans](mixed/asurascans/index.js) | asurascans.com | English | Safe | 2.4.0 |
| [Atsumaru](mixed/atsu/index.js) | atsu.moe | English | Mature | 1.0.1 |
| [Chikari](mixed/chikari/index.js) | chikari.moe | English | Adult | 4.4.0 |
| [Dreame](novels/dreame/index.js) | dreame.com | English | Adult | 1.2.0 |
| [Exnovels](novels/exnovels/index.js) | exnovels.com | English | Safe | 1.0.1 |
| [EzManga](mixed/ezmanga/index.js) | ezmanga.org | English | Safe | 1.0.1 |
| [FreeWebNovel](novels/freewebnovel/index.js) | freewebnovel.com | English | Adult | 1.2.2 |
| [GoodNovel](novels/goodnovel/index.js) | goodnovel.com | English | Adult | 1.2.1 |
| [JJWXC](novels/jjwxc/index.js) | jjwxc.net | Chinese | Mature | 1.3.0 |
| [LibRead](novels/libread/index.js) | libread.com | English | Adult | 1.2.0 |
| [MoboReader](novels/moboreader/index.js) | moboreader.com | English | Adult | 1.2.0 |
| [Novel Archive](novels/novelarchive/index.js) | novelarchive.cc | English | Mature | 1.0.1 |
| [NovelBuddy](novels/novelbuddy/index.js) | novelbuddy.me | English | Adult | 1.2.0 |
| [NovelFire](novels/novelfire/index.js) | novelfire.net | English | Adult | 2.6.0 |
| [NovelFull](novels/novelfull/index.js) | novelfull.net | English | Adult | 1.1.0 |
| [Qi Manga](mixed/qimanga/index.js) | qimanga.com | English | Safe | 1.1.1 |
| [Qidian](novels/qidian/index.js) | qidian.com | Chinese | Safe | 1.2.0 |
| [Ranobes](novels/ranobes/index.js) | ranobes.top | English | Adult | 1.1.1 |
| [ReadNovelFull](novels/readnovelfull/index.js) | readnovelfull.com | English | Adult | 1.1.1 |
| [ReadWN](novels/readwn/index.js) | wuxiabox.com | English | Safe | 1.2.1 |
| [Royal Road](novels/royalroad/index.js) | royalroad.com | English | Safe | 1.0.0 |
| [ScribbleHub](novels/scribblehub/index.js) | scribblehub.com | English | Adult | 1.0.0 |
| [Sleepy Translations](novels/sleepytranslations/index.js) | sleepytranslations.com | English | Safe | 1.0.0 |
| [Wattpad](novels/wattpad/index.js) | wattpad.com | English | Adult | 1.1.1 |
| [Webfic](novels/webfic/index.js) | webfic.com | English | Adult | 1.3.0 |
| [Webnovel](novels/webnovel/index.js) | webnovel.com | English | Adult | 1.4.4 |
| [Wuxiaworld](novels/wuxiaworld/index.js) | wuxiaworld.com | English | Mature | 1.1.0 |
| [WuxiaWorld.site](novels/wuxiaworldsite/index.js) | wuxiaworld.site | English | Safe | 1.0.0 |

### Anime

Anime extensions use `medium: "anime"` and a `getVideos` method. Sumizuri plays them. Boundless skips them for now.

| Extension | Site | Language | Rating | Version |
| --- | --- | --- | --- | --- |
| [AniZone](anime/anizone/index.js) | anizone.to | English | Mature | 1.0.0 |
| [KickAssAnime](anime/kickassanime/index.js) | kaa.lt | English | Mature | 1.0.1 |
| [UniqueStream](anime/uniquestream/index.js) | anime.uniquestream.net | English | Mature | 1.0.1 |

## Known issues

These extensions are known to be broken right now:

- **Anisa Scans** (`anisascans`): The site's domain no longer points to a server.
- **Renascans** (`renascans`): The site's API address (api.renascans.net) no longer exists.

## Credits

Thanks to the people who built extensions for Inkstone.

- [omfgitsjesus](https://discord.com/users/177424485526274048): HiperDEX
- [matsukiender-star](https://github.com/matsukiender-star): KuManga

## Contributing

New extensions and fixes are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Copyright and takedowns

Inkstone doesn't host any content. The extensions are code that runs on your device and reads from other sites. If you think something in this repository infringes your rights, open an issue with the "Copyright or takedown request" template, or message us on [Discord](https://discord.gg/6pX2XgFYcs). More at [inkstone.web.app/copyright](https://inkstone.web.app/copyright).

## License

MIT. See [LICENSE](LICENSE).

## Disclaimer

Inkstone is an independent project. It isn't part of Boundless Reader and isn't endorsed by it.

Inkstone doesn't host any content. Extensions read from third party sites, and everything they show belongs to those sites and their owners.
