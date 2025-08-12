// Core Types
export * from './types.js';
export * from './scoring.js';
export * from './database.js';

// Re-export commonly used schemas for validation
export {
  EvidencePointerSchema,
  FindingSchema,
  ScoreCardEntrySchema,
  ActionItemSchema,
  AssessmentSchema,
  UserSchema,
  AuditLogSchema,
  ScoringRuleSchema,
  GuidelineAttributeMappingSchema,
  ScoringProfileSchema
} from './types.js';

// Utility functions
export {
  calculateConfidence,
  determineScoreLevel,
  DEFAULT_GUIDELINES
} from './scoring.js';

// Constants
export const ASSESSMENT_STATES = [
  'SCOPING',
  'EVIDENCE_COLLECTION',
  'INTERVIEWS', 
  'DRAFT_SCORING',
  'HIL_REVIEW',
  'REMEDIATION_PLAN',
  'FINAL_REPORT',
  'COMPLETED',
  'CANCELLED'
] as const;

export const USER_ROLES = ['Admin', 'Facilitator', 'Analyst', 'Viewer'] as const;

export const RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;

export const EVIDENCE_TYPES = ['pdf', 'docx', 'xlsx', 'csv', 'text', 'url'] as const;
