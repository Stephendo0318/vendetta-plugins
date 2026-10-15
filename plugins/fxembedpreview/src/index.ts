import { storage } from "@vendetta/plugin";
import { findByStoreName } from "@vendetta/metro";
import { FluxDispatcher } from "@vendetta/metro/common";
import { before } from "@vendetta/patcher";

import * as cache from "./cache";
import { Opts, Provider, RawEmbed, Target } from "./embed";
import { Enabled, findTargets, providerOfHost } from "./links";
import { fetchInstagram } from "./providers/instagram";
import { fetchReddit } from "./providers/reddit";
import { fetchTikTok } from "./providers/tiktok";
import { fetchTwitter } from "./providers/twitter";
import Settings, { applyDefaults } from "./settings";
import { cleanDomain, limited } from "./util";

const MessageStore = findByStoreName("MessageStore");
const ChannelStore = findByStoreName("ChannelStore");

const SUPPRESS_EMBEDS = 1 << 2;

const enabled = (): Enabled => ({
    twitter: !!storage.twitter, reddit: !!storage.reddit, instagram: !!storage.instagram, tiktok: !!storage.tiktok
});

const options = (): Opts => ({
    inlineVideo: !!storage.inlineVideo,
    maxCaption: Math.max(50, Math.min(3500, Number(storage.maxCaption) || 600)),
    apiHost: cleanDomain(storage.apiHost, "api.fxtwitter.com"),
    tiktokHost: cleanDomain(storage.tiktokHost, "tnktok.com"),
    instagramHost: storage.instagramHost ? cleanDomain(storage.instagramHost, "") : ""
});

function fetchTarget(t: Target, o: Opts): Promise<RawEmbed[] | null> {
    switch (t.provider) {
        case "twitter": return fetchTwitter(t.key.slice(3), `https://x.com/i/status/${t.key.slice(3)}`, o);
        case "reddit": return fetchReddit(t.url, o);
        case "tiktok": return fetchTikTok(t.url, o);
        case "instagram": return fetchInstagram(t.url, o);
    }
}

// key -> messages waiting on that lookup (several messages can share one link)
const inflight = new Map<string, Set<string>>();

function schedule(t: Target, channelId: string, messageId: string) {
    const waiter = `${channelId}:${messageId}`;
    const existing = inflight.get(t.key);
    if (existing) { existing.add(waiter); return; }
    const waiters = new Set([waiter]);
    inflight.set(t.key, waiters);

    // Snapshot options now so a settings change mid-flight doesn't mix modes in one embed.
    const o = options();
    limited(() => fetchTarget(t, o))
        .catch(() => null)
        .then(result => {
            cache.put(t.key, result && result.length ? result : null);
            inflight.delete(t.key);
            if (result?.length) waiters.forEach(w => { const [c, m] = w.split(":"); refresh(c, m); });
        });
}

/** Ask the client to re-render a message; our dispatch hook then fills in the cached embeds. */
function refresh(channelId: string, messageId: string) {
    const stored = MessageStore.getMessage(channelId, messageId);
    if (!stored) return; // scrolled out / channel unloaded: it'll be processed again when loaded
    FluxDispatcher.dispatch({
        type: "MESSAGE_UPDATE",
        message: { id: messageId, channel_id: channelId, guild_id: ChannelStore.getChannel(channelId)?.guild_id, embeds: [] }
    });
}

/**
 * Mutates a raw message payload before Discord's stores see it:
 *  - cached lookup  -> replace that platform's Discord embeds with ours
 *  - not cached yet -> kick off the lookup; refresh() re-dispatches when it lands
 */
function processMessage(msg: any) {
    if (!msg?.id || !msg.channel_id || !Array.isArray(msg.embeds)) return;
    const stored = msg.content == null || msg.flags == null ? MessageStore.getMessage(msg.channel_id, msg.id) : null;
    const content: string | undefined = msg.content ?? stored?.content;
    const flags: number = msg.flags ?? stored?.flags ?? 0;
    if (!content || (flags & SUPPRESS_EMBEDS)) return;

    const targets = findTargets(content, enabled());
    if (!targets.length) return;

    const mine: RawEmbed[] = [];
    const providers = new Set<Provider>();
    for (const t of targets) {
        const hit = cache.peek(t.key);
        if (hit === undefined) schedule(t, msg.channel_id, msg.id);
        else if (hit) { mine.push(...hit); providers.add(t.provider); }
    }
    if (!mine.length) return;

    // Drop Discord's own (usually broken/missing) embed for the same platform, keep unrelated ones.
    const keep = msg.embeds.filter((e: any) => !providers.has(providerOfHost(e?.url) as Provider));
    msg.embeds = [...keep, ...mine].slice(0, 10);
}

const patches: Array<() => void> = [];

export default {
    onLoad() {
        applyDefaults();
        patches.push(before("dispatch", FluxDispatcher, ([payload]: any[]) => {
            try {
                switch (payload?.type) {
                    case "MESSAGE_CREATE":
                    case "MESSAGE_UPDATE":
                        processMessage(payload.message);
                        break;
                    case "LOAD_MESSAGES_SUCCESS":
                        if (Array.isArray(payload.messages)) payload.messages.forEach(processMessage);
                        break;
                }
            } catch (e) {
                console.error("[FxEmbedPreview]", e); // never break Discord's own dispatch
            }
        }));
    },
    onUnload() {
        patches.splice(0).forEach(unpatch => unpatch());
        inflight.clear();
        cache.clear();
    },
    settings: Settings
};
