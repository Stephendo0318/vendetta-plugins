import { RawEmbed } from "./embed";

const OK_TTL = 30 * 60 * 1000;   // successful lookups reused for 30 min
const FAIL_TTL = 30 * 1000;      // failures retried after 30 s
const MAX = 300;

interface Entry { expires: number; value: RawEmbed[] | null; }
const map = new Map<string, Entry>();

/** undefined = not cached (go fetch), null = recently failed, array = ready. */
export function peek(key: string): RawEmbed[] | null | undefined {
    const e = map.get(key);
    if (!e) return undefined;
    if (e.expires < Date.now()) { map.delete(key); return undefined; }
    return e.value;
}

export function put(key: string, value: RawEmbed[] | null) {
    map.delete(key);
    map.set(key, { expires: Date.now() + (value ? OK_TTL : FAIL_TTL), value });
    while (map.size > MAX) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) break;
        map.delete(oldest);
    }
}

export const clear = () => map.clear();
