/**
 * 权限不足（2026-10-23）：百业用户（baiye_user）点进数据工厂 / 实体管理时，proxy 把人送到这里。
 * 说清楚是权限、不是出错，并给回 AI 百业的入口——别让人以为网站坏了。
 */
export const metadata = { title: '权限不足' };

const BAIYE = 'https://www.aisimjob.com';

export default function NoAccessPage() {
  return (
    <div style={{ minHeight: 'calc(100vh - 140px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 16px' }}>
      <div className="lab-glass" style={{ maxWidth: 560, width: '100%', padding: '40px 32px', textAlign: 'center', lineHeight: 1.9 }}>
        <div className="lab-mono lab-cap" style={{ marginBottom: 10 }}>ACCESS · 权限不足</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', marginBottom: 10 }}>这个账号只开通了 AI 百业</div>
        <div style={{ fontSize: 14.5, color: 'var(--ink2)' }}>
          你刚才打开的是平方的数据工厂 / 实体管理，这部分只对内部同事开放。<br />
          百业的职业模拟、真活和企业 / 科研工作台都可以照常使用。
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 24 }}>
          <a className="lab-btn" href={BAIYE} style={{ textDecoration: 'none' }}>回到 AI 百业继续使用 →</a>
          <a className="lab-btn ghost" href="/work/mine" style={{ textDecoration: 'none' }}>我的真活</a>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 18 }}>需要数据工厂的权限，请联系平方的管理员开通。</div>
      </div>
    </div>
  );
}
