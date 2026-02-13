/**
 * SQL utilities tests
 */

import { describe, it, expect } from 'vitest';
import {
  validateIdentifier,
  validateTableName,
  isValidIdentifier,
  quoteIdentifier,
  buildCreateViewSql,
  buildDropViewSql,
  escapeString,
  applyLimitOffset,
  buildParameterizedSql,
} from './sql';
import { SqlValidationError } from '../errors/query-errors';
import { SqlIdentifier } from '@open-insights-web/foundation-data-model';

describe('validateIdentifier', () => {
  it('should accept valid identifiers', () => {
    expect(validateIdentifier('users')).toBe('users');
    expect(validateIdentifier('user_table')).toBe('user_table');
    expect(validateIdentifier('_private')).toBe('_private');
    expect(validateIdentifier('Table1')).toBe('Table1');
    expect(validateIdentifier('a')).toBe('a');
  });

  it('should reject empty identifiers', () => {
    try {
      validateIdentifier('');
      expect.fail('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(SqlValidationError);
      expect((e as Error).message).toContain('empty');
    }
  });

  it('should reject identifiers starting with numbers', () => {
    expect(() => validateIdentifier('1table')).toThrow(SqlValidationError);
    expect(() => validateIdentifier('123')).toThrow(SqlValidationError);
  });

  it('should reject identifiers with invalid characters', () => {
    expect(() => validateIdentifier('user-table')).toThrow(SqlValidationError);
    expect(() => validateIdentifier('user.table')).toThrow(SqlValidationError);
    expect(() => validateIdentifier('user table')).toThrow(SqlValidationError);
    expect(() => validateIdentifier('user@table')).toThrow(SqlValidationError);
  });

  it('should reject SQL reserved words', () => {
    expect(() => validateIdentifier('SELECT')).toThrow(SqlValidationError);
    expect(() => validateIdentifier('select')).toThrow(SqlValidationError);
    expect(() => validateIdentifier('DROP')).toThrow(SqlValidationError);
    expect(() => validateIdentifier('TABLE')).toThrow(SqlValidationError);
  });

  it('should reject very long identifiers', () => {
    const longName = 'a'.repeat(300);
    try {
      validateIdentifier(longName);
      expect.fail('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(SqlValidationError);
      expect((e as Error).message).toMatch(/maximum length|invalid \(cached\)/);
    }
  });
});

describe('validateTableName', () => {
  it('should work same as validateIdentifier', () => {
    expect(validateTableName('users')).toBe('users');
    expect(() => validateTableName('')).toThrow(SqlValidationError);
    expect(() => validateTableName('SELECT')).toThrow(SqlValidationError);
  });
});

describe('isValidIdentifier', () => {
  it('should return true for valid identifiers', () => {
    expect(isValidIdentifier('users')).toBe(true);
    expect(isValidIdentifier('user_table')).toBe(true);
    expect(isValidIdentifier('_private')).toBe(true);
  });

  it('should return false for invalid identifiers', () => {
    expect(isValidIdentifier('')).toBe(false);
    expect(isValidIdentifier('1table')).toBe(false);
    expect(isValidIdentifier('SELECT')).toBe(false);
    expect(isValidIdentifier(null)).toBe(false);
    expect(isValidIdentifier(undefined)).toBe(false);
    expect(isValidIdentifier(123)).toBe(false);
  });
});

describe('quoteIdentifier', () => {
  it('should wrap identifier in double quotes', () => {
    expect(quoteIdentifier('users' as SqlIdentifier)).toBe('"users"');
    expect(quoteIdentifier('UserTable' as SqlIdentifier)).toBe('"UserTable"');
  });

  it('should escape embedded double quotes', () => {
    expect(quoteIdentifier('user"name' as SqlIdentifier)).toBe('"user""name"');
    expect(quoteIdentifier('a"b"c' as SqlIdentifier)).toBe('"a""b""c"');
  });
});

describe('buildCreateViewSql', () => {
  it('should build CREATE OR REPLACE VIEW by default', () => {
    const sql = buildCreateViewSql(
      'active_users' as SqlIdentifier,
      'SELECT * FROM users WHERE active = true'
    );
    expect(sql).toBe(
      'CREATE OR REPLACE VIEW "active_users" AS SELECT * FROM users WHERE active = true'
    );
  });

  it('should build CREATE VIEW without OR REPLACE', () => {
    const sql = buildCreateViewSql(
      'active_users' as SqlIdentifier,
      'SELECT * FROM users WHERE active = true',
      false
    );
    expect(sql).toBe(
      'CREATE VIEW "active_users" AS SELECT * FROM users WHERE active = true'
    );
  });
});

describe('buildDropViewSql', () => {
  it('should build DROP VIEW IF EXISTS by default', () => {
    const sql = buildDropViewSql('active_users' as SqlIdentifier);
    expect(sql).toBe('DROP VIEW IF EXISTS "active_users"');
  });

  it('should build DROP VIEW without IF EXISTS', () => {
    const sql = buildDropViewSql('active_users' as SqlIdentifier, false);
    expect(sql).toBe('DROP VIEW "active_users"');
  });
});

describe('escapeString', () => {
  it('should escape single quotes', () => {
    expect(escapeString("O'Brien")).toBe("O''Brien");
    expect(escapeString("It's a test")).toBe("It''s a test");
    expect(escapeString("''")).toBe("''''");
  });

  it('should leave strings without quotes unchanged', () => {
    expect(escapeString('hello')).toBe('hello');
    expect(escapeString('')).toBe('');
  });
});

describe('buildParameterizedSql', () => {
  it('should validate placeholder count', () => {
    expect(() => buildParameterizedSql('SELECT * FROM users WHERE id = ?', 1)).not.toThrow();
    expect(() => buildParameterizedSql('SELECT * FROM users WHERE id = ? AND name = ?', 2)).not.toThrow();
  });

  it('should throw on placeholder mismatch', () => {
    expect(() => buildParameterizedSql('SELECT * FROM users WHERE id = ?', 2)).toThrow(
      SqlValidationError
    );
    expect(() => buildParameterizedSql('SELECT * FROM users WHERE id = ? AND name = ?', 1)).toThrow(
      SqlValidationError
    );
  });
});

describe('applyLimitOffset', () => {
  it('should add LIMIT to query', () => {
    const sql = applyLimitOffset('SELECT * FROM users', 10);
    expect(sql).toBe('SELECT * FROM users LIMIT 10');
  });

  it('should add LIMIT and OFFSET to query', () => {
    const sql = applyLimitOffset('SELECT * FROM users', 10, 20);
    expect(sql).toBe('SELECT * FROM users LIMIT 10 OFFSET 20');
  });

  it('should not add LIMIT if already present', () => {
    const sql = applyLimitOffset('SELECT * FROM users LIMIT 5', 10);
    expect(sql).toBe('SELECT * FROM users LIMIT 5');
  });

  it('should not add OFFSET without LIMIT', () => {
    const sql = applyLimitOffset('SELECT * FROM users', undefined, 20);
    expect(sql).toBe('SELECT * FROM users');
  });

  it('should floor decimal values', () => {
    const sql = applyLimitOffset('SELECT * FROM users', 10.7, 20.3);
    expect(sql).toBe('SELECT * FROM users LIMIT 10 OFFSET 20');
  });
});
