import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { React, ReactNative as RN } from "@vendetta/metro/common";
import { Forms } from "@vendetta/ui/components";

import * as cache from "./cache";

const { FormSection, FormSwitchRow, FormInput, FormText, FormDivider } = Forms;

const DEFAULTS: Record<string, any> = {
    twitter: true,
    reddit: true,
    instagram: true,
    tiktok: true,
    inlineVideo: true,
    maxCaption: 600,
    apiHost: "api.fxtwitter.com",
    tiktokHost: "tnktok.com",
    instagramHost: ""
};

export function applyDefaults() {
    for (const [key, value] of Object.entries(DEFAULTS)) {
        if (storage[key] === undefined) storage[key] = value;
    }
}

export default function Settings() {
    useProxy(storage);
    applyDefaults();

    const toggle = (key: string, label: string, sub?: string) => (
        <FormSwitchRow
            label={label}
            subLabel={sub}
            value={!!storage[key]}
            onValueChange={(v: boolean) => { storage[key] = v; }}
        />
    );

    return (
        <RN.ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
            <FormSection title="Platforms" android_noDivider>
                {toggle("twitter", "X / Twitter", "Posts with text, photos, video, polls and quotes")}
                {toggle("reddit", "Reddit", "Title, text, images, galleries and Reddit-hosted video")}
                {toggle("tiktok", "TikTok", "Caption, creator, thumbnail and video (via replacement host)")}
                {toggle("instagram", "Instagram", "Best effort: login walls often block it")}
            </FormSection>

            <FormSection title="Display">
                {toggle("inlineVideo", "Inline video player", "Experimental. If videos show up blank, turn this off to get a thumbnail with a tap-to-open link.")}
                <FormDivider />
                <FormInput
                    title="Max caption length"
                    keyboardType="numeric"
                    value={String(storage.maxCaption ?? 600)}
                    onChange={(v: string) => { storage.maxCaption = parseInt(v, 10) || 600; }}
                />
            </FormSection>

            <FormSection title="Hosts">
                <FormInput
                    title="FxTwitter API host"
                    placeholder="api.fxtwitter.com"
                    value={storage.apiHost}
                    autoCapitalize="none"
                    onChange={(v: string) => { storage.apiHost = v; cache.clear(); }}
                />
                <FormInput
                    title="TikTok replacement host"
                    placeholder="tnktok.com"
                    value={storage.tiktokHost}
                    autoCapitalize="none"
                    onChange={(v: string) => { storage.tiktokHost = v; cache.clear(); }}
                />
                <FormInput
                    title="Instagram replacement host (optional)"
                    placeholder="leave empty to read instagram.com directly"
                    value={storage.instagramHost}
                    autoCapitalize="none"
                    onChange={(v: string) => { storage.instagramHost = v; cache.clear(); }}
                />
                <FormText style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
                    Message text is never modified. Discord's own embed for these platforms is replaced when a preview loads;
                    links wrapped in &lt;angle brackets&gt; or messages with embeds suppressed are left alone. Links already using
                    fixupx.com / fixvx.com / fxtwitter.com are left to Discord.
                </FormText>
            </FormSection>
        </RN.ScrollView>
    );
}
