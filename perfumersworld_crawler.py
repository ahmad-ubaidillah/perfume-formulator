#!/usr/bin/env python3
"""
PerfumersWorld Raw Material Crawler
Crawls all product pages from perfumersworld.com and extracts structured data.
"""

import csv
import json
import re
import sys
import time
import os
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
from html.parser import HTMLParser
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Optional
import concurrent.futures
import threading

# Configuration
BASE_URL = "https://www.perfumersworld.com"
SITEMAP_URL = f"{BASE_URL}/sitemap.php"
OUTPUT_CSV = os.path.join(os.path.dirname(os.path.abspath(__file__)), "raw_materials.csv")
OUTPUT_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), "raw_materials.json")
REQUEST_DELAY = 0.5  # seconds between requests to be polite
MAX_RETRIES = 3
TIMEOUT = 30

# Thread-safe stats
stats_lock = threading.Lock()
stats = {"total": 0, "success": 0, "failed": 0, "skip": 0}


@dataclass
class RawMaterial:
    raw_material: str = ""
    description: str = ""
    price: str = ""
    odour: str = ""
    relative_odor_impact: str = ""
    odour_lifetime: str = ""
    synonyms: str = ""
    cas: str = ""
    ifra: str = ""
    abc_donut: str = ""
    typical_usage_from: str = ""
    typical_usage_average: str = ""
    typical_usage_maximum: str = ""
    application_suitability: str = ""
    source_url: str = ""
    sku: str = ""


class MLStripper(HTMLParser):
    """Strip HTML tags and decode entities."""
    def __init__(self):
        super().__init__()
        self.reset()
        self.strict = False
        self.convert_charrefs = True
        self.result = []

    def handle_data(self, d):
        self.result.append(d)

    def get_data(self):
        return ' '.join(self.result)


def strip_tags(html: str) -> str:
    """Remove HTML tags from string."""
    s = MLStripper()
    s.feed(html)
    return s.get_data()


def strip_whitespace(text: str) -> str:
    """Normalize whitespace."""
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def fetch_url(url: str, retries: int = MAX_RETRIES) -> Optional[str]:
    """Fetch URL with retry logic."""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
    }
    for attempt in range(retries):
        try:
            req = Request(url, headers=headers)
            with urlopen(req, timeout=TIMEOUT) as response:
                charset = response.headers.get_content_charset() or 'utf-8'
                return response.read().decode(charset, errors='replace')
        except (URLError, HTTPError, ConnectionError, TimeoutError, OSError) as e:
            if attempt < retries - 1:
                time.sleep(2 * (attempt + 1))
            else:
                print(f"  [FAIL] {url} - {e}", file=sys.stderr)
    return None


def get_product_ids() -> List[str]:
    """Extract all product IDs from sitemap."""
    print(f"[INFO] Fetching sitemap from {SITEMAP_URL}")
    html = fetch_url(SITEMAP_URL)
    if not html:
        print("[ERROR] Failed to fetch sitemap", file=sys.stderr)
        return []

    # Extract pro_id from view.php links
    pattern = r'view\.php\?pro_id=([0-9A-Z]+)'
    ids = re.findall(pattern, html)
    unique_ids = sorted(set(ids))
    print(f"[INFO] Found {len(unique_ids)} product IDs in sitemap")
    return unique_ids


def get_category_product_ids(category_url: str) -> List[str]:
    """Extract product IDs from a category page."""
    html = fetch_url(category_url)
    if not html:
        return []
    pattern = r'view\.php\?pro_id=([0-9A-Z]+)'
    ids = re.findall(pattern, html)
    return sorted(set(ids))


def get_all_category_urls() -> List[str]:
    """Get all category listing URLs."""
    return [
        f"{BASE_URL}/aroma-chemicals.php",
        # Can add more categories if needed
    ]


def parse_product_page(html: str, pro_id: str) -> Optional[RawMaterial]:
    """Parse a single product page HTML and extract all fields."""
    product = RawMaterial()
    product.source_url = f"{BASE_URL}/view.php?pro_id={pro_id}"

    # --- SKU ---
    sku_match = re.search(r'<h5><small>SKU</small>\s*([0-9A-Z]+)</h5>', html)
    if sku_match:
        product.sku = strip_whitespace(sku_match.group(1))
    else:
        product.sku = pro_id

    # --- Name / Raw Material ---
    name_match = re.search(r'<h1[^>]*class="page-header"[^>]*itemprop="name"[^>]*>([^<]+)</h1>', html)
    if not name_match:
        # Try fallback: commented out title div
        name_match = re.search(r'<div[^>]*id="title"[^>]*>([^<]+)</div>', html)
    if name_match:
        product.raw_material = strip_whitespace(name_match.group(1))
    else:
        # Last resort: try meta or title
        title_match = re.search(r'<title>([^<]+)</title>', html)
        if title_match:
            product.raw_material = strip_whitespace(title_match.group(1).split('|')[0].strip())
        else:
            print(f"  [WARN] No name found for {pro_id}", file=sys.stderr)
            return None

    # --- Description ---
    desc_match = re.search(r'<p[^>]*itemprop="description"[^>]*>(.*?)</p>', html, re.DOTALL)
    if desc_match:
        product.description = strip_whitespace(desc_match.group(1))

    # --- Price ---
    price_match = re.search(r'<span[^>]*itemprop="price"[^>]*content="([^"]+)"', html)
    price_text_match = re.search(r'US\$\s*<span[^>]*itemprop="price"[^>]*>([^<]+)', html)
    if price_match:
        price_val = price_match.group(1)
        price_text = price_text_match.group(1).strip() if price_text_match else price_val
        product.price = f"US$ {price_text} /gram"
    else:
        # Try alternative price format
        alt_price = re.search(r'<strong>\s*\$\s*<span[^>]*itemprop="price"[^>]*>([^<]+)</span>\s*/gram', html)
        if alt_price:
            product.price = f"US$ {alt_price.group(1).strip()} /gram"

    # --- Odour ---
    # Look for Odour section: <h3 class="box-title">Odour</h3> followed by content
    odour_section = re.search(
        r'<h3[^>]*class="box-title"[^>]*>[^<]*Odour[^<]*</h3>\s*(.*?)<(?:h3|div)[^>]*>',
        html, re.DOTALL
    )
    if odour_section:
        odour_html = odour_section.group(1)
        # Try <b>Odour=>...</b> pattern (Lilial style)
        b_match = re.search(r'<b>Odour\s*=>\s*</b>\s*([^<]+)', odour_html)
        if b_match:
            product.odour = strip_whitespace(b_match.group(1))
        else:
            # Try <p><b>Odour=>...</b> pattern (Benzophenone style - multi-line)
            p_match = re.search(r'<p>\s*<b>Odour\s*=>\s*</b>(.*?)</p>', odour_html, re.DOTALL)
            if p_match:
                product.odour = strip_whitespace(p_match.group(1))
            else:
                # Generic: get all text until next section
                generic = strip_tags(odour_html)
                generic = re.sub(r'Odour\s*=>\s*', '', generic, flags=re.IGNORECASE)
                product.odour = strip_whitespace(generic)

    # --- Relative Odor Impact & Odor Lifetime ---
    # Pattern: <span class="pull-right">NN</span> (impact) then <span class="pull-right">NN hrs</span> (lifetime)
    pull_rights = re.findall(r'<span class="pull-right">([^<]+)</span>', html)
    if len(pull_rights) >= 2:
        product.relative_odor_impact = strip_whitespace(pull_rights[0])
        lifetime_text = strip_whitespace(pull_rights[1])
        # Lifetime usually has "hrs" but sometimes just number
        product.odour_lifetime = lifetime_text

    # --- Synonyms ---
    syn_section = re.search(
        r'<h3[^>]*class="box-title"[^>]*>[^<]*Synonyms[^<]*</h3>\s*(.*?)<(?:h3|div)[^>]*class="box-title"[^>]*>',
        html, re.DOTALL
    )
    if syn_section:
        syn_html = syn_section.group(1)
        # Extract all text, clean up the $XX : Synonyms=> prefix
        syn_text = strip_tags(syn_html)
        syn_text = re.sub(r'\$\w+\s*:\s*', '', syn_text)   # Remove "$MA :" or "$RP :"
        syn_text = re.sub(r'Synonyms=>\s*', '', syn_text)   # Remove "Synonyms=>"
        syn_text = re.sub(r':\s*:\s*', ': ', syn_text)       # Fix double colons
        syn_text = re.sub(r'\s+', ' ', syn_text)
        syn_text = syn_text.strip().rstrip(':')
        product.synonyms = syn_text

    # --- CAS Number ---
    cas_match = re.search(
        r'<td[^>]*>\s*CAS No\.\s*</td>\s*<td[^>]*>([^<]+)</td>',
        html, re.IGNORECASE
    )
    if cas_match:
        product.cas = strip_whitespace(cas_match.group(1))

    # --- FEMA/IFRA Number ---
    fema_match = re.search(
        r'<td[^>]*>\s*FEMA\s*</td>\s*<td[^>]*>([^<]+)</td>',
        html, re.IGNORECASE
    )
    if fema_match:
        product.ifra = strip_whitespace(fema_match.group(1))

    # --- ABC Donut Data (from inline JS or image references) ---
    # ABC donut data is usually in <img> src or JS variables
    donut_img = re.search(r'images/syn/([a-zA-Z0-9_]+\.jpg)', html)
    if donut_img:
        product.abc_donut = f"image:syn/{donut_img.group(1)}"

    # Try to extract ABC donut data from JS
    donut_js = re.search(r'var imagedonut\s*=\s*[\'"]([^\'"]+)[\'"]', html)
    if donut_js:
        product.abc_donut = f"image:{donut_js.group(1)}"
    
    # Try to extract from <canvas> or SVG data attributes
    donut_data = re.search(r'data-abc=[\'"]([^\'"]+)[\'"]', html)
    if donut_data:
        product.abc_donut = donut_data.group(1)

    # --- Typical Usage (from Perfumery Applications section) ---
    usage_section = re.search(
        r'<h3[^>]*class="box-title"[^>]*>[^<]*Perfumery Applications[^<]*</h3>\s*(.*?)<h3',
        html, re.DOTALL
    )
    if usage_section:
        usage_html = usage_section.group(1)
        
        # Extract "from" (minimum) value
        from_match = re.search(
            r'<span class="description-percentage text-red">.*?<i class="fa fa-caret-down"></i>\s*([0-9.]+%)',
            usage_html, re.DOTALL
        )
        if from_match:
            product.typical_usage_from = from_match.group(1)

        # Extract "average" value
        avg_match = re.search(
            r'<span class="description-percentage text-yellow">.*?<i class="fa fa-caret-left"></i>\s*([0-9.]+%)\s*<i',
            usage_html, re.DOTALL
        )
        if avg_match:
            product.typical_usage_average = avg_match.group(1)

        # Extract "maximum" value
        max_match = re.search(
            r'<span class="description-percentage text-green">.*?<i class="fa fa-caret-up"></i>\s*([0-9.]+%)',
            usage_html, re.DOTALL
        )
        if max_match:
            product.typical_usage_maximum = max_match.group(1)

# --- Application Suitability ---
    # Find the Application Suitability heading, then extract all progress pairs after it
    app_heading_match = re.search(
        r'<h3[^>]*class="box-title"[^>]*>[^<]*Application Suitability[^<]*</h3>',
        html
    )
    if app_heading_match:
        # Get everything after the heading
        after_heading = html[app_heading_match.end():]
        # Collect all progress pairs until we hit another box-title heading or end
        apps = []
        text_spans = re.findall(
            r'<span class="progress-text">([^<]+)</span>',
            after_heading
        )
        number_spans = re.findall(
            r'<span class="progress-number">\s*<b>([^<]*)</b>\s*</span>',
            after_heading
        )
        # Stop at the first non-applicability pair (if there are extra spans)
        # Application entries stop when we encounter empty rating consistently
        for i, text in enumerate(text_spans):
            if i >= len(number_spans):
                break
            text = strip_whitespace(text)
            rating = strip_whitespace(number_spans[i])
            # Skip if this looks like it's from a different section
            if not text:
                continue
            apps.append(f"{text}: {rating}" if rating else text)

        product.application_suitability = "; ".join(apps)

    return product


def process_product(pro_id: str) -> Optional[RawMaterial]:
    """Fetch and parse a single product."""
    global stats
    
    url = f"{BASE_URL}/view.php?pro_id={pro_id}"
    html = fetch_url(url)
    
    if not html:
        with stats_lock:
            stats["failed"] += 1
        return None
    
    # Check for truly empty/invalid pages (not just login banners)
    # "Login Failure" is a sidebar banner, not a page blocker
    if "page-header" not in html and "box-title" not in html:
        with stats_lock:
            stats["skip"] += 1
        print(f"  [SKIP] {pro_id} - no product data found", file=sys.stderr)
        return None
    
    product = parse_product_page(html, pro_id)
    
    with stats_lock:
        if product:
            stats["success"] += 1
        else:
            stats["failed"] += 1
    
    return product


def save_csv(products: List[RawMaterial], filepath: str):
    """Save products to CSV."""
    if not products:
        print("[WARN] No products to save")
        return
    
    fieldnames = [
        "raw_material", "description", "price", "odour", 
        "relative_odor_impact", "odour_lifetime", "synonyms",
        "cas", "ifra", "abc_donut", "typical_usage_from",
        "typical_usage_average", "typical_usage_maximum",
        "application_suitability", "source_url", "sku"
    ]
    
    with open(filepath, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, quoting=csv.QUOTE_ALL)
        writer.writeheader()
        for p in products:
            writer.writerow(asdict(p))
    
    print(f"[INFO] Saved {len(products)} products to {filepath}")


def save_json(products: List[RawMaterial], filepath: str):
    """Save products to JSON."""
    data = [asdict(p) for p in products]
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"[INFO] Saved {len(products)} products to {filepath}")


def main():
    # Change to crawler directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    
    print("=" * 60)
    print("PerfumersWorld Raw Material Crawler")
    print("=" * 60)
    
    # Get all product IDs
    product_ids = get_product_ids()
    
    if not product_ids:
        print("[ERROR] No product IDs found. Exiting.")
        sys.exit(1)
    
    # Optionally test with a subset
    if '--test' in sys.argv:
        test_ids = ['3MA00273', '1RP00051', '1BB00290', '1RP05672']
        product_ids = [pid for pid in test_ids if pid in product_ids]
        print(f"[TEST MODE] Processing {len(product_ids)} products")
    
    if '--limit' in sys.argv:
        idx = sys.argv.index('--limit')
        limit = int(sys.argv[idx + 1])
        product_ids = product_ids[:limit]
        print(f"[LIMIT] Processing first {limit} products")
    
    stats["total"] = len(product_ids)
    
    # Process products
    products: List[RawMaterial] = []
    
    # Check for parallel mode
    if '--parallel' in sys.argv:
        max_workers = 8
        if '--workers' in sys.argv:
            idx = sys.argv.index('--workers')
            max_workers = int(sys.argv[idx + 1])
        
        print(f"[INFO] Processing {len(product_ids)} products with {max_workers} workers")
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_id = {executor.submit(process_product, pid): pid for pid in product_ids}
            for future in concurrent.futures.as_completed(future_to_id):
                pro_id = future_to_id[future]
                try:
                    result = future.result()
                    if result:
                        products.append(result)
                        print(f"  [OK] {pro_id}: {result.raw_material}")
                    else:
                        print(f"  [FAIL] {pro_id}")
                except Exception as e:
                    print(f"  [ERROR] {pro_id}: {e}", file=sys.stderr)
                time.sleep(REQUEST_DELAY)
    else:
        # Sequential processing
        for i, pro_id in enumerate(product_ids):
            print(f"\r[PROGRESS] {i+1}/{len(product_ids)} ({stats['success']} ok, {stats['failed']} fail, {stats['skip']} skip)", end="", flush=True)
            
            product = process_product(pro_id)
            if product:
                products.append(product)
                print(f"\r  [OK] {pro_id}: {product.raw_material}")
            
            time.sleep(REQUEST_DELAY)
        print()  # Newline after progress
    
    # Summary
    print("\n" + "=" * 60)
    print(f"RESULTS: {stats['success']} success, {stats['failed']} failed, {stats['skip']} skipped")
    print("=" * 60)
    
    # Save outputs
    if products:
        save_csv(products, OUTPUT_CSV)
        save_json(products, OUTPUT_JSON)
        
        # Quick summary of fields found
        fields_present = {}
        for p in products:
            for f in ['description', 'price', 'odour', 'relative_odor_impact', 
                      'odour_lifetime', 'synonyms', 'cas', 'ifra', 
                      'typical_usage_from', 'typical_usage_average', 
                      'typical_usage_maximum', 'application_suitability']:
                val = getattr(p, f)
                if val:
                    fields_present[f] = fields_present.get(f, 0) + 1
        
        print("\n[FIELD COVERAGE]")
        for field, count in sorted(fields_present.items(), key=lambda x: -x[1]):
            pct = (count / len(products)) * 100
            print(f"  {field}: {count}/{len(products)} ({pct:.1f}%)")
    else:
        print("[WARN] No products extracted. Check your network connection and try again.")


if __name__ == "__main__":
    main()