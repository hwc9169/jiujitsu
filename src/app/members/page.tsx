"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin-shell";
import { apiFetch } from "@/lib/api_client";
import type { Member, MemberBelt, MemberBeltGral, MemberGender, MemberStatus, MembershipState } from "@/lib/types";

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

const GENDER_OPTIONS: MemberGender[] = ["남", "여"];
const BELT_OPTIONS: MemberBelt[] = ["흰띠", "그레이띠", "오렌지띠", "초록띠", "파란띠", "보라띠", "갈색띠", "검은띠"];
const BELT_TONE_CLASS: Record<MemberBelt, string> = {
  흰띠: "belt-tone-white",
  그레이띠: "belt-tone-gray",
  오렌지띠: "belt-tone-orange",
  초록띠: "belt-tone-green",
  파란띠: "belt-tone-blue",
  보라띠: "belt-tone-purple",
  갈색띠: "belt-tone-brown",
  검은띠: "belt-tone-black",
};
const BELT_GRAL_OPTIONS: MemberBeltGral[] = [0, 1, 2, 3, 4];
const BELT_GRAL_LABEL: Record<MemberBeltGral, string> = {
  0: "무그랄",
  1: "1그랄",
  2: "2그랄",
  3: "3그랄",
  4: "4그랄",
};

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

function calculateAge(birthDate?: string | null): number | null {
  if (!birthDate) return null;
  const [year, month, day] = birthDate.split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;

  const today = new Date();
  let age = today.getFullYear() - year;
  const thisYearBirthday = new Date(today.getFullYear(), month - 1, day);
  if (today < thisYearBirthday) age -= 1;
  return age >= 0 ? age : null;
}

function resolveMembershipState(member: Member): MembershipState {
  return member.membership_state === "PAUSED" ? "PAUSED" : "ACTIVE";
}

function resolveBeltGral(member: Member): MemberBeltGral {
  const gral = member.belt_gral;
  if (gral === 0 || gral === 1 || gral === 2 || gral === 3 || gral === 4) return gral;
  return 0;
}

function MaterialEditIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 17.25V21h3.75l11.06-11.06-3.75-3.75L3 17.25Z" />
      <path d="M20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z" />
    </svg>
  );
}

function MaterialPauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 19h4V5H6v14Zm8-14v14h4V5h-4Z" />
    </svg>
  );
}

function MaterialPlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function MaterialDeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12Zm2.46-4.88 1.41 1.41L12 13.41l2.12 2.12 1.41-1.41L13.41 12l2.12-2.12-1.41-1.41L12 10.59 9.88 8.47 8.47 9.88 10.59 12l-2.13 2.12ZM15.5 4l-1-1h-5l-1 1H5v2h14V4h-3.5Z" />
    </svg>
  );
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

  const onTogglePause = async (m: Member) => {
    const membershipState = resolveMembershipState(m);
    const action = membershipState === "PAUSED" ? "RESUME" : "PAUSE";
    const message = action === "PAUSE"
      ? `${m.name} 회원 등록을 정지할까요?`
      : `${m.name} 회원 등록을 재개할까요?`;
    if (!confirm(message)) return;

    await apiFetch(`/api/members/${m.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action }),
    });
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
                  <th>띠</th>
                  <th>나이</th>
                  <th>전화번호</th>
                  <th>등록상태</th>
                  <th>만료일</th>
                  <th>메모</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {items.map((m) => {
                  const status = resolveStatus(m);
                  const membershipState = resolveMembershipState(m);
                  const beltGral = resolveBeltGral(m);
                  const beltToneClass = m.belt ? BELT_TONE_CLASS[m.belt] : "";
                  const age = calculateAge(m.birth_date);
                  const diff = dayDiffFromToday(m.expire_date);
                  const expireTone = diff < 0 ? "expire-overdue" : diff <= 7 ? "expire-warning" : "expire-normal";
                  let registrationClass = "chip chip-normal";
                  let registrationLabel = "활성";
                  if (status === "OVERDUE") {
                    registrationClass = "chip chip-overdue";
                    registrationLabel = "미납";
                  } else if (membershipState === "PAUSED") {
                    registrationClass = "chip chip-paused";
                    registrationLabel = "정지";
                  }
                  return (
                    <tr key={m.id}>
                      <td className="member-name">{m.name}</td>
                      <td>{m.gender ?? "-"}</td>
                      <td>
                        {m.belt ? (
                          <div className="member-belt-cell" title={`${m.belt} ${BELT_GRAL_LABEL[beltGral]}`}>
                            <span className={`belt-icon belt-icon-table ${beltToneClass}`} aria-hidden="true">
                              <span className="belt-icon-band" />
                              <span className="belt-icon-knot" />
                            </span>
                            <span className="gral-icon-group member-belt-gral" aria-hidden="true">
                              {[0, 1, 2, 3].map((index) => (
                                <span
                                  key={index}
                                  className={`gral-icon ${index < beltGral ? "active" : ""}`}
                                />
                              ))}
                            </span>
                          </div>
                        ) : "-"}
                      </td>
                      <td>{age == null ? "-" : `${age}세`}</td>
                      <td className="member-phone">{formatPhoneDisplay(m.phone)}</td>
                      <td>
                        <span className={registrationClass}>{registrationLabel}</span>
                      </td>
                      <td className={expireTone}>
                        {m.expire_date}
                        <span className="expire-dday">{formatDday(diff)}</span>
                      </td>
                      <td>{m.memo?.trim() || "-"}</td>
                      <td>
                        <div className="table-actions">
                          <button
                            type="button"
                            className="icon-btn"
                            data-tooltip="회원 정보 수정"
                            aria-label="회원 정보 수정"
                            title="회원 정보 수정"
                            onClick={() => openEdit(m)}
                          >
                            <MaterialEditIcon />
                          </button>
                          <button
                            type="button"
                            className={`icon-btn ${membershipState === "PAUSED" ? "icon-btn-resume" : "icon-btn-pause"}`}
                            data-tooltip={membershipState === "PAUSED" ? "회원 등록 재개" : "회원 등록 정지"}
                            aria-label={membershipState === "PAUSED" ? "회원 등록 재개" : "회원 등록 정지"}
                            title={membershipState === "PAUSED" ? "회원 등록 재개" : "회원 등록 정지"}
                            onClick={() => onTogglePause(m)}
                          >
                            {membershipState === "PAUSED" ? <MaterialPlayIcon /> : <MaterialPauseIcon />}
                          </button>
                          <button
                            type="button"
                            className="icon-btn icon-btn-danger"
                            data-tooltip="회원 삭제"
                            aria-label="회원 삭제"
                            title="회원 삭제"
                            onClick={() => onDelete(m)}
                          >
                            <MaterialDeleteIcon />
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
  const [belt, setBelt] = useState<MemberBelt | "">(member?.belt ?? (isEdit ? "" : "흰띠"));
  const [beltGral, setBeltGral] = useState<MemberBeltGral>(member?.belt_gral ?? 0);
  const [phone, setPhone] = useState(member?.phone ?? "");
  const [birthDate, setBirthDate] = useState(formatDateInput(member?.birth_date));
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

      if (!name.trim() || !gender || !belt || !normalizedPhone || !expireDate) {
        setErr("이름/성별/띠/전화/만료일은 필수");
        return;
      }
      if (normalizedPhone.length < 9) {
        setErr("전화번호 형식을 확인해 주세요.");
        return;
      }

      const payload = {
        name: name.trim(),
        gender,
        belt,
        belt_gral: beltGral,
        phone: normalizedPhone,
        birth_date: birthDate || null,
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
              띠*
              <div className="belt-options">
                {BELT_OPTIONS.map((option) => {
                  const toneClass = BELT_TONE_CLASS[option];
                  return (
                    <button
                      key={option}
                      type="button"
                      className={`belt-option ${belt === option ? "active" : ""}`}
                      onClick={() => setBelt(option)}
                    >
                      <span className={`belt-icon ${toneClass}`} aria-hidden="true">
                        <span className="belt-icon-band" />
                        <span className="belt-icon-knot" />
                      </span>
                      <span className="belt-option-label">{option}</span>
                    </button>
                  );
                })}
              </div>
            </label>

            <label className="field-label">
              그랄*
              <div className="gral-options">
                {BELT_GRAL_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`gral-option ${beltGral === option ? "active" : ""}`}
                    onClick={() => setBeltGral(option)}
                  >
                    <span className="gral-icon-group" aria-hidden="true">
                      {[0, 1, 2, 3].map((index) => (
                        <span
                          key={index}
                          className={`gral-icon ${index < option ? "active" : ""}`}
                        />
                      ))}
                    </span>
                    <span className="gral-label">{BELT_GRAL_LABEL[option]}</span>
                  </button>
                ))}
              </div>
            </label>

            <label className="field-label">
              생년월일
              <input
                className="input"
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
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
