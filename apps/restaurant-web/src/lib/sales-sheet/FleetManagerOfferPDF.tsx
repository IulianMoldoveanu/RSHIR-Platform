import 'server-only';
import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

// Fleet Manager Offer PDF.
//
// Minimal MVP shipped 2026-06-11 after the generated 14-section design crashed
// at runtime with react-pdf reconciler error #31 ("object with keys $$typeof
// type key ref props" — a React element where reconciler expects a primitive).
// Root cause never narrowed down; rather than ship a broken file we re-shrink
// to the smallest content that actually renders, then layer sections back in
// follow-up commits each verified against prod.

const BRAND_PRIMARY = '#4F46E5';
const BRAND_DARK = '#0F172A';
const BRAND_MUTED = '#64748B';

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontFamily: 'Helvetica',
    color: BRAND_DARK,
    fontSize: 11,
    lineHeight: 1.55,
  },
  bar: { width: 72, height: 4, backgroundColor: BRAND_PRIMARY, marginBottom: 28 },
  brand: { fontSize: 10, letterSpacing: 2, color: BRAND_PRIMARY, marginBottom: 18 },
  title: { fontSize: 26, fontFamily: 'Helvetica-Bold', color: BRAND_DARK, marginBottom: 8 },
  subtitle: { fontSize: 13, color: BRAND_MUTED, marginBottom: 28 },
  forText: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: BRAND_DARK, marginBottom: 6 },
  dateText: { fontSize: 11, color: BRAND_MUTED, marginBottom: 36 },
  h2: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: BRAND_DARK, marginTop: 22, marginBottom: 8 },
  p: { fontSize: 11, color: BRAND_DARK, marginBottom: 10 },
  callout: {
    backgroundColor: '#EEF2FF',
    borderLeft: '3 solid ' + BRAND_PRIMARY,
    padding: 14,
    marginTop: 6,
    marginBottom: 14,
  },
  calloutText: { fontSize: 11, color: BRAND_DARK },
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 48,
    right: 48,
    borderTop: '1 solid #E2E8F0',
    paddingTop: 10,
    fontSize: 9,
    color: BRAND_MUTED,
  },
});

export type FleetManagerOfferPDFProps = {
  fleetName: string;
  preparedDate: string;
};

export function FleetManagerOfferPDF({ fleetName, preparedDate }: FleetManagerOfferPDFProps) {
  return (
    <Document
      title={'HIR Oferta Manager Flota ' + fleetName}
      author="HIRforYOU SRL"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.bar} />
        <Text style={styles.brand}>HIRFORYOU</Text>
        <Text style={styles.title}>Propunere Parteneriat Manager Flota</Text>
        <Text style={styles.subtitle}>
          Infrastructura de livrare locala. Puterea ramane la tine si la vendori.
        </Text>
        <Text style={styles.forText}>Pentru: {fleetName}</Text>
        <Text style={styles.dateText}>Pregatit la {preparedDate} de Iulian Moldoveanu, HIRforYOU SRL</Text>

        <Text style={styles.h2}>1. Ce este HIR</Text>
        <Text style={styles.p}>
          HIR este infrastructura tehnica (storefront vendor, dispecerizare curieri, AI Hepi, multi-vendor pool)
          care iti permite sa transformi flota ta locala intr-o retea de livrare profesionista, pastrand controlul
          comercial si relatia cu restaurantele. Comisioane fixe, predictibile, fara procent din cosul de cumparaturi.
        </Text>

        <Text style={styles.h2}>2. Cele 3 modele de pricing</Text>
        <Text style={styles.p}>
          Model A - Dispatch Only: restaurantul nu foloseste HIR. Tu introduci manual comenzile primite telefonic.
          HIR este invizibil pentru restaurant. Restaurantul plateste DOAR flota (tariful tau).
          Tu platesti HIR 1 leu plus TVA pentru fiecare comanda dispatch.
        </Text>
        <Text style={styles.p}>
          Model B - HIR Connect: restaurantul are propriul site (WooCommerce, custom). Plugin Connect trimite
          comenzile automat la HIR. Restaurantul plateste fleet plus HIR 2 lei plus TVA pentru data layer.
          Tu platesti HIR 1 leu plus TVA pentru dispatch.
        </Text>
        <Text style={styles.p}>
          Model C - Full Stack: restaurantul foloseste TOATA platforma HIR (storefront white-label, KDS, CRM,
          AI Hepi, dispatch). Restaurantul plateste HIR 2 lei plus TVA. Tu platesti HIR 1 leu plus TVA.
        </Text>

        <View style={styles.callout}>
          <Text style={styles.calloutText}>
            Comisioane HIR LOCKED: 2 lei plus TVA 21% per comanda procesata (vendor) si 1 leu plus TVA 21%
            per comanda livrata via flota (tu). TVA este pass-through (colectata si virata la ANAF). Facturare
            saptamanala (luni dimineata pentru saptamana precedenta), termen plata 7 zile.
          </Text>
        </View>

        <Text style={styles.h2}>3. Rolul tau ca Fleet Manager</Text>
        <Text style={styles.p}>
          Tu setezi propriile tarife per livrare cu fiecare restaurant (20-50 RON zone-based, libertate totala).
          Tu platesti curierii cum vrei (PFA, contract, fix lunar, per livrare). HIR nu intervine in relatia
          ta cu restaurantele sau curierii. Iti oferim doar softul plus suport plus rapoarte.
        </Text>

        <Text style={styles.h2}>4. Pasii pentru a incepe</Text>
        <Text style={styles.p}>
          Ziua 1: self-signup la app.hirforyou.ro/fleet-signup. Ziua 2: upload KYF (act constitutiv, extras cont,
          certificat ONRC) la curier.hirforyou.ro/fleet/kyf. Ziua 3: aprobare KYF (24h). Ziua 4-5: onboarding
          restaurante. Ziua 6: live cu primele comenzi.
        </Text>

        <Text style={styles.h2}>5. Contact</Text>
        <Text style={styles.p}>
          Iulian Moldoveanu, fondator HIRforYOU SRL. Telefon: +40 743 700 916. Email: office@hirforyou.ro.
          Self-signup: https://app.hirforyou.ro/fleet-signup.
        </Text>

        <View style={styles.footer} fixed>
          <Text>
            HIRforYOU SRL - CUI RO46864293 - office@hirforyou.ro - hirforyou.ro
          </Text>
        </View>
      </Page>
    </Document>
  );
}
