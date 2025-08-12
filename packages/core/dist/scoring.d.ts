import { z } from 'zod';
export declare const ScoringRuleSchema: any;
export type ScoringRule = z.infer<typeof ScoringRuleSchema>;
export declare const GuidelineAttributeMappingSchema: any;
export type GuidelineAttributeMapping = z.infer<typeof GuidelineAttributeMappingSchema>;
export declare const ScoringProfileSchema: any;
export type ScoringProfile = z.infer<typeof ScoringProfileSchema>;
export declare const DEFAULT_GUIDELINES: GuidelineAttributeMapping[];
export interface ConfidenceFactors {
    evidenceDensity: number;
    sourceReliability: number;
    recency: number;
    consistency: number;
}
export declare function calculateConfidence(factors: ConfidenceFactors): number;
export declare function determineScoreLevel(score: number): string;
//# sourceMappingURL=scoring.d.ts.map