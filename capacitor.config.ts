import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.abdul.eduai",
  appName: "EduAI",
  webDir: ".output/public",
  server: { androidScheme: "http", cleartext: true },
};

export default config;
