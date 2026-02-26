import { createHmac, randomUUID } from "node:crypto";

export const SOLAPI_TEMPLATE_KEY = "membership_expiry_notice_v1" as const;

export type SolapiTemplateVariables = {
  "#{gym_name}": string;
  "#{member_name}": string;
  "#{expiry_date}": string;
  "#{days_left}": string;
  "#{contact_phone}": string;
};

export type SolapiAlimtalkRecipient = {
  to: string;
  variables: SolapiTemplateVariables;
};

type SolapiConfig = {
  apiKey: string;
  apiSecret: string;
  fromNumber: string;
  pfId: string;
  baseUrl: string;
};

type SolapiRequestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim() ?? "";
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function getConfig(): SolapiConfig {
  return {
    apiKey: getRequiredEnv("SOLAPI_API_KEY"),
    apiSecret: getRequiredEnv("SOLAPI_API_SECRET"),
    fromNumber: normalizePhone(getRequiredEnv("SOLAPI_FROM_NUMBER")),
    pfId: getRequiredEnv("SOLAPI_KAKAO_PFID"),
    baseUrl: (process.env.SOLAPI_API_BASE_URL?.trim() || "https://api.solapi.com/messages/v4").replace(/\/$/, ""),
  };
}

function buildAuthorizationHeader(config: SolapiConfig) {
  const date = new Date().toISOString();
  const salt = randomUUID().replace(/-/g, "");
  const signature = createHmac("sha256", config.apiSecret).update(`${date}${salt}`).digest("hex");
  return {
    authorization: `HMAC-SHA256 apiKey=${config.apiKey}, date=${date}, salt=${salt}, signature=${signature}`,
    date,
    salt,
  };
}

async function requestSolapi(config: SolapiConfig, path: string, method: SolapiRequestMethod, body?: unknown) {
  const { authorization } = buildAuthorizationHeader(config);
  const response = await fetch(`${config.baseUrl}${path}`, {
    method,
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: body == null ? undefined : JSON.stringify(body),
    cache: "no-store",
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      (typeof json?.message === "string" && json.message) ||
      (typeof json?.errorCode === "string" && `${json.errorCode}`) ||
      `Solapi API request failed (${response.status})`;
    throw new Error(message);
  }

  return json as Record<string, unknown>;
}

function getGroupId(payload: Record<string, unknown>) {
  const direct = payload.groupId;
  if (typeof direct === "string" && direct) return direct;

  const groupInfo = payload.groupInfo;
  if (groupInfo && typeof groupInfo === "object" && groupInfo !== null) {
    const nested = (groupInfo as Record<string, unknown>).groupId;
    if (typeof nested === "string" && nested) return nested;
  }

  const id = payload.id;
  if (typeof id === "string" && id) return id;

  return null;
}

function buildFallbackText(variables: SolapiTemplateVariables) {
  return `[${variables["#{gym_name}"]}] ${variables["#{member_name}"]} 회원님, 이용권 만료일은 ${variables["#{expiry_date}"]} (D${Number(variables["#{days_left}"]) >= 0 ? "-" : "+"}${Math.abs(Number(variables["#{days_left}"]))}) 입니다. 문의: ${variables["#{contact_phone}"]}`;
}

export async function sendSolapiAlimtalkGroup(recipients: SolapiAlimtalkRecipient[]) {
  if (recipients.length === 0) {
    throw new Error("No recipients to send");
  }

  const config = getConfig();

  const groupCreated = await requestSolapi(config, "/groups", "POST", {});
  const groupId = getGroupId(groupCreated);
  if (!groupId) {
    throw new Error("Failed to create Solapi group");
  }

  const messages = recipients.map((recipient) => ({
    to: normalizePhone(recipient.to),
    from: config.fromNumber,
    type: "ATA",
    text: buildFallbackText(recipient.variables),
    kakaoOptions: {
      pfId: config.pfId,
      templateId: SOLAPI_TEMPLATE_KEY,
      variables: recipient.variables,
      disableSms: true,
    },
  }));

  await requestSolapi(config, `/groups/${groupId}/messages`, "PUT", {
    messages,
  });

  const sent = await requestSolapi(config, `/groups/${groupId}/send`, "POST", {});

  return {
    groupId,
    response: sent,
  };
}

export function daysLeftFromToday(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  const target = new Date(year, (month || 1) - 1, day || 1);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return String(Math.floor((target.getTime() - today.getTime()) / 86_400_000));
}

export function normalizePhoneForMessage(value: string | null | undefined) {
  return normalizePhone(value ?? "");
}
