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

The build is paced at ~150 requests/minute, under the 200/minute Wikimedia allows a
client whose User-Agent carries a contact (about 15 minutes for the full set; without a
contact the limit is 10/minute). To resume:

    python3 tools/build_thumbnails.py        # picks up where it left off
    git add app/assets/thumbs app/src/data/thumbs.ts && git commit -m "More thumbnails"

Every fetcher's User-Agent carries a contact email, as Wikimedia's policy asks.

## Sound ID model

`perch_test.py <audio>` validates the model on a recording. `build_perch_labels.py` writes the
class list the app bundles. The model files live in `tools/models/` (not committed):

- `perch_v2.onnx` — Google Perch v2, Apache 2.0, from https://huggingface.co/justinchuby/Perch-onnx (409 MB float).
- `perch_v2_int8.onnx` — the app's model: dense layers quantized to int8 (131 MB). Rebuild with the
  snippet in the git history of this README's commit, or run `perch_test.py --quantized` to check it.
- `perch_v2_ebird_classes.csv`, `labels.csv` — from https://huggingface.co/cgeorgiaw/Perch.

Python deps are in `.venv` (`python3 -m venv .venv && .venv/bin/pip install numpy onnxruntime onnx soundfile scipy`).

During development the app downloads the model from this machine:

    cd tools/models && python3 -m http.server 8090 --bind 0.0.0.0

The app derives the URL from Metro's host, or set `EXPO_PUBLIC_MODEL_URL`.

# Development builds

Sound ID needs native modules (ONNX Runtime, the audio API), so the app runs as a development
build rather than in Expo Go. What this machine needed, all without admin rights:

- **JDK 21** in `~/.local/jdk` (Temurin). The JDK 25 bundled with Android Studio makes the Android
  Gradle plugin fail with "A restricted method in java.lang.System has been called".
- **CocoaPods** under Homebrew's portable Ruby 3.4 in `~/.local/portable-ruby` (system Ruby 2.6
  is too old). Both are on PATH via `~/.zshrc`.
- `patches/onnxruntime-react-native+1.24.3.patch` (applied by `postinstall`): a Gradle 9 fix and
  removal of a legacy `unimodule.json` that made Expo autolinking skip the package on Android.

Build and run (from `app/`): `npx expo run:ios`, `npx expo run:android`. Add `--no-bundler` when
Metro is already running. `npx expo start` serves both dev builds.

## Bird sounds

`fetch_xc_recordings.py` queries Xeno-canto (API v3; key in `tools/.env` as `XC_API_KEY`, not committed) for MP3 clips of quality C or better. `fetch_recordings.py` searches Wikimedia Commons for audio per species (many are Xeno-canto
mirrors under Creative Commons), keeps up to six clips under three minutes with an MP3
rendition (iOS cannot play OGG), and classifies each as song, call, alarm, flight call, or
drumming from its description. `build_recordings_pack.py` merges both (Xeno-canto first) and writes
`app/assets/data/recordings-na.json`, which the app seeds into its `recordings` table. Clips
stream from Commons until the user saves a species for offline use.

## Male and female photos

`fetch_inat_photos.py` pulls research-grade iNaturalist observations annotated Male or
Female (Creative Commons photos, most-voted first, two per sex, different photographers),
about one request per second. `build_photos_pack.py` writes `app/assets/data/photos-na.json`;
the app seeds it into `species_photos` and shows a swipeable gallery on species pages.
