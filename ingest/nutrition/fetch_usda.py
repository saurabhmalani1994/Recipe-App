"""Fetch USDA FoodData Central: Foundation Foods + SR Legacy (CSV downloads, public domain).

Run:
  python3 -m ingest.nutrition.fetch_usda

Writes into /home/user/recipe-data/raw/usda/<dataset>/ (RAW below), resumable: a dataset already
unzipped there is skipped. This is the only network call in the nutrition slice; everything
downstream (ingest/nutrition/build_mapping.py) reads these CSVs from disk.

FoodData Central ships several datasets; Foundation Foods and SR Legacy are the two general-
purpose ones with per-100g nutrient values for whole/generic foods (no branded products, no
survey/FNDDS recipes), which is what a "chicken_breast" or "all_purpose_flour" taxonomy slug
should map to. https://fdc.nal.usda.gov/download-datasets
"""
import os
import sys
import time
import urllib.request
import zipfile

RAW = os.environ.get('RECIPE_RAW_DATA_ROOT', '/home/user/recipe-data/raw')
OUT = os.path.join(RAW, 'usda')

# (dataset key, download filename). The filenames carry FDC's own release dates; check
# https://fdc.nal.usda.gov/download-datasets if a fetch 404s and a newer release replaced these.
DATASETS = {
    'foundation': 'FoodData_Central_foundation_food_csv_2025-04-24.zip',
    'sr_legacy': 'FoodData_Central_sr_legacy_food_csv_2018-04.zip',
}
BASE_URL = 'https://fdc.nal.usda.gov/fdc-datasets/'


def _download(url, dest, log=print):
    t0 = time.time()
    with urllib.request.urlopen(url, timeout=60) as resp:
        total = int(resp.headers.get('Content-Length') or 0)
        chunk = 1 << 20
        got = 0
        with open(dest, 'wb') as fh:
            while True:
                buf = resp.read(chunk)
                if not buf:
                    break
                fh.write(buf)
                got += len(buf)
                if total:
                    log(f'\r{os.path.basename(dest)}: {got / 1e6:.1f}/{total / 1e6:.1f} MB', end='')
    log(f'\r{os.path.basename(dest)}: {got / 1e6:.1f} MB in {time.time() - t0:.0f}s' + ' ' * 10)


def dataset_dir(key):
    """The directory a dataset's CSVs land in: OUT/<key>/<the zip's own top-level folder>."""
    d = os.path.join(OUT, key)
    if not os.path.isdir(d):
        return None
    sub = [n for n in os.listdir(d) if os.path.isdir(os.path.join(d, n))]
    return os.path.join(d, sub[0]) if sub else None


def fetch(only=None, log=print):
    """Download and unzip every dataset not already present. Returns {key: csv_dir}."""
    os.makedirs(OUT, exist_ok=True)
    out = {}
    for key, fname in DATASETS.items():
        if only and key not in only:
            continue
        d = dataset_dir(key)
        if d is not None:
            log(f'{key}: already have {d}')
            out[key] = d
            continue
        zpath = os.path.join(OUT, fname)
        if not os.path.exists(zpath):
            _download(BASE_URL + fname, zpath, log=log)
        dest = os.path.join(OUT, key)
        os.makedirs(dest, exist_ok=True)
        with zipfile.ZipFile(zpath) as zf:
            zf.extractall(dest)
        out[key] = dataset_dir(key)
        log(f'{key}: unzipped to {out[key]}')
    return out


def main(argv=None):
    only = set((argv or sys.argv[1:])) or None
    out = fetch(only=only)
    for k, v in out.items():
        print(f'{k}: {v}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
