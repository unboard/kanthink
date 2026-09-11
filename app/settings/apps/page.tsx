'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, ExternalLink, Globe, Loader2, Sparkles } from 'lucide-react';
import type { AppPublisherProfile } from '@/lib/types';

/**
 * Settings → Apps.
 *
 * Two things live here and nowhere else: the house style every app thumbnail is
 * rendered in, and the public page your published apps appear on. Both are
 * account-level on purpose — a style repeated per app is a style nobody keeps
 * consistent, and a page per app is not a page anyone visits twice.
 */
export default function AppsSettingsPage() {
  const [profile, setProfile] = useState<AppPublisherProfile | null>(null);
  const [defaultPrompt, setDefaultPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [imagePrompt, setImagePrompt] = useState('');
  const [slug, setSlug] = useState('');
  const [pageTitle, setPageTitle] = useState('');
  const [bio, setBio] = useState('');
  const [isPublic, setIsPublic] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/playground/profile', { cache: 'no-store' });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) { setError(data?.error || 'Could not load your app settings'); return; }
        const p = data.profile as AppPublisherProfile;
        setProfile(p);
        setDefaultPrompt(data.defaultImagePrompt || '');
        setImagePrompt(p.appImagePrompt || '');
        setSlug(p.appPageSlug || '');
        setPageTitle(p.appPageTitle || '');
        setBio(p.appPageBio || '');
        setIsPublic(p.appPagePublic);
      } catch {
        if (!cancelled) setError('Could not load your app settings');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const save = useCallback(async (patch: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/playground/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error || 'Could not save'); return false; }
      const p = data.profile as AppPublisherProfile;
      setProfile(p);
      setSlug(p.appPageSlug || '');
      setIsPublic(p.appPagePublic);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
      return true;
    } catch {
      setError('Could not save');
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 sm:px-6 pb-16">
        <div className="py-20 flex items-center justify-center gap-2 text-sm text-neutral-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 pb-20 space-y-8">
      {/* House style */}
      <section>
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">Thumbnail style</h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
          Every app thumbnail is generated in this style. Describe the look, not any one
          app — Kan supplies the subject from whatever the app is, and this decides how it
          is rendered. It is the reason a shelf of twenty apps looks like one person made them.
        </p>

        <textarea
          value={imagePrompt}
          onChange={(e) => setImagePrompt(e.target.value)}
          onBlur={() => {
            if ((profile?.appImagePrompt || '') !== imagePrompt) void save({ appImagePrompt: imagePrompt });
          }}
          rows={4}
          placeholder={defaultPrompt}
          className="mt-3 w-full px-3 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm text-neutral-900 dark:text-white outline-none focus:border-violet-400 resize-none leading-relaxed"
        />
        <div className="mt-1.5 flex items-start justify-between gap-3">
          <p className="text-xs text-neutral-400">
            {imagePrompt.trim() ? 'Your style.' : 'Empty uses the Kanthink default, shown above as placeholder text.'}
          </p>
          {imagePrompt.trim() && (
            <button
              onClick={() => { setImagePrompt(''); void save({ appImagePrompt: '' }); }}
              className="flex-shrink-0 text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            >
              Reset to default
            </button>
          )}
        </div>

        <div className="mt-3 flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-violet-500/5 border border-violet-500/15">
          <Sparkles className="w-3.5 h-3.5 text-violet-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
            Changing this does not redraw anything. Existing thumbnails stay as they are until
            you regenerate them from the{' '}
            <Link href="/apps" className="text-violet-600 dark:text-violet-400 hover:underline">app directory</Link>.
          </p>
        </div>
      </section>

      {/* Public page */}
      <section>
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">Your public app page</h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
          One page listing every app you have published, at an address you choose. Apps only
          appear here once they are published — this page does not publish anything by itself.
        </p>

        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1.5">Address</span>
            <div className="flex items-stretch rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden focus-within:border-violet-400">
              <span className="flex items-center px-3 text-sm text-neutral-400 bg-neutral-50 dark:bg-neutral-800/60 border-r border-neutral-200 dark:border-neutral-800">
                /apps/u/
              </span>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                onBlur={() => {
                  if ((profile?.appPageSlug || '') !== slug) void save({ appPageSlug: slug });
                }}
                placeholder="your-name"
                className="flex-1 min-w-0 px-3 py-2.5 bg-white dark:bg-neutral-900 text-sm text-neutral-900 dark:text-white outline-none"
              />
            </div>
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1.5">Page title</span>
            <input
              value={pageTitle}
              onChange={(e) => setPageTitle(e.target.value)}
              onBlur={() => {
                if ((profile?.appPageTitle || '') !== pageTitle) void save({ appPageTitle: pageTitle });
              }}
              placeholder={profile?.name ? `${profile.name}'s apps` : 'Apps'}
              className="w-full px-3 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm text-neutral-900 dark:text-white outline-none focus:border-violet-400"
            />
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1.5">Intro</span>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              onBlur={() => {
                if ((profile?.appPageBio || '') !== bio) void save({ appPageBio: bio });
              }}
              rows={3}
              placeholder="A line or two about what you make."
              className="w-full px-3 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm text-neutral-900 dark:text-white outline-none focus:border-violet-400 resize-none"
            />
          </label>

          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
            <label className="flex items-center gap-3 px-3 py-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => { setIsPublic(e.target.checked); void save({ appPagePublic: e.target.checked }); }}
                disabled={!profile?.appPageSlug}
                className="w-4 h-4 rounded accent-violet-600 disabled:opacity-40"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-neutral-900 dark:text-white">Page is public</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {profile?.appPageSlug
                    ? 'Anyone with the address can see your published apps.'
                    : 'Pick an address first.'}
                </p>
              </div>
            </label>

            {profile?.appPageSlug && profile.appPagePublic && (
              <a
                href={`/apps/u/${profile.appPageSlug}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 px-3 py-2.5 border-t border-neutral-200 dark:border-neutral-800 text-xs text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/5"
              >
                <Globe className="w-3.5 h-3.5" />
                <span className="truncate">/apps/u/{profile.appPageSlug}</span>
                <ExternalLink className="w-3 h-3 ml-auto flex-shrink-0" />
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Status line: one place for every save on this page. */}
      <div className="h-5 text-xs">
        {error ? (
          <span className="text-red-500">{error}</span>
        ) : saving ? (
          <span className="flex items-center gap-1.5 text-neutral-400">
            <Loader2 className="w-3 h-3 animate-spin" /> Saving…
          </span>
        ) : saved ? (
          <span className="flex items-center gap-1.5 text-emerald-500">
            <Check className="w-3 h-3" /> Saved
          </span>
        ) : null}
      </div>
    </div>
  );
}
