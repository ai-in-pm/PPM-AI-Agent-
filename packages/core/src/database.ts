import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type {
  Assessment,
  Finding,
  ScoreCardEntry,
  ActionItem,
  User,
  AuditLog,
  EvidencePointer,
  AssessmentState,
  UserRole
} from './types.js';

export interface DatabaseConfig {
  path: string;
  enableWAL?: boolean;
  enableForeignKeys?: boolean;
  busyTimeout?: number;
}

export class IP2MDatabase {
  private db: Database.Database;

  constructor(config: DatabaseConfig) {
    this.db = new Database(config.path);
    
    if (config.enableWAL !== false) {
      this.db.pragma('journal_mode = WAL');
    }
    
    if (config.enableForeignKeys !== false) {
      this.db.pragma('foreign_keys = ON');
    }
    
    if (config.busyTimeout) {
      this.db.pragma(`busy_timeout = ${config.busyTimeout}`);
    }

    this.initializeSchema();
  }

  private initializeSchema(): void {
    // Users table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('Admin', 'Facilitator', 'Analyst', 'Viewer')),
        is_active BOOLEAN NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_login_at DATETIME,
        password_hash TEXT NOT NULL,
        failed_login_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until DATETIME
      );
    `);

    // Assessments table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS assessments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        organization_name TEXT NOT NULL,
        contract_number TEXT,
        assessment_type TEXT NOT NULL CHECK (assessment_type IN ('initial', 'surveillance', 'closeout')),
        state TEXT NOT NULL CHECK (state IN ('SCOPING', 'EVIDENCE_COLLECTION', 'INTERVIEWS', 'DRAFT_SCORING', 'HIL_REVIEW', 'REMEDIATION_PLAN', 'FINAL_REPORT', 'COMPLETED', 'CANCELLED')),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_by TEXT NOT NULL,
        facilitator_id TEXT NOT NULL,
        team_members TEXT, -- JSON array
        scope_documents TEXT, -- JSON array
        metadata TEXT, -- JSON object
        FOREIGN KEY (created_by) REFERENCES users(id),
        FOREIGN KEY (facilitator_id) REFERENCES users(id)
      );
    `);

    // Evidence pointers table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS evidence_pointers (
        id TEXT PRIMARY KEY,
        source_kind TEXT NOT NULL CHECK (source_kind IN ('pdf', 'docx', 'xlsx', 'csv', 'text', 'url')),
        source_path_or_url TEXT NOT NULL,
        location_hint TEXT, -- JSON object
        snippet TEXT,
        confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
        extracted_at DATETIME NOT NULL,
        file_hash TEXT,
        metadata TEXT -- JSON object
      );
    `);

    // Findings table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS findings (
        id TEXT PRIMARY KEY,
        assessment_id TEXT NOT NULL,
        guideline_ids TEXT NOT NULL, -- JSON array
        attribute_ids TEXT NOT NULL, -- JSON array
        factors TEXT, -- JSON array
        summary TEXT NOT NULL,
        evidence_ids TEXT NOT NULL, -- JSON array of evidence pointer IDs
        risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
        confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_by TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('draft', 'under-review', 'approved', 'rejected')),
        review_notes TEXT,
        FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id)
      );
    `);

    // Scorecard entries table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scorecard_entries (
        id TEXT PRIMARY KEY,
        assessment_id TEXT NOT NULL,
        target TEXT NOT NULL,
        target_type TEXT NOT NULL CHECK (target_type IN ('attribute', 'factor')),
        proposed_score REAL NOT NULL CHECK (proposed_score >= 0 AND proposed_score <= 5),
        scoring_method TEXT NOT NULL,
        rationale TEXT NOT NULL,
        evidence_ids TEXT NOT NULL, -- JSON array
        confidence_interval TEXT, -- JSON array [min, max]
        status TEXT NOT NULL CHECK (status IN ('draft', 'awaiting-approval', 'approved', 'rejected')),
        reviewed_by TEXT,
        reviewed_at DATETIME,
        review_notes TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE,
        FOREIGN KEY (reviewed_by) REFERENCES users(id)
      );
    `);

    // Action items table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS action_items (
        id TEXT PRIMARY KEY,
        assessment_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        maps_to_guidelines TEXT NOT NULL, -- JSON array
        maps_to_attributes TEXT, -- JSON array
        owner_role TEXT NOT NULL CHECK (owner_role IN ('CAM', 'PM', 'EV Analyst', 'Org Lead', 'Other')),
        owner_name TEXT,
        priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
        due_in_days INTEGER NOT NULL,
        estimated_effort TEXT,
        status TEXT NOT NULL CHECK (status IN ('not-started', 'in-progress', 'completed', 'cancelled')),
        evidence_links TEXT, -- JSON array of evidence pointer IDs
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE
      );
    `);

    // Audit log table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT,
        details TEXT, -- JSON object
        ip_address TEXT,
        user_agent TEXT,
        timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        success BOOLEAN NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);

    // Vector embeddings table (for sqlite-vec integration)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS document_chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        embedding BLOB, -- Vector embedding
        metadata TEXT, -- JSON object with page, line numbers, etc.
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(document_id, chunk_index)
      );
    `);

    // Create indexes for performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_assessments_state ON assessments(state);
      CREATE INDEX IF NOT EXISTS idx_assessments_facilitator ON assessments(facilitator_id);
      CREATE INDEX IF NOT EXISTS idx_findings_assessment ON findings(assessment_id);
      CREATE INDEX IF NOT EXISTS idx_findings_status ON findings(status);
      CREATE INDEX IF NOT EXISTS idx_scorecard_assessment ON scorecard_entries(assessment_id);
      CREATE INDEX IF NOT EXISTS idx_scorecard_status ON scorecard_entries(status);
      CREATE INDEX IF NOT EXISTS idx_action_items_assessment ON action_items(assessment_id);
      CREATE INDEX IF NOT EXISTS idx_action_items_status ON action_items(status);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_document_chunks_document ON document_chunks(document_id);
    `);

    // Create triggers for updated_at timestamps
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_assessments_timestamp 
      AFTER UPDATE ON assessments
      BEGIN
        UPDATE assessments SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;

      CREATE TRIGGER IF NOT EXISTS update_findings_timestamp 
      AFTER UPDATE ON findings
      BEGIN
        UPDATE findings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;

      CREATE TRIGGER IF NOT EXISTS update_scorecard_timestamp 
      AFTER UPDATE ON scorecard_entries
      BEGIN
        UPDATE scorecard_entries SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;

      CREATE TRIGGER IF NOT EXISTS update_action_items_timestamp 
      AFTER UPDATE ON action_items
      BEGIN
        UPDATE action_items SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    `);
  }

  // User management methods
  createUser(user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): string {
    const id = uuidv4();
    const stmt = this.db.prepare(`
      INSERT INTO users (id, username, email, full_name, role, is_active, password_hash, failed_login_attempts)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      id,
      user.username,
      user.email,
      user.fullName,
      user.role,
      user.isActive,
      user.passwordHash,
      user.failedLoginAttempts
    );
    
    return id;
  }

  getUserById(id: string): User | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.mapRowToUser(row) : null;
  }

  getUserByUsername(username: string): User | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE username = ?');
    const row = stmt.get(username) as any;
    return row ? this.mapRowToUser(row) : null;
  }

  getUserByEmail(email: string): User | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE email = ?');
    const row = stmt.get(email) as any;
    return row ? this.mapRowToUser(row) : null;
  }

  updateUser(id: string, updates: Partial<User>): void {
    const fields = [];
    const values = [];

    if (updates.failedLoginAttempts !== undefined) {
      fields.push('failed_login_attempts = ?');
      values.push(updates.failedLoginAttempts);
    }

    if (updates.lockedUntil !== undefined) {
      fields.push('locked_until = ?');
      values.push(updates.lockedUntil?.toISOString() || null);
    }

    if (updates.lastLoginAt !== undefined) {
      fields.push('last_login_at = ?');
      values.push(updates.lastLoginAt?.toISOString() || null);
    }

    if (updates.passwordHash !== undefined) {
      fields.push('password_hash = ?');
      values.push(updates.passwordHash);
    }

    if (updates.isActive !== undefined) {
      fields.push('is_active = ?');
      values.push(updates.isActive);
    }

    if (fields.length === 0) return;

    values.push(id);
    const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
    const stmt = this.db.prepare(sql);
    stmt.run(...values);
  }

  private mapRowToUser(row: any): User {
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      fullName: row.full_name,
      role: row.role as UserRole,
      isActive: Boolean(row.is_active),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastLoginAt: row.last_login_at ? new Date(row.last_login_at) : undefined,
      passwordHash: row.password_hash,
      failedLoginAttempts: row.failed_login_attempts,
      lockedUntil: row.locked_until ? new Date(row.locked_until) : undefined
    };
  }

  // Assessment management methods
  createAssessment(assessment: Omit<Assessment, 'id' | 'createdAt' | 'updatedAt' | 'findings' | 'scorecard' | 'actionItems'>): string {
    const id = uuidv4();
    const stmt = this.db.prepare(`
      INSERT INTO assessments (
        id, name, description, organization_name, contract_number, assessment_type,
        state, created_by, facilitator_id, team_members, scope_documents, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      id,
      assessment.name,
      assessment.description,
      assessment.organizationName,
      assessment.contractNumber,
      assessment.assessmentType,
      assessment.state,
      assessment.createdBy,
      assessment.facilitatorId,
      JSON.stringify(assessment.teamMembers),
      JSON.stringify(assessment.scopeDocuments),
      JSON.stringify(assessment.metadata || {})
    );
    
    return id;
  }

  getAssessmentById(id: string): Assessment | null {
    const stmt = this.db.prepare('SELECT * FROM assessments WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;

    // Get related data
    const findings = this.getFindingsByAssessmentId(id);
    const scorecard = this.getScorecardByAssessmentId(id);
    const actionItems = this.getActionItemsByAssessmentId(id);

    return this.mapRowToAssessment(row, findings, scorecard, actionItems);
  }

  updateAssessmentState(id: string, state: AssessmentState, approvedBy: string): void {
    const stmt = this.db.prepare('UPDATE assessments SET state = ? WHERE id = ?');
    stmt.run(state, id);
    
    // Log the state change
    this.logAudit({
      userId: approvedBy,
      action: 'assessment_state_change',
      resourceType: 'assessment',
      resourceId: id,
      details: { newState: state },
      success: true
    });
  }

  private mapRowToAssessment(row: any, findings: Finding[], scorecard: ScoreCardEntry[], actionItems: ActionItem[]): Assessment {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      organizationName: row.organization_name,
      contractNumber: row.contract_number,
      assessmentType: row.assessment_type,
      state: row.state as AssessmentState,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      createdBy: row.created_by,
      facilitatorId: row.facilitator_id,
      teamMembers: JSON.parse(row.team_members || '[]'),
      scopeDocuments: JSON.parse(row.scope_documents || '[]'),
      findings,
      scorecard,
      actionItems,
      metadata: JSON.parse(row.metadata || '{}')
    };
  }

  // Evidence pointer methods
  createEvidencePointer(evidence: Omit<EvidencePointer, 'id'>): string {
    const id = uuidv4();
    const stmt = this.db.prepare(`
      INSERT INTO evidence_pointers (
        id, source_kind, source_path_or_url, location_hint, snippet,
        confidence, extracted_at, file_hash, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      id,
      evidence.sourceKind,
      evidence.sourcePathOrUrl,
      JSON.stringify(evidence.locationHint || {}),
      evidence.snippet,
      evidence.confidence,
      evidence.extractedAt.toISOString(),
      evidence.fileHash,
      JSON.stringify(evidence.metadata || {})
    );
    
    return id;
  }

  getEvidencePointerById(id: string): EvidencePointer | null {
    const stmt = this.db.prepare('SELECT * FROM evidence_pointers WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.mapRowToEvidencePointer(row) : null;
  }

  private mapRowToEvidencePointer(row: any): EvidencePointer {
    return {
      id: row.id,
      sourceKind: row.source_kind,
      sourcePathOrUrl: row.source_path_or_url,
      locationHint: JSON.parse(row.location_hint || '{}'),
      snippet: row.snippet,
      confidence: row.confidence,
      extractedAt: new Date(row.extracted_at),
      fileHash: row.file_hash,
      metadata: JSON.parse(row.metadata || '{}')
    };
  }

  // Audit logging
  logAudit(log: Omit<AuditLog, 'id' | 'timestamp'>): void {
    const id = uuidv4();
    const stmt = this.db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details, ip_address, user_agent, success)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      id,
      log.userId,
      log.action,
      log.resourceType,
      log.resourceId,
      JSON.stringify(log.details || {}),
      log.ipAddress,
      log.userAgent,
      log.success
    );
  }

  getAssessments(options: {
    page: number;
    limit: number;
    state?: AssessmentState;
    facilitatorId?: string;
    userId?: string;
  }): { items: Assessment[]; total: number } {
    let query = 'SELECT * FROM assessments WHERE 1=1';
    const params: any[] = [];

    if (options.state) {
      query += ' AND state = ?';
      params.push(options.state);
    }

    if (options.facilitatorId) {
      query += ' AND facilitator_id = ?';
      params.push(options.facilitatorId);
    }

    if (options.userId) {
      query += ' AND (facilitator_id = ? OR created_by = ? OR team_members LIKE ?)';
      params.push(options.userId, options.userId, `%"${options.userId}"%`);
    }

    // Get total count
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as count');
    const countStmt = this.db.prepare(countQuery);
    const countResult = countStmt.get(...params) as { count: number };
    const total = countResult.count;

    // Get paginated results
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(options.limit, (options.page - 1) * options.limit);

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    const items = rows.map(row => {
      const findings = this.getFindingsByAssessmentId(row.id);
      const scorecard = this.getScorecardByAssessmentId(row.id);
      const actionItems = this.getActionItemsByAssessmentId(row.id);
      return this.mapRowToAssessment(row, findings, scorecard, actionItems);
    });

    return { items, total };
  }

  // Placeholder methods for findings, scorecard, and action items
  private getFindingsByAssessmentId(assessmentId: string): Finding[] {
    // Implementation would go here
    return [];
  }

  private getScorecardByAssessmentId(assessmentId: string): ScoreCardEntry[] {
    // Implementation would go here
    return [];
  }

  private getActionItemsByAssessmentId(assessmentId: string): ActionItem[] {
    // Implementation would go here
    return [];
  }

  // Additional methods for admin functionality
  getUsers(options: {
    page: number;
    limit: number;
    role?: UserRole;
    active?: boolean;
  }): { items: User[]; total: number } {
    let query = 'SELECT * FROM users WHERE 1=1';
    const params: any[] = [];

    if (options.role) {
      query += ' AND role = ?';
      params.push(options.role);
    }

    if (options.active !== undefined) {
      query += ' AND is_active = ?';
      params.push(options.active);
    }

    // Get total count
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as count');
    const countStmt = this.db.prepare(countQuery);
    const countResult = countStmt.get(...params) as { count: number };
    const total = countResult.count;

    // Get paginated results
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(options.limit, (options.page - 1) * options.limit);

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    const items = rows.map(row => this.mapRowToUser(row));

    return { items, total };
  }

  getAuditLogs(options: {
    page: number;
    limit: number;
    userId?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
  }): { items: AuditLog[]; total: number } {
    let query = 'SELECT * FROM audit_logs WHERE 1=1';
    const params: any[] = [];

    if (options.userId) {
      query += ' AND user_id = ?';
      params.push(options.userId);
    }

    if (options.action) {
      query += ' AND action LIKE ?';
      params.push(`%${options.action}%`);
    }

    if (options.startDate) {
      query += ' AND timestamp >= ?';
      params.push(options.startDate.toISOString());
    }

    if (options.endDate) {
      query += ' AND timestamp <= ?';
      params.push(options.endDate.toISOString());
    }

    // Get total count
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as count');
    const countStmt = this.db.prepare(countQuery);
    const countResult = countStmt.get(...params) as { count: number };
    const total = countResult.count;

    // Get paginated results
    query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(options.limit, (options.page - 1) * options.limit);

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    const items = rows.map(row => this.mapRowToAuditLog(row));

    return { items, total };
  }

  getUserStats(): any {
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN role = 'Admin' THEN 1 ELSE 0 END) as admins,
        SUM(CASE WHEN role = 'Facilitator' THEN 1 ELSE 0 END) as facilitators,
        SUM(CASE WHEN role = 'Analyst' THEN 1 ELSE 0 END) as analysts,
        SUM(CASE WHEN role = 'Viewer' THEN 1 ELSE 0 END) as viewers
      FROM users
    `);
    return stmt.get();
  }

  getAssessmentStats(): any {
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN state = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN state = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled,
        SUM(CASE WHEN state NOT IN ('COMPLETED', 'CANCELLED') THEN 1 ELSE 0 END) as active
      FROM assessments
    `);
    return stmt.get();
  }

  getActiveAdminCount(): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM users
      WHERE role = 'Admin' AND is_active = 1
    `);
    const result = stmt.get() as { count: number };
    return result.count;
  }

  private mapRowToAuditLog(row: any): AuditLog {
    return {
      id: row.id,
      userId: row.user_id,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      details: JSON.parse(row.details || '{}'),
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      timestamp: new Date(row.timestamp),
      success: Boolean(row.success)
    };
  }

  close(): void {
    this.db.close();
  }
}
