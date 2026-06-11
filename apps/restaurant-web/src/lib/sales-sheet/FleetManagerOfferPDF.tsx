import 'server-only';
import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

// Fleet Manager Offer PDF — multi-page commercial proposal sent to fleet
// owners we negotiate with. Same react-pdf stack as SalesSheetPDF.tsx
// (Node runtime, no Chromium). Helvetica fallback for diacritics matches
// the sales-sheet implementation.
//
// Content is RO copy held in this file so the component stays
// self-contained for snapshot testing.

const BRAND_PRIMARY = '#4F46E5';
const BRAND_DARK = '#0F172A';
const BRAND_MUTED = '#64748B';
const BRAND_SUCCESS = '#059669';
const WHITE = '#FFFFFF';
const BORDER = '#E2E8F0';
const SOFT_BG = '#F8FAFC';
const CALLOUT_BG = '#EEF2FF';

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 56,
    paddingHorizontal: 36,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: BRAND_DARK,
    backgroundColor: WHITE,
    lineHeight: 1.45,
  },
  // ── Cover ──
  coverPage: {
    paddingTop: 64,
    paddingBottom: 56,
    paddingHorizontal: 36,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: BRAND_DARK,
    backgroundColor: WHITE,
  },
  coverBar: {
    width: 64,
    height: 4,
    backgroundColor: BRAND_PRIMARY,
    marginBottom: 28,
  },
  coverBrand: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: BRAND_PRIMARY,
    letterSpacing: 2,
    marginBottom: 16,
  },
  coverTitle: {
    fontSize: 28,
    fontFamily: 'Helvetica-Bold',
    color: BRAND_DARK,
    lineHeight: 1.15,
    marginBottom: 12,
  },
  coverSubtitle: {
    fontSize: 14,
    color: BRAND_MUTED,
    lineHeight: 1.4,
    marginBottom: 40,
  },
  coverFor: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: BRAND_PRIMARY,
    marginBottom: 24,
  },
  coverMeta: {
    fontSize: 10,
    color: BRAND_MUTED,
    marginTop: 2,
  },
  coverMetaStrong: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: BRAND_DARK,
    marginTop: 12,
  },
  // ── Section ──
  eyebrow: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: BRAND_PRIMARY,
    letterSpacing: 1.2,
    marginBottom: 6,
    marginTop: 14,
  },
  heading: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: BRAND_DARK,
    marginBottom: 10,
    lineHeight: 1.2,
  },
  bodyParagraph: {
    fontSize: 10,
    color: BRAND_DARK,
    marginBottom: 6,
    lineHeight: 1.5,
  },
  callout: {
    backgroundColor: CALLOUT_BG,
    borderLeftWidth: 3,
    borderLeftColor: BRAND_PRIMARY,
    padding: 10,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 3,
  },
  calloutText: {
    fontSize: 10,
    color: BRAND_DARK,
    fontFamily: 'Helvetica-Bold',
    lineHeight: 1.45,
  },
  // ── Table ──
  table: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
    marginTop: 8,
    marginBottom: 8,
    overflow: 'hidden',
  },
  tr: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  trHeader: {
    flexDirection: 'row',
    backgroundColor: SOFT_BG,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  th: {
    flex: 1,
    padding: 6,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: BRAND_DARK,
    borderLeftWidth: 1,
    borderLeftColor: BORDER,
  },
  thFirst: {
    flex: 1,
    padding: 6,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: BRAND_DARK,
  },
  td: {
    flex: 1,
    padding: 6,
    fontSize: 8.5,
    color: BRAND_DARK,
    borderLeftWidth: 1,
    borderLeftColor: BORDER,
  },
  tdFirst: {
    flex: 1,
    padding: 6,
    fontSize: 8.5,
    color: BRAND_DARK,
    fontFamily: 'Helvetica-Bold',
  },
  // ── Footer ──
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 8,
  },
  footerText: {
    fontSize: 7.5,
    color: BRAND_MUTED,
  },
  footerStrong: {
    fontSize: 7.5,
    color: BRAND_DARK,
    fontFamily: 'Helvetica-Bold',
  },
  // ── Misc ──
  legalBlock: {
    marginTop: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  legalText: {
    fontSize: 7.5,
    color: BRAND_MUTED,
    lineHeight: 1.45,
  },
  successText: {
    color: BRAND_SUCCESS,
    fontFamily: 'Helvetica-Bold',
  },
});

// ── Content (RO) ──────────────────────────────────────────────
type TableContent = {
  headers: string[];
  rows: string[][];
};

type SectionContent = {
  id: string;
  eyebrow: string;
  heading: string;
  body: string;
  callout?: string;
  table?: TableContent;
};

const COVER = {
  title: 'Propunere Parteneriat Manager Flota',
  subtitle: 'Infrastructura de livrare locala. Puterea ramane la tine.',
  preparedBy: 'Pregatit de Iulian Moldoveanu, HIRforYOU SRL',
  cityLabel: 'Brasov, Romania',
};

const FOOTER_COMPANY = 'HIRforYOU SRL  -  CUI RO46864293';
const FOOTER_CONTACT = 'office@hirforyou.ro  -  +40 743 700 916';

const LEGAL_DISCLAIMER =
  'Acest document este o propunere comerciala preliminara si nu constituie un contract. Termenii financiari (2 lei + TVA / comanda vendor si 1 leu + TVA / comanda flota) sunt fermi la data emiterii. Orice modificare ulterioara se va comunica cu preaviz de 60 zile. Documentul contine informatii confidentiale destinate exclusiv destinatarului. HIRforYOU SRL, CUI RO46864293, cu sediul in Brasov. TVA 21% se aplica conform Codului Fiscal si este pass-through (virat la ANAF). Litigiile se solutioneaza de instantele competente din Brasov, conform legii romane.';

const SECTIONS: SectionContent[] = [
  {
    id: 'executive-summary',
    eyebrow: 'SUMAR EXECUTIV',
    heading: 'De ce aceasta propunere',
    body: 'HIRforYOU iti ofera infrastructura tehnica (storefront vendor, dispecerizare curieri, AI Hepi, multi-vendor pool) pentru a transforma flota ta locala intr-o retea de livrare profesionista, fara sa cedezi controlul comercial sau relatia cu restaurantele. Tu pastrezi tarifele, tu pastrezi clientii, tu pastrezi marja. HIR este invizibil pentru vendor in Modelul A si complet transparent in Modelele B si C. Comisioane fixe, predictibile, fara procent din cos.',
    callout: '2 lei + TVA / comanda vendor   |   1 leu + TVA / comanda flota   |   0% din valoarea cosului',
  },
  {
    id: 'ce-este-hir',
    eyebrow: 'DESPRE PLATFORMA',
    heading: 'Ce este HIR',
    body: 'HIR este o platforma de infrastructura pentru livrari locale, construita ca alternativa la modelul Glovo / Bolt / Wolt. Spre deosebire de agregatorii internationali care iau 25-35% din cosul de produse, HIR ofera o stiva tehnologica completa pe care vendorii si flotele o folosesc ca pe propria infrastructura.\n\nComponente principale:\n- Storefront vendor white-label (site de comanda personalizat cu brandul restaurantului, fara logo HIR vizibil pentru clientul final).\n- Sistem KDS (Kitchen Display System) pe tableta pentru bucatarie.\n- Modul dispecerizare curieri cu alocare automata sau manuala, harta live, status in timp real.\n- Pool multi-vendor: restaurante, florarii, magazine cadouri, farmacii partajeaza aceeasi flota in orasul tau.\n- Asistent AI Hepi pentru comenzi telefonice, suport client, raportare operationala.\n- CRM integrat: datele clientilor raman la vendor, nu la HIR si nu la flota.\n- Plugin HIR Connect pentru integrare cu WooCommerce si site-uri existente.',
  },
  {
    id: 'patru-roluri',
    eyebrow: 'ARHITECTURA ECOSISTEMULUI',
    heading: 'Cele 4 roluri in fluxul de livrare',
    body: 'Fluxul HIR separa clar responsabilitatile intre cele 4 parti. Fiecare are zona lui de control si de venit. Nimeni nu calca pe nimeni.',
    callout: 'HIR (Iulian Moldoveanu)  >  VENDOR (restaurant, florarie, magazin)  >  FLOTA (TU, managerul de flota)  >  CURIER (livrator PFA sau angajat)',
    table: {
      headers: ['Rol', 'Cine este', 'Ce face', 'Cum castiga'],
      rows: [
        ['HIR', 'HIRforYOU SRL', 'Furnizeaza platforma tehnica, mentenanta, suport, AI Hepi', '2 lei + TVA / vendor + 1 leu + TVA / flota'],
        ['VENDOR', 'Restaurant, florarie, farmacie, magazin local', 'Primeste comenzi, prepara produsul, preda coletul curierului', 'Marja proprie pe produs (controlul preturilor ramane la el)'],
        ['FLOTA', 'TU - managerul de flota locala', 'Coordonezi curierii, setezi tarifele de livrare, facturezi vendorii', 'Diferenta dintre tariful tau (20-50 RON) si costul curierului'],
        ['CURIER', 'PFA sau angajat al flotei tale', 'Ridica si livreaza coletul, urmeaza ruta din aplicatie', 'Platit de tine (PFA per cursa, contract, fix lunar - cum decizi)'],
      ],
    },
  },
  {
    id: 'rolul-tau',
    eyebrow: 'RESPONSABILITATILE TALE',
    heading: 'Rolul TAU ca Fleet Manager',
    body: 'Tu esti patronul flotei locale. HIR iti da uneltele, dar afacerea este a ta.',
    table: {
      headers: ['#', 'Ce faci tu'],
      rows: [
        ['1', 'Recrutezi si gestionezi curierii (PFA, contract sau angajati - tu decizi forma legala)'],
        ['2', 'Setezi tarifele de livrare per zona (20-50 RON / livrare, libertate totala)'],
        ['3', 'Negociezi direct cu restaurantele din zona ta si semnezi contracte de livrare cu ele'],
        ['4', 'Facturezi vendorii pentru livrarile efectuate (factura ta, platita direct tie)'],
        ['5', 'Platesti curierii cum vrei (per cursa, fix saptamanal, contract de munca)'],
        ['6', 'Coordonezi operational flota din panoul HIR Dispatch (harta live, atribuire, SLA)'],
        ['7', 'Asiguri respectarea KYF (Know Your Fleet): documente curieri valide, KYC complet'],
        ['8', 'Raspunzi de calitatea livrarii in relatia cu vendorul si clientul final'],
      ],
    },
  },
  {
    id: 'rolul-hir',
    eyebrow: 'CE FACE SI CE NU FACE HIR',
    heading: 'Rolul HIR (transparenta totala)',
    body: 'Vrem sa fie clar de la inceput ce livram si unde se opreste responsabilitatea noastra. Nu vindem promisiuni, vindem infrastructura.',
    table: {
      headers: ['HIR FACE', 'HIR NU FACE'],
      rows: [
        ['Furnizeaza platforma tehnica (storefront, dispatch, KDS, AI)', 'Nu seteaza tarifele tale de livrare catre vendori'],
        ['Mentenanta, uptime, suport tehnic 24/7', 'Nu intervine in relatia ta cu restaurantele'],
        ['Onboarding vendori si flote (KYF, KYC)', 'Nu intervine in relatia ta cu curierii'],
        ['Facturare automata saptamanala a comisioanelor sale', 'Nu colecteaza banii vendorilor sau ai clientilor (nu este PSP)'],
        ['Asistenta AI Hepi pentru comenzi telefonice si raportare', 'Nu iti ia un procent din cos sau din tariful tau'],
        ['Conformitate GDPR, audit log, securitate date', 'Nu concureaza cu tine - HIR este infrastructura, nu agregator'],
      ],
    },
  },
  {
    id: 'trei-modele',
    eyebrow: 'AVANTAJUL CHEIE',
    heading: 'Cele 3 modele de pricing HIR',
    body: 'Acesta este punctul forte al ofertei: indiferent daca restaurantul vrea sau nu sa foloseasca HIR, tu poti lucra cu el. Trei modele, trei niveluri de integrare, trei structuri de cost. Tu alegi care se potriveste fiecarui vendor din reteaua ta.\n\nModel A - Dispatch-Only: restaurantul nici nu stie ca HIR exista. Primesti comanda telefonic sau WhatsApp si o introduci manual in panoul HIR Dispatch pentru a o atribui unui curier. HIR este complet invizibil pentru vendor. Tu iti facturezi restaurantul cu tariful tau obisnuit. HIR te factureaza doar pe tine.\n\nModel B - HIR Connect (headless): restaurantul are deja propriul site (WooCommerce, Shopify, custom). Instalezi plugin-ul HIR Connect care trimite automat fiecare comanda platita catre HIR Dispatch. Restaurantul plateste HIR pentru data layer + integrare. Tu ramai flota care livreaza.\n\nModel C - Full Stack: restaurantul migreaza pe storefront-ul HIR white-label. Foloseste tot: site, KDS, CRM, AI Hepi. Cea mai mare valoare pentru vendor, cea mai stabila reteta comerciala pentru tine.',
    table: {
      headers: ['Criteriu', 'Model A - Dispatch-Only', 'Model B - HIR Connect', 'Model C - Full Stack'],
      rows: [
        ['Restaurantul foloseste HIR?', 'NU. HIR este invizibil.', 'Partial. Doar plugin pe site-ul propriu.', 'DA. Tot stack-ul HIR.'],
        ['Cine introduce comanda?', 'TU, manual, din telefon / WhatsApp', 'Automat, din checkout-ul vendorului', 'Automat, din storefront HIR'],
        ['Cat plateste vendorul catre HIR?', '0 lei (HIR nu il vede)', '2 lei + TVA / comanda', '2 lei + TVA / comanda'],
        ['Cat plateste vendorul catre TINE?', 'Tariful tau integral de livrare', 'Tariful tau integral de livrare', 'Tariful tau integral de livrare'],
        ['Cat platesti TU catre HIR?', '1 leu + TVA / comanda livrata', '1 leu + TVA / comanda livrata', '1 leu + TVA / comanda livrata'],
        ['Cost total HIR / comanda', '1 leu + TVA', '3 lei + TVA (split vendor + flota)', '3 lei + TVA (split vendor + flota)'],
        ['Pentru cine e potrivit?', 'Restaurante mici, conservatoare, fara site, care prefera telefon', 'Restaurante cu site propriu functional, care nu vor sa schimbe', 'Restaurante fara infrastructura digitala sau care vor upgrade complet'],
      ],
    },
    callout: 'Important: in toate cele 3 modele, tariful tau de livrare catre vendor ramane 100% al tau. HIR nu ia procent din el.',
  },
  {
    id: 'cum-factureaza-hir',
    eyebrow: 'MODELUL DE VENIT HIR',
    heading: 'Cum te factureaza HIR',
    body: 'Pricing fix, predictibil, fara surprize. Zero procent din cos. TVA 21% este pass-through (nu intra in marja HIR, este virat la ANAF conform legislatiei).\n\nFacturare saptamanala automata: lunea dimineata primesti factura pentru saptamana precedenta (luni-duminica). Termen de plata: 7 zile calendaristice. Plata prin transfer bancar catre contul HIRforYOU SRL.',
    table: {
      headers: ['Element', 'Tarif', 'Cine plateste', 'Frecventa'],
      rows: [
        ['Procesare comanda (data layer)', '2 lei + TVA 21% / comanda', 'Vendor (in Modelele B si C)', 'Saptamanal'],
        ['Orchestrare livrare (dispatch)', '1 leu + TVA 21% / comanda livrata', 'Flota (TU)', 'Saptamanal'],
        ['Onboarding vendor nou', '0 lei (gratuit)', '-', '-'],
        ['Onboarding flota noua', '0 lei (gratuit)', '-', '-'],
        ['Suport tehnic standard', '0 lei (inclus)', '-', '-'],
        ['Servicii optionale (custom branding, integrari speciale)', 'Cotatie pe proiect', 'La cerere', 'One-off'],
      ],
    },
    callout: 'TVA 21% pass-through: HIR colecteaza si vireaza la ANAF, nu ramane in marja noastra. Marja noastra reala este 2 lei (vendor) + 1 leu (flota) net.',
  },
  {
    id: 'cum-facturezi-tu',
    eyebrow: 'MODELUL TAU DE VENIT',
    heading: 'Cum facturezi TU restaurantele si cum platesti curierii',
    body: 'Aici incepe libertatea ta totala. HIR nu se amesteca.\n\nFacturarea vendorilor (venitul tau):\n- Setezi tarife per zona de livrare: 20-50 RON / livrare este intervalul tipic in piata.\n- Poti face zone concentric pe oras, zone forfetare, tarife pe vreme rea, tarife de varf de cerere - cum vrei tu.\n- Negociezi direct cu fiecare vendor: contract cadru, abonament lunar, tarif per livrare, mix.\n- Emiti factura directa catre vendor sub firma ta (PFA, SRL sau cum operezi).\n- Banii intra direct la tine. HIR nu este PSP, nu colecteaza si nu tine banii vendorilor.\n\nPlata curierilor (costul tau):\n- PFA per livrare (tipic 10-18 RON / cursa in piata).\n- Contract de munca cu fix lunar (tipic 3000-4500 RON brut + bonus).\n- Mix: fix lunar mic + bonus per livrare.\n- Sezonier / weekend only.\n- Tu decizi forma legala si suma. HIR nu impune nimic.\n\nMarja ta:\nDiferenta dintre tariful pe care il iei de la vendor (ex: 25 RON) si costul tau total per livrare (curier + 1 leu HIR + combustibil daca platesti tu = ex: 14 RON) = marja ta operationala.',
    callout: 'Exemplu: 25 RON tarif vendor - 12 RON curier - 1 leu HIR - 0 lei alte costuri = ~12 RON marja bruta / livrare',
  },
  {
    id: 'cifre-estimative',
    eyebrow: 'MODELARE FINANCIARA',
    heading: 'Cifre estimative pentru reteaua TA',
    body: 'Trei scenarii orientative, asumand ca ai 10 restaurante / vendori activi in reteaua ta, operand 30 de zile / luna. Tariful mediu catre vendor: 25 RON / livrare. Cost mediu curier: 12 RON / livrare. Cost HIR pentru tine: 1 leu + TVA / livrare = ~1,21 RON.',
    table: {
      headers: ['Scenariu', 'Comenzi / zi / vendor', 'Total comenzi / luna (10 vendori)', 'Plata ta catre HIR (1 leu + TVA)', 'Venit brut estimat (25 RON x volum)', 'Marja bruta estimata (~12 RON / livrare)'],
      rows: [
        ['Conservator', '15', '4.500', '~5.445 RON', '112.500 RON', '~54.000 RON'],
        ['Moderat', '30', '9.000', '~10.890 RON', '225.000 RON', '~108.000 RON'],
        ['Optimist', '50', '15.000', '~18.150 RON', '375.000 RON', '~180.000 RON'],
      ],
    },
    callout: 'Nota: cifrele sunt orientative, depind de tariful tau real, costul curierilor si mixul de zone. Costul HIR ramane 1 leu + TVA indiferent de scenariu - predictibil 100%.',
  },
  {
    id: 'flux-tehnic',
    eyebrow: 'CUM FUNCTIONEAZA IN PRACTICA',
    heading: 'Fluxul tehnic in 6 pasi',
    body: 'De la comanda la livrare, indiferent de modelul ales.',
    table: {
      headers: ['Pas', 'Ce se intampla', 'Cine actioneaza'],
      rows: [
        ['1', 'Comanda intra in sistem (telefon manual / site vendor / storefront HIR)', 'Vendor sau TU (Model A)'],
        ['2', 'Plata este confirmata (cash la livrare sau online prin PSP-ul vendorului)', 'Client + Vendor / PSP'],
        ['3', 'Comanda apare in panoul tau HIR Dispatch cu zona, tariful, distanta', 'Sistem automat'],
        ['4', 'Atribuire curier: automat (alocare HIR cu SLA) sau manual (tu alegi din pool)', 'TU sau motor HIR'],
        ['5', 'Curierul ridica coletul de la vendor, navigatie in aplicatie, status live', 'Curier'],
        ['6', 'Livrare confirmata, dovada POD (semnatura / foto / OTP), POST-mortem KPI', 'Curier + sistem'],
      ],
    },
  },
  {
    id: 'pasi-incepere',
    eyebrow: 'ONBOARDING FLOTA',
    heading: 'Pasii pentru a incepe (timeline 5 zile)',
    body: 'Procesul este self-serve, nu trebuie sa astepti o intalnire.',
    table: {
      headers: ['Ziua', 'Actiune', 'Cine face'],
      rows: [
        ['Ziua 1', 'Self-signup la app.hirforyou.ro/fleet-signup (5 minute, completezi formular)', 'TU'],
        ['Ziua 1-2', 'Upload documente KYF: act constitutiv, extras cont bancar, certificat ONRC recent', 'TU'],
        ['Ziua 2-3', 'Verificare KYF si aprobare cont flota (manual review HIR)', 'HIR'],
        ['Ziua 3-4', 'Sesiune onboarding live (1h video call): tur panou Dispatch, configurare zone, KDS, training', 'HIR + TU'],
        ['Ziua 4-5', 'Onboarding primii curieri ai tai (KYC, documente, app installation)', 'TU'],
        ['Ziua 5', 'GO LIVE: primele comenzi reale pe reteaua ta', 'TU + Vendori'],
      ],
    },
    callout: 'KYF (Know Your Fleet) este obligatoriu prin lege si pentru auditul nostru anti-spalare. Fara documentele complete, contul flotei ramane in pending.',
  },
  {
    id: 'termeni-preliminari',
    eyebrow: 'CADRU CONTRACTUAL',
    heading: 'Termeni preliminari (urmeaza contract complet)',
    body: 'Acestia sunt termenii cheie. Contractul detaliat se semneaza la finalul KYF-ului si are anexe tehnice + financiare.',
    table: {
      headers: ['Clauza', 'Detaliu'],
      rows: [
        ['Durata', 'Nedeterminata, cu posibilitate de denuntare unilaterala'],
        ['Denuntare', '30 zile preaviz scris, fara penalitati, fara explicatii obligatorii'],
        ['Confidentialitate', 'NDA reciproc pe date comerciale, tarife, baze de clienti, durata 3 ani dupa incetare'],
        ['GDPR', 'HIR este procesator de date pentru vendori. Flota este controlor pentru datele curierilor sai. DPA separat.'],
        ['ANPC', 'Pentru relatiile B2C (vendor - client final), responsabilitatea ramane la vendor. HIR este B2B.'],
        ['Plata', 'Saptamanal, factura luni dimineata, termen 7 zile calendaristice'],
        ['Penalitati intarziere', '0,1% / zi dupa depasirea termenului (conform Codului Civil)'],
        ['Jurisdictie', 'Instantele competente din Brasov, legea romana aplicabila'],
        ['Modificari tarif HIR', 'Preaviz 60 zile, dreptul de denuntare imediata daca nu accepti'],
      ],
    },
  },
  {
    id: 'anexa-glovo',
    eyebrow: 'ANEXA A',
    heading: 'Comparatie HIR vs Glovo / Bolt Food',
    body: 'Pentru claritate: ce primesti cu HIR vs ce ti s-ar intampla daca ai lucra cu un agregator clasic.',
    table: {
      headers: ['Componenta', 'HIR', 'Glovo / Bolt Food', 'Diferenta pentru tine'],
      rows: [
        ['Model de venit', 'Comision fix: 2 lei + 1 leu / comanda', 'Procent din cos: 25-35%', 'La un cos de 100 RON: HIR ia 3 lei, Glovo ia 30 RON'],
        ['Cine detine clientul', 'Vendorul (date in CRM-ul vendorului)', 'Glovo (datele raman la platforma)', 'Tu si vendorul construiti loialitate, nu agregatorul'],
        ['Cine seteaza tarifele de livrare', 'TU, flota locala (20-50 RON, libertate totala)', 'Glovo, centralizat, nu negociabil', 'Controlul economic ramane local'],
        ['Statutul tau operational', 'Partener independent, brand propriu', 'Sub-contractor anonim al unui brand international', 'Tu construiesti un business al tau, nu pentru altcineva'],
        ['Concurenta cu vendorul tau', 'Niciuna - HIR e infrastructura, nu agregator', 'Glovo promoveaza si alte restaurante peste al tau', 'Vendorul nu pierde clienti la concurentii lui pe aceeasi platforma'],
        ['Transparenta costuri', 'Total: 3 lei + TVA / comanda, fix', 'Variabil pe zone, pe vreme, surge pricing', 'Predictibilitate financiara'],
      ],
    },
    callout: 'Filozofia HIR: infrastructura de livrare, puterea ramane la vendori si la flote locale. Nu construim un brand consumer care sa ii inlocuiasca, construim uneltele cu care ei raman independenti.',
  },
  {
    id: 'contact-cta',
    eyebrow: 'ANEXA B',
    heading: 'Contact si pasii urmatori',
    body: 'Daca propunerea iti face sens, urmatorul pas este self-signup. Nu trebuie sa ma suni inainte, dar daca vrei sa clarificam ceva specific - sunt disponibil.\n\nPersoana de contact:\nIulian Moldoveanu, fondator HIRforYOU SRL\nTelefon: +40 743 700 916\nEmail: office@hirforyou.ro\n\nSelf-signup flota:\nhttps://app.hirforyou.ro/fleet-signup\n\nDate companie:\nHIRforYOU SRL\nCUI: RO46864293\nSediu: Brasov, Romania\n\nMesaj personal:\nAm construit HIR pentru ca am crezut ca Romania merita o infrastructura de livrare locala, pe care vendorii si flotele sa o foloseasca fara sa cedeze controlul. Daca rezonezi cu asta, hai sa facem un pilot impreuna in orasul tau. Primele 30 de zile sunt cea mai buna proba - daca nu iti iese, iesi fara penalitati. Astept signup-ul tau.',
    callout: 'Pasul urmator: completeaza formularul la app.hirforyou.ro/fleet-signup. Raspund personal in maxim 24h.',
  },
];

// ── Helpers ───────────────────────────────────────────────────
function renderTable(table: TableContent) {
  return (
    <View style={styles.table}>
      <View style={styles.trHeader}>
        {table.headers.map((h, i) => (
          <Text key={i} style={i === 0 ? styles.thFirst : styles.th}>
            {h}
          </Text>
        ))}
      </View>
      {table.rows.map((row, ri) => (
        <View key={ri} style={ri === table.rows.length - 1 ? { flexDirection: 'row' } : styles.tr}>
          {row.map((cell, ci) => (
            <Text key={ci} style={ci === 0 ? styles.tdFirst : styles.td}>
              {cell}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function renderParagraphs(body: string) {
  // Body can include \n\n (paragraph break) or \n (line break). React-pdf
  // already supports newlines in <Text>; we split by \n\n so each paragraph
  // gets its own margin.
  const paragraphs = body.split('\n\n');
  return paragraphs.map((p, i) => (
    <Text key={i} style={styles.bodyParagraph}>
      {p}
    </Text>
  ));
}

function FooterBlock() {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerStrong}>{FOOTER_COMPANY}</Text>
      <Text
        style={styles.footerText}
        render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
          `${FOOTER_CONTACT}   -   Pagina ${pageNumber} / ${totalPages}`
        }
      />
    </View>
  );
}

// ── Public component ─────────────────────────────────────────
export type FleetManagerOfferPDFProps = {
  fleetName: string;
  preparedDate: string;
};

export function FleetManagerOfferPDF({ fleetName, preparedDate }: FleetManagerOfferPDFProps) {
  return (
    <Document
      title={`HIR — Oferta Manager Flota — ${fleetName}`}
      author="HIRforYOU SRL"
      creator="hirforyou.ro"
      producer="hirforyou.ro"
    >
      {/* Cover page */}
      <Page size="A4" style={styles.coverPage}>
        <View style={styles.coverBar} />
        <Text style={styles.coverBrand}>HIRFORYOU</Text>
        <Text style={styles.coverTitle}>{COVER.title}</Text>
        <Text style={styles.coverSubtitle}>{COVER.subtitle}</Text>
        <Text style={styles.coverFor}>Pentru: {fleetName}</Text>
        <Text style={styles.coverMetaStrong}>{COVER.preparedBy}</Text>
        <Text style={styles.coverMeta}>{`${COVER.cityLabel} - ${preparedDate}`}</Text>
        <FooterBlock />
      </Page>

      {/* Content pages */}
      <Page size="A4" style={styles.page}>
        {SECTIONS.map((section) => (
          <View key={section.id} wrap={false} style={{ marginBottom: 18 }}>
            <Text style={styles.eyebrow}>{section.eyebrow}</Text>
            <Text style={styles.heading}>{section.heading}</Text>
            {renderParagraphs(section.body)}
            {section.callout ? (
              <View style={styles.callout}>
                <Text style={styles.calloutText}>{section.callout}</Text>
              </View>
            ) : null}
            {section.table ? renderTable(section.table) : null}
          </View>
        ))}

        <View style={styles.legalBlock} wrap={false}>
          <Text style={styles.legalText}>{LEGAL_DISCLAIMER}</Text>
        </View>

        <FooterBlock />
      </Page>
    </Document>
  );
}
