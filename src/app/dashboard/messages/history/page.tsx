"use client";

import { useEffect, useMemo, useState } from "react";
import { ConsoleShell } from "@/components/console-shell";
import { apiFetch } from "@/lib/api_client";

type MeResponse = {
  gymId: string | null;
};

type MessageJob = {
  id: string;
  gym_id: string;
  mode: "bulk";
  template_key: string;
  status: "pending" | "processing" | "completed" | "partial_failed" | "failed";
  requested_count: number;
  sent_count: number;
  failed_count: number;
  blocked_count: number;
  error_message: string | null;
  created_at: string;
  sent_at: string | null;
  completed_at: string | null;
};

type MessageRecipient = {
  id: string;
  member_id: string | null;
  member_name: string;
  to_phone: string;
  status: "queued" | "sent" | "failed" | "blocked";
  error_message: string | null;
  created_at: string;
  sent_at: string | null;
};

type JobsResponse = {
  items: MessageJob[];
};

type JobDetailResponse = {
  job: MessageJob;
  recipients: MessageRecipient[];
};

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPhoneDisplay(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return phone;
}

function jobStatusLabel(status: MessageJob["status"]) {
  if (status === "pending") return "대기";
  if (status === "processing") return "처리중";
  if (status === "completed") return "완료";
  if (status === "partial_failed") return "부분실패";
  return "실패";
}

function recipientStatusLabel(status: MessageRecipient["status"]) {
  if (status === "queued") return "대기";
  if (status === "sent") return "sent";
  if (status === "failed") return "failed";
  return "blocked";
}

export default function MessageHistoryPage() {
  const [gymId, setGymId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<MessageJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<MessageJob | null>(null);
  const [recipients, setRecipients] = useState<MessageRecipient[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadJobs = async (targetGymId: string) => {
    setLoadingJobs(true);
    try {
      const response = await apiFetch<JobsResponse>(`/api/gyms/${targetGymId}/messages/jobs?limit=100`);
      setJobs(response.items ?? []);
      setSelectedJobId((prev) => {
        if (prev && (response.items ?? []).some((job) => job.id === prev)) {
          return prev;
        }
        return response.items?.[0]?.id ?? null;
      });
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "발송 로그를 불러오지 못했습니다.");
    } finally {
      setLoadingJobs(false);
    }
  };

  useEffect(() => {
    const run = async () => {
      try {
        const me = await apiFetch<MeResponse>("/api/me");
        if (!me.gymId) {
          setError("체육관 정보를 찾을 수 없습니다.");
          return;
        }
        setGymId(me.gymId);
        await loadJobs(me.gymId);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "로그 화면을 준비하지 못했습니다.");
      }
    };

    void run();
  }, []);

  useEffect(() => {
    if (!gymId || !selectedJobId) {
      setSelectedJob(null);
      setRecipients([]);
      return;
    }

    setLoadingDetail(true);
    apiFetch<JobDetailResponse>(`/api/gyms/${gymId}/messages/jobs/${selectedJobId}`)
      .then((response) => {
        setSelectedJob(response.job);
        setRecipients(response.recipients ?? []);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "상세 로그를 불러오지 못했습니다.");
      })
      .finally(() => {
        setLoadingDetail(false);
      });
  }, [gymId, selectedJobId]);

  const selectedIndex = useMemo(
    () => jobs.findIndex((job) => job.id === selectedJobId),
    [jobs, selectedJobId],
  );

  return (
    <ConsoleShell>
      {error ? <div className="alert-error">{error}</div> : null}

      <section className="panel">
        <div className="panel-header">
          <h3 className="panel-title">발송 Job 로그</h3>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              if (!gymId) return;
              void loadJobs(gymId);
            }}
            disabled={!gymId || loadingJobs}
          >
            새로고침
          </button>
        </div>

        <div className="table-wrap">
          {loadingJobs ? (
            <div className="empty-state">로그를 불러오는 중...</div>
          ) : jobs.length === 0 ? (
            <div className="empty-state">발송 이력이 없습니다.</div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>발송일시</th>
                  <th>발송수</th>
                  <th>성공수</th>
                  <th>실패수</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job, index) => {
                  const active = job.id === selectedJobId;
                  return (
                    <tr
                      key={job.id}
                      className={`message-job-row ${active ? "message-job-row-active" : ""}`}
                      onClick={() => setSelectedJobId(job.id)}
                    >
                      <td>{index + 1}</td>
                      <td>{formatDateTime(job.sent_at ?? job.created_at)}</td>
                      <td>{job.requested_count.toLocaleString("ko-KR")}</td>
                      <td>{job.sent_count.toLocaleString("ko-KR")}</td>
                      <td>{(job.failed_count + job.blocked_count).toLocaleString("ko-KR")}</td>
                      <td>
                        <span className={`chip message-job-status message-job-status-${job.status}`}>
                          {jobStatusLabel(job.status)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3 className="panel-title">Job 상세</h3>
          {selectedIndex >= 0 ? <span>{selectedIndex + 1}번째 Job</span> : null}
        </div>
        <div className="table-wrap">
          {!selectedJobId ? (
            <div className="empty-state">상세를 볼 Job을 선택해 주세요.</div>
          ) : loadingDetail ? (
            <div className="empty-state">상세 로그를 불러오는 중...</div>
          ) : recipients.length === 0 ? (
            <div className="empty-state">상세 수신자 로그가 없습니다.</div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>회원명</th>
                  <th>전화번호</th>
                  <th>상태</th>
                  <th>error_message</th>
                </tr>
              </thead>
              <tbody>
                {recipients.map((recipient) => (
                  <tr key={recipient.id}>
                    <td>{recipient.member_name}</td>
                    <td className="member-phone">{formatPhoneDisplay(recipient.to_phone)}</td>
                    <td>
                      <span className={`chip message-recipient-status message-recipient-status-${recipient.status}`}>
                        {recipientStatusLabel(recipient.status)}
                      </span>
                    </td>
                    <td>{recipient.error_message || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {selectedJob?.error_message ? (
          <div className="panel-subhead">
            <span>Job 오류</span>
            <strong>{selectedJob.error_message}</strong>
          </div>
        ) : null}
      </section>
    </ConsoleShell>
  );
}
