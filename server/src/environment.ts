const DEPLOYMENT_ENVIRONMENTS = ["local", "staging", "production"] as const;

export type DeploymentEnvironment = (typeof DEPLOYMENT_ENVIRONMENTS)[number];

export class EnvironmentConfigurationError extends Error {
  override readonly name = "EnvironmentConfigurationError";

  constructor() {
    super("Unsupported deployment environment");
  }
}

export function parseDeploymentEnvironment(
  env: Readonly<Pick<Env, "ENVIRONMENT">>,
): DeploymentEnvironment {
  const environment = env.ENVIRONMENT;
  if (DEPLOYMENT_ENVIRONMENTS.some((candidate) => candidate === environment)) {
    return environment;
  }
  throw new EnvironmentConfigurationError();
}
