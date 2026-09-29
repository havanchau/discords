import { BadRequestException } from '@nestjs/common';
import type { MessageComponent, MessageComponentRow } from '@discord-clone/shared';
import {
  MESSAGE_COMPONENT_MAX_BUTTONS_PER_ROW,
  MESSAGE_COMPONENT_MAX_ROWS,
} from '@discord-clone/shared';

/**
 * Structural rules `class-validator` cannot express on a single DTO field (row composition,
 * LINK/customId exclusivity, `customId` uniqueness across the whole message) — a plain function
 * called from the service, mirroring `interactions.service.ts`'s existing `validateOptions` helper
 * (`bot-message-components.md` → Technical approach). Per-field shape (lengths, enums, URL format) is
 * already checked by `MessageComponentDto`/`SelectOptionDto` before this runs.
 */
export function validateComponentRows(rows: MessageComponentRow[] | undefined | null): void {
  if (!rows || rows.length === 0) return;
  if (rows.length > MESSAGE_COMPONENT_MAX_ROWS) {
    throw new BadRequestException(
      `A message may carry at most ${MESSAGE_COMPONENT_MAX_ROWS} action rows`,
    );
  }

  const seenCustomIds = new Set<string>();

  rows.forEach((row) => {
    const components = row.components;
    if (!components || components.length === 0) {
      throw new BadRequestException('An action row cannot be empty');
    }

    const selects = components.filter((component) => component.type === 'SELECT');
    const buttons = components.filter((component) => component.type === 'BUTTON');

    if (selects.length > 0 && (selects.length !== components.length || selects.length > 1)) {
      throw new BadRequestException(
        'A row holds either one select menu or up to 5 buttons, never both',
      );
    }
    if (buttons.length > MESSAGE_COMPONENT_MAX_BUTTONS_PER_ROW) {
      throw new BadRequestException(
        `A row may hold at most ${MESSAGE_COMPONENT_MAX_BUTTONS_PER_ROW} buttons`,
      );
    }

    components.forEach((component) => {
      if (component.type === 'BUTTON') {
        validateButton(component);
      } else {
        validateSelect(component);
      }

      const customId =
        component.type === 'BUTTON' && component.style === 'LINK' ? undefined : component.customId;
      if (!customId) return;
      if (seenCustomIds.has(customId)) {
        throw new BadRequestException('Duplicate customId');
      }
      seenCustomIds.add(customId);
    });
  });
}

function validateButton(component: Extract<MessageComponent, { type: 'BUTTON' }>): void {
  if (component.style === 'LINK') {
    if (component.customId) {
      throw new BadRequestException('A LINK button cannot carry a customId');
    }
    if (!component.url) {
      throw new BadRequestException('A LINK button requires a url');
    }
    return;
  }
  if (component.url) {
    throw new BadRequestException('Only a LINK button carries a url');
  }
  if (!component.customId) {
    throw new BadRequestException('A non-LINK button requires a customId');
  }
}

function validateSelect(component: Extract<MessageComponent, { type: 'SELECT' }>): void {
  if (!component.customId) {
    throw new BadRequestException('A select menu requires a customId');
  }
  if (!component.options || component.options.length === 0) {
    throw new BadRequestException('A select menu requires at least one option');
  }
  const values = new Set<string>();
  component.options.forEach((option) => {
    if (values.has(option.value)) {
      throw new BadRequestException('Duplicate select option value');
    }
    values.add(option.value);
  });
}

/** Finds a component by `customId` across every row (a LINK button has none, so never matches). */
export function findComponent(
  rows: MessageComponentRow[] | null | undefined,
  customId: string,
): MessageComponent | undefined {
  for (const row of rows ?? []) {
    const match = row.components.find((component) => component.customId === customId);
    if (match) return match;
  }
  return undefined;
}
