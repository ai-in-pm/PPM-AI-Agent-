import { z } from 'zod';
// Evidence and Source Management
export const EvidencePointerSchema = z.object({
    id: z.string().uuid(),
    sourceKind: z.enum(['pdf', 'docx', 'xlsx', 'csv', 'text', 'url']),
    sourcePathOrUrl: z.string(),
    locationHint: z.object({
        page: z.number().optional(),
        lineStart: z.number().optional(),
        lineEnd: z.number().optional(),
        section: z.string().optional(),
        table: z.string().optional()
    }).optional(),
    snippet: z.string().optional(),
    confidence: z.number().min(0).max(1),
    extractedAt: z.date(),
    fileHash: z.string().optional(),
    metadata: z.record(z.any()).optional()
});
// Assessment Findings
export const FindingSchema = z.object({
    id: z.string().uuid(),
    guidelineIds: z.array(z.string()),
    attributeIds: z.array(z.string()),
    factors: z.array(z.string()).optional(),
    summary: z.string(),
    evidence: z.array(EvidencePointerSchema),
    riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
    confidence: z.number().min(0).max(1),
    createdAt: z.date(),
    updatedAt: z.date(),
    createdBy: z.string(),
    status: z.enum(['draft', 'under-review', 'approved', 'rejected']),
    reviewNotes: z.string().optional()
});
// Scorecard Management
export const ScoreCardEntrySchema = z.object({
    id: z.string().uuid(),
    target: z.string(), // AttributeId or FactorId
    targetType: z.enum(['attribute', 'factor']),
    proposedScore: z.number().min(0).max(5),
    scoringMethod: z.string(),
    rationale: z.string(),
    evidence: z.array(EvidencePointerSchema),
    confidenceInterval: z.tuple([z.number(), z.number()]).optional(),
    status: z.enum(['draft', 'awaiting-approval', 'approved', 'rejected']),
    reviewedBy: z.string().optional(),
    reviewedAt: z.date().optional(),
    reviewNotes: z.string().optional(),
    createdAt: z.date(),
    updatedAt: z.date()
});
// Action Items and Remediation
export const ActionItemSchema = z.object({
    id: z.string().uuid(),
    title: z.string(),
    description: z.string(),
    mapsToGuidelines: z.array(z.string()),
    mapsToAttributes: z.array(z.string()).optional(),
    ownerRole: z.enum(['CAM', 'PM', 'EV Analyst', 'Org Lead', 'Other']),
    ownerName: z.string().optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']),
    dueInDays: z.number(),
    estimatedEffort: z.string().optional(),
    status: z.enum(['not-started', 'in-progress', 'completed', 'cancelled']),
    evidenceLinks: z.array(EvidencePointerSchema).optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
    completedAt: z.date().optional()
});
// Assessment State Machine
export const AssessmentStateSchema = z.enum([
    'SCOPING',
    'EVIDENCE_COLLECTION',
    'INTERVIEWS',
    'DRAFT_SCORING',
    'HIL_REVIEW',
    'REMEDIATION_PLAN',
    'FINAL_REPORT',
    'COMPLETED',
    'CANCELLED'
]);
export const AssessmentSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    description: z.string(),
    organizationName: z.string(),
    contractNumber: z.string().optional(),
    assessmentType: z.enum(['initial', 'surveillance', 'closeout']),
    state: AssessmentStateSchema,
    createdAt: z.date(),
    updatedAt: z.date(),
    createdBy: z.string(),
    facilitatorId: z.string(),
    teamMembers: z.array(z.string()),
    scopeDocuments: z.array(z.string()),
    findings: z.array(FindingSchema),
    scorecard: z.array(ScoreCardEntrySchema),
    actionItems: z.array(ActionItemSchema),
    metadata: z.record(z.any()).optional()
});
// User Management and RBAC
export const UserRoleSchema = z.enum(['Admin', 'Facilitator', 'Analyst', 'Viewer']);
export const UserSchema = z.object({
    id: z.string().uuid(),
    username: z.string(),
    email: z.string().email(),
    fullName: z.string(),
    role: UserRoleSchema,
    isActive: z.boolean(),
    createdAt: z.date(),
    updatedAt: z.date(),
    lastLoginAt: z.date().optional(),
    passwordHash: z.string(),
    failedLoginAttempts: z.number().default(0),
    lockedUntil: z.date().optional()
});
// Audit Logging
export const AuditLogSchema = z.object({
    id: z.string().uuid(),
    userId: z.string(),
    action: z.string(),
    resourceType: z.string(),
    resourceId: z.string().optional(),
    details: z.record(z.any()).optional(),
    ipAddress: z.string().optional(),
    userAgent: z.string().optional(),
    timestamp: z.date(),
    success: z.boolean()
});
//# sourceMappingURL=types.js.map