import urllib.request
import urllib.parse
import json
import gzip
import io
import re
import time
import sys

SNAPSHOT = "CC-MAIN-2026-17"
BASE_INDEX = f"https://index.commoncrawl.org/{SNAPSHOT}-index"
BASE_DATA = "https://data.commoncrawl.org/"

KNOWN_DOMAINS = {
    "supremeburger.ro", "cosmobm.ro", "pizzeria-allegria.ro", "camizo.ro",
    "cos-restaurant-bucuresti.ro", "cucinadicasa.ro", "kingrolls.ro",
    "restaurant-mandaloun.ro", "mivadelivery.ro", "suzanaribs.ro", "time2eat.ro",
    "craftpub.ro", "restaurantardealul.ro", "robaker.ro", "thecorner.ro",
    "pizzacugust-galati.ro", "pizzacugust-tecuci.ro", "pizzacugust-barlad.ro",
    "pizzacugust-buzau.ro", "pizzacugust-focsani.ro", "restaurantgreencity.ro",
    "restaurantvalentina.ro", "pizzahavana.ro", "pitesti-delivery.ro",
    "diamondclub.ro", "hotelabi.ro", "pizzeriasenna.ro", "zadis.ro",
    "elevenses.ro", "saladina.ro", "calumeasuceava.ro", "epicpub.ro",
    "titdelivery.ro", "elpasso.ro", "kingpizza.ro", "coco-delivery.ro", "xpburgers.ro"
}

GLORIAFOOD_SIGS = [
    b"fbgcdn.com",
    b"foodbooking.com",
    b"data-glf-cuid",
    b"glf-button",
    b"gloriafood",
]

RO_LANGUAGE_SIGS = [
    b'lang="ro"',
    b"lang='ro'",
    "comandă".encode('utf-8'),
    b"livrare",
    b"meniu",
    b"restaurant",
    b"telefon",
    b"orar",
    b".ro",
]

RESTAURANT_KEYWORDS = [
    "pizza", "burger", "restaurant", "delivery", "livrare", "meniu",
    "pub", "sushi", "kebab", "grill", "bistro", "shaorma", "salata",
    "food", "brunch", "cafenea", "braserie", "taverna", "crama",
    "pizzerie", "rotiserie", "cofetarie", "patiserie", "pita"
]

def fetch_cc_records(page_num, limit=200):
    url = f"{BASE_INDEX}?url=*.ro&output=json&limit={limit}&page={page_num}"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'CCResearch/1.0'})
        with urllib.request.urlopen(req, timeout=30) as resp:
            content = resp.read().decode('utf-8', errors='replace')
        records = []
        for line in content.strip().split('\n'):
            if line.strip():
                try:
                    records.append(json.loads(line))
                except:
                    pass
        return records
    except Exception as e:
        print(f"  ERROR fetching page {page_num}: {e}", flush=True)
        return []

def fetch_warc_chunk(filename, offset, length):
    url = BASE_DATA + filename
    end = int(offset) + int(length) - 1
    req = urllib.request.Request(url, headers={
        'Range': f'bytes={offset}-{end}',
        'User-Agent': 'CCResearch/1.0'
    })
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = resp.read()
        with gzip.open(io.BytesIO(data)) as gz:
            return gz.read()
    except Exception as e:
        return None

def is_restaurant_domain(domain):
    domain_lower = domain.lower()
    return any(kw in domain_lower for kw in RESTAURANT_KEYWORDS)

def check_html_for_gloriafood(html_bytes):
    if not html_bytes:
        return False, False, None
    has_gf = False
    matched_sig = None
    for sig in GLORIAFOOD_SIGS:
        if sig in html_bytes:
            has_gf = True
            matched_sig = sig.decode('utf-8', errors='replace')
            break
    is_ro = False
    if has_gf:
        for sig in RO_LANGUAGE_SIGS:
            if sig in html_bytes:
                is_ro = True
                break
    return has_gf, is_ro, matched_sig

def extract_domain(url):
    try:
        parsed = urllib.parse.urlparse(url)
        domain = parsed.netloc.lower()
        if domain.startswith('www.'):
            domain = domain[4:]
        return domain
    except:
        return ""

RO_CITIES = [
    "Bucuresti", "Cluj", "Timisoara", "Iasi", "Constanta", "Craiova",
    "Brasov", "Galati", "Ploiesti", "Oradea", "Braila", "Arad",
    "Pitesti", "Sibiu", "Bacau", "Targu Mures", "Baia Mare", "Buzau",
    "Botosani", "Satu Mare", "Ramnicu Valcea", "Suceava", "Piatra Neamt",
    "Deva", "Focsani", "Zalau", "Bistrita", "Alba Iulia", "Tulcea",
    "Motru", "Sinaia", "Mangalia", "Turda", "Campina", "Roman",
    "Drobeta-Turnu Severin", "Ramnicu", "Valcea"
]
RO_CITIES_UTF8 = [
    "București", "Timișoara", "Iași", "Constanța", "Brașov",
    "Galați", "Ploiești", "Brăila", "Pitești", "Bacău",
    "Târgu Mureș", "Buzău", "Botoșani", "Râmnicu Vâlcea",
    "Focșani", "Zalău", "Bistrița", "Piatra Neamț"
]

def guess_city_from_html(html_bytes):
    if not html_bytes:
        return "?"
    html_str = html_bytes[:15000].decode('utf-8', errors='replace')
    for city in RO_CITIES_UTF8 + RO_CITIES:
        if city in html_str:
            return city
    return "?"

results = []
checked_domains = set()
total_checked = 0
total_fetched_bytes = 0
MAX_BYTES = 300 * 1024 * 1024  # 300MB

print("=== GloriaFood Common Crawl Hunter ===", flush=True)
print(f"Snapshot: {SNAPSHOT}", flush=True)

pages_to_scan = list(range(0, 200, 3))
pages_to_scan += list(range(200, 500, 7))
pages_to_scan += list(range(500, 997, 11))

print(f"Will scan {len(pages_to_scan)} index pages", flush=True)

for page_idx, page_num in enumerate(pages_to_scan):
    if total_fetched_bytes > MAX_BYTES:
        print(f"\nBudget reached ({total_fetched_bytes/1024/1024:.1f}MB). Stopping.", flush=True)
        break

    records = fetch_cc_records(page_num, limit=200)
    if not records:
        continue

    restaurant_records = []
    for r in records:
        domain = extract_domain(r.get('url', ''))
        if (domain and
            domain.endswith('.ro') and
            domain not in checked_domains and
            domain not in KNOWN_DOMAINS and
            is_restaurant_domain(domain) and
            r.get('mime-detected', '').startswith('text/html') and
            r.get('status', '') == '200'):
            restaurant_records.append((domain, r))
            checked_domains.add(domain)

    for domain, r in restaurant_records[:8]:
        if total_fetched_bytes > MAX_BYTES:
            break

        filename = r.get('filename', '')
        offset = r.get('offset', '')
        length = r.get('length', '')

        if not all([filename, offset, length]):
            continue
        if int(length) > 800000:
            continue

        total_checked += 1
        total_fetched_bytes += int(length)

        html = fetch_warc_chunk(filename, offset, length)
        has_gf, is_ro, matched_sig = check_html_for_gloriafood(html)

        if has_gf:
            city = guess_city_from_html(html) if html else "?"
            confirmed_ro = "HIGH" if is_ro else "MED"
            result = {
                'domain': domain,
                'city_guess': city,
                'signature_match': matched_sig,
                'cc_snapshot': SNAPSHOT,
                'cc_url': r.get('url', ''),
                'confirmed_ro': confirmed_ro,
            }
            results.append(result)
            print(f"  FOUND: {domain} | sig={matched_sig} | ro={confirmed_ro} | city={city}", flush=True)

        time.sleep(0.03)

    if page_idx % 20 == 0:
        print(f"Progress: page {page_idx+1}/{len(pages_to_scan)} | checked={total_checked} | found={len(results)} | {total_fetched_bytes/1024/1024:.1f}MB", flush=True)

print(f"\n=== Done ===", flush=True)
print(f"Total pages scanned: {page_idx+1}", flush=True)
print(f"Total domains checked: {total_checked}", flush=True)
print(f"GloriaFood sites found: {len(results)}", flush=True)
print(f"Total WARC bytes fetched: {total_fetched_bytes/1024/1024:.1f}MB", flush=True)
print()
print("RESULTS JSON:")
print(json.dumps(results, ensure_ascii=False, indent=2))
