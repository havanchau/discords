export const Permissions = {
  ViewChannel: 'VIEW_CHANNEL',
  SendMessages: 'SEND_MESSAGES',
  ManageMessages: 'MANAGE_MESSAGES',
  ManageChannels: 'MANAGE_CHANNELS',
  ManageServer: 'MANAGE_SERVER',
  ManageRoles: 'MANAGE_ROLES',
  KickMembers: 'KICK_MEMBERS',
  BanMembers: 'BAN_MEMBERS',
  CreateInvite: 'CREATE_INVITE',
  ConnectVoice: 'CONNECT_VOICE',
  SpeakVoice: 'SPEAK_VOICE',
  MuteMembers: 'MUTE_MEMBERS',
  DeafenMembers: 'DEAFEN_MEMBERS',
  MentionEveryone: 'MENTION_EVERYONE',
  UploadFiles: 'UPLOAD_FILES'
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];

export const ownerPermissions = Object.values(Permissions);

export const defaultMemberPermissions: Permission[] = [
  Permissions.ViewChannel,
  Permissions.SendMessages,
  Permissions.CreateInvite,
  Permissions.ConnectVoice,
  Permissions.SpeakVoice,
  Permissions.UploadFiles
];
