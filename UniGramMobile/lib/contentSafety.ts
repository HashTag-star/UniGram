const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const ZERO_WIDTH_CHARS = /[\u200B-\u200D\uFEFF]/g;
const REPEATED_WHITESPACE = /[ \t]{2,}/g;
const REPEATED_LINES = /\n{3,}/g;

const MAX_LENGTHS = {
  postCaption: 2200,
  comment: 600,
  profileBio: 300,
  profileName: 80,
  username: 30,
  reportReason: 80,
  reportDetails: 600,
  location: 120,
  website: 160,
};

type TextKind = keyof typeof MAX_LENGTHS;

export function cleanUserText(value: string | null | undefined, kind: TextKind): string {
  const max = MAX_LENGTHS[kind];
  return String(value ?? '')
    .replace(CONTROL_CHARS, '')
    .replace(ZERO_WIDTH_CHARS, '')
    .replace(REPEATED_WHITESPACE, ' ')
    .replace(REPEATED_LINES, '\n\n')
    .trim()
    .slice(0, max);
}

export function cleanUsername(value: string | null | undefined): string {
  return cleanUserText(value, 'username')
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '')
    .slice(0, MAX_LENGTHS.username);
}

export function cleanUrl(value: string | null | undefined): string | undefined {
  const url = cleanUserText(value, 'website');
  if (!url) return undefined;
  if (!/^https?:\/\//i.test(url)) return `https://${url}`;
  return url;
}

export function requireText(value: string, label: string): string {
  if (!value.trim()) throw new Error(`${label} cannot be empty.`);
  return value;
}

export function assertUuid(value: string, label = 'ID') {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${label} is invalid.`);
  }
}
