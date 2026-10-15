// Raw Discord API embed shape (what the client's own embed sanitizer expects).
export interface RawEmbed {
    type: "rich";
    url?: string;
    title?: string;
    description?: string;
    color?: number;
    timestamp?: string;
    author?: { name: string; url?: string; icon_url?: string; proxy_icon_url?: string; };
    footer?: { text: string; };
    image?: { url: string; proxy_url?: string; width?: number; height?: number; };
    video?: { url: string; proxy_url?: string; width?: number; height?: number; };
    fields?: Array<{ name: string; value: string; inline?: boolean; }>;
}

export type Provider = "twitter" | "reddit" | "instagram" | "tiktok";

export interface Target { provider: Provider; url: string; key: string; }

export const img = (url: string, width?: number, height?: number) => ({ url, proxy_url: url, width, height });
export const icon = (url?: string) => url ? { icon_url: url, proxy_icon_url: url } : {};

export interface Opts {
    inlineVideo: boolean;
    maxCaption: number;
    apiHost: string;
    tiktokHost: string;
    instagramHost: string;
}

/**
 * Puts a video on an embed. Inline mode uses the embed's video slot (renders as a player in Discord);
 * otherwise shows the poster and a tappable link so something useful always appears.
 */
export function attachVideo(embed: RawEmbed, video: { url: string; thumbnail?: string; width?: number; height?: number; }, inline: boolean) {
    if (inline) {
        embed.video = img(video.url, video.width, video.height);
        return;
    }
    if (video.thumbnail) embed.image = img(video.thumbnail, video.width, video.height);
    embed.description = `${embed.description ? `${embed.description}\n\n` : ""}[▶ Watch video](${video.url})`;
}
