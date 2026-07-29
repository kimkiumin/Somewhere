import { parseDeploymentEnvironment } from "./environment";
import { handleRequest } from "./http";

export { JourneyDurableObject } from "./journey/durable-object";

const worker = {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    parseDeploymentEnvironment(env);
    return handleRequest(request);
  },
} satisfies ExportedHandler<Env>;

export default worker;
