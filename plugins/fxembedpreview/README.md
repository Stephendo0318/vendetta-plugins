# FxEmbedPreview for Vendetta / Revenge Classic

Port of the Vencord `fxEmbedPreview` plugin. Message text is never changed. For X/Twitter (main focus), Reddit,
TikTok and Instagram post links, the plugin looks up the post on-device and **replaces Discord's own embed with a
native Discord embed** built from the result.

## Install (into the template)
1. `git clone https://github.com/vendetta-mod/plugin-template` (or use it as a GitHub template), `pnpm i`.
2. Copy this folder to `plugins/fxembedpreview/` (it contains `manifest.json` + `src/`). Delete `plugins/template` if unused.
3. `pnpm build` -> `dist/fxembedpreview/{index.js,manifest.json}`.
4. Host `dist/` (the template's GitHub Actions workflow publishes it to GitHub Pages) and add
   `https://<user>.github.io/<repo>/fxembedpreview` in Revenge/Vendetta -> Plugins.

## What changed vs. the Vencord version
| Vencord | Here |
|---|---|
| `native.ts` (Electron main process, CSP allowlist, DNS/SSRF checks) | Gone. RN `fetch` has no CORS/CSP, so all lookups are plain `fetch` in `src/providers/*`. |
| Custom DOM card + `styles.css` | Native Discord embeds (author, text, fields, image, video, footer, timestamp). |
| Blob download cache, resume position, caption expand | Not needed / not possible with native embeds. Lookup cache kept (30 min OK, 30 s failure). |
| Clickable reply/repost/like intents | Not possible inside an embed; counts are shown in the footer. |
| Editable domain-rule table + generic OG route for any site | Replaced by 3 host fields (FxTwitter API, TikTok host, Instagram host) + per-platform toggles. |
| "Hide original embeds" toggle | Always on for the matched platform (see Limitations). |
| GIF autoplay/loop | GIFs play like normal videos (mp4). |

Kept: FxTwitter v2 -> VxTwitter fallback (a definitive 404 does not fall back), quotes, polls, up to 4 photos,
video dimensions for stable layout, TikTok via `tnktok.com` + oEmbed, Reddit JSON (galleries, hosted video),
best-effort Instagram, `fixupx.com`/`fixvx.com` links left to Discord. Added: `<link>` and "suppress embeds" are respected;
Reddit NSFW posts show text only.

## Settings
Platform toggles, **Inline video player** (experimental; turn off for thumbnail + tap-to-open link), max caption length,
and host overrides.

## How it works
`before("dispatch", FluxDispatcher)` rewrites `embeds` on `MESSAGE_CREATE`, `MESSAGE_UPDATE` and
`LOAD_MESSAGES_SUCCESS` payloads. Cache hit: embeds are swapped in synchronously. Miss: the lookup runs (max 4 at a
time) and a minimal `MESSAGE_UPDATE` is dispatched on completion, which passes back through the same hook.

## Limitations / unverified
- **Not tested inside Discord** (only type-checked, and the link parser + Twitter provider were run against mocked responses).
  The things most likely to need a tweak on a real device: whether `video` inside a rich embed plays inline on your client
  version (hence the toggle), and whether multiple same-URL image embeds are grouped into a gallery.
- When a lookup completes, the refresh sets the message's embeds to ours only, so an unrelated embed in the same message
  (e.g. a second, different link) disappears until the channel reloads.
- Instagram usually blocks anonymous scraping; set a replacement host in settings if you have one that works.
- Messages already in memory when the plugin loads are processed the next time they're (re)loaded.
