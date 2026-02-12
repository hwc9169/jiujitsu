import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getGymIdByUserId, requireUserIdFromAuthHeader } from "@/lib/supabase/gym";
import type { MemberGender } from "@/lib/types";

type CsvError = {
  row: number;
  reason: string;
};

type CsvMemberPayload = {
  row: number;
  name: string;
  phone: string;
  gender: MemberGender;
  start_date: string | null;
  expire_date: string;
  memo: string | null;
};

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const HEADER_MAP: Record<string, keyof CsvMemberPayload | "ignore"> = {
  name: "name",
  이름: "name",
  phone: "phone",
  전화번호: "phone",
  전화: "phone",
  gender: "gender",
  성별: "gender",
  start_date: "start_date",
  시작일: "start_date",
  expire_date: "expire_date",
  만료일: "expire_date",
  memo: "memo",
  메모: "memo",
};

function normalizeHeader(header: string) {
  return header
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "_");
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeGender(value: string): MemberGender | null {
  const normalized = value.trim().toLowerCase();
  if (["남", "남자", "male", "m"].includes(normalized)) return "남";
  if (["여", "여자", "female", "f"].includes(normalized)) return "여";
  return null;
}

function parseCsv(content: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const ch = content[index];

    if (inQuotes) {
      if (ch === "\"") {
        if (content[index + 1] === "\"") {
          field += "\"";
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === "\"") {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    if (ch === "\r") {
      continue;
    }

    field += ch;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function mapHeaders(headerRow: string[]) {
  const mapped: Partial<Record<keyof CsvMemberPayload, number>> = {};

  headerRow.forEach((header, index) => {
    const field = HEADER_MAP[normalizeHeader(header)];
    if (!field || field === "ignore") return;
    if (field in mapped) return;
    mapped[field] = index;
  });

  return mapped;
}

function getCell(row: string[], index?: number) {
  if (typeof index !== "number") return "";
  return (row[index] ?? "").trim();
}

function validateCsvRow(row: string[], mapped: Partial<Record<keyof CsvMemberPayload, number>>, rowNumber: number): CsvMemberPayload | CsvError {
  const name = getCell(row, mapped.name);
  const phone = normalizePhone(getCell(row, mapped.phone));
  const genderRaw = getCell(row, mapped.gender);
  const gender = normalizeGender(genderRaw);
  const startDateRaw = getCell(row, mapped.start_date);
  const expireDate = getCell(row, mapped.expire_date);
  const memo = getCell(row, mapped.memo);

  if (!name) return { row: rowNumber, reason: "이름 누락" };
  if (!phone) return { row: rowNumber, reason: "전화번호 누락" };
  if (!gender) return { row: rowNumber, reason: "성별은 남/여만 허용" };
  if (!expireDate) return { row: rowNumber, reason: "만료일 누락" };
  if (!DATE_REGEX.test(expireDate)) return { row: rowNumber, reason: "만료일 형식 오류(YYYY-MM-DD)" };
  if (startDateRaw && !DATE_REGEX.test(startDateRaw)) {
    return { row: rowNumber, reason: "시작일 형식 오류(YYYY-MM-DD)" };
  }

  return {
    row: rowNumber,
    name,
    phone,
    gender,
    start_date: startDateRaw || null,
    expire_date: expireDate,
    memo: memo || null,
  };
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserIdFromAuthHeader(req);
    const gymId = await getGymIdByUserId(userId);
    if (!gymId) return NextResponse.json({ error: "No gym" }, { status: 404 });

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "CSV file is required" }, { status: 400 });
    }

    const content = await file.text();
    if (!content.trim()) {
      return NextResponse.json({ error: "CSV file is empty" }, { status: 400 });
    }

    const rows = parseCsv(content);
    if (rows.length < 2) {
      return NextResponse.json({ error: "CSV must include header + data rows" }, { status: 400 });
    }

    const mappedHeaders = mapHeaders(rows[0]);
    const requiredHeaders: (keyof CsvMemberPayload)[] = ["name", "phone", "gender", "expire_date"];
    const missingHeaders = requiredHeaders.filter((key) => typeof mappedHeaders[key] !== "number");
    if (missingHeaders.length > 0) {
      return NextResponse.json(
        { error: `Missing required headers: ${missingHeaders.join(", ")}` },
        { status: 400 },
      );
    }

    const payloads: CsvMemberPayload[] = [];
    const errors: CsvError[] = [];

    rows.slice(1).forEach((row, index) => {
      const rowNumber = index + 2;
      const isEmpty = row.every((cell) => cell.trim() === "");
      if (isEmpty) return;

      const validated = validateCsvRow(row, mappedHeaders, rowNumber);
      if ("reason" in validated) {
        errors.push(validated);
        return;
      }
      payloads.push(validated);
    });

    if (payloads.length === 0) {
      return NextResponse.json({
        total: 0,
        created: 0,
        updated: 0,
        failed: errors.length,
        errors: errors.slice(0, 20),
      });
    }

    const sb = supabaseServer();
    const phones = Array.from(new Set(payloads.map((item) => item.phone)));
    const { data: existingMembers, error: existingError } = await sb
      .from("members")
      .select("id, phone")
      .eq("gym_id", gymId)
      .is("deleted_at", null)
      .in("phone", phones);

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    const existingMap = new Map((existingMembers ?? []).map((member: { id: string; phone: string }) => [member.phone, member.id]));

    let created = 0;
    let updated = 0;
    let failed = errors.length;

    for (const payload of payloads) {
      const memberId = existingMap.get(payload.phone);
      if (memberId) {
        const { error: updateError } = await sb
          .from("members")
          .update({
            name: payload.name,
            gender: payload.gender,
            start_date: payload.start_date,
            expire_date: payload.expire_date,
            memo: payload.memo,
          })
          .eq("id", memberId)
          .eq("gym_id", gymId)
          .is("deleted_at", null);

        if (updateError) {
          failed += 1;
          errors.push({ row: payload.row, reason: updateError.message });
          continue;
        }

        updated += 1;
        continue;
      }

      const { data: insertedMember, error: insertError } = await sb
        .from("members")
        .insert({
          gym_id: gymId,
          name: payload.name,
          phone: payload.phone,
          gender: payload.gender,
          start_date: payload.start_date,
          expire_date: payload.expire_date,
          memo: payload.memo,
        })
        .select("id, phone")
        .single();

      if (insertError) {
        failed += 1;
        errors.push({ row: payload.row, reason: insertError.message });
        continue;
      }

      created += 1;
      if (insertedMember?.phone && insertedMember?.id) {
        existingMap.set(insertedMember.phone, insertedMember.id);
      }
    }

    return NextResponse.json({
      total: payloads.length,
      created,
      updated,
      failed,
      errors: errors.slice(0, 20),
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 },
    );
  }
}
