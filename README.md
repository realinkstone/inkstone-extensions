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
donghua/<id>/index.js      donghua (Chinese animation) extensions, the same video format
drama/<id>/index.js        drama extensions (live action series and telefilms), the same video format
western/<id>/index.js      western series, films and cartoons, the same video format
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

295 extensions right now. Ratings are Safe, Mature or Adult, and some extensions also rate each title on its own.

Each extension lives in the folder for what it offers: `comics`, `novels`, `mixed` for those that do both, or `anime`. The site still serves every one at `inkstone.web.app/<id>/index.js`, so the folders change nothing in the apps.

### Comics

| Extension | Site | Language | Rating | Version |
| --- | --- | --- | --- | --- |
| [1668Manga](comics/1668manga/index.js) | 1668manga.com | Thai | Mature | 1.0.0 |
| [Akaza Scans](comics/akazascans/index.js) | akazascans.org | English | Safe | 1.0.0 |
| [Amanga Planet](comics/amangaplanet/index.js) | amangaplanet.com.tr | Turkish | Safe | 1.0.0 |
| [Amuy](comics/amuy/index.js) | apenasmaisumyaoi.com | Brazilian Portuguese | Adult | 1.0.0 |
| [Anikiga](comics/anikiga/index.js) | anikiga.com | Turkish | Safe | 1.0.2 |
| [Anime-Sama](comics/animesama/index.js) | anime-sama.to | French | Mature | 1.0.1 |
| [AnimeShinigami](comics/animeshinigami/index.js) | animeshinigami.com | Italian | Safe | 1.0.2 |
| [Arena Scans](comics/arenascans/index.js) | arenascan.com | English | Mature | 1.0.0 |
| [Aster Scans](comics/asterscans/index.js) | asterscans.com | English | Safe | 1.0.0 |
| [AsuraScans](mixed/asurascans/index.js) | asurascans.com | English | Safe | 2.4.0 |
| [Athrea Scans](comics/athreascans/index.js) | athreascans.com | English | Adult | 1.0.0 |
| [Atsumaru](mixed/atsu/index.js) | atsu.moe | English | Mature | 1.0.1 |
| [Bega Translation](comics/begatranslation/index.js) | begatranslation.com | Spanish | Adult | 1.0.0 |
| [BL village](comics/blvillage/index.js) | blvillage.com | Japanese | Adult | 1.1.1 |
| [Blue Solo](comics/bluesolo/index.js) | bluesolo.org | French | Safe | 1.0.1 |
| [BokugenTranslation](comics/bokugentranslation/index.js) | bokugents.com | Spanish | Mature | 1.0.0 |
| [Boruto Explorer](comics/borutoexplorer/index.js) | leitor.borutoexplorer.com.br | Brazilian Portuguese | Safe | 1.0.0 |
| [Bun Manga](comics/bunmanga/index.js) | bunmanga.com | English | Safe | 1.0.0 |
| [Café com Yaoi](comics/cafcomyaoi/index.js) | cafecomyaoi.com.br | Brazilian Portuguese | Mature | 1.0.2 |
| [Chikari](mixed/chikari/index.js) | chikari.moe | English | Adult | 4.4.0 |
| [CManga](comics/cmanga/index.js) | cmangavn.com | Vietnamese | Adult | 1.0.0 |
| [Cocomic](comics/cocomic/index.js) | cocomic.co | English | Adult | 1.0.1 |
| [ComicFury](comics/comicfury/index.js) | comicfury.com | English | Adult | 1.0.0 |
| [ComicLand](comics/comicland/index.js) | comicland.org | English | Adult | 1.0.0 |
| [Decadence Scans](comics/decadencescans/index.js) | reader.decadencescans.com | English | Adult | 1.0.1 |
| [Doodmanga](comics/doodmanga/index.js) | doodmanga.com | Thai | Safe | 1.0.0 |
| [Dragon Translation](comics/dragontranslation/index.js) | dragontranslation.org | Spanish | Adult | 1.0.0 |
| [Dynasty Scans](comics/dynastyscans/index.js) | dynasty-scans.com | English | Mature | 1.0.0 |
| [Eternal Mangas](comics/eternalmangas/index.js) | eternalmangas.org | Spanish | Adult | 1.0.2 |
| [Eva Scans](comics/evascans/index.js) | evascans.net | English | Adult | 1.0.1 |
| [EzManga](mixed/ezmanga/index.js) | ezmanga.org | English | Safe | 1.0.1 |
| [Flame Scans](comics/flamescans/index.js) | flamecomics.xyz | English | Safe | 1.0.0 |
| [Flash-Manga](comics/flashmanga/index.js) | flash-manga.net | Thai | Safe | 1.0.1 |
| [FMTEAM](comics/fmteam/index.js) | fmteam.fr | French | Safe | 1.0.1 |
| [Gaiatoon](comics/gaiatoon/index.js) | gaiatoon.com | Turkish | Mature | 1.0.0 |
| [GakaMangas](comics/gakamangas/index.js) | gakamangas.com | English | Safe | 1.0.0 |
| [GD Scans](comics/gdscans/index.js) | gdscans.com | English | Adult | 1.0.0 |
| [GhosToon](comics/ghostoon/index.js) | ghostoon.com | Turkish | Adult | 1.0.1 |
| [GlobalComix](comics/globalcomix/index.js) | globalcomix.com | English | Adult | 1.1.1 |
| [Grabber Zone](comics/grabberzone/index.js) | grabber.zone | English | Safe | 1.0.0 |
| [GTO The Great Site](comics/gtothegreatsite/index.js) | reader.gtothegreatsite.net | Italian | Mature | 1.0.1 |
| [Hades no Fansub](comics/hadesnofansub/index.js) | lectorhades.latamtoon.com | Spanish | Adult | 1.0.1 |
| [Harmony-Scan](comics/harmonyscan/index.js) | harmony-scan.fr | French | Safe | 1.0.0 |
| [Hijala Scans](comics/hijala/index.js) | en-hijala.com | English | Safe | 1.0.0 |
| [HiperDEX](comics/hiperdex/index.js) | hiperdex.tv | English | Adult | 1.0.1 |
| [HiveToons](comics/hivetoon/index.js) | hivetoons.org | English | Adult | 1.1.0 |
| [Hizo Manga](comics/hizomanga/index.js) | hizomanga.net | Arabic | Safe | 1.0.0 |
| [Hot Cabaret Scan](comics/hotcabaretscan/index.js) | hotcabaretscan.com | Brazilian Portuguese | Mature | 1.0.2 |
| [House Of Otakus](comics/houseofotakus/index.js) | houseofotakusv2.xyz | Spanish | Safe | 1.0.0 |
| [Hunlight Comics](comics/hunlightcomics/index.js) | hunlightcomics.com | English | Safe | 1.0.0 |
| [Ikigai Mangas](comics/ikigaimangas/index.js) | ikigaimangas.com | Spanish | Adult | 1.0.0 |
| [Indomanhwa](comics/indomanhwa/index.js) | indomanhwa.com | Indonesian | Mature | 1.0.1 |
| [InkStory](comics/inkstory/index.js) | inkstory.net | Russian | Mature | 1.1.0 |
| [InManga](comics/inmanga/index.js) | inmanga.com | Spanish | Safe | 1.1.0 |
| [Inu Manga](comics/inumanga/index.js) | inu-manga.net | Thai | Mature | 1.0.2 |
| [Inventario Oculto](comics/inventariooculto/index.js) | inventariooculto.com | Spanish | Adult | 1.0.1 |
| [Jinmangas](comics/jinmangas/index.js) | mangafree.info | English | Adult | 1.0.0 |
| [Kagane](comics/kagane/index.js) | kagane.org | English | Safe | 1.3.3 |
| [KaliScan.org](comics/kaliscanorg/index.js) | kaliscan.org | English | Adult | 1.0.0 |
| [Kami Sama Explorer](comics/kamisamaexplorer/index.js) | leitor.kamisama.com.br | Brazilian Portuguese | Safe | 1.0.2 |
| [Kazoku Den](comics/kazokuden/index.js) | kazokuden.com | Spanish | Mature | 1.0.2 |
| [Keikomik](comics/keikomik/index.js) | keikomik.net | Indonesian | Adult | 1.0.0 |
| [Ken Scans](comics/kenscans/index.js) | kencomics.com | English | Mature | 1.0.0 |
| [Kingofshojo](comics/kingofshojo/index.js) | kingofshojo.com | English | Adult | 1.0.0 |
| [KlikManga](comics/klikmanga/index.js) | klikmanga.org | Indonesian | Safe | 1.0.2 |
| [Kmansin09](comics/kmansin09/index.js) | kmansin09.top | Japanese | Safe | 1.0.1 |
| [KokoMangas](comics/kokomangas/index.js) | kokomangas.com | English | Adult | 1.0.0 |
| [Komikindo](comics/komikindo/index.js) | komikindo.ch | Indonesian | Adult | 1.0.1 |
| [Komiku](comics/komiku/index.js) | komiku.org | Indonesian | Adult | 1.0.0 |
| [Koreli Scans](comics/koreliscans/index.js) | nabicix.com | Turkish | Safe | 1.0.2 |
| [KSGroupScans](comics/ksgroupscans/index.js) | ksgroupscans.com | English | Mature | 1.0.0 |
| [KuManga](comics/kumanga/index.js) | kumanga.com | Spanish | Adult | 1.0.0 |
| [KunManga](comics/kunmanga/index.js) | kunmanga.com | English | Adult | 1.1.1 |
| [Kuro Manga](comics/kuromanga/index.js) | kuromanga.id | Indonesian | Mature | 1.0.0 |
| [Lagoon Scans](comics/lagoonscans/index.js) | lagoonscans.com | English | Safe | 1.0.0 |
| [Lectormanga](comics/lectormanga/index.js) | lectormangass.net | Spanish | Adult | 1.2.2 |
| [Leer Manhwas](comics/leermanhwas/index.js) | leermanhwas.com | Spanish | Adult | 1.0.2 |
| [LeerCapitulo](comics/leercapitulo/index.js) | leercapitulo.co | Spanish | Adult | 1.0.2 |
| [LelManga](comics/lelmanga/index.js) | lelmanga.com | French | Adult | 1.0.0 |
| [Lelscans](comics/lelscans/index.js) | lelscans.net | French | Safe | 1.1.1 |
| [LHTranslation](comics/lhtranslation/index.js) | lhtranslation.net | English | Mature | 1.0.0 |
| [LupiTeam](comics/lupiteam/index.js) | lupiteam.net | Italian | Safe | 1.0.1 |
| [Madara Scans](comics/madarascans/index.js) | madarascans.net | English | Mature | 1.0.0 |
| [Magus Manga](comics/magusmanga/index.js) | magustoon.org | English | Safe | 1.0.0 |
| [Manga Demon](comics/mangademon/index.js) | demonicscans.org | English | Mature | 1.0.0 |
| [Manga District](comics/mangadistrict/index.js) | mangadistrict.com | English | Adult | 1.0.0 |
| [Manga Eclipse](comics/mangaeclipse/index.js) | mangaeclipse.com | English | Mature | 1.0.0 |
| [Manga Livre.to](comics/mangalivreto/index.js) | mangalivre.to | Brazilian Portuguese | Mature | 1.0.0 |
| [Manga Trend](comics/mangatrend/index.js) | mangatrend.org | English | Safe | 1.0.0 |
| [Manga-Corporation](comics/mangacorporation/index.js) | manga-corporation.com | French | Safe | 1.0.1 |
| [Manga-Scantrad](comics/mangascantrad/index.js) | manga-scantrad.io | French | Adult | 1.0.1 |
| [Mangabat](comics/mangabats/index.js) | mangabats.com | English | Adult | 1.0.0 |
| [MangaBuddy](comics/mangabuddy/index.js) | mangabuddy1.co.uk | English | Adult | 1.3.0 |
| [MangaDex](comics/mangadex/index.js) | mangadex.org | English | Safe | 1.2.2 |
| [MangaFire](comics/mangafire/index.js) | mangafire.to | English | Safe | 1.4.1 |
| [MangaFox](comics/mangafox/index.js) | fanfox.net | English | Adult | 1.0.0 |
| [MangaFreak](comics/mangafreak/index.js) | mangafreak.me | English | Adult | 1.0.1 |
| [MangaGo](comics/mangago/index.js) | mangago.me | English | Adult | 1.1.0 |
| [MangaHere](comics/mangahere/index.js) | mangahere.cc | English | Adult | 1.1.1 |
| [MangaHub](comics/mangahub/index.js) | mangahub.io | English | Adult | 1.0.1 |
| [MangaIsekaiThai](comics/mangaisekaithai/index.js) | mangaisekaithai.net | Thai | Safe | 1.0.1 |
| [MangaK](comics/mangak/index.js) | mangak.io | English | Mature | 1.0.0 |
| [Mangakakalot](comics/mangakakalot/index.js) | mangakakalot.gg | English | Adult | 1.2.1 |
| [MangaKatana](comics/mangakatana/index.js) | mangakatana.com | English | Adult | 1.1.3 |
| [MangaKimi](comics/mangakimi/index.js) | mangakimi.com | Thai | Mature | 1.0.1 |
| [MangaOwl](comics/mangaowl/index.js) | mangaowl.io | English | Adult | 1.0.0 |
| [Mangapill](comics/mangapill/index.js) | mangapill.com | English | Adult | 1.0.0 |
| [MangaPlaza](comics/mangaplaza/index.js) | mangaplaza.com | English | Adult | 1.1.1 |
| [MangaRead](comics/mangaread/index.js) | mangaread.org | English | Adult | 1.0.1 |
| [Mangas.in](comics/mangasin/index.js) | m440.in | Spanish | Adult | 1.0.0 |
| [Mangasushi](comics/mangasushi/index.js) | mangasushi.org | English | Adult | 1.0.1 |
| [MangaToon](comics/mangatoon/index.js) | mangatoon.mobi | English | Mature | 1.3.0 |
| [MangaTown](comics/mangatown/index.js) | mangatown.com | English | Adult | 1.2.0 |
| [MangaTV](comics/mangatv/index.js) | mangatv.net | Spanish | Adult | 1.0.0 |
| [MangaWOW](comics/mangawow/index.js) | mangawow.org | Turkish | Mature | 1.0.2 |
| [MangoLibreria](comics/mangolibreria/index.js) | lectorfenix.com | Spanish | Adult | 1.0.1 |
| [Manhua Plus (.com)](comics/manhuapluscom/index.js) | manhuaplus.com | English | Mature | 1.0.0 |
| [ManhuaBug](comics/manhuabug/index.js) | manhuabug.com | Thai | Safe | 1.0.0 |
| [ManhuaFast](comics/manhuafast/index.js) | manhuafast.net | English | Mature | 1.0.1 |
| [Manhuagui](comics/manhuagui/index.js) | m.manhuagui.com | Chinese | Adult | 1.0.1 |
| [ManhuaHot](comics/manhuahot/index.js) | manhuahot.com | English | Mature | 1.0.0 |
| [Manhuanext](comics/manhuanext/index.js) | manhuanext.com | English | Safe | 1.0.0 |
| [Manhuaplus](comics/manhuaplus/index.js) | manhuaplus.org | English | Safe | 1.0.0 |
| [ManhuaThai](comics/manhuathai/index.js) | manhuathai.com | Thai | Safe | 1.0.0 |
| [Manhuaus](comics/manhuaus/index.js) | manhuaus.club | English | Mature | 1.0.0 |
| [ManhuaVN](comics/manhuavn/index.js) | manhuavn.top | Vietnamese | Adult | 1.2.0 |
| [Manhwa Latino](comics/manhwalatino/index.js) | manhwa-latino.com | Spanish | Adult | 1.0.0 |
| [Manhwa Reads](comics/manhwareads/index.js) | manhwareads.com | English | Mature | 1.0.0 |
| [Manhwa18](comics/manhwa18/index.js) | manhwa18.cc | English | Adult | 1.0.1 |
| [ManhwaBreakup](comics/manhwabreakup/index.js) | manhwabreakup.com | Thai | Safe | 1.0.0 |
| [ManhwaBuddy](comics/manhwabuddy/index.js) | manhwabuddy.com | English | Adult | 1.0.0 |
| [ManhwaClan](comics/manhwaclan/index.js) | manhwaclan.com | English | Adult | 1.0.1 |
| [Manhwaddict](comics/manhwaddict/index.js) | manhwaddict.com | English | Adult | 1.0.0 |
| [ManhwaGalaxy](comics/manhwagalaxy/index.js) | manhwagalaxy.com | English | Adult | 1.0.0 |
| [ManhwaHQ](comics/manhwahq/index.js) | manhwahq.com | English | Adult | 1.0.1 |
| [ManhwaNex](comics/manhwanex/index.js) | manhwanex.com | English | Safe | 1.0.0 |
| [ManhwaOnline](comics/manhwaonline/index.js) | manhwaonline.org | English | Mature | 1.0.0 |
| [ManhwaTop](comics/manhwatop/index.js) | manhwatop.com | English | Adult | 1.0.1 |
| [ManhwaWeb](comics/manhwaweb/index.js) | manhwaweb.com | Spanish | Adult | 1.0.2 |
| [Marmota](comics/marmota/index.js) | marmota.me | Spanish | Safe | 1.0.0 |
| [MGeko](comics/mgeko/index.js) | mgeko.cc | English | Safe | 1.0.0 |
| [Mgread.io](comics/mangayy/index.js) | mgread.io | English | Mature | 2.0.0 |
| [MHScans](comics/mhscans/index.js) | mhscans.com | Spanish | Safe | 1.1.0 |
| [Monopoly Scan](comics/monopolyscan/index.js) | monopolymanhua.com | Spanish | Safe | 1.0.2 |
| [Natomanga](comics/natomanga/index.js) | natomanga.com | English | Adult | 1.2.0 |
| [Naver Webtoon](comics/navercomic/index.js) | comic.naver.com | Korean | Mature | 1.2.0 |
| [Nebulosa Scan](comics/nebulosascan/index.js) | nebulosascan.com | Brazilian Portuguese | Mature | 1.0.2 |
| [NekoScans](comics/nekoscans/index.js) | nekoproject.org | Spanish | Safe | 1.0.0 |
| [NetTruyen](comics/nettruyen/index.js) | nettruyenvia.com | Vietnamese | Adult | 1.0.1 |
| [Ngomik](comics/ngomik/index.js) | 02.ngomik.cc | Indonesian | Safe | 1.0.0 |
| [Ninja Scan](comics/ninjascan/index.js) | ninjacomics.xyz | Brazilian Portuguese | Safe | 1.0.0 |
| [NirvanaManga](comics/nirvanamanga/index.js) | nirvanamanga.com | Turkish | Adult | 1.0.1 |
| [Nocturne Summer](comics/nocturnesummer/index.js) | nocfsb.com | Brazilian Portuguese | Mature | 1.0.0 |
| [Nyx Scans](comics/nyxscans/index.js) | nyxscans.com | English | Safe | 1.0.0 |
| [Olympus Scanlation](comics/olympusscans/index.js) | olympusbiblioteca.com | Spanish | Adult | 1.0.3 |
| [Orion Scans](comics/orionscans/index.js) | orion-scans.com | English | Safe | 1.0.0 |
| [Phoenix Scans](comics/phoenixscans/index.js) | phoenixscans.com | Italian | Mature | 1.0.1 |
| [Qi Manga](mixed/qimanga/index.js) | qimanga.com | English | Safe | 1.1.1 |
| [Rackus](comics/rackus/index.js) | rackusreads.com | English | Safe | 1.0.0 |
| [Ragnarok Scanlation](comics/ragnarokscanlation/index.js) | ragnarokscanlation.org | Spanish | Safe | 1.0.3 |
| [Rakuen Translations](comics/rakuentranslations/index.js) | rakuentranslations.com | Spanish | Mature | 1.0.2 |
| [Raven Scans](comics/ravenscans/index.js) | ravenscans.org | English | Adult | 1.0.1 |
| [Rawkuma](comics/rawkuma/index.js) | rawkuma.net | Japanese | Adult | 1.0.2 |
| [ReManga](comics/remanga/index.js) | remanga.org | Russian | Adult | 1.2.1 |
| [Renascans](comics/renascans/index.js) | renascans.net | English | Safe | 1.0.0 |
| [RichtoScan](comics/richtoscan/index.js) | r1.richtoon.top | Spanish | Safe | 1.0.1 |
| [RokariComics](comics/rokaricomics/index.js) | rokaricomics.com | English | Adult | 1.0.1 |
| [Rolia Scan](comics/roliascan/index.js) | roliascan.com | English | Mature | 1.0.0 |
| [Rùa Hấp Chanh Dây](comics/rahpchanhdy/index.js) | ruahapchanhday2.com | Vietnamese | Adult | 1.0.1 |
| [Rüya Manga](comics/ryamanga/index.js) | ruyamanga2.com | Turkish | Safe | 1.0.2 |
| [S2Manga](comics/s2manga/index.js) | s2read.com | English | Adult | 1.0.1 |
| [Sana Scans](comics/sanascans/index.js) | sanascans.com | English | Safe | 1.0.0 |
| [Scan-VF](comics/scanvf/index.js) | scan-vf.net | French | Safe | 1.0.0 |
| [Scythe Scans](comics/scythescans/index.js) | scythescans.com | English | Safe | 1.0.0 |
| [Shadow Manga](comics/shadowmanga/index.js) | shademanga.com | Spanish | Mature | 1.0.2 |
| [SingManga](comics/singmanga/index.js) | sing-manga.com | Thai | Safe | 1.0.1 |
| [Slow Manga](comics/slowmanga/index.js) | slow-manga.net | Thai | Mature | 1.0.2 |
| [Speed Manga](comics/speedmanga/index.js) | speed-manga.com | Thai | Mature | 1.0.0 |
| [Tanuki-Manga](comics/tanukimanga/index.js) | tanuki-manga.net | Thai | Mature | 1.0.1 |
| [Tapas](comics/tapas/index.js) | tapas.io | English | Mature | 1.2.0 |
| [Tarot Scans](comics/tarotscans/index.js) | tarotscans.com | Turkish | Adult | 1.0.1 |
| [TCB Scans](comics/tcbscans/index.js) | tcbonepiecechapters.com | English | Safe | 1.0.0 |
| [ThaiManga](comics/thaimanga/index.js) | thaimanga.net | Thai | Mature | 1.0.1 |
| [Thunder Scans](comics/thunderscans/index.js) | en-thunderscans.com | English | Mature | 1.0.0 |
| [Tilki Scans](comics/tilkiscans/index.js) | tilkiscans.com | Turkish | Mature | 1.1.0 |
| [TonizuToon](comics/tonizutoon/index.js) | tonizu.top | Turkish | Safe | 1.0.0 |
| [ToonGod](comics/toongod/index.js) | toongod.org | English | Adult | 1.0.1 |
| [ToonGrab](comics/toongrab/index.js) | toongrab.com | English | Safe | 1.0.0 |
| [Toonily](comics/toonily/index.js) | toonily.com | English | Adult | 1.2.1 |
| [Toonizy](comics/toonizy/index.js) | toonizy.com | English | Safe | 1.0.0 |
| [Tortuga Ceviri](comics/tortugaceviri/index.js) | tortugaceviri.com | Turkish | Safe | 1.0.2 |
| [Tritinia Scans](comics/tritinia/index.js) | tritinia.org | English | Mature | 1.0.1 |
| [TruyenQQ](comics/truyenqq/index.js) | truyenqqgo.com | Vietnamese | Safe | 1.0.0 |
| [TruyenTini](comics/truyentini/index.js) | truyentini.net | Vietnamese | Adult | 1.0.1 |
| [TruyenTuoiTho](comics/truyentuoitho/index.js) | truyentuoitho.com | Vietnamese | Safe | 1.0.2 |
| [Tsundoku Traduções](comics/tsundokutradues/index.js) | tsundoku.com.br | Brazilian Portuguese | Adult | 1.0.1 |
| [Türkçe Manga Oku](comics/trkemangaoku/index.js) | trmangaoku.com | Turkish | Safe | 1.0.2 |
| [Turkmanga](comics/turkmanga/index.js) | turkmanga.org | Turkish | Adult | 1.0.1 |
| [TuttoAnimeManga](comics/tuttoanimemanga/index.js) | tuttoanimemanga.net | Italian | Mature | 1.0.1 |
| [Uchuujin Projects](comics/uchuujinprojects/index.js) | uchuujinmangas.com | Spanish | Mature | 1.0.2 |
| [UnderTranslations](comics/undertranslations/index.js) | undertranslations.com | Spanish | Mature | 1.0.2 |
| [Violet Scans](comics/violetscans/index.js) | violetmanga.com | English | Safe | 1.0.0 |
| [VIZ Manga](comics/viz/index.js) | viz.com | English | Mature | 1.0.0 |
| [Vortex Scans](comics/vortexscans/index.js) | vortexscans.org | English | Safe | 1.0.0 |
| [WaManga](comics/wamanga/index.js) | wamanga.ru | Russian | Adult | 1.2.0 |
| [WEBTOON](comics/webtoons/index.js) | webtoons.com | English | Safe | 1.1.0 |
| [Webtoon Hatti](comics/webtoonhatti/index.js) | webtoonhatti.club | Turkish | Safe | 1.0.0 |
| [Weeb Central](comics/weebcentral/index.js) | weebcentral.com | English | Adult | 1.0.0 |
| [YakshaComics](comics/yakshacomics/index.js) | yakshacomics.com | English | Safe | 1.0.0 |
| [Yuri on Air](comics/yurionair/index.js) | yurionair.top | Brazilian Portuguese | Safe | 1.0.0 |
| [Yuri-Online](comics/yurionline/index.js) | yuri-online.com | Spanish | Safe | 1.0.2 |
| [Yurimanga](comics/yurimanga/index.js) | yurimanga.net | English | Adult | 1.1.0 |
| [Zenith Scans](comics/zenithscans/index.js) | zenithscans.com | Turkish | Safe | 1.0.0 |
| [Zinmanga](comics/zinmanga/index.js) | zinmanga.net | English | Safe | 1.0.0 |
| [ZonaTMO.org](comics/zonatmoorg/index.js) | zonatmo.org | Spanish | Adult | 1.0.0 |
| [مانجا العاشق](comics/3asq/index.js) | 3asq.online | Arabic | Mature | 1.0.0 |
| [مانجا ليك](comics/mangalik/index.js) | mangalik.net | Arabic | Safe | 1.0.2 |

### Novels

| Extension | Site | Language | Rating | Version |
| --- | --- | --- | --- | --- |
| [17K Novel Network](novels/17k/index.js) | 17k.com | Chinese | Mature | 1.3.0 |
| [AbertoVerse](novels/abertoverse/index.js) | abertoverse.com | English | Safe | 1.0.0 |
| [AsuraScans](mixed/asurascans/index.js) | asurascans.com | English | Safe | 2.4.0 |
| [Atsumaru](mixed/atsu/index.js) | atsu.moe | English | Mature | 1.0.1 |
| [Chikari](mixed/chikari/index.js) | chikari.moe | English | Adult | 4.4.0 |
| [Dreame](novels/dreame/index.js) | dreame.com | English | Adult | 1.2.0 |
| [Elejandría](novels/elejandria/index.js) | elejandria.com | Spanish | Mature | 1.0.0 |
| [Exnovels](novels/exnovels/index.js) | exnovels.com | English | Safe | 1.0.1 |
| [EzManga](mixed/ezmanga/index.js) | ezmanga.org | English | Safe | 1.0.1 |
| [FreeWebNovel](novels/freewebnovel/index.js) | freewebnovel.com | English | Adult | 1.2.2 |
| [GoodNovel](novels/goodnovel/index.js) | goodnovel.com | English | Adult | 1.2.1 |
| [JJWXC](novels/jjwxc/index.js) | jjwxc.net | Chinese | Mature | 1.3.0 |
| [Lectulandia](novels/lectulandia/index.js) | ww3.lectulandia.co | Spanish | Mature | 1.0.1 |
| [LibRead](novels/libread/index.js) | libread.com | English | Adult | 1.2.0 |
| [MoboReader](novels/moboreader/index.js) | moboreader.com | English | Adult | 1.2.0 |
| [Novel Archive](novels/novelarchive/index.js) | novelarchive.cc | English | Mature | 1.0.1 |
| [Novela en Español](novels/novelaenespanol/index.js) | novelaenespanol.com | Spanish | Mature | 1.0.1 |
| [NovelasLigeras](novels/novelasligeras/index.js) | novelasligeras.net | Spanish | Adult | 1.0.1 |
| [NovelBuddy](novels/novelbuddy/index.js) | novelbuddy.me | English | Adult | 1.2.0 |
| [NovelFire](novels/novelfire/index.js) | novelfire.net | English | Adult | 2.6.0 |
| [NovelFull](novels/novelfull/index.js) | novelfull.net | English | Adult | 1.1.1 |
| [Qi Manga](mixed/qimanga/index.js) | qimanga.com | English | Safe | 1.1.1 |
| [Qidian](novels/qidian/index.js) | qidian.com | Chinese | Safe | 1.2.0 |
| [Ranobes](novels/ranobes/index.js) | ranobes.top | English | Adult | 1.1.1 |
| [ReadNovelFull](novels/readnovelfull/index.js) | readnovelfull.com | English | Adult | 1.1.1 |
| [ReadWN](novels/readwn/index.js) | wuxiabox.com | English | Adult | 1.2.2 |
| [Royal Road](novels/royalroad/index.js) | royalroad.com | English | Safe | 1.0.0 |
| [ScribbleHub](novels/scribblehub/index.js) | scribblehub.com | English | Adult | 1.0.1 |
| [Sleepy Translations](novels/sleepytranslations/index.js) | sleepytranslations.com | English | Adult | 1.0.1 |
| [Traducciones Isekai](novels/traduccionesisekai/index.js) | traduccionesisekai.blogspot.com | Spanish | Mature | 1.2.1 |
| [Wattpad](novels/wattpad/index.js) | wattpad.com | English | Adult | 1.2.0 |
| [Webfic](novels/webfic/index.js) | webfic.com | English | Adult | 1.3.0 |
| [Webnovel](novels/webnovel/index.js) | webnovel.com | English | Adult | 1.4.4 |
| [Wikisource (Español)](novels/wikisourcees/index.js) | es.wikisource.org | Spanish | Safe | 1.0.2 |
| [Wuxiaworld](novels/wuxiaworld/index.js) | wuxiaworld.com | English | Mature | 1.1.0 |
| [WuxiaWorld.site](novels/wuxiaworldsite/index.js) | wuxiaworld.site | English | Adult | 1.0.1 |

### Anime

Video extensions use `medium: "anime"` and a `getVideos` method. Sumizuri plays them. Boundless skips them for now.

| Extension | Site | Language | Rating | Version |
| --- | --- | --- | --- | --- |
| [Anikoto](anime/anikoto/index.js) | anikototv.to | English | Mature | 1.0.2 |
| [AnimeAV1](anime/animeav1/index.js) | animeav1.com | Spanish | Mature | 1.0.0 |
| [AnimeGG](anime/animegg/index.js) | animegg.org | English | Mature | 1.0.1 |
| [AnimeHeaven](anime/animeheaven/index.js) | animeheaven.me | English | Mature | 1.0.1 |
| [AnimeJL](anime/animejl/index.js) | anime-jl.net | Spanish | Adult | 1.0.1 |
| [AnimeLatinoHD](anime/animelatinohd/index.js) | animelatinohd.com | Spanish | Mature | 1.0.0 |
| [AnimeMovil](anime/animemovil/index.js) | tvanime.tv | Spanish | Adult | 1.0.2 |
| [AnimeOnline.Ninja](anime/animeonlineninja/index.js) | ver2.animeonline.ninja | Spanish | Mature | 1.0.0 |
| [AniWorld](anime/aniworld/index.js) | aniworld.to | German | Mature | 1.0.3 |
| [AniZone](anime/anizone/index.js) | anizone.to | English | Mature | 1.0.2 |
| [Beatz Anime](anime/beatzanime/index.js) | beatz-anime.net | Spanish | Mature | 1.0.0 |
| [HentaiLA](anime/hentaila/index.js) | hentaila.com | Spanish | Adult | 1.0.0 |
| [JKAnime](anime/jkanime/index.js) | jkanime.net | Spanish | Mature | 1.0.0 |
| [Katanime](anime/katanime/index.js) | katanime.net | Spanish | Mature | 1.0.1 |
| [KickAssAnime](anime/kickassanime/index.js) | kaa.lt | English | Mature | 1.0.2 |
| [Latanime](anime/latanime/index.js) | latanime.org | Spanish | Mature | 1.0.0 |
| [LegionAnime](anime/legionanime/index.js) | legionanime.xyz | Spanish | Mature | 1.0.1 |
| [Miruro](anime/miruro/index.js) | miruro.cx | English | Mature | 1.0.1 |
| [MonosChinos](anime/monoschinos/index.js) | monoschinos.st | Spanish | Mature | 1.0.2 |
| [SerienStream](anime/serienstream/index.js) | serienstream.to | German | Mature | 1.0.3 |
| [TioAnime](anime/tioanime/index.js) | tioanime.com | Spanish | Mature | 1.0.0 |
| [UniqueStream](anime/uniquestream/index.js) | anime.uniquestream.net | English | Mature | 1.1.1 |
| [VerAnime](anime/veranime/index.js) | verani.me | Spanish | Mature | 1.0.1 |
| [VerAnimes](anime/veranimes/index.js) | wwv.veranimes.net | Spanish | Mature | 1.0.1 |

### Donghua

Video extensions use `medium: "anime"` and a `getVideos` method. Sumizuri plays them. Boundless skips them for now.

| Extension | Site | Language | Rating | Version |
| --- | --- | --- | --- | --- |
| [Anime4i](donghua/anime4i/index.js) | anime4i.com | English | Safe | 1.0.4 |
| [AnimeKhor](donghua/animekhor/index.js) | animekhor.org | English | Safe | 1.0.4 |
| [AnimeXin](donghua/animexin/index.js) | animexin.dev | English | Safe | 1.0.4 |
| [Donghua4K](donghua/donghua4k/index.js) | donghua4k.net | English | Safe | 1.0.4 |
| [LMAnime](donghua/lmanime/index.js) | lmanime.com | English | Safe | 1.0.4 |
| [LuciferDonghua](donghua/luciferdonghua/index.js) | luciferdonghua.org | English | Safe | 1.0.4 |
| [MundoDonghua](donghua/mundodonghua/index.js) | mundodonghua.com | Spanish | Mature | 1.0.2 |
| [NarulDonghua](donghua/naruldonghua/index.js) | naruldonghua.com | English | Safe | 1.0.4 |

### Drama

Video extensions use `medium: "anime"` and a `getVideos` method. Sumizuri plays them. Boundless skips them for now.

| Extension | Site | Language | Rating | Version |
| --- | --- | --- | --- | --- |
| [ARY Plus](drama/aryplus/index.js) | aryplus.tv | Urdu | Safe | 1.0.3 |
| [AsiaLiveAction](drama/asialiveaction/index.js) | asialiveaction.com | Spanish | Mature | 1.0.1 |
| [DoramasFlix](drama/doramasflix/index.js) | doramasflix.in | Spanish | Mature | 1.0.1 |
| [DoramasYT](drama/doramasyt/index.js) | doramasyt.com | Spanish | Mature | 1.0.1 |
| [KissAsian](drama/kissasian/index.js) | kissasian.com.gr | English | Mature | 1.0.0 |
| [MyAsianTV](drama/myasiantv/index.js) | ww7.myasiantv.rest | English | Mature | 1.0.0 |

### Western

Video extensions use `medium: "anime"` and a `getVideos` method. Sumizuri plays them. Boundless skips them for now.

| Extension | Site | Language | Rating | Version |
| --- | --- | --- | --- | --- |
| [Bingr](western/bingr/index.js) | bingr.one | English | Mature | 1.0.3 |
| [CineCalidad](western/cinecalidad/index.js) | cinecalidad.org | Spanish | Mature | 1.0.0 |
| [CinePlus123](western/cineplus123/index.js) | cineplus123.org | Spanish | Mature | 1.0.1 |
| [Cuevana](western/cuevana/index.js) | cuevana3.eu | Spanish | Mature | 1.0.1 |
| [Gnula](western/gnula/index.js) | gnula.life | Spanish | Mature | 1.0.2 |
| [HydraHD](western/hydrahd/index.js) | hydrahd.gd | English | Mature | 1.0.4 |
| [PelisForte](western/pelisforte/index.js) | www2.pelisforte.se | Spanish | Mature | 1.0.0 |
| [PoseidonHD](western/poseidonhd/index.js) | poseidonhd2.co | Spanish | Mature | 1.0.1 |
| [PressPlayZ](western/pressplayz/index.js) | pressplayz.top | English | Mature | 1.0.3 |

## Known issues

These extensions are known to be broken right now:

- **Renascans** (`renascans`): The site's API address (api.renascans.net) no longer exists.

## Credits

Thanks to the people who built extensions for Inkstone.

- [matsukiender-star](https://github.com/matsukiender-star): AnimeAV1, AnimeJL, AnimeLatinoHD, AnimeMovil, AnimeOnline.Ninja, AsiaLiveAction, Beatz Anime, CineCalidad, CinePlus123, Cuevana, DoramasFlix, DoramasYT, Dragon Translation, Elejandría, Eternal Mangas, Gnula, HentaiLA, Ikigai Mangas, JKAnime, Katanime, KuManga, Latanime, Lectulandia, Leer Manhwas, LeerCapitulo, LegionAnime, Mangas.in, MangaTV, MangoLibreria, Manhwa Latino, ManhwaWeb, Marmota, MonosChinos, MundoDonghua, Novela en Español, NovelasLigeras, PelisForte, PoseidonHD, Shadow Manga, TioAnime, Traducciones Isekai, VerAnime, VerAnimes, Wikisource (Español), ZonaTMO.org
- [omfgitsjesus](https://discord.com/users/177424485526274048): HiperDEX

## Contributing

New extensions and fixes are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Copyright and takedowns

Inkstone doesn't host any content. The extensions are code that runs on your device and reads from other sites. If you think something in this repository infringes your rights, open an issue with the "Copyright or takedown request" template, or message us on [Discord](https://discord.gg/6pX2XgFYcs). More at [inkstone.web.app/copyright](https://inkstone.web.app/copyright).

## License

MIT. See [LICENSE](LICENSE).

## Disclaimer

Inkstone is an independent project. It isn't part of Boundless Reader and isn't endorsed by it.

Inkstone doesn't host any content. Extensions read from third party sites, and everything they show belongs to those sites and their owners.
