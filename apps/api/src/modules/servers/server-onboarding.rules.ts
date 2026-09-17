import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { SELF_ASSIGNABLE_ROLE_PERMISSIONS, type SelfAssignQuestion } from '@discord-clone/shared';
import type { SelfAssignQuestionDto } from './dto/update-onboarding.dto';

export interface OnboardingRole {
  id: string;
  name: string;
  permissions: string[];
}

const QUESTION_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
const selfAssignablePermissions: ReadonlySet<string> = new Set(SELF_ASSIGNABLE_ROLE_PERMISSIONS);

/** `@everyone` is everyone's already, and a role carrying moderation rights is never handed out. */
export function isSelfAssignableRole(role: OnboardingRole) {
  return (
    role.name !== '@everyone' &&
    role.permissions.every((permission) => selfAssignablePermissions.has(permission))
  );
}

/** Reads the `selfAssignQuestions` column; an entry without the expected shape is dropped. */
export function readStoredQuestions(value: Prisma.JsonValue | null): SelfAssignQuestion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return [];
    const { id, prompt, roleIds, multiSelect } = item;
    if (typeof id !== 'string' || typeof prompt !== 'string' || !Array.isArray(roleIds)) return [];
    return [
      {
        id,
        prompt,
        roleIds: roleIds.filter((roleId): roleId is string => typeof roleId === 'string'),
        multiSelect: multiSelect === true,
      },
    ];
  });
}

/**
 * The questions as they apply now: stored config is re-validated against the server's current roles
 * on every read, so a deleted role, or one edited to carry moderation rights, stops being offered
 * without anyone re-saving the config. A question with no role left is omitted.
 */
export function offeredQuestions(
  stored: SelfAssignQuestion[],
  roles: ReadonlyMap<string, OnboardingRole>,
): SelfAssignQuestion[] {
  return stored.flatMap((question) => {
    const roleIds = question.roleIds.filter((roleId) => {
      const role = roles.get(roleId);
      return role !== undefined && isSelfAssignableRole(role);
    });
    return roleIds.length ? [{ ...question, roleIds }] : [];
  });
}

/** Validates questions from a config update; unlike a read, an invalid role is an error here. */
export function normalizeQuestions(
  input: SelfAssignQuestionDto[],
  roles: ReadonlyMap<string, OnboardingRole>,
): SelfAssignQuestion[] {
  return input.map((question) => {
    const prompt = question.prompt.trim();
    if (!prompt) throw new BadRequestException('Question prompt cannot be empty');
    const roleIds = [...new Set(question.roleIds)];
    for (const roleId of roleIds) {
      const role = roles.get(roleId);
      if (!role) throw new NotFoundException('Role not found');
      if (!isSelfAssignableRole(role))
        throw new BadRequestException('Role cannot be self-assigned');
    }
    const id = question.id && QUESTION_ID_PATTERN.test(question.id) ? question.id : randomUUID();
    return { id, prompt, roleIds, multiSelect: question.multiSelect };
  });
}

/**
 * A member may only pick roles the current questions offer, and at most one role from each
 * single-choice question. Nothing outside the config can be granted through onboarding.
 */
export function validateRoleSelection(questions: SelfAssignQuestion[], roleIds: string[]) {
  const offered = new Set(questions.flatMap((question) => question.roleIds));
  if (roleIds.some((roleId) => !offered.has(roleId))) {
    throw new BadRequestException('Role is not offered by this server');
  }
  const chosen = new Set(roleIds);
  for (const question of questions) {
    if (question.multiSelect) continue;
    if (question.roleIds.filter((roleId) => chosen.has(roleId)).length > 1) {
      throw new BadRequestException('Choose one role for each single-choice question');
    }
  }
}

/** Plain JSON for the `selfAssignQuestions` column. */
export function toStoredQuestions(questions: SelfAssignQuestion[]): Prisma.InputJsonArray {
  return questions.map((question) => ({
    id: question.id,
    prompt: question.prompt,
    roleIds: question.roleIds,
    multiSelect: question.multiSelect,
  }));
}
