"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin-shell";
import { apiFetch } from "@/lib/api_client";
import type { Member, MemberGender, MemberStatus } from "@/lib/types";

type MembersResponse = {
  items: Member[];
  count: number;
  page: number;
  pageSize: number;
};

type FilterStatus = MemberStatus | "ALL";

const TABS: { key: FilterStatus; label: string }[] = [
  { key: "ALL", label: "전체" },
  { key: "NORMAL", label: "정상" },
  { key: "EXPIRING", label: "7일 이내" },
  { key: "OVERDUE", label: "미납" },
];

const STATUS_META: Record<MemberStatus, { label: string; className: string }> = {
  NORMAL: { label: "정상", className: "chip chip-normal" },
  EXPIRING: { label: "7일 이내", className: "chip chip-expiring" },
  OVERDUE: { label: "미납", className: "chip chip-overdue" },
};

const GENDER_OPTIONS: MemberGender[] = ["남", "여"];

const REGISTRATION_PLANS = [
  { value: "1", label: "1개월" },
  { value: "3", label: "3개월" },
  { value: "6", label: "6개월" },
  { value: "12", label: "12개월" },
] as const;

type RegistrationPlanValue = (typeof REGISTRATION_PLANS)[number]["value"];

function formatDateInput(d?: string | null) {
  return d ?? "";
}

function todayYYYYMMDD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toDateString(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseDateOnly(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function addMonthsToDateString(baseDate: string, months: number) {
  const base = parseDateOnly(baseDate);
  const monthStart = new Date(base.getFullYear(), base.getMonth() + months, 1);
  const endDay = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const day = Math.min(base.getDate(), endDay);
  return toDateString(new Date(monthStart.getFullYear(), monthStart.getMonth(), day));
}

function dayDiffFromToday(expireDate: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expire = parseDateOnly(expireDate);
  expire.setHours(0, 0, 0, 0);
  return Math.floor((expire.getTime() - today.getTime()) / 86_400_000);
}

function statusFromExpireDate(expireDate: string): MemberStatus {
  const diff = dayDiffFromToday(expireDate);
  if (diff < 0) return "OVERDUE";
  if (diff <= 7) return "EXPIRING";
  return "NORMAL";
}

function resolveStatus(member: Member): MemberStatus {
  if (member.status === "NORMAL" || member.status === "EXPIRING" || member.status === "OVERDUE") {
    return member.status;
  }
  return statusFromExpireDate(member.expire_date);
}

function formatDday(diff: number) {
  if (diff === 0) return "D-day";
  if (diff > 0) return `D-${diff}`;
  return `D+${Math.abs(diff)}`;
}

function formatPhoneDisplay(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return phone;
}

export default function MembersPage() {
  const [tab, setTab] = useState<FilterStatus>("ALL");
  const [qInput, setQInput] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const [items, setItems] = useState<Member[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);

  // modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(count / pageSize)), [count]);

  const load = useCallback(async (nextPage = page) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        q: appliedQ,
        page: String(nextPage),
        pageSize: String(pageSize),
      });
      if (tab !== "ALL") qs.set("status", tab);
      const res = await apiFetch<MembersResponse>(`/api/members?${qs.toString()}`);
      setItems(res.items);
      setCount(res.count);
    } finally {
      setLoading(false);
    }
  }, [appliedQ, page, pageSize, tab]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  const onSearch = () => {
    setPage(1);
    setAppliedQ(qInput.trim());
  };

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (m: Member) => {
    setEditing(m);
    setModalOpen(true);
  };

  const onDelete = async (m: Member) => {
    if (!confirm(`${m.name} 삭제(복구 가능)할까?`)) return;
    await apiFetch(`/api/members/${m.id}`, { method: "DELETE" });
    await load();
  };

  const onSaved = async () => {
    setModalOpen(false);
    setEditing(null);
    await load();
  };

  return (
    <AdminShell
      title="회원 관리"
      subtitle="만료일 기준 상태를 관리하고, 미납/만료예정 회원을 즉시 확인하세요."
      actions={
        <button type="button" className="btn btn-accent" onClick={openCreate}>
          + 회원 추가
        </button>
      }
    >
      <section className="panel">
        <div className="members-toolbar">
          <div className="tab-group">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setTab(t.key);
                  setPage(1);
                }}
                className={`tab-button ${tab === t.key ? "active" : ""}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="search-group">
            <input
              className="input"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="이름/전화번호 검색"
              onKeyDown={(e) => {
                if (e.key === "Enter") onSearch();
              }}
            />
            <button type="button" className="btn btn-secondary" onClick={onSearch}>
              검색
            </button>
          </div>
        </div>

        <div className="panel-subhead">
          <div>{loading ? "회원 목록 불러오는 중..." : `총 ${count}명`}</div>
          <div>
            {page} / {totalPages} 페이지
          </div>
        </div>

        <div className="table-wrap">
          {items.length === 0 ? (
            <div className="empty-state">표시할 회원이 없습니다.</div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>이름</th>
                  <th>성별</th>
                  <th>전화번호</th>
                  <th>상태</th>
                  <th>만료일</th>
                  <th>메모</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {items.map((m) => {
                  const status = resolveStatus(m);
                  const statusMeta = STATUS_META[status];
                  const diff = dayDiffFromToday(m.expire_date);
                  const expireTone = diff < 0 ? "expire-overdue" : diff <= 7 ? "expire-warning" : "expire-normal";
                  return (
                    <tr key={m.id}>
                      <td className="member-name">{m.name}</td>
                      <td>{m.gender ?? "-"}</td>
                      <td className="member-phone">{formatPhoneDisplay(m.phone)}</td>
                      <td>
                        <span className={statusMeta.className}>{statusMeta.label}</span>
                      </td>
                      <td className={expireTone}>
                        {m.expire_date}
                        <span className="expire-dday">{formatDday(diff)}</span>
                      </td>
                      <td>{m.memo?.trim() || "-"}</td>
                      <td>
                        <div className="table-actions">
                          <button type="button" className="btn btn-text" onClick={() => openEdit(m)}>
                            수정
                          </button>
                          <button type="button" className="btn btn-danger" onClick={() => onDelete(m)}>
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <div className="pagination-row">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          이전
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
        >
          다음
        </button>
      </div>

      {modalOpen && (
        <MemberModal
          member={editing}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
          onSaved={onSaved}
        />
      )}
    </AdminShell>
  );
}

function MemberModal({
  member,
  onClose,
  onSaved,
}: {
  member: Member | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const isEdit = !!member;
  const defaultStartDate = formatDateInput(member?.start_date ?? (!isEdit ? todayYYYYMMDD() : null));
  const defaultRegistrationMonths: RegistrationPlanValue | "" = isEdit ? "" : "1";
  const defaultExpireDate = formatDateInput(
    member?.expire_date ??
      (!isEdit
        ? addMonthsToDateString(defaultStartDate || todayYYYYMMDD(), Number(defaultRegistrationMonths))
        : todayYYYYMMDD()),
  );

  const [name, setName] = useState(member?.name ?? "");
  const [gender, setGender] = useState<MemberGender | "">(member?.gender ?? (isEdit ? "" : "남"));
  const [phone, setPhone] = useState(member?.phone ?? "");
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [expireDate, setExpireDate] = useState(defaultExpireDate);
  const [memo, setMemo] = useState(member?.memo ?? "");
  const [registrationMonths, setRegistrationMonths] = useState<RegistrationPlanValue | "">(defaultRegistrationMonths);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const applyRegistrationPlan = (plan: RegistrationPlanValue) => {
    const baseDate = startDate || todayYYYYMMDD();
    if (!startDate) setStartDate(baseDate);
    setRegistrationMonths(plan);
    setExpireDate(addMonthsToDateString(baseDate, Number(plan)));
  };

  const save = async () => {
    setErr(null);
    setLoading(true);
    try {
      const normalizedPhone = phone.replace(/\D/g, "");

      if (!name.trim() || !gender || !normalizedPhone || !expireDate) {
        setErr("이름/성별/전화/만료일은 필수");
        return;
      }
      if (normalizedPhone.length < 9) {
        setErr("전화번호 형식을 확인해 주세요.");
        return;
      }

      const payload = {
        name: name.trim(),
        gender,
        phone: normalizedPhone,
        start_date: startDate ? startDate : null,
        expire_date: expireDate,
        memo: memo.trim() ? memo.trim() : null,
      };

      if (isEdit) {
        await apiFetch(`/api/members/${member!.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch(`/api/members`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      await onSaved();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card">
        <div className="modal-header">
          <h2 className="modal-title">{isEdit ? "회원 수정" : "회원 추가"}</h2>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            닫기
          </button>
        </div>

        <div className="modal-body">
          <div className="field-grid">
            <label className="field-label">
              이름*
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </label>

            <label className="field-label">
              성별*
              <div className="gender-options">
                {GENDER_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`gender-option ${gender === option ? "active" : ""}`}
                    onClick={() => setGender(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </label>

            <label className="field-label">
              전화번호*
              <input
                className="input"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d-]/g, ""))}
                placeholder="010-1234-5678"
              />
            </label>

            <label className="field-label">
              시작일
              <input
                className="input"
                type="date"
                value={startDate}
                onChange={(e) => {
                  const nextDate = e.target.value;
                  setStartDate(nextDate);
                  if (registrationMonths) {
                    const baseDate = nextDate || todayYYYYMMDD();
                    setExpireDate(addMonthsToDateString(baseDate, Number(registrationMonths)));
                  }
                }}
              />
            </label>

            {!isEdit ? (
              <label className="field-label">
                등록 기간
                <div className="duration-options">
                  {REGISTRATION_PLANS.map((plan) => (
                    <button
                      key={plan.value}
                      type="button"
                      className={`duration-option ${registrationMonths === plan.value ? "active" : ""}`}
                      onClick={() => applyRegistrationPlan(plan.value)}
                    >
                      {plan.label}
                    </button>
                  ))}
                </div>
              </label>
            ) : null}

            <label className="field-label">
              만료일*
              <input
                className="input"
                type="date"
                value={expireDate}
                onChange={(e) => {
                  setExpireDate(e.target.value);
                  setRegistrationMonths("");
                }}
              />
            </label>

            <label className="field-label">
              메모
              <textarea className="textarea" value={memo} onChange={(e) => setMemo(e.target.value)} rows={3} />
            </label>
          </div>

          {err && <div className="error-text">{err}</div>}

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              취소
            </button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={loading}>
              {loading ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
