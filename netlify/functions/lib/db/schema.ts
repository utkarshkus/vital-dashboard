import {
  pgTable,
  text,
  integer,
  boolean,
  numeric,
  date,
  timestamp,
  bigserial,
  uniqueIndex,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';

// userId is crypto.randomBytes(8).toString('hex') — kept as TEXT for FK stability
// during the Blobs → DB cutover.
export const users = pgTable('users', {
  userId:       text('user_id').primaryKey(),
  username:     text('username').notNull(),
  displayName:  text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  passwordSalt: text('password_salt').notNull(),
  isAdmin:      boolean('is_admin').notNull().default(false),
  tokenVersion: integer('token_version').notNull().default(0),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // Lowercase username is the lookup key today (users.js stores keys lowercased).
  usernameLowerIdx: uniqueIndex('users_username_lower_idx').on(t.username),
}));

export const userSettings = pgTable('user_settings', {
  userId:          text('user_id').primaryKey().references(() => users.userId, { onDelete: 'cascade' }),
  startWeightKg:   numeric('start_weight_kg', { precision: 5, scale: 2 }),
  currentWeightKg: numeric('current_weight_kg', { precision: 5, scale: 2 }),
  targetWeightKg:  numeric('target_weight_kg', { precision: 5, scale: 2 }),
  startDate:       date('start_date'),
  targetDate:      date('target_date'),
  wakeTime:        text('wake_time'),    // 'HH:MM' — kept as text to match UI input format exactly
  sleepTime:       text('sleep_time'),
  stepTarget:      integer('step_target'),
  manualSteps:     integer('manual_steps'),
  caffeineProfile: text('caffeine_profile'),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const weightLogs = pgTable('weight_logs', {
  id:        bigserial('id', { mode: 'number' }).primaryKey(),
  userId:    text('user_id').notNull().references(() => users.userId, { onDelete: 'cascade' }),
  loggedAt:  timestamp('logged_at', { withTimezone: true }).notNull(),
  value:     numeric('value', { precision: 5, scale: 2 }).notNull(),
  unit:      text('unit').notNull().default('kg'),
  notes:     text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userLoggedIdx:    index('weight_logs_user_logged_idx').on(t.userId, t.loggedAt.desc()),
  userLoggedUnique: uniqueIndex('weight_logs_user_logged_unique').on(t.userId, t.loggedAt),
}));

export const caffeineLogs = pgTable('caffeine_logs', {
  id:        bigserial('id', { mode: 'number' }).primaryKey(),
  userId:    text('user_id').notNull().references(() => users.userId, { onDelete: 'cascade' }),
  loggedAt:  timestamp('logged_at', { withTimezone: true }).notNull(),
  value:     numeric('value', { precision: 6, scale: 2 }).notNull(),
  unit:      text('unit').notNull().default('mg'),
  label:     text('label'),
  notes:     text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userLoggedIdx:    index('caffeine_logs_user_logged_idx').on(t.userId, t.loggedAt.desc()),
  userLoggedUnique: uniqueIndex('caffeine_logs_user_logged_unique').on(t.userId, t.loggedAt),
}));

// Sessions — replaces vital-sessions blob store. Token = 64-char hex (random 32 bytes).
export const sessions = pgTable('sessions', {
  token:        text('token').primaryKey(),
  userId:       text('user_id').notNull().references(() => users.userId, { onDelete: 'cascade' }),
  tokenVersion: integer('token_version').notNull().default(0),
  expiresAt:    timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  expiresIdx: index('sessions_expires_idx').on(t.expiresAt),
}));

// WHOOP OAuth tokens — replaces vital-auth/tokens-{userId}.
export const whoopTokens = pgTable('whoop_tokens', {
  userId:       text('user_id').primaryKey().references(() => users.userId, { onDelete: 'cascade' }),
  accessToken:  text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  expiresAt:    timestamp('expires_at', { withTimezone: true }).notNull(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Ephemeral OAuth state — replaces vital-auth/oauth-state-{state} (TTL 600s).
// expires_at lets a periodic sweep clean these up; for now the OAuth callback deletes by state.
export const oauthStates = pgTable('oauth_states', {
  state:     text('state').primaryKey(),
  userId:    text('user_id').notNull().references(() => users.userId, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// IP/action sliding-window counter — replaces vital-ratelimit.
export const rateLimits = pgTable('rate_limits', {
  action:      text('action').notNull(),
  ip:          text('ip').notNull(),
  count:       integer('count').notNull().default(0),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  expiresAt:   timestamp('expires_at', { withTimezone: true }).notNull(),
}, (t) => ({
  pk:         primaryKey({ columns: [t.action, t.ip] }),
  expiresIdx: index('rate_limits_expires_idx').on(t.expiresAt),
}));
