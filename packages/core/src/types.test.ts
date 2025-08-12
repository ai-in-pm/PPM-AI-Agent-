import { describe, it, expect } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import {
  EvidencePointerSchema,
  FindingSchema,
  ScoreCardEntrySchema,
  ActionItemSchema,
  AssessmentSchema,
  UserSchema,
  AuditLogSchema,
  calculateConfidence,
  determineScoreLevel
} from './index.js';

describe('Core Types Validation', () => {
  describe('EvidencePointer', () => {
    it('should validate a complete evidence pointer', () => {
      const evidencePointer = {
        id: uuidv4(),
        sourceKind: 'pdf' as const,
        sourcePathOrUrl: '/path/to/document.pdf',
        locationHint: {
          page: 15,
          lineStart: 10,
          lineEnd: 25,
          section: 'Section 3.2'
        },
        snippet: 'This is a relevant quote from the document',
        confidence: 0.85,
        extractedAt: new Date(),
        fileHash: 'sha256:abc123...',
        metadata: { author: 'John Doe', version: '1.0' }
      };

      expect(() => EvidencePointerSchema.parse(evidencePointer)).not.toThrow();
    });

    it('should reject invalid confidence values', () => {
      const invalidEvidence = {
        id: uuidv4(),
        sourceKind: 'pdf' as const,
        sourcePathOrUrl: '/path/to/document.pdf',
        confidence: 1.5, // Invalid: > 1
        extractedAt: new Date()
      };

      expect(() => EvidencePointerSchema.parse(invalidEvidence)).toThrow();
    });
  });

  describe('Finding', () => {
    it('should validate a complete finding', () => {
      const finding = {
        id: uuidv4(),
        guidelineIds: ['EIA748-1', 'EIA748-2'],
        attributeIds: ['IP2M-A1', 'IP2M-A2'],
        factors: ['IP2M-F1'],
        summary: 'Work authorization processes are well-defined',
        evidence: [{
          id: uuidv4(),
          sourceKind: 'pdf' as const,
          sourcePathOrUrl: '/docs/wbs.pdf',
          confidence: 0.9,
          extractedAt: new Date()
        }],
        riskLevel: 'low' as const,
        confidence: 0.8,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'analyst-1',
        status: 'approved' as const
      };

      expect(() => FindingSchema.parse(finding)).not.toThrow();
    });
  });

  describe('ScoreCardEntry', () => {
    it('should validate a scorecard entry', () => {
      const scoreEntry = {
        id: uuidv4(),
        target: 'IP2M-A1',
        targetType: 'attribute' as const,
        proposedScore: 4.2,
        scoringMethod: 'weighted-average',
        rationale: 'Strong evidence of work authorization processes',
        evidence: [{
          id: uuidv4(),
          sourceKind: 'docx' as const,
          sourcePathOrUrl: '/docs/procedures.docx',
          confidence: 0.95,
          extractedAt: new Date()
        }],
        confidenceInterval: [3.8, 4.6] as [number, number],
        status: 'approved' as const,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      expect(() => ScoreCardEntrySchema.parse(scoreEntry)).not.toThrow();
    });

    it('should reject scores outside valid range', () => {
      const invalidScore = {
        id: uuidv4(),
        target: 'IP2M-A1',
        targetType: 'attribute' as const,
        proposedScore: 6.0, // Invalid: > 5
        scoringMethod: 'weighted-average',
        rationale: 'Test',
        evidence: [],
        status: 'draft' as const,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      expect(() => ScoreCardEntrySchema.parse(invalidScore)).toThrow();
    });
  });

  describe('ActionItem', () => {
    it('should validate an action item', () => {
      const actionItem = {
        id: uuidv4(),
        title: 'Implement WBS documentation',
        description: 'Create comprehensive work breakdown structure',
        mapsToGuidelines: ['EIA748-1'],
        mapsToAttributes: ['IP2M-A1'],
        ownerRole: 'PM' as const,
        ownerName: 'Jane Smith',
        priority: 'high' as const,
        dueInDays: 30,
        estimatedEffort: '2 weeks',
        status: 'in-progress' as const,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      expect(() => ActionItemSchema.parse(actionItem)).not.toThrow();
    });
  });

  describe('User', () => {
    it('should validate a user', () => {
      const user = {
        id: uuidv4(),
        username: 'jdoe',
        email: 'john.doe@example.com',
        fullName: 'John Doe',
        role: 'Facilitator' as const,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        passwordHash: '$2b$12$...',
        failedLoginAttempts: 0
      };

      expect(() => UserSchema.parse(user)).not.toThrow();
    });

    it('should reject invalid email', () => {
      const invalidUser = {
        id: uuidv4(),
        username: 'jdoe',
        email: 'not-an-email',
        fullName: 'John Doe',
        role: 'Facilitator' as const,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        passwordHash: '$2b$12$...',
        failedLoginAttempts: 0
      };

      expect(() => UserSchema.parse(invalidUser)).toThrow();
    });
  });
});

describe('Scoring Utilities', () => {
  describe('calculateConfidence', () => {
    it('should calculate confidence correctly', () => {
      const factors = {
        evidenceDensity: 0.8,
        sourceReliability: 0.9,
        recency: 0.7,
        consistency: 0.85
      };

      const confidence = calculateConfidence(factors);
      expect(confidence).toBeGreaterThan(0);
      expect(confidence).toBeLessThanOrEqual(1);
      expect(confidence).toBeCloseTo(0.8125, 3);
    });
  });

  describe('determineScoreLevel', () => {
    it('should determine correct score levels', () => {
      expect(determineScoreLevel(4.8)).toBe('excellent');
      expect(determineScoreLevel(4.0)).toBe('satisfactory');
      expect(determineScoreLevel(3.0)).toBe('marginal');
      expect(determineScoreLevel(2.0)).toBe('unsatisfactory');
      expect(determineScoreLevel(1.0)).toBe('deficient');
    });
  });
});
