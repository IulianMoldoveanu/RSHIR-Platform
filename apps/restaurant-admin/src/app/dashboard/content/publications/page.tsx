'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Megaphone,
  TrendingUp,
  TrendingDown,
  ExternalLink,
  Eye,
  MousePointerClick,
  ShoppingCart,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

type PubChannel = 'Facebook' | 'Instagram' | 'TikTok' | 'LinkedIn' | 'X';

type FilterTab = 'all' | PubChannel;

type Publication = {
  id: number;
  channel: PubChannel;
  channelColor: string;
  format: string;
  body: string;
  permalink: string;
  postedAgo: string;
  impressions: number;
  clicks: number;
  conversions: number;
  trend: 'up' | 'down';
  trendNote: string;
};

const PUBLICATIONS: Publication[] = [
  {
    id: 1,
    channel: 'TikTok',
    channelColor: 'bg-zinc-900 text-white',
    format: 'TikTok Reel · 25 sec',
    body: 'Aveți pizza pentru un cartof astăzi? 🍕 Pizza Margherita la 25 RON — livrare gratuită!',
    permalink: 'tiktok.com/@pizzabrasov/video/7234567890',
    postedAgo: '2 zile în urmă',
    impressions: 12_840,
    clicks: 342,
    conversions: 28,
    trend: 'up',
    trendNote: 'Peste medie cu 40%',
  },
  {
    id: 2,
    channel: 'Instagram',
    channelColor: 'bg-gradient-to-r from-pink-500 to-orange-400 text-white',
    format: 'IG Reel · 18 sec',
    body: 'Cum economisește Mihai 4.200 RON/lună renunțând la Glovo. Patron mulțumit, clienți fericiți.',
    permalink: 'instagram.com/reel/CzXkLmn1234',
    postedAgo: '5 zile în urmă',
    impressions: 8_210,
    clicks: 198,
    conversions: 19,
    trend: 'up',
    trendNote: 'Peste medie cu 18%',
  },
  {
    id: 3,
    channel: 'Facebook',
    channelColor: 'bg-blue-600 text-white',
    format: 'Facebook Post · static',
    body: 'WEEKEND DEAL: 2 pizze mari + suc gratis = 49 RON. Comandă direct fără comision Glovo!',
    permalink: 'facebook.com/p/pizzabrasov/112233445566',
    postedAgo: '1 săpt în urmă',
    impressions: 3_420,
    clicks: 87,
    conversions: 12,
    trend: 'down',
    trendNote: 'Sub medie cu 5%',
  },
  {
    id: 4,
    channel: 'LinkedIn',
    channelColor: 'bg-sky-700 text-white',
    format: 'LinkedIn Post',
    body: 'Cum am ridicat marja restaurantului de la 8% la 24% în 3 luni. Secretul? Comenzi directe.',
    permalink: 'linkedin.com/posts/pizzabrasov-activity-7234567890',
    postedAgo: '1 săpt în urmă',
    impressions: 1_150,
    clicks: 54,
    conversions: 3,
    trend: 'up',
    trendNote: 'Peste medie cu 9%',
  },
  {
    id: 5,
    channel: 'Facebook',
    channelColor: 'bg-blue-600 text-white',
    format: 'Facebook Post · static',
    body: '🍕 Meniu nou! Pizza Quattro Formaggi cu brânzeturi românești. Disponibilă de luni.',
    permalink: 'facebook.com/p/pizzabrasov/998877665544',
    postedAgo: '2 săpt în urmă',
    impressions: 2_680,
    clicks: 61,
    conversions: 8,
    trend: 'down',
    trendNote: 'Sub medie cu 12%',
  },
  {
    id: 6,
    channel: 'Instagram',
    channelColor: 'bg-gradient-to-r from-pink-500 to-orange-400 text-white',
    format: 'IG Story · static',
    body: 'Vineri seara înseamnă pizza în familie. Livrăm până la 23:00 în tot Brașovul.',
    permalink: 'instagram.com/stories/pizzabrasov/highlights/17987654321',
    postedAgo: '2 săpt în urmă',
    impressions: 4_970,
    clicks: 130,
    conversions: 17,
    trend: 'up',
    trendNote: 'Peste medie cu 22%',
  },
];

const CHANNELS: PubChannel[] = ['Facebook', 'Instagram', 'TikTok', 'LinkedIn', 'X'];

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'Toate' },
  ...CHANNELS.map((ch) => ({ key: ch as FilterTab, label: ch })),
];

function fmt(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'k';
  return String(n);
}

function PublicationCard({ pub }: { pub: Publication }) {
  return (
    <article
      aria-label={`Publicație ${pub.channel}: ${pub.body.slice(0, 40)}...`}
      className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      {/* Top row */}
      <div className="flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${pub.channelColor}`}
        >
          {pub.format}
        </span>
        <span className="text-[11px] text-zinc-400">{pub.postedAgo}</span>
      </div>

      {/* Body */}
      <p className="mt-3 text-sm leading-relaxed text-zinc-700">{pub.body}</p>

      {/* Permalink */}
      <a
        href={`https://${pub.permalink}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Deschide postarea pe ${pub.channel}`}
        className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
      >
        <ExternalLink className="h-3 w-3" aria-hidden />
        {pub.permalink}
      </a>

      {/* Metrics */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-zinc-50 px-3 py-2 text-center">
          <div className="flex items-center justify-center gap-1 text-zinc-400">
            <Eye className="h-3.5 w-3.5" aria-hidden />
            <span className="text-[10px] uppercase tracking-wide">Impresii</span>
          </div>
          <p className="mt-0.5 text-base font-bold text-zinc-900">{fmt(pub.impressions)}</p>
        </div>
        <div className="rounded-lg bg-zinc-50 px-3 py-2 text-center">
          <div className="flex items-center justify-center gap-1 text-zinc-400">
            <MousePointerClick className="h-3.5 w-3.5" aria-hidden />
            <span className="text-[10px] uppercase tracking-wide">Click-uri</span>
          </div>
          <p className="mt-0.5 text-base font-bold text-zinc-900">{fmt(pub.clicks)}</p>
        </div>
        <div className="rounded-lg bg-zinc-50 px-3 py-2 text-center">
          <div className="flex items-center justify-center gap-1 text-zinc-400">
            <ShoppingCart className="h-3.5 w-3.5" aria-hidden />
            <span className="text-[10px] uppercase tracking-wide">Conversii</span>
          </div>
          <p className="mt-0.5 text-base font-bold text-zinc-900">{fmt(pub.conversions)}</p>
        </div>
      </div>

      {/* Trend */}
      <div
        className={`mt-3 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${
          pub.trend === 'up'
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-rose-50 text-rose-700'
        }`}
      >
        {pub.trend === 'up' ? (
          <TrendingUp className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <TrendingDown className="h-3.5 w-3.5" aria-hidden />
        )}
        {pub.trendNote}
      </div>
    </article>
  );
}

export default function ContentPublicationsPage() {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

  const filtered =
    activeFilter === 'all'
      ? PUBLICATIONS
      : PUBLICATIONS.filter((p) => p.channel === activeFilter);

  const totalImpressions = PUBLICATIONS.reduce((s, p) => s + p.impressions, 0);

  return (
    <div className="mx-auto max-w-4xl py-6">
      <Link
        href="/dashboard/content"
        className="mb-6 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Înapoi la Content
      </Link>

      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Megaphone className="h-7 w-7 text-violet-500" aria-hidden />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Publicații</h1>
            <p className="mt-0.5 text-sm text-zinc-500">
              {fmt(totalImpressions)} impresii totale · {PUBLICATIONS.length} postări
            </p>
          </div>
        </div>

        {/* Filter tabs */}
        <nav
          aria-label="Filtrare publicații pe canal"
          className="flex flex-wrap items-center gap-1 rounded-lg border border-zinc-200 bg-white p-1"
        >
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveFilter(tab.key)}
              aria-pressed={activeFilter === tab.key}
              aria-label={`Filtrează după canal: ${tab.label}`}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeFilter === tab.key
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Cards grid */}
      {filtered.length > 0 ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {filtered.map((pub) => (
            <PublicationCard key={pub.id} pub={pub} />
          ))}
        </div>
      ) : (
        <div className="mt-8 rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
          <Megaphone className="mx-auto h-10 w-10 text-zinc-300" aria-hidden />
          <p className="mt-3 text-sm font-medium text-zinc-600">
            Nu există publicații pe canalul selectat.
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Aprobă un draft și el va apărea aici după publicare.
          </p>
        </div>
      )}

      {/* Demo mode notice */}
      <p className="mt-8 text-center text-[11px] text-zinc-400">
        Mod demo — date simulate. Metrici reale apar după conectarea publisher-ilor.
      </p>
    </div>
  );
}
