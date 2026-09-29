import { Matches, MaxLength } from 'class-validator';
import { WORKFLOW_ALLOWLIST_HOSTNAME_MAX_LENGTH } from '@discord-clone/shared';

// A bare hostname (`api.example.com`), or the same with a literal leading `*.` to also allow every
// subdomain. No scheme, path, port, userinfo, or wildcard anywhere but that one leading label.
const ALLOWLIST_HOSTNAME_PATTERN =
  /^(?:\*\.)?(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export class AddWorkflowHttpAllowlistEntryDto {
  @MaxLength(WORKFLOW_ALLOWLIST_HOSTNAME_MAX_LENGTH)
  @Matches(ALLOWLIST_HOSTNAME_PATTERN, {
    message: 'Hostname must be a bare domain, optionally prefixed with *.',
  })
  hostname!: string;
}
