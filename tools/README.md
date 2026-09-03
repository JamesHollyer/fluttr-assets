# Data pipeline

Everything the app bundles is built by the scripts here. Run them from the repo root with
`python3 tools/<script>.py`. All fetchers are resumable: they skip anything already in
`tools/data/` and only fetch what is missing.

## Inputs to download first (not committed)

Put these in a scratch folder and pass it as the first argument to `build_species_pack.py`:

- `ebird_tax.csv` — eBird/Clements taxonomy: https://api.ebird.org/v2/ref/taxonomy/ebird?fmt=csv
- `nacc.csv` — AOS North American checklist: https://checklist.americanornithology.org/taxa.csv

## Order

1. `build_species_pack.py <scratch>` — joins the taxonomy and checklist, then merges every
   dataset below that exists. Writes `app/assets/data/species-na.json`. Re-run after any step.
2. `fetch_wikipedia_info.py` — descriptions and lead photos (batched MediaWiki API).
3. `fetch_gbif_likelihood.py` — US + Canada occurrence counts by month.
4. `build_attributes.py` — wizard attributes from `data/family-attributes.json`, mined
   colors, and `data/attribute-overrides.json`. Edit those two files to improve the wizard.
5. `build_thumbnails.py` — square list thumbnails into `app/assets/thumbs/` plus the
   generated `app/src/data/thumbs.ts`. `--map-only` regenerates the table offline.

Hand-maintained inputs: `data/family-attributes.json`, `data/attribute-overrides.json`,
`data/extra-species.json` (recent eBird splits the checklist lacks).

## Resuming the thumbnail build

The build is paced at Wikimedia's anonymous limit (10 requests/minute, ~3 hours for the
full set). Adding a contact email or URL to `UA` in `build_thumbnails.py` raises the
allowance to 200/minute (~15 minutes). To resume:

    python3 tools/build_thumbnails.py        # picks up where it left off
    git add app/assets/thumbs app/src/data/thumbs.ts && git commit -m "More thumbnails"

Wikimedia asks that the User-Agent on every fetcher carry a contact; add one before
running any of them at scale.
