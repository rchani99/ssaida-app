export const developmentProjectRefs: readonly string[];
export const authRedirectUri: string;
export function isDevelopmentEndpoint(value: string | undefined): boolean;
export type EnvironmentInput = {
  environment?: string;
  developmentUrl?: string;
  developmentKey?: string;
  productionUrl?: string;
  productionKey?: string;
  productionProjectRef?: string;
  devLogin?: string;
  redirectUri?: string;
};
export function validateEnvironment(
  input: EnvironmentInput,
  release?: boolean,
): {
  environment: 'development' | 'production';
  url: string;
  publishableKey: string;
  redirectUri: string;
  devLogin: boolean;
};
