import { attachVideo, img, icon, Opts, RawEmbed } from "../embed";
import { compact, getJson, positive, toIso, truncate } from "../util";

interface Media { url: string; thumbnail?: string; type?: string; width?: number; height?: number; }
interface Post {
    name?: string; screenName?: string; avatar?: string; text?: string; createdAt?: string;
    videos: Media[]; photos: Media[];
    likes?: number; reposts?: number; replies?: number; quotes?: number; views?: number;
    quote?: { name?: string; screenName?: string; text?: string; };
    poll?: { choices?: Array<{ label?: string; percentage?: number; }>; total_votes?: number; time_left_en?: string; };
}

const UA = { "User-Agent": "Vendetta-FxEmbedPreview" };
const num = (v: unknown) => typeof v === "number" ? v : undefined;

// ---- FxTwitter v2 (primary) ----
function normalizeFx(s: any): Post {
    const quote = s.quote && s.quote.type !== "tombstone" ? s.quote : undefined;
    const rawVideos: any[] = s.media?.videos?.length ? s.media.videos : quote?.media?.videos ?? [];
    return {
        name: s.author?.name,
        screenName: s.author?.screen_name,
        avatar: s.author?.avatar_url ?? undefined,
        text: s.text,
        createdAt: s.created_at,
        videos: rawVideos.filter(v => v?.url).map(v => ({ url: v.url, thumbnail: v.thumbnail_url, type: v.type, width: positive(v.width), height: positive(v.height) })),
        photos: (s.media?.photos ?? []).filter((p: any) => p?.url).map((p: any) => ({ url: p.url, width: positive(p.width), height: positive(p.height) })),
        likes: num(s.likes), reposts: num(s.reposts), replies: num(s.replies), quotes: num(s.quotes), views: num(s.views),
        quote: quote ? { name: quote.author?.name, screenName: quote.author?.screen_name, text: quote.text } : undefined,
        poll: s.poll
    };
}

// ---- VxTwitter (fallback; no quote/poll detail) ----
function normalizeVx(t: any): Post {
    const ext: any[] = Array.isArray(t.media_extended) ? t.media_extended : [];
    const videos: Media[] = ext
        .filter(m => /video|gif/i.test(m.type ?? "") && typeof m.url === "string")
        .map(m => ({ url: m.url, thumbnail: m.thumbnail_url, type: m.type, width: positive(m.size?.width), height: positive(m.size?.height) }));
    for (const url of Array.isArray(t.mediaURLs) ? t.mediaURLs : []) {
        if (typeof url === "string" && /video\.twimg\.com/i.test(url) && !videos.some(v => v.url === url))
            videos.push({ url, type: /tweet_video/i.test(url) ? "gif" : "video" });
    }
    return {
        name: t.user_name, screenName: t.user_screen_name, avatar: t.user_profile_image_url ?? t.profile_image_url,
        text: t.text, createdAt: t.date, videos,
        photos: ext.filter(m => /photo|image/i.test(m.type ?? "") && typeof m.url === "string").map(m => ({ url: m.url, width: positive(m.size?.width), height: positive(m.size?.height) })),
        likes: num(t.likes), reposts: num(t.retweets), replies: num(t.replies), views: num(t.views)
    };
}

async function load(id: string, apiHost: string): Promise<Post | null> {
    let fallback = false;
    try {
        const { status, json } = await getJson<any>(`https://${apiHost}/2/status/${id}`, UA);
        if (status === 200 && json?.code === 200 && json.status && json.status.type !== "tombstone") return normalizeFx(json.status);
        if (status >= 200 && status < 300) {
            // HTTP OK but unusable body: fall back on server-side errors or a missing status object.
            const code = json?.code ?? 0;
            fallback = code >= 500 || code === 429 || !json?.status;
        } else {
            fallback = status >= 500 || status === 429;
        }
        if (!fallback) return null; // definitive: deleted / private / 404
    } catch { fallback = true; }

    if (!fallback) return null;
    try {
        const { status, json } = await getJson<any>(`https://api.vxtwitter.com/i/status/${id}`, UA);
        if (status !== 200) return null;
        const tweet = json?.tweet ?? json;
        if (!tweet || (!tweet.tweetID && !tweet.text && !tweet.mediaURLs && !tweet.media_extended)) return null;
        return normalizeVx(tweet);
    } catch { return null; }
}

const bar = (pct: number) => {
    const filled = Math.round(Math.max(0, Math.min(100, pct)) / 10);
    return "▰".repeat(filled) + "▱".repeat(10 - filled);
};

export async function fetchTwitter(statusId: string, url: string, opts: Opts): Promise<RawEmbed[] | null> {
    const post = await load(statusId, opts.apiHost);
    if (!post) return null;
    if (!post.text && !post.videos.length && !post.photos.length && !post.quote && !post.poll) return null;

    const stats = ([
        post.replies != null && `💬 ${compact(post.replies)}`,
        post.reposts != null && `🔁 ${compact(post.reposts)}`,
        post.likes != null && `❤️ ${compact(post.likes)}`,
        post.views != null && `👁 ${compact(post.views)}`,
        post.quotes ? `↪ ${compact(post.quotes)}` : false
    ].filter(Boolean) as string[]).join("  ");

    const main: RawEmbed = {
        type: "rich",
        url,
        color: 0x1d9bf0,
        description: truncate(post.text, opts.maxCaption),
        timestamp: toIso(post.createdAt),
        footer: { text: `FxEmbed${stats ? ` · ${stats}` : ""}` }
    };
    if (post.name || post.screenName) {
        main.author = {
            name: post.screenName ? `${post.name ?? post.screenName} (@${post.screenName})` : post.name!,
            url: post.screenName ? `https://x.com/${post.screenName}` : undefined,
            ...icon(post.avatar)
        };
    }

    const fields: NonNullable<RawEmbed["fields"]> = [];
    if (post.quote && (post.quote.text || post.quote.name)) {
        const who = [post.quote.name, post.quote.screenName && `@${post.quote.screenName}`].filter(Boolean).join(" ");
        fields.push({ name: `↪ Quoting ${who || "a post"}`, value: truncate(post.quote.text, 1000) || "\u200b" });
    }
    if (post.poll?.choices?.length) {
        const lines = post.poll.choices.map((c, i) => {
            const pct = Math.max(0, Math.min(100, Number(c.percentage ?? 0)));
            return `${bar(pct)} **${pct}%** ${c.label || `Option ${i + 1}`}`;
        });
        if (post.poll.time_left_en) lines.push(`*${post.poll.time_left_en}*`);
        fields.push({
            name: `Poll${post.poll.total_votes != null ? ` · ${post.poll.total_votes.toLocaleString()} votes` : ""}`,
            value: truncate(lines.join("\n"), 1000)!
        });
    }
    if (fields.length) main.fields = fields;

    const extras: RawEmbed[] = [];
    const video = post.videos[0];
    const photos = post.photos.slice(0, 4);
    if (video) {
        attachVideo(main, { url: video.url, thumbnail: video.thumbnail, width: video.width, height: video.height }, opts.inlineVideo);
        for (const p of photos) extras.push({ type: "rich", url, image: img(p.url, p.width, p.height) });
    } else if (photos.length) {
        main.image = img(photos[0].url, photos[0].width, photos[0].height);
        // Several embeds sharing one URL are grouped into a gallery by Discord.
        for (const p of photos.slice(1)) extras.push({ type: "rich", url, image: img(p.url, p.width, p.height) });
    }
    return [main, ...extras];
}
