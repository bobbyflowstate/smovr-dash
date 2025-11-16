// convex/convex.config.ts
import { defineApp } from "convex/server";
import migrations from "@convex-dev/migrations/convex.config";

const app = defineApp();
app.use(migrations);

// Note: Cron jobs are auto-discovered from convex/crons.ts
// They don't need to be registered here

export default app;
