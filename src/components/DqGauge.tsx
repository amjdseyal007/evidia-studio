import type { QualityResult } from '../lib/api';

/** 0–100 DQ score gauge (dataquality score shape). Pure CSS bar + number. */
export default function DqGauge({ result }: { result: QualityResult }) {
  const score = Math.max(0, Math.min(100, result.score));
  return (
    <div className="dq-gauge" data-testid="dq-gauge">
      <div className="dq-gauge-head">
        <span>Data-quality score</span>
        <strong>{score.toFixed(1)} / 100</strong>
      </div>
      <div className="dq-gauge-track" role="progressbar" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100} aria-label="Data quality score">
        <div className="dq-gauge-fill" style={{ width: `${score}%` }} />
      </div>
      <p className="dq-gauge-meta">
        Run {result.run_id} · {result.summary.passed} pass / {result.summary.warned} warn / {result.summary.failed} fail
        of {result.summary.total_checks} checks · {result.summary.total_rows.toLocaleString()} rows
      </p>
    </div>
  );
}
