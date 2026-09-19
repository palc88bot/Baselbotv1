import { pgTable, serial, text, timestamp, doublePrecision, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const trades = pgTable('trades', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  symbol: text('symbol').notNull(),
  side: text('side').notNull(), // BUY or SELL
  price: doublePrecision('price').notNull(),
  quantity: doublePrecision('quantity').notNull(),
  status: text('status').notNull(), // FILLED, CANCELED, etc.
  strategyId: text('strategy_id').notNull(),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});

export const balanceHistory = pgTable('balance_history', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  totalEquity: doublePrecision('total_equity').notNull(),
  availableCash: doublePrecision('available_cash').notNull(),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  trades: many(trades),
  balances: many(balanceHistory),
}));

export const tradesRelations = relations(trades, ({ one }) => ({
  user: one(users, {
    fields: [trades.userId],
    references: [users.id],
  }),
}));

export const balanceHistoryRelations = relations(balanceHistory, ({ one }) => ({
  user: one(users, {
    fields: [balanceHistory.userId],
    references: [users.id],
  }),
}));
