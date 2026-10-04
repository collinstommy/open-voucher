import { defineApp } from "convex/server";
import aggregate from "@convex-dev/aggregate/convex.config.js";

const app = defineApp();

// Named instance for voucher counts (available/claimed/total by type).
// Multiple aggregates need one component instance per table.
app.use(aggregate, { name: "voucherAgg" });

export default app;
