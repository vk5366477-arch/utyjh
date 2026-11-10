import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  build: {
    packageManager: "npm",
    command: "npm run build",
  },
});
