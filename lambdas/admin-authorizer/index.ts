import { timingSafeEqual } from "crypto";
import { APIGatewayTokenAuthorizerHandler, APIGatewayAuthorizerResult } from "aws-lambda";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const ssm = new SSMClient({});
const USERNAME_PARAM = process.env.ADMIN_USERNAME_PARAM!;
const PASSWORD_PARAM = process.env.ADMIN_PASSWORD_PARAM!;

// 60-second module-scope cache — same pattern as analytics-emotions.
let cache: { username: string; password: string; expiresAt: number } | null = null;

async function getCreds() {
  if (cache && cache.expiresAt > Date.now()) return cache;
  const [u, p] = await Promise.all([
    ssm.send(new GetParameterCommand({ Name: USERNAME_PARAM })),
    ssm.send(new GetParameterCommand({ Name: PASSWORD_PARAM, WithDecryption: true })),
  ]);
  cache = {
    username: u.Parameter?.Value ?? "",
    password: p.Parameter?.Value ?? "",
    expiresAt: Date.now() + 60_000,
  };
  return cache;
}

function stageWildcard(methodArn: string): string {
  // methodArn: arn:aws:execute-api:region:account:apiId/stage/METHOD/resource
  // Return:    arn:aws:execute-api:region:account:apiId/stage/*/*
  // A single cached Allow policy then covers every method on this stage,
  // so parallel calls to /emotions, /campaigns, /trends all hit the same cache entry.
  const parts = methodArn.split(":");
  const [apiId, stage] = parts[5].split("/");
  return [...parts.slice(0, 5), `${apiId}/${stage}/*/*`].join(":");
}

function policy(effect: "Allow" | "Deny", resource: string, principal = "admin"): APIGatewayAuthorizerResult {
  return {
    principalId: principal,
    policyDocument: {
      Version: "2012-10-17",
      Statement: [{
        Action: "execute-api:Invoke",
        Effect: effect,
        Resource: effect === "Allow" ? stageWildcard(resource) : resource,
      }],
    },
  };
}

export const handler: APIGatewayTokenAuthorizerHandler = async (event) => {
  const token = event.authorizationToken ?? "";
  const match = token.match(/^Basic\s+(.+)$/i);
  if (!match) return policy("Deny", event.methodArn);

  const decoded = Buffer.from(match[1], "base64").toString("utf-8");
  const idx = decoded.indexOf(":");
  if (idx < 0) return policy("Deny", event.methodArn);
  const u = decoded.slice(0, idx);
  const p = decoded.slice(idx + 1);

  const creds = await getCreds();
  const safeEq = (a: string, b: string) =>
    a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
  if (!safeEq(u, creds.username) || !safeEq(p, creds.password)) return policy("Deny", event.methodArn);
  return policy("Allow", event.methodArn);
};
