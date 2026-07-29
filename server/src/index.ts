import { DurableObject } from "cloudflare:workers";

import { parseDeploymentEnvironment } from "./environment";
import { handleRequest } from "./http";

export class JourneyDurableObject extends DurableObject<Env> {}

const worker = {
  fetch(request: Request, env: Env): Response {
    parseDeploymentEnvironment(env);
    return handleRequest(request);
  },
} satisfies ExportedHandler<Env>;

export default worker;
