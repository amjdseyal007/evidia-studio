import { MODE } from '../lib/api';

export default function MockBanner() {
  if (MODE === 'live') {
    return (
      <div className="mock-banner" role="note" data-testid="mock-banner">
        LIVE MODE — pointed at VITE_EVIDIA_API_BASE_URL. Live mode is code-ready and has not yet been run against a deployed backend; failed requests surface as errors, never fixture fallback.
      </div>
    );
  }
  return (
    <div className="mock-banner" role="note" data-testid="mock-banner">
      MOCK DATA — no live backend. Everything on this page is fixture data; nothing here talks to a real system.
    </div>
  );
}
