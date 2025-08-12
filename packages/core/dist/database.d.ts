import type { Assessment, User, AuditLog, EvidencePointer, AssessmentState, UserRole } from './types.js';
export interface DatabaseConfig {
    path: string;
    enableWAL?: boolean;
    enableForeignKeys?: boolean;
    busyTimeout?: number;
}
export declare class IP2MDatabase {
    private db;
    constructor(config: DatabaseConfig);
    private initializeSchema;
    createUser(user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): string;
    getUserById(id: string): User | null;
    getUserByUsername(username: string): User | null;
    getUserByEmail(email: string): User | null;
    updateUser(id: string, updates: Partial<User>): void;
    private mapRowToUser;
    createAssessment(assessment: Omit<Assessment, 'id' | 'createdAt' | 'updatedAt' | 'findings' | 'scorecard' | 'actionItems'>): string;
    getAssessmentById(id: string): Assessment | null;
    updateAssessmentState(id: string, state: AssessmentState, approvedBy: string): void;
    private mapRowToAssessment;
    createEvidencePointer(evidence: Omit<EvidencePointer, 'id'>): string;
    getEvidencePointerById(id: string): EvidencePointer | null;
    private mapRowToEvidencePointer;
    logAudit(log: Omit<AuditLog, 'id' | 'timestamp'>): void;
    getAssessments(options: {
        page: number;
        limit: number;
        state?: AssessmentState;
        facilitatorId?: string;
        userId?: string;
    }): {
        items: Assessment[];
        total: number;
    };
    private getFindingsByAssessmentId;
    private getScorecardByAssessmentId;
    private getActionItemsByAssessmentId;
    getUsers(options: {
        page: number;
        limit: number;
        role?: UserRole;
        active?: boolean;
    }): {
        items: User[];
        total: number;
    };
    getAuditLogs(options: {
        page: number;
        limit: number;
        userId?: string;
        action?: string;
        startDate?: Date;
        endDate?: Date;
    }): {
        items: AuditLog[];
        total: number;
    };
    getUserStats(): any;
    getAssessmentStats(): any;
    getActiveAdminCount(): number;
    private mapRowToAuditLog;
    close(): void;
}
//# sourceMappingURL=database.d.ts.map