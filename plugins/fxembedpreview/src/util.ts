// Small helpers that avoid APIs React Native / Hermes handle badly
// (URL getters, URLSearchParams, AbortSignal.timeout, regex lookbehind).

export interface ParsedUrl { scheme: string; host: string; path: string; query: string; }

export function parseUrl(raw: string): ParsedUrl | null {
    const m = /^(https?):\/\/([^\/?#:@]+)(?::\d+)?([^?#]*)(\?[^#]*)?/i.exec(raw.trim());
    if (!m) return null;
    return { scheme: m[1].toLowerCase(), host: m[2].toLowerCase(), path: m[3] || "/", query: m[4] || "" };
}

/** x.com / www.x.com / mobile.twitter.com -> x.com / twitter.com */
export const bareHost = (host: string) => host.toLowerCase().replace(/^(?:www|m|mobile)\./, "");

export const isDomain = (v: string) => /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(v) && !v.includes("..") && v.includes(".");

export const cleanDomain = (v: unknown, fallback: string) => {
    const d = String(v ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    return isDomain(d) ? d : fallback;
};

/** Swap `from` for `to` while keeping subdomains (vm.tiktok.com -> vm.tnktok.com). */
export function rewriteHost(rawUrl: string, from: string, to: string): string {
    const p = parseUrl(rawUrl);
    if (!p) return rawUrl;
    const host = p.host;
    const sub = host === from ? "" : host.endsWith(`.${from}`) ? host.slice(0, -(from.length + 1)) : null;
    if (sub === null) return rawUrl;
    const newHost = sub && sub !== "www" && sub !== "m" && sub !== "mobile" ? `${sub}.${to}` : to;
    return `https://${newHost}${p.path}${p.query}`;
}

export const httpsUrl = (v: unknown): string | undefined =>
    typeof v === "string" && /^https:\/\/[^\s]+$/i.test(v) ? v : undefined;

export const positive = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : undefined;

export function truncate(text: string | undefined, max: number): string | undefined {
    if (!text) return undefined;
    return text.length > max ? `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…` : text;
}

export function compact(n: number): string {
    if (n >= 1e9) return `${(n / 1e9).toFixed(1).replace(/\.0$/, "")}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
    if (n >= 1e4) return `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
    return String(n);
}

export function toIso(value?: string): string | undefined {
    if (!value) return undefined;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** fetch with a timeout (AbortSignal.timeout doesn't exist in RN). Redirects are followed by the OS. */
export async function request(url: string, init: RequestInit = {}, ms = 12000): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

export async function getJson<T = any>(url: string, headers: Record<string, string> = {}): Promise<{ status: number; json: T | null; }> {
    const res = await request(url, { headers: { Accept: "application/json", ...headers } });
    let json: T | null = null;
    try { json = await res.json(); } catch { /* not JSON */ }
    return { status: res.status, json: res.ok ? json : json };
}

// ---------- Open Graph scraping (TikTok / Instagram) ----------

export function decodeEntities(value: string) {
    return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, e: string) => {
        if (e[0] === "#") {
            const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
            try { return String.fromCodePoint(code); } catch { return ""; }
        }
        return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " } as Record<string, string>)[e.toLowerCase()] ?? "";
    });
}

export function readMetaTags(html: string) {
    const tags: Record<string, string> = {};
    for (const tag of html.match(/<meta\s[^>]*>/gi) ?? []) {
        const key = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
        const c = /content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i.exec(tag);
        const content = c?.[1] ?? c?.[2];
        if (key && content != null && !(key in tags)) tags[key] = decodeEntities(content);
    }
    return tags;
}

export interface OgData {
    title?: string; description?: string; siteName?: string;
    image?: string; video?: string; videoWidth?: number; videoHeight?: number;
}

export async function fetchOg(url: string, userAgent: string): Promise<OgData | null> {
    const res = await request(url, { headers: { "User-Agent": userAgent, Accept: "text/html,application/xhtml+xml" } }, 15000);
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 1_000_000);
    const meta = readMetaTags(html);
    const abs = (v?: string) => {
        if (!v) return undefined;
        if (/^https:\/\//i.test(v)) return v;
        const base = parseUrl(res.url || url);
        if (base && v.startsWith("//")) return `https:${v}`;
        if (base && v.startsWith("/")) return `https://${base.host}${v}`;
        return undefined;
    };
    const videoType = meta["og:video:type"] ?? "";
    const titleTag = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1];
    const data: OgData = {
        title: meta["og:title"] ?? meta["twitter:title"] ?? (titleTag ? decodeEntities(titleTag) : undefined),
        description: meta["og:description"] ?? meta["twitter:description"] ?? meta.description,
        siteName: meta["og:site_name"],
        image: abs(meta["og:image"] ?? meta["twitter:image"]),
        video: /html/i.test(videoType) ? undefined : abs(meta["og:video:secure_url"] ?? meta["og:video:url"] ?? meta["og:video"] ?? meta["twitter:player:stream"]),
        videoWidth: positive(Number(meta["og:video:width"])),
        videoHeight: positive(Number(meta["og:video:height"]))
    };
    return data.title || data.description || data.image || data.video ? data : null;
}

/** Tiny FIFO limiter so opening a busy channel doesn't fire 50 requests at once. */
let active = 0;
const queue: Array<() => void> = [];
export function limited<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const run = () => {
            active++;
            task().then(resolve, reject).then(() => { active--; queue.shift()?.(); });
        };
        if (active < 4) run(); else queue.push(run);
    });
}
