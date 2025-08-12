import { z } from 'zod';
// Scoring Configuration Schema
export const ScoringRuleSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    targetType: z.enum(['attribute', 'factor']),
    targetId: z.string(),
    conditions: z.array(z.object({
        evidenceType: z.string(),
        minimumCount: z.number(),
        qualityThreshold: z.number().min(0).max(1),
        keywords: z.array(z.string()).optional(),
        weight: z.number().min(0).max(1)
    })),
    scoreMapping: z.object({
        excellent: z.object({ min: z.number(), max: z.number(), description: z.string() }),
        satisfactory: z.object({ min: z.number(), max: z.number(), description: z.string() }),
        marginal: z.object({ min: z.number(), max: z.number(), description: z.string() }),
        unsatisfactory: z.object({ min: z.number(), max: z.number(), description: z.string() }),
        deficient: z.object({ min: z.number(), max: z.number(), description: z.string() })
    }),
    confidenceFactors: z.object({
        evidenceDensity: z.number().min(0).max(1),
        sourceReliability: z.number().min(0).max(1),
        recency: z.number().min(0).max(1),
        consistency: z.number().min(0).max(1)
    })
});
// EIA-748 Guidelines to IP2M Attribute Mapping
export const GuidelineAttributeMappingSchema = z.object({
    guidelineId: z.string(),
    guidelineTitle: z.string(),
    guidelineDescription: z.string(),
    category: z.enum(['Organization', 'Planning', 'Accounting', 'Analysis', 'Revisions']),
    mappedAttributes: z.array(z.object({
        attributeId: z.string(),
        attributeName: z.string(),
        relationshipType: z.enum(['primary', 'secondary', 'supporting']),
        weight: z.number().min(0).max(1)
    })),
    mappedFactors: z.array(z.object({
        factorId: z.string(),
        factorName: z.string(),
        relationshipType: z.enum(['direct', 'indirect', 'contextual']),
        weight: z.number().min(0).max(1)
    })).optional(),
    evidenceRequirements: z.array(z.object({
        type: z.string(),
        description: z.string(),
        mandatory: z.boolean(),
        sources: z.array(z.string())
    }))
});
// Scoring Profile Configuration
export const ScoringProfileSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    description: z.string(),
    version: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
    isDefault: z.boolean(),
    guidelines: z.array(GuidelineAttributeMappingSchema),
    scoringRules: z.array(ScoringRuleSchema),
    globalSettings: z.object({
        confidenceThreshold: z.number().min(0).max(1),
        evidenceMinimumCount: z.number().min(1),
        allowPartialScoring: z.boolean(),
        requireHumanApproval: z.boolean(),
        scoringMethod: z.enum(['weighted-average', 'minimum-threshold', 'consensus-based'])
    })
});
// Default EIA-748 Guidelines (first 10 as example)
export const DEFAULT_GUIDELINES = [
    {
        guidelineId: 'EIA748-1',
        guidelineTitle: 'Define the authorized work elements',
        guidelineDescription: 'Define the authorized work elements for the program to the appropriate level of detail',
        category: 'Organization',
        mappedAttributes: [
            { attributeId: 'IP2M-A1', attributeName: 'Work Authorization', relationshipType: 'primary', weight: 0.8 },
            { attributeId: 'IP2M-A2', attributeName: 'Scope Definition', relationshipType: 'primary', weight: 0.7 }
        ],
        evidenceRequirements: [
            { type: 'WBS', description: 'Work Breakdown Structure documentation', mandatory: true, sources: ['project-docs', 'contracts'] },
            { type: 'SOW', description: 'Statement of Work', mandatory: true, sources: ['contracts', 'proposals'] }
        ]
    },
    {
        guidelineId: 'EIA748-2',
        guidelineTitle: 'Identify the program organizational structure',
        guidelineDescription: 'Identify the program organizational structure responsible for accomplishing the authorized work',
        category: 'Organization',
        mappedAttributes: [
            { attributeId: 'IP2M-A3', attributeName: 'Organizational Structure', relationshipType: 'primary', weight: 0.9 },
            { attributeId: 'IP2M-A4', attributeName: 'Responsibility Assignment', relationshipType: 'secondary', weight: 0.6 }
        ],
        evidenceRequirements: [
            { type: 'OBS', description: 'Organizational Breakdown Structure', mandatory: true, sources: ['org-charts', 'project-docs'] },
            { type: 'RAM', description: 'Responsibility Assignment Matrix', mandatory: true, sources: ['project-docs'] }
        ]
    },
    {
        guidelineId: 'EIA748-3',
        guidelineTitle: 'Provide for the integration of the company\'s planning',
        guidelineDescription: 'Provide for the integration of the company\'s planning, scheduling, budgeting, work authorization and cost accumulation processes',
        category: 'Organization',
        mappedAttributes: [
            { attributeId: 'IP2M-A5', attributeName: 'Process Integration', relationshipType: 'primary', weight: 0.8 },
            { attributeId: 'IP2M-A6', attributeName: 'System Integration', relationshipType: 'secondary', weight: 0.7 }
        ],
        evidenceRequirements: [
            { type: 'PROCESS', description: 'Integrated process documentation', mandatory: true, sources: ['procedures', 'manuals'] },
            { type: 'WORKFLOW', description: 'Workflow diagrams and procedures', mandatory: false, sources: ['process-docs'] }
        ]
    }
];
export function calculateConfidence(factors) {
    const weights = {
        evidenceDensity: 0.3,
        sourceReliability: 0.25,
        recency: 0.2,
        consistency: 0.25
    };
    return (factors.evidenceDensity * weights.evidenceDensity +
        factors.sourceReliability * weights.sourceReliability +
        factors.recency * weights.recency +
        factors.consistency * weights.consistency);
}
export function determineScoreLevel(score) {
    if (score >= 4.5)
        return 'excellent';
    if (score >= 3.5)
        return 'satisfactory';
    if (score >= 2.5)
        return 'marginal';
    if (score >= 1.5)
        return 'unsatisfactory';
    return 'deficient';
}
//# sourceMappingURL=scoring.js.map