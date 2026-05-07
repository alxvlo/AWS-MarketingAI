import { timingSafeEqual } from "crypto";
import { APIGatewayProxyHandler } from "aws-lambda";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const ssm = new SSMClient({});
const USERNAME_PARAM = process.env.ADMIN_USERNAME_PARAM!;
const PASSWORD_PARAM = process.env.ADMIN_PASSWORD_PARAM!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" };

  let username = "", password = "";
  try {
    const body = JSON.parse(event.body ?? "{}");
    username = String(body.username ?? "");
    password = String(body.password ?? "");
  } catch {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  if (!username || !password) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Missing credentials" }) };
  }

  const [u, p] = await Promise.all([
    ssm.send(new GetParameterCommand({ Name: USERNAME_PARAM })),
    ssm.send(new GetParameterCommand({ Name: PASSWORD_PARAM, WithDecryption: true })),
  ]);

  const storedUsername = u.Parameter?.Value ?? "";
  const storedPassword = p.Parameter?.Value ?? "";
  const safeEq = (a: string, b: string) =>
    a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
  if (!safeEq(username, storedUsername) || !safeEq(password, storedPassword)) {
    return { statusCode: 401, headers: cors, body: JSON.stringify({ error: "Invalid credentials" }) };
  }

  const token = Buffer.from(`${username}:${password}`).toString("base64");
  return { statusCode: 200, headers: cors, body: JSON.stringify({ token }) };
};
