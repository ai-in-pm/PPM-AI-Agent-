/**
 * IP2M Policy Graph Package
 * 
 * This package provides EIA-748 to IP2M mapping functionality
 * and policy graph management for assessment workflows.
 */

import { z } from 'zod';

// EIA-748 Guideline Schema
export const EIA748GuidelineSchema = z.object({
  id: z.string(),
  number: z.number(),
  title: z.string(),
  description: z.string(),
  category: z.enum(['Organization', 'Planning', 'Accounting', 'Analysis', 'Revisions']),
  requirements: z.array(z.string()),
  evidenceTypes: z.array(z.string())
});

// IP2M Attribute Schema
export const IP2MAttributeSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  factors: z.array(z.string()),
  weight: z.number().min(0).max(1),
  scoringCriteria: z.record(z.string(), z.any())
});

// Policy Mapping Schema
export const PolicyMappingSchema = z.object({
  id: z.string(),
  eia748GuidelineId: z.string(),
  ip2mAttributeId: z.string(),
  mappingType: z.enum(['direct', 'indirect', 'supporting']),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
  evidenceRequirements: z.array(z.string())
});

export type EIA748Guideline = z.infer<typeof EIA748GuidelineSchema>;
export type IP2MAttribute = z.infer<typeof IP2MAttributeSchema>;
export type PolicyMapping = z.infer<typeof PolicyMappingSchema>;

/**
 * Policy Graph Manager
 * 
 * Manages the relationships between EIA-748 guidelines and IP2M attributes
 */
export class PolicyGraphManager {
  private guidelines: Map<string, EIA748Guideline> = new Map();
  private attributes: Map<string, IP2MAttribute> = new Map();
  private mappings: Map<string, PolicyMapping> = new Map();

  /**
   * Add an EIA-748 guideline to the graph
   */
  addGuideline(guideline: EIA748Guideline): void {
    this.guidelines.set(guideline.id, guideline);
  }

  /**
   * Add an IP2M attribute to the graph
   */
  addAttribute(attribute: IP2MAttribute): void {
    this.attributes.set(attribute.id, attribute);
  }

  /**
   * Add a policy mapping between guideline and attribute
   */
  addMapping(mapping: PolicyMapping): void {
    this.mappings.set(mapping.id, mapping);
  }

  /**
   * Get all mappings for a specific EIA-748 guideline
   */
  getMappingsForGuideline(guidelineId: string): PolicyMapping[] {
    return Array.from(this.mappings.values())
      .filter(mapping => mapping.eia748GuidelineId === guidelineId);
  }

  /**
   * Get all mappings for a specific IP2M attribute
   */
  getMappingsForAttribute(attributeId: string): PolicyMapping[] {
    return Array.from(this.mappings.values())
      .filter(mapping => mapping.ip2mAttributeId === attributeId);
  }

  /**
   * Calculate coverage score for IP2M attributes
   */
  calculateCoverage(): Record<string, number> {
    const coverage: Record<string, number> = {};
    
    for (const attribute of this.attributes.values()) {
      const mappings = this.getMappingsForAttribute(attribute.id);
      const totalWeight = mappings.reduce((sum, mapping) => sum + mapping.confidence, 0);
      coverage[attribute.id] = Math.min(totalWeight, 1.0);
    }
    
    return coverage;
  }
}

// Default EIA-748 Guidelines (subset for demonstration)
export const DEFAULT_EIA748_GUIDELINES: EIA748Guideline[] = [
  {
    id: 'eia748-01',
    number: 1,
    title: 'Define Work Breakdown Structure',
    description: 'Define the authorized work elements for the program to the appropriate level',
    category: 'Organization',
    requirements: ['WBS definition', 'Work package identification'],
    evidenceTypes: ['WBS documents', 'Work authorization documents']
  },
  {
    id: 'eia748-02',
    number: 2,
    title: 'Identify Program Organizational Structure',
    description: 'Identify the program organizational structure responsible for accomplishing the authorized work',
    category: 'Organization',
    requirements: ['Organizational chart', 'Responsibility assignment'],
    evidenceTypes: ['Organization charts', 'RACI matrices']
  }
];

// Default IP2M Attributes (subset for demonstration)
export const DEFAULT_IP2M_ATTRIBUTES: IP2MAttribute[] = [
  {
    id: 'ip2m-planning',
    name: 'Planning and Controls',
    description: 'Project planning, scheduling, and control processes',
    factors: ['Schedule development', 'Resource planning', 'Risk management'],
    weight: 0.25,
    scoringCriteria: {
      'excellent': 'Comprehensive planning with integrated controls',
      'good': 'Adequate planning with some control gaps',
      'fair': 'Basic planning with limited controls',
      'poor': 'Inadequate planning and controls'
    }
  },
  {
    id: 'ip2m-execution',
    name: 'Execution and Performance',
    description: 'Project execution effectiveness and performance measurement',
    factors: ['Work execution', 'Performance measurement', 'Quality assurance'],
    weight: 0.30,
    scoringCriteria: {
      'excellent': 'Excellent execution with strong performance metrics',
      'good': 'Good execution with adequate metrics',
      'fair': 'Fair execution with basic metrics',
      'poor': 'Poor execution with limited metrics'
    }
  }
];

export * from './mappings/index.js';
export * from './scoring/index.js';
