#!/usr/bin/env python3
"""Run Perch v2 (ONNX) on an audio file and print the top predictions.

Usage: .venv/bin/python tools/perch_test.py <audio file> [--quantized]

Decodes the file, resamples to 32 kHz mono, splits into 5-second windows
(160,000 samples), runs the model on each, and prints the top eBird codes per
window plus a pooled result. Used to validate the model before wiring it into
the app, and later to compare quantized builds against the float model.
"""
import csv, pathlib, sys, time
import numpy as np
import onnxruntime as ort
import soundfile as sf
from scipy.signal import resample_poly

ROOT = pathlib.Path(__file__).resolve().parent.parent
MODELS = ROOT / "tools/models"
SR = 32000
WINDOW = 5 * SR

def load_audio(path):
    audio, sr = sf.read(str(path), dtype="float32", always_2d=True)
    audio = audio.mean(axis=1)
    if sr != SR:
        from math import gcd
        g = gcd(SR, sr)
        audio = resample_poly(audio, SR // g, sr // g).astype(np.float32)
    return audio

def load_labels():
    # perch_v2_ebird_classes.csv is the ordered class list for the 'label' output.
    rows = list(csv.reader(open(MODELS / "perch_v2_ebird_classes.csv")))
    header, rows = rows[0], rows[1:]
    codes = [r[0] for r in rows] if len(rows[0]) == 1 else [r[header.index("ebird2022") if "ebird2022" in header else 0] for r in rows]
    return codes

def main():
    path = pathlib.Path(sys.argv[1])
    model = MODELS / ("perch_v2_int8.onnx" if "--quantized" in sys.argv else "perch_v2.onnx")
    pack = {s["code"]: s["common"] for s in __import__("json").load(open(ROOT / "app/assets/data/species-na.json"))["species"]}

    t = time.time()
    sess = ort.InferenceSession(str(model), providers=["CPUExecutionProvider"])
    print("model %s loaded in %.1fs" % (model.name, time.time() - t))
    inp = sess.get_inputs()[0]
    outs = [o.name for o in sess.get_outputs()]
    print("input:", inp.name, inp.shape, inp.type, "| outputs:", outs)

    labels = load_labels()
    audio = load_audio(path)
    print("audio: %.1fs at %d Hz" % (len(audio) / SR, SR))
    n = max(1, len(audio) // WINDOW)
    pooled = None
    for i in range(min(n, 6)):
        chunk = audio[i * WINDOW:(i + 1) * WINDOW]
        if len(chunk) < WINDOW:
            chunk = np.pad(chunk, (0, WINDOW - len(chunk)))
        t = time.time()
        res = sess.run(["label"], {inp.name: chunk[None, :]})[0][0]
        dt = time.time() - t
        probs = 1 / (1 + np.exp(-res))
        pooled = probs if pooled is None else np.maximum(pooled, probs)
        top = np.argsort(-probs)[:5]
        print("window %d (%.0f ms): %s" % (i, dt * 1000, ", ".join("%s(%s) %.2f" % (labels[j], pack.get(labels[j], "?"), probs[j]) for j in top)))
    top = np.argsort(-pooled)[:5]
    print("pooled: " + ", ".join("%s(%s) %.2f" % (labels[j], pack.get(labels[j], "?"), pooled[j]) for j in top))

if __name__ == "__main__":
    main()
