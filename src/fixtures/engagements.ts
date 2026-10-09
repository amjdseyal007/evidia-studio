/**
 * Tenant engagement fixtures for the enterprise console.
 *
 * All demo data. Tracks where each tenant sits in the demo onboarding
 * journey — phase, health, and milestone progress — for control-plane
 * presentation only.
 */

export const ENGAGEMENT_MILESTONES = ['Kickoff & BAA executed', 'First dataset landed', 'OMOP harmonization validated', 'DQ baseline accepted', 'First cohort built', 'First evidence package delivered', 'Go-live'] as const;

export type EngagementPhase = 'onboarding' | 'data-validation' | 'first-study' | 'live';
export type EngagementHealth = 'on-track' | 'at-risk' | 'blocked';

export interface EngagementRecord {
  tenant_id: string;
  phase: EngagementPhase;
  health: EngagementHealth;
  milestones: string[];
  completed: string[];
  updated_at: string;
}

export const engagementSeed: Record<string, EngagementRecord> = {
  acme_rare: {
    tenant_id: 'acme_rare',
    phase: 'first-study',
    health: 'on-track',
    milestones: [...ENGAGEMENT_MILESTONES],
    completed: [...ENGAGEMENT_MILESTONES.slice(0, 5)],
    updated_at: '2026-10-08T14:05:00Z',
  },
  beacon_bio: {
    tenant_id: 'beacon_bio',
    phase: 'data-validation',
    health: 'at-risk',
    milestones: [...ENGAGEMENT_MILESTONES],
    completed: [...ENGAGEMENT_MILESTONES.slice(0, 2)],
    updated_at: '2026-10-08T08:50:00Z',
  },
  corvus_tx: {
    tenant_id: 'corvus_tx',
    phase: 'onboarding',
    health: 'on-track',
    milestones: [...ENGAGEMENT_MILESTONES],
    completed: [],
    updated_at: '2026-10-02T14:20:00Z',
  },
};
