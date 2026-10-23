/** 教务处只给学院管理员：普通用户点进 /college/admin 时送到这里，说清不是出错 */
export const metadata = { title: '教务处 · 仅管理员' };
export default function CollegeNoAccess() {
  return (
    <div className="col-main" style={{ padding: '80px 16px', textAlign: 'center', maxWidth: 560, margin: '0 auto', lineHeight: 1.9 }}>
      <div className="col-eyebrow">OFFICE OF THE REGISTRAR</div>
      <h1 className="serif" style={{ fontSize: 28, margin: '8px 0 10px' }}>教务处只对学院管理员开放</h1>
      <p style={{ color: 'var(--ink2)', margin: 0 }}>这里是学院的核心业务逻辑（评分口径、培养路径、线索）。你的账号可以照常使用学院官网、百业和真活；需要教务权限，请联系学院管理员。</p>
      <div style={{ marginTop: 24, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <a className="col-btn" href="/college">回到学院官网</a>
        <a className="col-btn ghost" href="/lab">去百业</a>
      </div>
    </div>
  );
}
