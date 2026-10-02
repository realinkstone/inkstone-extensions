# Inkstone

**Extension Registry.** Community-made extensions that add content to Boundless Reader. Free and open source under the MIT license.

Each extension is one small JavaScript file that Boundless downloads and runs in a sandbox on your device.

The full catalog and docs live at [inkstone.web.app](https://inkstone.web.app). Questions or a broken extension? Come say hi on [Discord](https://discord.gg/6pX2XgFYcs).

## Add it to Boundless

Paste this into Boundless Reader's extension settings:

```
https://inkstone.web.app/v3
```

Step by step guide: [inkstone.web.app/installation](https://inkstone.web.app/installation)

Nothing installs until you pick an extension, and removing one takes a tap.

## What's in here

```
<id>/index.js              one folder per extension
versioning.json            the list Boundless reads
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

92 extensions right now. Ratings are Safe, Mature or Adult, and some extensions also rate each title on its own.

### Comics

| Extension | Site | Language | Rating | Version |
| --- | --- | --- | --- | --- |
| [Anime-Sama](animesama/index.js) | anime-sama.to | French | Mature | 1.0.1 |
| [AsuraScans](asurascans/index.js) | asurascans.com | English | Safe | 2.3.1 |
| [BL village](blvillage/index.js) | blvillage.com | Japanese | Adult | 1.1.0 |
| [Chikari](chikari/index.js) | chikari.moe | English | Adult | 4.3.0 |
| [CManga](cmanga/index.js) | cmangavn.com | Vietnamese | Adult | 1.0.0 |
| [ComicFury](comicfury/index.js) | comicfury.com | English | Adult | 1.0.0 |
| [Comix](comix/index.js) | comix.to | English | Safe | 2.2.2 |
| [Flame Scans](flamescans/index.js) | flamecomics.xyz | English | Safe | 1.0.0 |
| [GD Scans](gdscans/index.js) | gdscans.com | English | Adult | 1.0.0 |
| [GlobalComix](globalcomix/index.js) | globalcomix.com | English | Adult | 1.1.0 |
| [HiveToons](hivetoon/index.js) | hivetoon.com | English | Adult | 1.0.0 |
| [Indomanhwa](indomanhwa/index.js) | indomanhwa.com | Indonesian | Mature | 1.0.0 |
| [InkStory](inkstory/index.js) | inkstory.net | Russian | Mature | 1.1.0 |
| [InManga](inmanga/index.js) | inmanga.com | Spanish | Safe | 1.1.0 |
| [Kagane](kagane/index.js) | kagane.to | English | Safe | 1.0.6 |
| [Keikomik](keikomik/index.js) | keikomik.net | Indonesian | Adult | 1.0.0 |
| [Kingofshojo](kingofshojo/index.js) | kingofshojo.com | English | Adult | 1.0.0 |
| [Komikindo](komikindo/index.js) | komikindo.ch | Indonesian | Adult | 1.0.0 |
| [Komiku](komiku/index.js) | komiku.org | Indonesian | Adult | 1.0.0 |
| [KunManga](kunmanga/index.js) | kunmanga.com | English | Adult | 1.1.0 |
| [Lectormanga](lectormanga/index.js) | lectormangass.net | Spanish | Adult | 1.2.0 |
| [LelManga](lelmanga/index.js) | lelmanga.com | French | Adult | 1.0.0 |
| [Lelscans](lelscans/index.js) | lelscans.net | French | Safe | 1.1.0 |
| [Manga District](mangadistrict/index.js) | mangadistrict.com | English | Adult | 1.0.0 |
| [Manga-Scantrad](mangascantrad/index.js) | manga-scantrad.io | French | Adult | 1.0.0 |
| [MangaBuddy](mangabuddy/index.js) | mangabuddy1.co.uk | English | Adult | 1.3.0 |
| [MangaDex](mangadex/index.js) | mangadex.org | English | Safe | 1.0.0 |
| [MangaFire](mangafire/index.js) | mangafire.to | English | Safe | 1.0.0 |
| [MangaFreak](mangafreak/index.js) | mangafreak.me | English | Adult | 1.0.0 |
| [MangaGo](mangago/index.js) | mangago.me | English | Adult | 1.1.0 |
| [MangaHere](mangahere/index.js) | mangahere.cc | English | Adult | 1.0.0 |
| [MangaHub](mangahub/index.js) | mangahub.io | English | Adult | 1.0.0 |
| [Mangakakalot](mangakakalot/index.js) | mangakakalot.gg | English | Adult | 1.2.0 |
| [MangaKatana](mangakatana/index.js) | mangakatana.com | English | Adult | 1.1.2 |
| [MangaOwl](mangaowl/index.js) | mangaowl.io | English | Adult | 1.0.0 |
| [Mangapill](mangapill/index.js) | mangapill.com | English | Adult | 1.0.0 |
| [MangaPlaza](mangaplaza/index.js) | mangaplaza.com | English | Adult | 1.1.1 |
| [MangaRead](mangaread/index.js) | mangaread.org | English | Adult | 1.0.0 |
| [MangaToon](mangatoon/index.js) | mangatoon.mobi | English | Mature | 1.1.1 |
| [MangaTown](mangatown/index.js) | mangatown.com | English | Adult | 1.1.1 |
| [ManhuaFast](manhuafast/index.js) | manhuafast.net | English | Mature | 1.0.0 |
| [Manhuagui](manhuagui/index.js) | m.manhuagui.com | Chinese | Adult | 1.0.1 |
| [ManhuaHot](manhuahot/index.js) | manhuahot.com | English | Mature | 1.0.0 |
| [Manhuaplus](manhuaplus/index.js) | manhuaplus.org | English | Safe | 1.0.0 |
| [Manhuaus](manhuaus/index.js) | manhuaus.club | English | Mature | 1.0.0 |
| [ManhuaVN](manhuavn/index.js) | manhuavn.top | Vietnamese | Adult | 1.1.0 |
| [Manhwa18](manhwa18/index.js) | manhwa18.cc | English | Adult | 1.0.0 |
| [ManhwaClan](manhwaclan/index.js) | manhwaclan.com | English | Adult | 1.0.0 |
| [ManhwaHQ](manhwahq/index.js) | manhwahq.com | English | Adult | 1.0.1 |
| [ManhwaTop](manhwatop/index.js) | manhwatop.com | English | Adult | 1.0.0 |
| [MGeko](mgeko/index.js) | mgeko.cc | English | Safe | 1.0.0 |
| [Natomanga](natomanga/index.js) | natomanga.com | English | Adult | 1.2.0 |
| [Naver Webtoon](navercomic/index.js) | comic.naver.com | Korean | Mature | 1.1.0 |
| [NetTruyen](nettruyen/index.js) | nettruyenvia.com | Vietnamese | Adult | 1.0.0 |
| [NirvanaManga](nirvanamanga/index.js) | nirvanamanga.com | Turkish | Adult | 1.0.0 |
| [Olympus Scanlation](olympusscans/index.js) | olympusbiblioteca.com | Spanish | Adult | 1.0.2 |
| [Rawkuma](rawkuma/index.js) | rawkuma.net | Japanese | Adult | 1.0.0 |
| [ReManga](remanga/index.js) | remanga.org | Russian | Adult | 1.2.1 |
| [Scan-VF](scanvf/index.js) | scan-vf.net | French | Safe | 1.0.0 |
| [Serein Scan](sereinscan/index.js) | sereinscan.net | Turkish | Safe | 1.0.0 |
| [Tapas](tapas/index.js) | tapas.io | English | Mature | 1.1.0 |
| [Tilki Scans](tilkiscans/index.js) | tilkiscans.com | Turkish | Mature | 1.1.0 |
| [ToonGod](toongod/index.js) | toongod.org | English | Adult | 1.0.0 |
| [Toonily](toonily/index.js) | toonily.com | English | Adult | 1.2.1 |
| [Tritinia Scans](tritinia/index.js) | tritinia.org | English | Mature | 1.0.0 |
| [TruyenQQ](truyenqq/index.js) | truyenqqgo.com | Vietnamese | Safe | 1.0.0 |
| [Turkmanga](turkmanga/index.js) | turkmanga.org | Turkish | Adult | 1.0.0 |
| [VIZ Manga](viz/index.js) | viz.com | English | Mature | 1.0.0 |
| [WaManga](wamanga/index.js) | wamanga.ru | Russian | Adult | 1.2.0 |
| [WEBTOON](webtoons/index.js) | webtoons.com | English | Safe | 1.0.0 |
| [Weeb Central](weebcentral/index.js) | weebcentral.com | English | Adult | 1.0.0 |
| [Yurimanga](yurimanga/index.js) | yurimanga.net | English | Adult | 1.1.0 |

### Novels

| Extension | Site | Language | Rating | Version |
| --- | --- | --- | --- | --- |
| [17K Novel Network](17k/index.js) | 17k.com | Chinese | Mature | 1.2.0 |
| [Chikari](chikari/index.js) | chikari.moe | English | Adult | 4.3.0 |
| [Dreame](dreame/index.js) | dreame.com | English | Adult | 1.2.0 |
| [FreeWebNovel](freewebnovel/index.js) | freewebnovel.com | English | Adult | 1.2.0 |
| [GoodNovel](goodnovel/index.js) | goodnovel.com | English | Adult | 1.2.0 |
| [JJWXC](jjwxc/index.js) | jjwxc.net | Chinese | Mature | 1.2.0 |
| [LibRead](libread/index.js) | libread.com | English | Adult | 1.2.0 |
| [MoboReader](moboreader/index.js) | moboreader.com | English | Adult | 1.2.0 |
| [NovelBuddy](novelbuddy/index.js) | novelbuddy.me | English | Adult | 1.2.0 |
| [NovelFire](novelfire/index.js) | novelfire.net | English | Adult | 2.6.0 |
| [NovelFull](novelfull/index.js) | novelfull.net | English | Adult | 1.1.0 |
| [Qidian](qidian/index.js) | qidian.com | Chinese | Safe | 1.2.0 |
| [Ranobes](ranobes/index.js) | ranobes.top | English | Adult | 1.1.0 |
| [ReadNovelFull](readnovelfull/index.js) | readnovelfull.com | English | Adult | 1.1.0 |
| [ReadWN](readwn/index.js) | wuxiabox.com | English | Safe | 1.2.0 |
| [Royal Road](royalroad/index.js) | royalroad.com | English | Safe | 1.0.0 |
| [ScribbleHub](scribblehub/index.js) | scribblehub.com | English | Adult | 1.0.0 |
| [Wattpad](wattpad/index.js) | wattpad.com | English | Adult | 1.1.0 |
| [Webfic](webfic/index.js) | webfic.com | English | Adult | 1.2.0 |
| [Webnovel](webnovel/index.js) | webnovel.com | English | Adult | 1.2.0 |
| [Wuxiaworld](wuxiaworld/index.js) | wuxiaworld.com | English | Mature | 1.1.0 |

## Contributing

New extensions and fixes are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).

## Disclaimer

Inkstone is an independent project. It isn't part of Boundless Reader and isn't endorsed by it.

Inkstone doesn't host any content. Extensions read from third party sites, and everything they show belongs to those sites and their owners.
