export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <div className="legal-layout">
        <aside className="legal-toc" aria-label="개인정보처리방침 목차">
          <p className="legal-toc-title">목차</p>
          <a href="#policy-1">1. 수집하는 개인정보 항목</a>
          <a href="#policy-2">2. 개인정보의 이용 목적</a>
          <a href="#policy-3">3. 보유 및 이용기간</a>
          <a href="#policy-4">4. 제3자 제공</a>
          <a href="#policy-5">5. 처리 위탁</a>
          <a href="#policy-6">6. 이용자의 권리</a>
          <a href="#policy-7">7. 개인정보의 파기</a>
          <a href="#policy-8">8. 개인정보 보호책임자</a>
          <a href="#policy-9">9. 방침의 변경</a>
        </aside>

        <article className="legal-card">
          <header className="legal-header">
            <span className="legal-badge">개인정보처리방침</span>
            <h1 className="legal-title">주짓때로 개인정보처리방침</h1>
            <p className="legal-lead">
              주짓때로(이하 &quot;회사&quot;)는 이용자의 개인정보를 중요하게 생각하며, 「개인정보 보호법」 등 관련 법령을
              준수합니다. 본 개인정보처리방침은 회사가 제공하는 서비스 이용과 관련하여 개인정보가 어떻게 처리되는지 안내하기 위해
              마련되었습니다.
            </p>
            <div className="legal-meta">
              <span className="legal-chip">시행일 2026-01-01</span>
              <span className="legal-chip">관련 법령 준수</span>
            </div>
          </header>

          <section id="policy-1" className="legal-section legal-section-card">
            <h2><span className="legal-index">1</span>수집하는 개인정보 항목</h2>
            <p>회사는 서비스 제공을 위해 다음과 같은 정보를 수집할 수 있습니다.</p>
            <h3>① 회원가입 및 카카오 로그인 시</h3>
            <ul className="legal-list">
              <li>[필수] 이름</li>
              <li>[필수] 카카오계정(전화번호)</li>
              <li>[필수] 성별</li>
              <li>[필수] 연령대</li>
              <li>[필수] 생일</li>
              <li>[필수] 출생연도</li>
              <li>[선택] 이메일</li>
            </ul>
            <h3>② 서비스 이용 과정에서</h3>
            <ul className="legal-list">
              <li>[필수] 도장 운영자가 입력하는 회원 정보(이름, 연락처, 회원권 정보 등)</li>
            </ul>
            <h3>③ 홈페이지 문의 기능 이용 시</h3>
            <ul className="legal-list">
              <li>[필수] 이름</li>
              <li>[필수] 연락처</li>
              <li>[필수] 문의 내용</li>
            </ul>
            <h3>④ 자동 수집 정보</h3>
            <ul className="legal-list">
              <li>접속 로그</li>
              <li>IP 주소</li>
              <li>쿠키</li>
              <li>서비스 이용 기록</li>
            </ul>
            <p>
              필수 항목은 회원가입 및 서비스 제공을 위해 반드시 필요한 정보이며, 선택 항목은 미동의 시에도 기본 서비스 이용이
              가능합니다.
            </p>
          </section>

          <section id="policy-2" className="legal-section legal-section-card">
            <h2><span className="legal-index">2</span>개인정보의 이용 목적</h2>
            <ul className="legal-list">
              <li>서비스 제공 및 운영</li>
              <li>회원 식별 및 카카오 로그인 연동 처리</li>
              <li>이용자 연령대 기반 서비스 제공 및 맞춤 안내</li>
              <li>회원 관리 기능 제공</li>
              <li>홈페이지 생성 및 관리 기능 제공</li>
              <li>문자 안내 발송(만료 안내, 공지 등)</li>
              <li>고객 문의 대응</li>
              <li>서비스 개선 및 운영 통계</li>
            </ul>
          </section>

          <section id="policy-3" className="legal-section legal-section-card">
            <h2><span className="legal-index">3</span>개인정보의 보유 및 이용기간</h2>
            <p>
              회사는 개인정보의 수집 및 이용 목적이 달성된 후에는 해당 정보를 지체 없이 파기합니다. 다만, 관련 법령에 따라
              보관이 필요한 경우에는 법령에서 정한 기간 동안 보관할 수 있습니다.
            </p>
          </section>

          <section id="policy-4" className="legal-section legal-section-card">
            <h2><span className="legal-index">4</span>개인정보의 제3자 제공</h2>
            <p>회사는 원칙적으로 이용자의 개인정보를 외부에 제공하지 않습니다.</p>
            <p>다만 다음의 경우에는 예외로 합니다.</p>
            <ul className="legal-list">
              <li>이용자의 사전 동의가 있는 경우</li>
              <li>법령에 의거한 요청이 있는 경우</li>
            </ul>
          </section>

          <section id="policy-5" className="legal-section legal-section-card">
            <h2><span className="legal-index">5</span>개인정보의 처리 위탁</h2>
            <p>회사는 서비스 운영을 위해 일부 업무를 외부 전문업체에 위탁할 수 있습니다.</p>
            <ul className="legal-list">
              <li>클라우드 인프라 제공업체</li>
              <li>문자 발송 서비스 업체</li>
              <li>기타 서비스 운영에 필요한 업체</li>
            </ul>
            <p>회사는 위탁 시 관련 법령에 따라 개인정보 보호가 이루어지도록 관리합니다.</p>
          </section>

          <section id="policy-6" className="legal-section legal-section-card">
            <h2><span className="legal-index">6</span>이용자의 권리</h2>
            <p>
              이용자는 언제든지 자신의 개인정보에 대해 열람, 수정, 삭제를 요청할 수 있습니다. 요청은 고객센터 또는 이메일을
              통해 가능합니다.
            </p>
          </section>

          <section id="policy-7" className="legal-section legal-section-card">
            <h2><span className="legal-index">7</span>개인정보의 파기</h2>
            <p>보유기간이 경과하거나 처리 목적이 달성된 개인정보는 관련 법령에 따라 안전한 방법으로 파기합니다.</p>
          </section>

          <section id="policy-8" className="legal-section legal-section-card">
            <h2><span className="legal-index">8</span>개인정보 보호책임자</h2>
            <p>개인정보 관련 문의는 아래 이메일로 연락해 주시기 바랍니다.</p>
            <ul className="legal-list">
              <li>이메일: (기입 예정)</li>
            </ul>
          </section>

          <section id="policy-9" className="legal-section legal-section-card">
            <h2><span className="legal-index">9</span>방침의 변경</h2>
            <p>본 개인정보처리방침은 관련 법령 또는 서비스 변경에 따라 수정될 수 있으며, 변경 시 홈페이지를 통해 공지합니다.</p>
          </section>
        </article>
      </div>
    </main>
  );
}
