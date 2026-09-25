import { MockHaClient } from "./mock-client";
import { RealHaClient } from "./real-client";
import type { HaClient } from "./types";

export * from "./types";

export function createHaClient(demoMode: boolean): HaClient {
  return demoMode ? new MockHaClient() : new RealHaClient();
}
