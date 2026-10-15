import { attachVideo, img, Opts, RawEmbed } from "../embed";
import { fetchOg, rewriteHost, truncate } from "../util";

const ANDROID = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/122.0.0.0 Mobile Safari/537.36";
const DISCORDBOT = "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)";

// Best effort: Instagram's own page often returns a login wall. If you configure a replacement host
// in settings, that host's Open Graph tags (which usually include og:video) are used instead.
export async function fetchInstagram(rawUrl: string, opts: Opts): Promise<RawEmbed[] | null> {
    const useReplacement = !!opts.instagramHost;
    const target = useReplacement ? rewriteHost(rawUrl, "instagram.com", opts.instagramHost) : rawUrl;
    const og = await fetchOg(target, useReplacement ? DISCORDBOT : ANDROID);
    if (!og) return null;
    // A generic "Login • Instagram" page isn't a preview.
    if (!og.image && !og.video && /^\s*(?:login|instagram)\b/i.test(og.title ?? "")) return null;

    const embed: RawEmbed = {
        type: "rich",
        url: rawUrl,
        color: 0xe1306c,
        title: truncate(og.title, 256),
        description: truncate(og.description, opts.maxCaption),
        footer: { text: "FxEmbed · Instagram" }
    };
    if (og.video) attachVideo(embed, { url: og.video, thumbnail: og.image, width: og.videoWidth, height: og.videoHeight }, opts.inlineVideo);
    else if (og.image) embed.image = img(og.image);
    return [embed];
}
