// lib/supabase/gym.ts
import { timingSafeEqual } from "node:crypto";
import { supabaseServer } from "./server";

const LOCAL_DEV_FALLBACK_USER_ID = "00000000-0000-0000-0000-000000000000";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ADMIN_IMPERSONATION_EMAIL_HEADER = "x-admin-impersonation-email";
const ADMIN_IMPERSONATION_CODE_HEADER = "x-admin-impersonation-code";
const MAX_USERS_SCAN_PAGES = 20;
const USERS_PAGE_SIZE = 200;

function isLocalDevBypassEnabled() {
  return process.env.NODE_ENV === "development" && process.env.LOCAL_DEV_AUTH_BYPASS === "true";
}

function isValidUuid(value: string) {
  return UUID_REGEX.test(value);
}

function isAdminCodeValid(inputCode: string) {
  const configuredCode = getConfiguredAdminCode();
  if (!configuredCode || !inputCode) return false;

  const configuredBuffer = Buffer.from(configuredCode);
  const inputBuffer = Buffer.from(inputCode);
  if (configuredBuffer.length !== inputBuffer.length) return false;
  return timingSafeEqual(configuredBuffer, inputBuffer);
}

function getConfiguredAdminCode() {
  return (process.env.ADMIN_IMPERSONATION_CODE ?? "").trim();
}

async function findUserIdByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const sb = supabaseServer();

  for (let page = 1; page <= MAX_USERS_SCAN_PAGES; page += 1) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: USERS_PAGE_SIZE });
    if (error) throw new Error(error.message);
    const users = data?.users ?? [];
    const found = users.find((user) => user.email?.trim().toLowerCase() === normalized);
    if (found?.id) return found.id;
    if (users.length < USERS_PAGE_SIZE) break;
  }

  return null;
}

async function resolveAdminImpersonatedUserId(req: Request) {
  const email = req.headers.get(ADMIN_IMPERSONATION_EMAIL_HEADER)?.trim() ?? "";
  const code = req.headers.get(ADMIN_IMPERSONATION_CODE_HEADER)?.trim() ?? "";
  if (!email && !code) return null;
  if (!email || !code) {
    throw new Error("Admin impersonation headers are incomplete.");
  }
  if (!getConfiguredAdminCode()) {
    throw new Error("관리자 코드 로그인이 비활성화되어 있습니다. ADMIN_IMPERSONATION_CODE를 설정해 주세요.");
  }
  if (!isAdminCodeValid(code)) {
    throw new Error("관리자 코드가 올바르지 않습니다.");
  }

  const userId = await findUserIdByEmail(email);
  if (!userId) {
    throw new Error("해당 이메일의 사용자를 찾을 수 없습니다.");
  }
  return userId;
}

async function getLocalDevUserId() {
  const userId = (process.env.LOCAL_DEV_USER_ID ?? "").trim();
  if (isValidUuid(userId)) return userId;

  const sb = supabaseServer();
  const { data: gymUserRow, error: gymUserError } = await sb
    .from("gym_users")
    .select("user_id")
    .not("user_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (!gymUserError && gymUserRow?.user_id && isValidUuid(String(gymUserRow.user_id))) {
    return String(gymUserRow.user_id);
  }

  const { data: usersPage, error: usersError } = await sb.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (!usersError) {
    const fallbackUserId = usersPage?.users?.[0]?.id;
    if (fallbackUserId && isValidUuid(fallbackUserId)) return fallbackUserId;
  }

  return LOCAL_DEV_FALLBACK_USER_ID;
}

export async function requireUserIdFromAuthHeader(req: Request) {
  const adminImpersonatedUserId = await resolveAdminImpersonatedUserId(req);
  if (adminImpersonatedUserId) {
    return adminImpersonatedUserId;
  }

  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    if (isLocalDevBypassEnabled()) {
      const localUserId = await getLocalDevUserId();
      if (!localUserId) {
        throw new Error("Local dev auth bypass is enabled, but no user could be resolved.");
      }
      return localUserId;
    }
    throw new Error("Missing Authorization Bearer token");
  }

  const sb = supabaseServer();
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) {
    if (isLocalDevBypassEnabled()) {
      const localUserId = await getLocalDevUserId();
      if (!localUserId) {
        throw new Error("Local dev auth bypass is enabled, but no user could be resolved.");
      }
      return localUserId;
    }
    throw new Error("Invalid token");
  }
  return data.user.id;
}

export async function getGymIdByUserId(userId: string) {
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("gym_users")
    .select("gym_id, role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.gym_id) {
    if (isLocalDevBypassEnabled()) {
      const { data: firstGym, error: firstGymError } = await sb
        .from("gyms")
        .select("id")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!firstGymError && firstGym?.id) return String(firstGym.id);
    }
    return null;
  }
  return data.gym_id as string;
}
