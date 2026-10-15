import { Provider, Target } from "./embed";
import { bareHost, parseUrl } from "./util";

export interface Enabled { twitter: boolean; reddit: boolean; instagram: boolean; tiktok: boolean; }

/** Which provider an (embed or link) URL belongs to, regardless of whether it's a post link. */
export function providerOfHost(rawUrl: unknown): Provider | undefined {
    if (typeof rawUrl !== "string") return undefined;
    const p = parseUrl(rawUrl);
    if (!p) return undefined;
    const h = bareHost(p.host);
    if (h === "x.com" || h === "twitter.com") return "twitter";
    if (h === "reddit.com" || h.endsWith(".reddit.com") || h === "redd.it") return "reddit";
    if (h === "instagram.com") return "instagram";
    if (h === "tiktok.com" || h.endsWith(".tiktok.com")) return "tiktok";
    return undefined;
}

function classify(raw: string): Target | null {
    const p = parseUrl(raw);
    if (!p) return null;
    const h = bareHost(p.host);
    const path = p.path;

    if (h === "x.com" || h === "twitter.com") {
        // /<user>/status/<id>, /i/status/<id>, /i/web/status/<id>. Profiles, search, lists etc. don't match.
        const m = /^\/(?:[A-Za-z0-9_]{1,30}|i\/web|i)\/status(?:es)?\/(\d{1,25})/.exec(path);
        return m ? { provider: "twitter", url: `https://x.com/i/status/${m[1]}`, key: `tw:${m[1]}` } : null;
    }
    if (h === "reddit.com" || h.endsWith(".reddit.com")) {
        if (/^\/r\/[^/]+\/(?:comments\/[a-z0-9]+|s\/[A-Za-z0-9]+)/i.test(path)) {
            const clean = `https://www.reddit.com${path.replace(/\/$/, "")}`;
            return { provider: "reddit", url: clean, key: `rd:${clean}` };
        }
        return null;
    }
    if (h === "redd.it") {
        return /^\/[a-z0-9]+/i.test(path) ? { provider: "reddit", url: `https://redd.it${path}`, key: `rd:redd.it${path}` } : null;
    }
    if (h === "instagram.com") {
        const m = /^\/(?:[A-Za-z0-9_.]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/.exec(path);
        return m ? { provider: "instagram", url: `https://www.instagram.com/${m[1] === "reels" ? "reel" : m[1]}/${m[2]}/`, key: `ig:${m[2]}` } : null;
    }
    if (h === "tiktok.com" || h.endsWith(".tiktok.com")) {
        const ok = /^\/@[^/]+\/video\/\d+/.test(path) || /^\/t\/[^/]+/.test(path) || /^\/v\/\d+\.html$/.test(path)
            || ((h === "vm.tiktok.com" || h === "vt.tiktok.com") && /^\/[A-Za-z0-9]+/.test(path));
        if (!ok) return null;
        const clean = `https://${p.host}${path.replace(/\/$/, "")}`;
        return { provider: "tiktok", url: clean, key: `tt:${clean}` };
    }
    return null;
}

const URL_RE = /https?:\/\/[^\s<>]+/gi;

/** Up to 3 distinct previewable post links in a message. `<link>` (embed suppression) is respected. */
export function findTargets(content: string, enabled: Enabled): Target[] {
    const out: Target[] = [];
    const seen = new Set<string>();
    URL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = URL_RE.exec(content)) && out.length < 3) {
        if (m.index > 0 && content[m.index - 1] === "<") continue; // user wrapped it in <> to suppress embeds
        const raw = m[0].replace(/[),.!?\]*_~|]+$/, "");
        const t = classify(raw);
        if (!t || !enabled[t.provider] || seen.has(t.key)) continue;
        seen.add(t.key);
        out.push(t);
    }
    return out;
}
