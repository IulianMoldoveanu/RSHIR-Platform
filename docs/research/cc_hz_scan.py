import urllib.request, json, gzip, io, time, sys
from concurrent.futures import ThreadPoolExecutor, as_completed
import urllib.parse

BASE_DATA = "https://data.commoncrawl.org/"
SHARD_URL = "https://data.commoncrawl.org/cc-index/collections/CC-MAIN-2026-17/indexes/cdx-00261.gz"

KNOWN = {
    "supremeburger.ro", "cosmobm.ro", "pizzeria-allegria.ro", "camizo.ro",
    "cos-restaurant-bucuresti.ro", "cucinadicasa.ro", "kingrolls.ro",
    "restaurant-mandaloun.ro", "mivadelivery.ro", "suzanaribs.ro", "time2eat.ro",
    "craftpub.ro", "restaurantardealul.ro", "robaker.ro", "thecorner.ro",
    "pizzacugust-galati.ro", "pizzacugust-tecuci.ro", "pizzacugust-barlad.ro",
    "pizzacugust-buzau.ro", "pizzacugust-focsani.ro", "restaurantgreencity.ro",
    "restaurantvalentina.ro", "pizzahavana.ro", "pitesti-delivery.ro",
    "diamondclub.ro", "hotelabi.ro", "pizzeriasenna.ro", "zadis.ro",
    "elevenses.ro", "saladina.ro", "calumeasuceava.ro", "epicpub.ro",
    "titdelivery.ro", "elpasso.ro", "kingpizza.ro", "coco-delivery.ro", "xpburgers.ro",
    "pizzatwenty.ro", "oldshanghai-bucuresti.ro"
}

GF_SIGS = [b"fbgcdn.com", b"data-glf-cuid", b"gloriafood", b"foodbooking.com/ordering"]

def fetch_warc_check(domain, filename, offset, length, url):
    try:
        data_url = BASE_DATA + filename
        end = int(offset) + int(length) - 1
        req = urllib.request.Request(data_url, headers={"Range": f"bytes={offset}-{end}", "User-Agent": "CCR/1.0"})
        with urllib.request.urlopen(req, timeout=12) as r:
            data = r.read()
        with gzip.open(io.BytesIO(data)) as gz:
            html = gz.read()
        for sig in GF_SIGS:
            if sig in html:
                return (domain, sig.decode(), url)
    except:
        pass
    return None

print("Streaming CDX shard 261 - collecting h-z domains...", flush=True)

candidates = {}
seen = set(KNOWN)
target_letters = set("hiklmnoprstuvwxy")
bytes_streamed = 0

req = urllib.request.Request(SHARD_URL, headers={"User-Agent": "CCR/1.0"})
try:
    with urllib.request.urlopen(req, timeout=300) as resp:
        with gzip.GzipFile(fileobj=resp) as gz:
            for line in gz:
                bytes_streamed += len(line)
                if bytes_streamed > 500 * 1024 * 1024:
                    print("Stream limit 500MB reached", flush=True)
                    break
                if len(candidates) >= 3000:
                    print("3000 candidates reached", flush=True)
                    break
                try:
                    line_str = line.decode("utf-8", errors="replace").strip()
                    parts = line_str.split(" ", 2)
                    if len(parts) < 3:
                        continue
                    urlkey = parts[0]
                    if not urlkey.startswith("ro,"):
                        continue
                    domain_start = urlkey[3:4].lower()
                    if domain_start not in target_letters:
                        continue
                    try:
                        meta = json.loads(parts[2])
                    except:
                        continue
                    if meta.get("status") != "200":
                        continue
                    if not meta.get("mime-detected", "").startswith("text/html"):
                        continue
                    url = meta.get("url", "")
                    if "?" in url:
                        continue
                    parsed = urllib.parse.urlparse(url)
                    path = parsed.path
                    if path.count("/") > 2 or len(path) > 30:
                        continue
                    domain = parsed.netloc.replace("www.", "").lower()
                    if not domain.endswith(".ro") or domain in seen:
                        continue
                    length_val = int(meta.get("length", 0))
                    if length_val < 3000 or length_val > 200000:
                        continue
                    seen.add(domain)
                    candidates[domain] = (meta.get("filename", ""), meta.get("offset", ""), str(length_val), url)
                    if len(candidates) % 300 == 0:
                        print(f"  {len(candidates)} h-z candidates, {bytes_streamed/1024/1024:.0f}MB streamed", flush=True)
                except:
                    continue
except Exception as e:
    print(f"Stream error at {bytes_streamed/1024/1024:.0f}MB: {e}", flush=True)

print(f"Collected {len(candidates)} h-z candidates from {bytes_streamed/1024/1024:.0f}MB", flush=True)

with open("C:/Users/Iulian/Desktop/CLAUDE AI/.worktree-gloriafood-leads/docs/research/hz_candidates_v2.json", "w") as f:
    json.dump(candidates, f)

for d in list(candidates.keys())[:20]:
    print(f"  {d}")
print("---")

if candidates:
    print("Parallel WARC check...", flush=True)
    results = []
    total_bytes = 0
    MAX_BYTES = 150 * 1024 * 1024
    items = [(d, *info) for d, info in candidates.items()]
    items.sort(key=lambda x: int(x[3]))
    with ThreadPoolExecutor(max_workers=6) as ex:
        futures = {}
        for domain, filename, offset, length, url in items:
            lb = int(length)
            if total_bytes + lb > MAX_BYTES:
                break
            total_bytes += lb
            futures[ex.submit(fetch_warc_check, domain, filename, offset, length, url)] = domain
        print(f"Submitted {len(futures)} tasks ({total_bytes/1024/1024:.0f}MB)", flush=True)
        done = 0
        for future in as_completed(futures):
            done += 1
            result = future.result()
            if result:
                d, sig, url = result
                results.append({"domain": d, "sig": sig, "url": url})
                print(f"FOUND: {d} sig={sig}", flush=True)
            if done % 200 == 0:
                print(f"  Checked {done}/{len(futures)}, found {len(results)}", flush=True)
    print(f"Done! Found {len(results)} GloriaFood sites.", flush=True)
    print("RESULTS:", json.dumps(results, ensure_ascii=False))
else:
    print("No candidates to check.")
