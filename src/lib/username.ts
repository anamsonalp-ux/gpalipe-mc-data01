// Netlify Identity requires an email for every account. Username-based accounts
// are stored under this internal domain, which never receives mail.
export const USERNAME_DOMAIN = 'staff.gpalipe-mc-data01.netlify.app';

export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

export const normalizeUsername = (value: string) => value.trim().toLowerCase();

export const isValidUsername = (value: string) => USERNAME_PATTERN.test(normalizeUsername(value));

// Accepts either a username or a full email address (for accounts created with an email).
export const toLoginEmail = (identifier: string) => {
  const value = identifier.trim();
  return value.includes('@') ? value : `${normalizeUsername(value)}@${USERNAME_DOMAIN}`;
};

export const isUsernameAccount = (email?: string) =>
  !!email && email.toLowerCase().endsWith(`@${USERNAME_DOMAIN}`);

// Shows the username for username accounts, otherwise the email.
export const displayLogin = (email?: string) =>
  email && isUsernameAccount(email) ? email.slice(0, -(USERNAME_DOMAIN.length + 1)) : email ?? '';
