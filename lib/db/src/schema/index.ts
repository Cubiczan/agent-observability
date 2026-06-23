import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  integer,
  numeric,
  timestamp,
  serial,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const departmentsTable = pgTable("departments", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});

export const modelsTable = pgTable("models", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  provider: text("provider").notNull(),
  // Access tier this model belongs to: "frontier" | "research" | "routine"
  tier: text("tier").notNull(),
  inputPricePerMillion: numeric("input_price_per_million", {
    precision: 12,
    scale: 4,
  }).notNull(),
  outputPricePerMillion: numeric("output_price_per_million", {
    precision: 12,
    scale: 4,
  }).notNull(),
});

export const employeesTable = pgTable("employees", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  // Highest model tier this employee is granted access to:
  // "frontier" | "research" | "routine"
  accessTier: text("access_tier").notNull(),
  departmentId: text("department_id")
    .notNull()
    .references(() => departmentsTable.id),
});

export const agentsTable = pgTable(
  "agents",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    purpose: text("purpose").notNull(),
    status: text("status").notNull(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employeesTable.id),
    modelId: text("model_id")
      .notNull()
      .references(() => modelsTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("agents_employee_idx").on(t.employeeId),
    index("agents_model_idx").on(t.modelId),
  ],
);

export const usageEventsTable = pgTable(
  "usage_events",
  {
    id: serial("id").primaryKey(),
    // Stable id from the source export/log (e.g. a provider request id). Lets
    // ingestion be idempotent/incremental: re-running the same export does not
    // duplicate rows. Null for synthetically seeded dev data.
    externalId: text("external_id").unique(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agentsTable.id),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
  },
  (t) => [
    index("usage_agent_idx").on(t.agentId),
    index("usage_timestamp_idx").on(t.timestamp),
  ],
);

export const budgetsTable = pgTable(
  "budgets",
  {
    id: serial("id").primaryKey(),
    departmentId: text("department_id")
      .notNull()
      .references(() => departmentsTable.id),
    // When null, the budget applies to the whole department across all models.
    // When set, the budget is scoped to a single model within the department.
    modelId: text("model_id").references(() => modelsTable.id),
    // Monthly budget cap in USD.
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // At most one department-wide budget (model_id IS NULL) per department.
    uniqueIndex("budgets_dept_wide_idx")
      .on(t.departmentId)
      .where(sql`${t.modelId} IS NULL`),
    // At most one budget per (department, model) pair.
    uniqueIndex("budgets_dept_model_idx")
      .on(t.departmentId, t.modelId)
      .where(sql`${t.modelId} IS NOT NULL`),
  ],
);

export type Department = typeof departmentsTable.$inferSelect;
export type Model = typeof modelsTable.$inferSelect;
export type Employee = typeof employeesTable.$inferSelect;
export type Agent = typeof agentsTable.$inferSelect;
export type UsageEvent = typeof usageEventsTable.$inferSelect;
export type Budget = typeof budgetsTable.$inferSelect;
