import { InferenceSession, Tensor } from 'onnxruntime-react-native';

import { scoreLogits, WINDOW_SAMPLES, type Candidate, type Detection, type SoundClassifier } from './classifier';

/** Runs Perch on the phone with ONNX Runtime. The model file comes from the model download. */
export class LocalClassifier implements SoundClassifier {
  private session: InferenceSession | null = null;
  private candidates: Candidate[] = [];

  constructor(private readonly modelPath: string) {}

  async load(): Promise<void> {
    const path = this.modelPath.replace(/^file:\/\//, '');
    this.session = await InferenceSession.create(path);
  }

  setCandidates(candidates: Candidate[]): void {
    this.candidates = candidates;
  }

  async classify(window: Float32Array): Promise<Detection[]> {
    if (!this.session) throw new Error('Classifier not loaded');
    if (window.length !== WINDOW_SAMPLES) throw new Error(`Expected ${WINDOW_SAMPLES} samples, got ${window.length}`);
    const input = new Tensor('float32', window, [1, WINDOW_SAMPLES]);
    const result = await this.session.run({ inputs: input }, ['label']);
    const logits = result.label.data as Float32Array;
    return scoreLogits(logits, this.candidates);
  }

  async dispose(): Promise<void> {
    await this.session?.release();
    this.session = null;
  }
}
