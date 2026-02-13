/**
 * Member reference utilities.
 *
 * Canonical parser/extractors for values in `table.column` format.
 *
 * @module utils/member-ref
 */

import type { MemberRef } from '@open-insights-web/foundation-data-model';
import { MemberRef as MemberRefUtil } from '@open-insights-web/foundation-data-model';

/**
 * Parsed member reference.
 */
export interface ParsedMemberRef {
  readonly table: string;
  readonly column: string;
}

/**
 * Parse a member reference in `table.column` format.
 */
export const parseMemberRef = (
  member: string
): ParsedMemberRef | null => {
  if (!MemberRefUtil.isValid(member)) {
    return null;
  }

  const parsed = MemberRefUtil.parse(member as MemberRef);
  return {
    table: parsed.table,
    column: parsed.member,
  };
};

/**
 * Extract table name from member reference.
 */
export const extractTableName = (member: string): string | null => {
  const parsed = parseMemberRef(member);
  return parsed?.table ?? null;
};

/**
 * Extract column/member name from member reference.
 */
export const extractColumnName = (member: string): string | null => {
  const parsed = parseMemberRef(member);
  return parsed?.column ?? null;
};

