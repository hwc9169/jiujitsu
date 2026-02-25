"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConsoleShell } from "@/components/console-shell";
import { apiFetch } from "@/lib/api_client";
import type {
  Member,
  MemberBelt,
  MemberBeltGral,
  MemberGender,
  MemberPayment,
  MemberStatus,
  MembershipState,
} from "@/lib/types";

type MembersResponse = {
  items: Member[];
  count: number;
  page: number;
  pageSize: number;
};

type MemberMutationResponse = {
  member: Member;
};

type PaymentsResponse = {
  items: MemberPayment[];
};

type PaymentMutationResponse = {
  payment: MemberPayment;
};

type FilterStatus = MemberStatus | "INACTIVE" | "ALL";

const TABS: { key: FilterStatus; label: string }[] = [
  { key: "ALL", label: "전체" },
  { key: "NORMAL", label: "정상" },
  { key: "EXPIRING", label: "7일 이내" },
  { key: "OVERDUE", label: "미납" },
  { key: "INACTIVE", label: "탈퇴(비활성)" },
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
const DEFAULT_UNIT_PRICE = 150000;
const STORAGE_UNIT_PRICE_KEY = "jjt_unit_price";

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

function resolveRegistrationPlan(baseDate: string, expireDate: string): RegistrationPlanValue | "" {
  if (!baseDate || !expireDate) return "";
  for (const plan of REGISTRATION_PLANS) {
    if (addMonthsToDateString(baseDate, Number(plan.value)) === expireDate) {
      return plan.value;
    }
  }
  return "";
}

function addDaysToDateString(baseDate: string, days: number) {
  const date = parseDateOnly(baseDate);
  date.setDate(date.getDate() + days);
  return toDateString(date);
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

function resolveEffectiveExpireDate(member: Member): string {
  if (member.effective_expire_date) return member.effective_expire_date;
  if (member.membership_state !== "PAUSED" || !member.paused_at) return member.expire_date;

  const pausedStart = new Date(member.paused_at);
  if (Number.isNaN(pausedStart.getTime())) return member.expire_date;

  const today = new Date();
  const pausedStartMidnight = new Date(pausedStart.getFullYear(), pausedStart.getMonth(), pausedStart.getDate());
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const pausedDays = Math.max(0, Math.floor((todayMidnight.getTime() - pausedStartMidnight.getTime()) / 86_400_000));
  return pausedDays > 0 ? addDaysToDateString(member.expire_date, pausedDays) : member.expire_date;
}

function resolveStatus(member: Member): MemberStatus {
  if (member.status === "NORMAL" || member.status === "EXPIRING" || member.status === "OVERDUE") {
    return member.status;
  }
  return statusFromExpireDate(resolveEffectiveExpireDate(member));
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

function formatKRW(value: number) {
  return `${Math.max(0, value).toLocaleString("ko-KR")}원`;
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

function MaterialPaymentIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 5h18v14H3V5Zm2 2v2h14V7H5Zm0 4v6h14v-6H5Zm2 1h5v4H7v-4Z" />
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

function MaterialSmsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2Zm0 14H5.17L4 17.17V4h16v12Zm-9-5h2v2h-2v-2Zm-4 0h2v2H7v-2Zm8 0h2v2h-2v-2Z" />
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
  const [notifyingId, setNotifyingId] = useState<string | null>(null);

  // modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [paymentMember, setPaymentMember] = useState<Member | null>(null);

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

  const openPayment = (m: Member) => {
    setPaymentMember(m);
  };

  const onDeactivateMember = async (m: Member) => {
    if (!confirm(`${m.name} 회원을 탈퇴 처리할까요? (비활성화)`)) return;
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

  const onPaymentSaved = async () => {
    setPaymentMember(null);
    await load();
  };

  const onSendOverdueNotice = async (m: Member) => {
    const status = resolveStatus(m);
    if (status !== "OVERDUE") {
      alert("미납 회원에게만 안내 문자를 보낼 수 있습니다.");
      return;
    }
    if (!confirm(`${m.name} 회원에게 미납 안내 문자를 보낼까요?`)) return;

    setNotifyingId(m.id);
    try {
      const result = await apiFetch<{ sid?: string }>(`/api/members/${m.id}/notify-overdue`, {
        method: "POST",
      });
      alert(result.sid ? `문자 발송 완료 (SID: ${result.sid})` : "문자 발송 완료");
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "문자 발송 중 오류가 발생했습니다.");
    } finally {
      setNotifyingId(null);
    }
  };

  return (
    <ConsoleShell>
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
          <div>
            <span>{page} / {totalPages} 페이지</span>
            <div>{loading ? "회원 목록 불러오는 중..." : `총 ${count}명`}</div>
          </div>
          <div className="members-subhead-actions">
            <button type="button" className="btn btn-accent" onClick={openCreate}>
              + 회원 추가
            </button>
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
                  <th>입관날짜</th>
                  <th>등록상태</th>
                  <th>만료일</th>
                  <th>메모</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {items.map((m) => {
                  const isInactive = Boolean(m.deleted_at) || m.status === "DELETED";
                  const status = isInactive ? null : resolveStatus(m);
                  const membershipState = resolveMembershipState(m);
                  const beltGral = resolveBeltGral(m);
                  const beltToneClass = m.belt ? BELT_TONE_CLASS[m.belt] : "";
                  const age = calculateAge(m.birth_date);
                  const effectiveExpireDate = isInactive ? null : resolveEffectiveExpireDate(m);
                  const diff = effectiveExpireDate ? dayDiffFromToday(effectiveExpireDate) : null;
                  const expireTone = diff == null ? "" : diff < 0 ? "expire-overdue" : diff <= 7 ? "expire-warning" : "expire-normal";
                  let registrationClass = "chip chip-normal";
                  let registrationLabel = "활성";
                  if (isInactive) {
                    registrationClass = "chip chip-inactive";
                    registrationLabel = "탈퇴";
                  } else if (status === "OVERDUE") {
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
                      <td>{m.join_date ?? "-"}</td>
                      <td>
                        <span className={registrationClass}>{registrationLabel}</span>
                      </td>
                      <td className={expireTone}>
                        {effectiveExpireDate ?? "-"}
                        {diff == null ? null : <span className="expire-dday">{formatDday(diff)}</span>}
                      </td>
                      <td>{m.memo?.trim() || "-"}</td>
                      <td>
                        {isInactive ? (
                          <span className="table-actions-disabled">-</span>
                        ) : (
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
                              className="icon-btn"
                              data-tooltip="결제 관리"
                              aria-label="결제 관리"
                              title="결제 관리"
                              onClick={() => openPayment(m)}
                            >
                              <MaterialPaymentIcon />
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
                            {status === "OVERDUE" ? (
                              <button
                                type="button"
                                className="icon-btn icon-btn-sms"
                                data-tooltip={notifyingId === m.id ? "문자 전송 중..." : "미납 안내 문자 발송"}
                                aria-label="미납 안내 문자 발송"
                                title="미납 안내 문자 발송"
                                onClick={() => onSendOverdueNotice(m)}
                                disabled={notifyingId === m.id}
                              >
                                <MaterialSmsIcon />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="icon-btn icon-btn-danger"
                              data-tooltip="회원 탈퇴(비활성화)"
                              aria-label="회원 탈퇴"
                              title="회원 탈퇴(비활성화)"
                              onClick={() => onDeactivateMember(m)}
                            >
                              <MaterialDeleteIcon />
                            </button>
                          </div>
                        )}
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

      <button type="button" className="mobile-fab" onClick={openCreate} aria-label="회원 추가">
        +
      </button>

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

      {paymentMember && (
        <PaymentModal
          member={paymentMember}
          onClose={() => setPaymentMember(null)}
          onSaved={onPaymentSaved}
        />
      )}
    </ConsoleShell>
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
  const defaultJoinDate = formatDateInput(
    member?.join_date ?? member?.start_date ?? member?.created_at?.slice(0, 10) ?? todayYYYYMMDD(),
  );
  const defaultPaymentDate = formatDateInput(member?.start_date ?? (!isEdit ? todayYYYYMMDD() : null));
  const defaultExpireDate = formatDateInput(
    member?.expire_date ??
      (!isEdit
        ? addMonthsToDateString(defaultPaymentDate || todayYYYYMMDD(), 1)
        : todayYYYYMMDD()),
  );
  const defaultRegistrationMonths: RegistrationPlanValue | "" = isEdit
    ? resolveRegistrationPlan(defaultPaymentDate, defaultExpireDate)
    : "1";

  const [name, setName] = useState(member?.name ?? "");
  const [gender, setGender] = useState<MemberGender | "">(member?.gender ?? (isEdit ? "" : "남"));
  const [belt, setBelt] = useState<MemberBelt | "">(member?.belt ?? (isEdit ? "" : "흰띠"));
  const [beltGral, setBeltGral] = useState<MemberBeltGral>(member?.belt_gral ?? 0);
  const [phone, setPhone] = useState(member?.phone ?? "");
  const [birthDate, setBirthDate] = useState(formatDateInput(member?.birth_date));
  const [joinDate, setJoinDate] = useState(defaultJoinDate);
  const [paymentDate, setPaymentDate] = useState(defaultPaymentDate);
  const [expireDate, setExpireDate] = useState(defaultExpireDate);
  const [memo, setMemo] = useState(member?.memo ?? "");
  const [registrationMonths, setRegistrationMonths] = useState<RegistrationPlanValue | "">(defaultRegistrationMonths);
  const [initialPaymentAmount, setInitialPaymentAmount] = useState(
    isEdit ? "" : String(Number(defaultRegistrationMonths || "1") * DEFAULT_UNIT_PRICE),
  );
  const [unitPrice, setUnitPrice] = useState(DEFAULT_UNIT_PRICE);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = Number(window.localStorage.getItem(STORAGE_UNIT_PRICE_KEY));
    if (!Number.isFinite(stored) || stored <= 0) return;
    const rounded = Math.round(stored);
    setUnitPrice(rounded);
    if (!isEdit) {
      const months = Number(defaultRegistrationMonths || "1");
      setInitialPaymentAmount(String(Math.max(1, months) * rounded));
    }
  }, [defaultRegistrationMonths, isEdit]);

  const applyRegistrationPlan = (plan: RegistrationPlanValue) => {
    const baseDate = paymentDate || todayYYYYMMDD();
    if (!paymentDate) setPaymentDate(baseDate);
    setRegistrationMonths(plan);
    setExpireDate(addMonthsToDateString(baseDate, Number(plan)));
    if (!isEdit) {
      setInitialPaymentAmount(String(Number(plan) * unitPrice));
    }
  };

  const save = async () => {
    setErr(null);
    setLoading(true);
    try {
      const normalizedPhone = phone.replace(/\D/g, "");

      if (!name.trim() || !gender || !belt || !normalizedPhone) {
        setErr("이름/성별/띠/전화는 필수");
        return;
      }
      if (normalizedPhone.length < 9) {
        setErr("전화번호 형식을 확인해 주세요.");
        return;
      }

      const basePayload = {
        name: name.trim(),
        gender,
        belt,
        belt_gral: beltGral,
        phone: normalizedPhone,
        birth_date: birthDate || null,
        memo: memo.trim() ? memo.trim() : null,
      };

      if (isEdit) {
        await apiFetch(`/api/members/${member!.id}`, {
          method: "PATCH",
          body: JSON.stringify(basePayload),
        });
      } else {
        if (!expireDate) {
          setErr("회원 추가 시 만료일은 필수입니다.");
          return;
        }

        const createPayload = {
          ...basePayload,
          join_date: joinDate || todayYYYYMMDD(),
          start_date: paymentDate || null,
          expire_date: expireDate,
        };

        const created = await apiFetch<MemberMutationResponse>(`/api/members`, {
          method: "POST",
          body: JSON.stringify(createPayload),
        });

        const paymentAmount = Number(initialPaymentAmount.replace(/[^\d]/g, ""));
        if (paymentDate && Number.isFinite(paymentAmount) && paymentAmount > 0) {
          const months = Number(registrationMonths || "1");
          await apiFetch<PaymentMutationResponse>(`/api/members/${created.member.id}/payments`, {
            method: "POST",
            body: JSON.stringify({
              payment_date: paymentDate,
              months: Number.isFinite(months) && months > 0 ? months : 1,
              amount: paymentAmount,
              memo: memo.trim() ? memo.trim() : null,
            }),
          });
        }
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
          <h2 className="modal-title">{isEdit ? "회원 정보 수정" : "회원 추가"}</h2>
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
                placeholder="01012345678"
              />
            </label>

            <label className="field-label">
              입관 날짜
              <input
                className="input"
                type="date"
                value={joinDate}
                onChange={(e) => setJoinDate(e.target.value)}
                disabled={isEdit}
              />
            </label>

            {!isEdit ? (
              <>
                <label className="field-label">
                  결제일
                  <input
                    className="input"
                    type="date"
                    value={paymentDate}
                    onChange={(e) => {
                      const nextDate = e.target.value;
                      setPaymentDate(nextDate);
                      if (registrationMonths) {
                        const baseDate = nextDate || todayYYYYMMDD();
                        setExpireDate(addMonthsToDateString(baseDate, Number(registrationMonths)));
                      }
                    }}
                  />
                </label>

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
                  초기 결제금액
                  <input
                    className="input"
                    inputMode="numeric"
                    value={initialPaymentAmount}
                    onChange={(e) => setInitialPaymentAmount(e.target.value.replace(/[^\d]/g, ""))}
                    placeholder={String(unitPrice)}
                  />
                </label>
              </>
            ) : (
              <p className="settings-help">결제/만료일 변경은 회원 목록의 `결제 관리`에서 처리하세요.</p>
            )}

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

function PaymentModal({
  member,
  onClose,
  onSaved,
}: {
  member: Member;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [items, setItems] = useState<MemberPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [paymentDate, setPaymentDate] = useState(todayYYYYMMDD());
  const [months, setMonths] = useState<RegistrationPlanValue>("1");
  const [amount, setAmount] = useState(String(DEFAULT_UNIT_PRICE));
  const [memo, setMemo] = useState("");
  const [unitPrice, setUnitPrice] = useState(DEFAULT_UNIT_PRICE);

  const expirePreview = useMemo(
    () => addMonthsToDateString(paymentDate || todayYYYYMMDD(), Number(months)),
    [months, paymentDate],
  );

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const response = await apiFetch<PaymentsResponse>(`/api/members/${member.id}/payments`);
      setItems(response.items ?? []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "결제 내역을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [member.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = Number(window.localStorage.getItem(STORAGE_UNIT_PRICE_KEY));
    if (!Number.isFinite(stored) || stored <= 0) return;
    const rounded = Math.round(stored);
    setUnitPrice(rounded);
    setAmount(String(rounded));
  }, []);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  const submitPayment = async () => {
    setSaving(true);
    setErr(null);
    try {
      const parsedAmount = Number(amount.replace(/[^\d]/g, ""));
      if (!paymentDate) {
        setErr("결제일을 입력해 주세요.");
        return;
      }
      if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
        setErr("결제금액은 0보다 큰 숫자여야 합니다.");
        return;
      }

      await apiFetch<PaymentMutationResponse>(`/api/members/${member.id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          payment_date: paymentDate,
          months: Number(months),
          amount: parsedAmount,
          memo: memo.trim() ? memo.trim() : null,
        }),
      });

      await onSaved();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "결제 저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
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
          <h2 className="modal-title">결제 관리 - {member.name}</h2>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            닫기
          </button>
        </div>

        <div className="modal-body">
          <div className="field-grid">
            <label className="field-label">
              결제일
              <input
                className="input"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </label>

            <label className="field-label">
              등록 기간
              <div className="duration-options">
                {REGISTRATION_PLANS.map((plan) => (
                  <button
                    key={plan.value}
                    type="button"
                    className={`duration-option ${months === plan.value ? "active" : ""}`}
                    onClick={() => {
                      setMonths(plan.value);
                      setAmount(String(unitPrice * Number(plan.value)));
                    }}
                  >
                    {plan.label}
                  </button>
                ))}
              </div>
            </label>

            <label className="field-label">
              다음 만료일(자동계산)
              <input className="input" type="date" value={expirePreview} disabled />
            </label>

            <label className="field-label">
              결제금액
              <input
                className="input"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
                placeholder={String(unitPrice)}
              />
            </label>

            <label className="field-label">
              메모
              <textarea className="textarea" rows={3} value={memo} onChange={(e) => setMemo(e.target.value)} />
            </label>
          </div>

          <div className="payments-history">
            <p className="payments-history-title">최근 결제 내역</p>
            {loading ? (
              <p className="payments-empty">결제 내역 불러오는 중...</p>
            ) : items.length === 0 ? (
              <p className="payments-empty">결제 내역이 없습니다.</p>
            ) : (
              <ul className="payments-list">
                {items.map((item) => (
                  <li key={item.id} className="payments-item">
                    <div className="payments-item-top">
                      <span>{item.payment_date}</span>
                      <strong>{formatKRW(item.amount)}</strong>
                    </div>
                    <div className="payments-item-bottom">
                      <span>{item.months}개월</span>
                      <span>만료 {item.expire_date}</span>
                    </div>
                    {item.memo ? <p className="payments-item-memo">{item.memo}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {err ? <div className="error-text">{err}</div> : null}

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              취소
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void submitPayment()} disabled={saving}>
              {saving ? "결제 중..." : "결제"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
