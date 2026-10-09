import { DailyWeighingEntry, WeighingDistribution } from '../../interfaces/flock-weighing.interface';

interface DistributionOptions {
  binWidth?: number;
  expectedRange?: { min: number; max: number };
}

const niceIntegerBinWidth = (target: number): number => {
  if (!Number.isFinite(target) || target <= 1) return 1;
  const scale = 10 ** Math.floor(Math.log10(target));
  return [1, 2, 5, 10].map((factor) => factor * scale)
    .reduce((best, candidate) => Math.abs(candidate - target) <= Math.abs(best - target) ? candidate : best);
};

const validIndividual = (entry: DailyWeighingEntry): boolean =>
  entry.mode === 'individual' && entry.bird_count === 1
  && entry.weight_g !== null && entry.weight_g.trim() !== ''
  && Number.isFinite(Number(entry.weight_g)) && Number(entry.weight_g) > 0;

/** Probability density in 1/g. Its integral over the real line is one. */
export const normalWeightDensity = (x: number, mean: number, deviation: number): number => {
  if (!Number.isFinite(x) || !Number.isFinite(mean) || !Number.isFinite(deviation) || deviation <= 0) return 0;
  const z = (x - mean) / deviation;
  return Math.exp(-0.5 * z * z) / (deviation * Math.sqrt(2 * Math.PI));
};

/** One valid individual entry is one observed bird. Group entries never enter this sample. */
export const dailyWeighingDistribution = (
  entries: DailyWeighingEntry[], options: DistributionOptions = {},
): WeighingDistribution => {
  const sample = entries.filter(validIndividual);
  const excludedIndividualCount = entries.filter((entry) => entry.mode === 'individual').length - sample.length;
  const n = sample.length;
  if (n === 0) {
    return {
      available: false, reason: 'no_individual_weights', unit: 'g', n,
      excluded_individual_count: excludedIndividualCount,
      mean: null, sample_stddev: null, minimum: null, maximum: null,
      uniformity_lower: null, uniformity_upper: null, uniformity_percent: null,
      bin_width: null, bins: [], curve: null,
    };
  }

  const weights = sample.map((entry) => Number(entry.weight_g));
  const mean = weights.reduce((sum, weight) => sum + weight, 0) / n;
  // These birds are a sample of the lot, so variance uses the sample denominator N - 1.
  const allEqual = weights.every((weight) => weight === weights[0]);
  const sampleStddev = n > 1
    ? allEqual ? 0 : Math.sqrt(weights.reduce((sum, weight) => sum + (weight - mean) ** 2, 0) / (n - 1)) : null;
  const minimum = weights.reduce((lowest, weight) => Math.min(lowest, weight), Infinity);
  const maximum = weights.reduce((highest, weight) => Math.max(highest, weight), -Infinity);
  const uniformityMargin = mean / 10;
  const uniformityLower = mean - uniformityMargin;
  const uniformityUpper = mean + uniformityMargin;
  const comparisonTolerance = Number.EPSILON * Math.max(1, mean) * 8;
  const uniformityPercent = 100 * weights.filter((weight) =>
    weight >= uniformityLower - comparisonTolerance && weight <= uniformityUpper + comparisonTolerance).length / n;

  const expected = options.expectedRange;
  const hasExpectedRange = expected && Number.isFinite(expected.min) && Number.isFinite(expected.max)
    && expected.min >= 0 && expected.max > expected.min;
  const targetBins = hasExpectedRange ? 20 : Math.min(20, Math.ceil(Math.log2(n) + 1));
  const referenceSpan = hasExpectedRange ? expected.max - expected.min : maximum - minimum;
  const automaticWidth = niceIntegerBinWidth(referenceSpan / targetBins);
  const width = options.binWidth !== undefined && Number.isSafeInteger(options.binWidth) && options.binWidth > 0
    ? options.binWidth : automaticWidth;
  // Keep only occupied intervals: a distant anomaly must not allocate thousands of empty bars.
  const binsByIndex = new Map<string, { lower: number; upper: number; center: number; count: number; anomalous: number }>();
  for (const entry of sample) {
    // Start with intervals centered on whole multiples of the base width.
    const weight = Number(entry.weight_g);
    const index = Math.floor((weight + width / 2) / width);
    let lower = index * width - width / 2;
    let upper = lower + width;
    if (hasExpectedRange && weight === expected.max && lower === expected.max) {
      lower -= width;
      upper -= width;
    }
    // Split intervals at inclusive expected limits so nearby anomalies do not
    // share a column with weights exactly on the limit.
    if (hasExpectedRange) {
      if (weight < expected.min) upper = Math.min(upper, expected.min);
      else if (weight > expected.max) lower = Math.max(lower, expected.max);
      else {
        lower = Math.max(lower, expected.min);
        upper = Math.min(upper, expected.max);
      }
    }
    const key = `${lower}:${upper}`;
    let bin = binsByIndex.get(key);
    if (!bin) {
      bin = { lower, upper, center: (lower + upper) / 2, count: 0, anomalous: 0 };
      binsByIndex.set(key, bin);
    }
    bin.count++;
    if (entry.outside_expected_range) bin.anomalous++;
  }
  const bins = [...binsByIndex.values()].sort((left, right) => left.lower - right.lower);

  const reason = n === 1 ? 'insufficient_sample' : sampleStddev === 0 ? 'zero_variance' : null;
  const curve = sampleStddev && sampleStddev > 0 ? Array.from({ length: 121 }, (_, index) => {
    const lower = mean - 4 * sampleStddev;
    const upper = mean + 4 * sampleStddev;
    const x = lower + ((upper - lower) * index) / 120;
    return { x, density: normalWeightDensity(x, mean, sampleStddev) };
  }) : null;

  return {
    available: true, reason, unit: 'g', n, excluded_individual_count: excludedIndividualCount,
    mean, sample_stddev: sampleStddev, minimum, maximum,
    uniformity_lower: uniformityLower, uniformity_upper: uniformityUpper,
    uniformity_percent: uniformityPercent, bin_width: width, bins, curve,
  };
};
