import 'server-only';
import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { SalesSheetStats } from './stats';

// Lane W — sales-sheet 1-pager.
//
// One A4 page, RO copy, branded HIR orange (#F97316) on near-white. Built
// with @react-pdf/renderer because (a) no Chromium runtime needed on
// Vercel serverless, (b) deterministic layout, (c) reasonable bundle.
//
// Audience variants change ONE block (the "Cui i se adresează"), the rest
// of the sheet stays identical so a partner who picks up two PDFs side-
// by-side still sees a coherent product.

export type SalesSheetAudience = 'fleet-manager' | 'restaurant-owner' | 'reseller';

const HIR_ORANGE = '#F97316';
const HIR_ORANGE_DARK = '#EA580C';
const INK = '#0F172A';
const MUTED = '#475569';
const BORDER = '#E2E8F0';
const SOFT_BG = '#FAFAFA';
const ACCENT_BG = '#FFF7ED'; // orange/50

const styles = StyleSheet.create({
  page: {
    padding: 28,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: INK,
    backgroundColor: '#FFFFFF',
  },
  // Hero strip
  hero: {
    backgroundColor: HIR_ORANGE,
    color: '#FFFFFF',
    padding: 16,
    borderRadius: 6,
    marginBottom: 12,
  },
  brand: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1.5,
    color: '#FFEDD5',
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    lineHeight: 1.15,
  },
  heroSub: {
    fontSize: 9,
    marginTop: 6,
    color: '#FFEDD5',
    lineHeight: 1.4,
  },
  // Stats row
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  statBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 6,
    padding: 10,
    backgroundColor: SOFT_BG,
  },
  statLabel: {
    fontSize: 7,
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    color: HIR_ORANGE_DARK,
    lineHeight: 1.1,
  },
  statSub: {
    fontSize: 7,
    color: MUTED,
    marginTop: 2,
  },
  // Section
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: INK,
    marginBottom: 6,
    marginTop: 4,
  },
  // Comparison table
  table: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 12,
  },
  tr: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  trLast: {
    flexDirection: 'row',
  },
  th: {
    flex: 1,
    padding: 6,
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    backgroundColor: '#F1F5F9',
    color: INK,
  },
  thFirst: {
    flex: 1.4,
    padding: 6,
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    backgroundColor: '#F1F5F9',
    color: INK,
  },
  td: {
    flex: 1,
    padding: 6,
    fontSize: 8,
    color: MUTED,
    borderLeftWidth: 1,
    borderLeftColor: BORDER,
  },
  tdFirst: {
    flex: 1.4,
    padding: 6,
    fontSize: 8,
    color: INK,
    fontFamily: 'Helvetica-Bold',
  },
  tdHir: {
    flex: 1,
    padding: 6,
    fontSize: 8,
    color: HIR_ORANGE_DARK,
    fontFamily: 'Helvetica-Bold',
    borderLeftWidth: 1,
    borderLeftColor: BORDER,
    backgroundColor: ACCENT_BG,
  },
  // Pricing
  pricingRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  pricingCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 6,
    padding: 10,
  },
  pricingTag: {
    fontSize: 7,
    color: HIR_ORANGE_DARK,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.5,
  },
  pricingTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: INK,
    marginTop: 2,
  },
  pricingBody: {
    fontSize: 8,
    color: MUTED,
    marginTop: 4,
    lineHeight: 1.4,
  },
  // Audience block
  audience: {
    borderWidth: 1,
    borderColor: HIR_ORANGE,
    backgroundColor: ACCENT_BG,
    borderRadius: 6,
    padding: 10,
    marginBottom: 12,
  },
  audienceTag: {
    fontSize: 7,
    color: HIR_ORANGE_DARK,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  audienceTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: INK,
    marginBottom: 4,
  },
  audienceBody: {
    fontSize: 8.5,
    color: INK,
    lineHeight: 1.45,
  },
  // Contact + footer
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 'auto',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  contactBlock: {
    fontSize: 8,
    color: INK,
    lineHeight: 1.45,
  },
  contactStrong: {
    fontFamily: 'Helvetica-Bold',
    color: INK,
  },
  ts: {
    fontSize: 6.5,
    color: '#94A3B8',
    textAlign: 'right',
  },
});

const fmtNum = (n: number | null): string => {
  if (n === null || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('ro-RO').format(n);
};

const fmtTimestamp = (iso: string): string => {
  const d = new Date(iso);
  // Romanian formatted timestamp; explicit so receiver knows when the
  // numbers were pulled.
  const date = d.toLocaleDateString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const time = d.toLocaleTimeString('ro-RO', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Bucharest',
  });
  return `${date} · ${time} (Europe/Bucharest)`;
};

function AudienceBlock({ audience }: { audience: SalesSheetAudience }) {
  if (audience === 'fleet-manager') {
    return (
      <View style={styles.audience}>
        <Text style={styles.audienceTag}>PENTRU MANAGERI DE FLOTĂ</Text>
        <Text style={styles.audienceTitle}>
          Conduci o flotă de curieri? Câștigă 25% Y1 + 20% recurring.
        </Text>
        <Text style={styles.audienceBody}>
          Fiecare restaurant adus pe HIR plătește 3 RON / livrare. Tu primești
          25% din comisionul HIR în primul an și 20% recurring după aceea.
          Curierii flotei tale primesc dispatch direct prin aplicația HIR
          Curier — fără app nou de instalat. Plată trimestrial pe factură SRL.
        </Text>
      </View>
    );
  }

  if (audience === 'restaurant-owner') {
    return (
      <View style={styles.audience}>
        <Text style={styles.audienceTag}>PENTRU PROPRIETARI DE RESTAURANT</Text>
        <Text style={styles.audienceTitle}>
          Vrei propriul site de comandă online? Setup în 10 minute.
        </Text>
        <Text style={styles.audienceBody}>
          Importăm meniul tău de pe GloriaFood, Glovo sau orice PDF / poză.
          Primești pagina ta de comenzi cu logo + brand propriu, fără
          cross-promote la concurenți. Datele clienților rămân la tine — CRM,
          SMS, email, loyalty. Plătești 3 RON / livrare și atât.
        </Text>
      </View>
    );
  }

  // reseller — quick ROI calculator. 5 restaurante × 800 ord/lună × 3 RON × 25%.
  return (
    <View style={styles.audience}>
      <Text style={styles.audienceTag}>PENTRU RESELLERI</Text>
      <Text style={styles.audienceTitle}>
        Calcul rapid: 5 restaurante = 3.000 RON / lună revenue share.
      </Text>
      <Text style={styles.audienceBody}>
        5 restaurante × 800 comenzi / lună × 3 RON HIR × 25% comision = 3.000
        RON / lună revenue share recurent. La 20 de restaurante înseamnă
        12.000 RON / lună. Plata trimestrial pe factură PFA / SRL. Fără
        upfront, fără target obligatoriu, fără exclusivitate.
      </Text>
    </View>
  );
}

export type SalesSheetProps = {
  audience: SalesSheetAudience;
  stats: SalesSheetStats;
};

export function SalesSheetDocument({ audience, stats }: SalesSheetProps) {
  return (
    <Document
      title="HIR Restaurant Suite — Fișă de prezentare"
      author="HIR Restaurant Suite"
      creator={process.env.NEXT_PUBLIC_PRIMARY_DOMAIN || 'hirforyou.ro'}
      producer={process.env.NEXT_PUBLIC_PRIMARY_DOMAIN || 'hirforyou.ro'}
    >
      <Page size="A4" style={styles.page}>
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.brand}>HIR RESTAURANT SUITE</Text>
          <Text style={styles.heroTitle}>
            Soluția de comenzi care nu îți ia comision din vânzări.
          </Text>
          <Text style={styles.heroSub}>
            3 RON flat per livrare. White-label per restaurant. Datele
            clientului rămân la tine. Construit în România.
          </Text>
        </View>

        {/* Live stats */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Restaurante active</Text>
            <Text style={styles.statValue}>{fmtNum(stats.activeTenants)}</Text>
            <Text style={styles.statSub}>tenants live pe platformă</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Orașe acoperite</Text>
            <Text style={styles.statValue}>{fmtNum(stats.liveCities)}</Text>
            <Text style={styles.statSub}>cu livrări înregistrate</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Comenzi 30 zile</Text>
            <Text style={styles.statValue}>{fmtNum(stats.ordersLast30Days)}</Text>
            <Text style={styles.statSub}>procesate în ultimele 30 zile</Text>
          </View>
        </View>

        {/* Comparison table */}
        <Text style={styles.sectionTitle}>HIR vs Glovo vs GloriaFood</Text>
        <View style={styles.table}>
          <View style={styles.tr}>
            <Text style={styles.thFirst}> </Text>
            <Text style={styles.th}>HIR</Text>
            <Text style={styles.th}>Glovo</Text>
            <Text style={styles.th}>GloriaFood</Text>
          </View>
          <View style={styles.tr}>
            <Text style={styles.tdFirst}>Comision din vânzare</Text>
            <Text style={styles.tdHir}>0% (3 RON / livrare flat)</Text>
            <Text style={styles.td}>~30%</Text>
            <Text style={styles.td}>~50 EUR / lună abonament</Text>
          </View>
          <View style={styles.tr}>
            <Text style={styles.tdFirst}>Livrare cu propria flotă</Text>
            <Text style={styles.tdHir}>Da (sau curier HIR)</Text>
            <Text style={styles.td}>Doar curier Glovo</Text>
            <Text style={styles.td}>Da (n-au curieri)</Text>
          </View>
          <View style={styles.tr}>
            <Text style={styles.tdFirst}>Branding propriu</Text>
            <Text style={styles.tdHir}>White-label complet</Text>
            <Text style={styles.td}>Brand Glovo</Text>
            <Text style={styles.td}>White-label limitat</Text>
          </View>
          <View style={styles.trLast}>
            <Text style={styles.tdFirst}>Datele clienților</Text>
            <Text style={styles.tdHir}>Rămân la restaurant</Text>
            <Text style={styles.td}>Blocate de Glovo</Text>
            <Text style={styles.td}>Se închide 30.04.2027</Text>
          </View>
        </View>

        {/* Pricing */}
        <Text style={styles.sectionTitle}>Prețuri</Text>
        <View style={styles.pricingRow}>
          <View style={styles.pricingCard}>
            <Text style={styles.pricingTag}>TIER 1</Text>
            <Text style={styles.pricingTitle}>3 RON / livrare</Text>
            <Text style={styles.pricingBody}>
              Tarif flat per comandă livrată. Restaurantul livrează cu propria
              flotă sau cu un curier desemnat. Fără abonament, fără setup fee.
            </Text>
          </View>
          <View style={styles.pricingCard}>
            <Text style={styles.pricingTag}>TIER 2</Text>
            <Text style={styles.pricingTitle}>Cost curier + 3 RON HIR</Text>
            <Text style={styles.pricingBody}>
              HIR alocă curier (HIR Direct sau prin rețeaua de parteneri).
              Restaurantul plătește costul curierului plus 3 RON HIR / livrare.
              Fără surpriză, fără markup ascuns.
            </Text>
          </View>
        </View>

        {/* Audience block */}
        <AudienceBlock audience={audience} />

        {/* Footer: contact + ts */}
        <View style={styles.footerRow}>
          <View style={styles.contactBlock}>
            <Text style={styles.contactStrong}>Iulian Moldoveanu — Founder, HIR</Text>
            <Text>iulianm698@gmail.com</Text>
            <Text>{process.env.NEXT_PUBLIC_PRIMARY_DOMAIN || 'hirforyou.ro'}</Text>
          </View>
          <View>
            <Text style={styles.ts}>Date generate la {fmtTimestamp(stats.generatedAt)}</Text>
            <Text style={styles.ts}>Document auto-generat — cifrele sunt reale, în timp real.</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
