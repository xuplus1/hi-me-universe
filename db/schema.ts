import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const userSettings = sqliteTable("user_settings", {
  userId: text("user_id").primaryKey(),
  revision: integer("revision").notNull().default(0),
  migratedAt: text("migrated_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const works = sqliteTable("works", {
  id: text("id").notNull(), userId: text("user_id").notNull(), archive: text("archive").notNull(),
  title: text("title").notNull(), english: text("english").notNull(), type: text("type").notNull(),
  year: text("year").notNull().default(""), creator: text("creator").notNull().default(""),
  status: text("status").notNull(), rating: text("rating").notNull().default(""), quote: text("quote").notNull().default(""),
  color: text("color").notNull(), timelineColors: text("timeline_colors").notNull(), coverKey: text("cover_key"),
  createdAt: text("created_at").notNull(), completedAt: text("completed_at"), updatedAt: text("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.id] }), index("works_user_updated_idx").on(table.userId, table.updatedAt)]);

export const lightDays = sqliteTable("light_days", {
  userId: text("user_id").notNull(), workId: text("work_id").notNull(), lightDate: text("light_date").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.workId, table.lightDate] }), index("light_days_user_date_idx").on(table.userId, table.lightDate)]);

export const notes = sqliteTable("notes", {
  id: text("id").notNull(), userId: text("user_id").notNull(), workId: text("work_id").notNull(), noteDate: text("note_date").notNull(),
  body: text("body").notNull(), tag: text("tag").notNull().default(""), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.id] }), index("notes_user_work_date_idx").on(table.userId, table.workId, table.noteDate)]);

export const importBatches = sqliteTable("import_batches", {
  id: text("id").notNull(), userId: text("user_id").notNull(), workCount: integer("work_count").notNull(),
  lightCount: integer("light_count").notNull(), noteCount: integer("note_count").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.id] })]);
