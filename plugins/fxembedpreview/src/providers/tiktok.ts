import { attachVideo, img, Opts, RawEmbed } from "../embed";
import { fetchOg, getJson, httpsUrl, parseUrl, request, rewriteHost, truncate } from "../util";

const DISCORDBOT = "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)";

export async function fetchTikTok(rawUrl: string, opts: Opts): Promise<RawEmbed[] | null> {
    let url = rawUrl;
    let canonical = rawUrl;

    // Short share links -> canonical video URL (oEmbed is happier with those).
    const p = parseUrl(rawUrl);
    if (p && (p.host === "vm.tiktok.com" || p.host === "vt.tiktok.com" || /^\/t\//.test(p.path))) {
        try {
            const res = await request(rawUrl, { headers: { "User-Agent": DISCORDBOT } }, 12000);
            const finalUrl = res.url || rawUrl;
            if (/tiktok\.com\/@[^/]+\/video\/\d+/i.test(finalUrl)) canonical = finalUrl.split("?")[0];
        } catch { /* keep the short link */ }
    }
    url = canonical;

    // 1) Replacement host (e.g. tnktok.com) exposes og:video; 2) oEmbed gives author/title/thumbnail.
    const replacement = rewriteHost(url, "tiktok.com", opts.tiktokHost);
    const [og, oembed] = await Promise.all([
        replacement !== url ? fetchOg(replacement, DISCORDBOT).catch(() => null) : Promise.resolve(null),
        getJson<any>(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`).then(r => r.status === 200 ? r.json : null).catch(() => null)
    ]);
    if (!og && !oembed) return null;

    const embed: RawEmbed = {
        type: "rich",
        url,
        color: 0x25f4ee,
        description: truncate(oembed?.title ?? og?.description ?? og?.title, opts.maxCaption),
        author: oembed?.author_name ? { name: oembed.author_name, url: httpsUrl(oembed.author_url) } : undefined,
        footer: { text: "FxEmbed · TikTok" }
    };
    const thumb = httpsUrl(og?.image) ?? httpsUrl(oembed?.thumbnail_url);
    if (og?.video) {
        attachVideo(embed, { url: og.video, thumbnail: thumb, width: og.videoWidth, height: og.videoHeight }, opts.inlineVideo);
    } else if (thumb) {
        embed.image = img(thumb, oembed?.thumbnail_width, oembed?.thumbnail_height);
        embed.description = `${embed.description ? `${embed.description}\n\n` : ""}Tap the title to open the video in TikTok.`;
        embed.title = "Open on TikTok";
    }
    return [embed];
}
