import { attachVideo, img, Opts, RawEmbed } from "../embed";
import { compact, getJson, httpsUrl, parseUrl, positive, request, truncate } from "../util";

const UA = { "User-Agent": "Mozilla/5.0 (Android 14; Mobile) FxEmbedPreview/1.0" };

export async function fetchReddit(rawUrl: string, opts: Opts): Promise<RawEmbed[] | null> {
    let p = parseUrl(rawUrl);
    if (!p) return null;

    // redd.it/<id> and /r/<sub>/s/<code> share links redirect to the real post; the OS follows redirects for us.
    if (p.host === "redd.it" || /^\/r\/[^/]+\/s\//i.test(p.path)) {
        try {
            const res = await request(rawUrl, { headers: UA }, 12000);
            p = parseUrl(res.url || rawUrl);
        } catch { return null; }
    }
    if (!p || !/(^|\.)reddit\.com$/i.test(p.host) || !/^\/r\/[^/]+\/comments\/[a-z0-9]+/i.test(p.path)) return null;

    const permalink = p.path.replace(/\/$/, "");
    const { status, json } = await getJson<any>(`https://www.reddit.com${permalink}.json?raw_json=1`, UA);
    const d = status === 200 ? json?.[0]?.data?.children?.[0]?.data ?? json?.data?.children?.[0]?.data : null;
    if (!d || d.removed_by_category === "deleted") return null;

    const nsfw = d.over_18 === true;
    const url = `https://www.reddit.com${d.permalink ?? permalink}`;
    const embed: RawEmbed = {
        type: "rich",
        url,
        color: 0xff4500,
        title: truncate(`${nsfw ? "🔞 " : ""}${d.title ?? ""}`, 256),
        description: truncate(typeof d.selftext === "string" ? d.selftext : undefined, opts.maxCaption),
        author: typeof d.author === "string" ? { name: `u/${d.author}`, url: `https://www.reddit.com/user/${d.author}` } : undefined,
        timestamp: typeof d.created_utc === "number" ? new Date(d.created_utc * 1000).toISOString() : undefined,
        footer: { text: `FxEmbed · r/${d.subreddit ?? "?"} · ⬆ ${compact(Number(d.score ?? 0))}  💬 ${compact(Number(d.num_comments ?? 0))}` }
    };
    if (nsfw) return [embed]; // text only; don't pull NSFW media into the chat

    const poster = httpsUrl(d.preview?.images?.[0]?.source?.url);
    const rv = d.secure_media?.reddit_video ?? d.preview?.reddit_video_preview;
    const videoUrl = httpsUrl(rv?.fallback_url);
    if (videoUrl) {
        attachVideo(embed, { url: videoUrl, thumbnail: poster, width: positive(rv.width), height: positive(rv.height) }, opts.inlineVideo);
        return [embed];
    }

    // Gallery posts: ordered ids -> media_metadata
    if (d.is_gallery && d.gallery_data?.items && d.media_metadata) {
        const imgs = (d.gallery_data.items as any[]).slice(0, 4)
            .map(it => d.media_metadata[it.media_id]?.s)
            .filter((s: any) => httpsUrl(s?.u))
            .map((s: any) => img(s.u, positive(s.x), positive(s.y)));
        if (imgs.length) {
            embed.image = imgs[0];
            return [embed, ...imgs.slice(1).map(image => ({ type: "rich" as const, url, image }))];
        }
    }

    const direct = typeof d.url_overridden_by_dest === "string" && /\.(?:jpe?g|png|gif|webp)(?:\?|$)/i.test(d.url_overridden_by_dest)
        ? httpsUrl(d.url_overridden_by_dest) : undefined;
    const image = poster ?? direct;
    if (image) embed.image = img(image, positive(d.preview?.images?.[0]?.source?.width), positive(d.preview?.images?.[0]?.source?.height));
    return [embed];
}
