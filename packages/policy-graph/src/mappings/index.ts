/**
 * Policy Graph Mappings
 * 
 * Default mappings between EIA-748 guidelines and IP2M attributes
 */

import { PolicyMapping } from '../index.js';

export const DEFAULT_POLICY_MAPPINGS: PolicyMapping[] = [
  {
    id: 'mapping-001',
    eia748GuidelineId: 'eia748-01',
    ip2mAttributeId: 'ip2m-planning',
    mappingType: 'direct',
    confidence: 0.9,
    rationale: 'WBS definition directly supports planning and controls',
    evidenceRequirements: ['WBS documents', 'Work authorization']
  },
  {
    id: 'mapping-002',
    eia748GuidelineId: 'eia748-02',
    ip2mAttributeId: 'ip2m-execution',
    mappingType: 'supporting',
    confidence: 0.7,
    rationale: 'Organizational structure supports execution effectiveness',
    evidenceRequirements: ['Organization charts', 'RACI matrices']
  }
];

export * from './eia748-mappings.js';
export * from './ip2m-mappings.js';
