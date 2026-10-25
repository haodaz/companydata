'use client';

/** 代码台：像 IDE——深色、文件标签（solution / tests / NOTES）、行号、底部终端跑自测 */
import React, { useRef, useState } from 'react';

export function CodeBench({ code, onCode, notes, onNotes, tests, language, onRun, testOut, onPaste, leading }: { leading?: React.ReactNode; code: string; onCode: (v: string) => void; notes: string; onNotes: (v: string) => void; tests: { name: string; code: string }[]; language: string; onRun: () => void; testOut: string; onPaste: (e: React.ClipboardEvent) => void }) {
  const [tab, setTab] = useState<'main' | 'tests' | 'notes'>('main');
  const gutter = useRef<HTMLDivElement>(null);
  const lines = (tab === 'main' ? code : tab === 'tests' ? testsSrc(tests) : notes).split('\n').length;
  const ext = language === 'py' || language === 'python' ? 'py' : language === 'ts' ? 'ts' : 'js';
  const file = tab === 'main' ? `solution.${ext}` : tab === 'tests' ? `solution.test.${ext}` : 'NOTES.md';
  const passed = /通过 (\d+)\/(\d+)/.exec(testOut);
  const mono = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#1e1f2b', borderRadius: 14, overflow: 'hidden', border: '1px solid #2b2d3e', color: '#d6d8e6' }}>
      {/* 标签栏 */}
      <div style={{ display: 'flex', alignItems: 'center', background: '#16171f', borderBottom: '1px solid #2b2d3e', fontSize: 12.5, fontFamily: mono }}>
        {leading && <div style={{ padding: '0 8px', fontFamily: 'inherit' }}>{leading}</div>}
        {([['main', `solution.${ext}`], ['tests', `solution.test.${ext}`], ['notes', 'NOTES.md']] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} style={{ padding: '9px 16px', border: 0, borderRight: '1px solid #2b2d3e', background: tab === k ? '#1e1f2b' : 'transparent', color: tab === k ? '#fff' : '#8b8fa8', cursor: 'pointer', borderTop: tab === k ? '2px solid #6a5cff' : '2px solid transparent', fontFamily: mono }}>{k === 'tests' ? '🧪 ' : k === 'notes' ? '📝 ' : '📄 '}{l}</button>)}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, paddingRight: 10 }}>
          <span style={{ color: '#8b8fa8' }}>{language || 'js'} · {lines} 行</span>
          {!!tests.length && <button onClick={onRun} style={{ padding: '5px 12px', borderRadius: 6, border: 0, background: 'linear-gradient(135deg,#3ddc97,#12b5cb)', color: '#0b1020', fontWeight: 800, cursor: 'pointer', fontFamily: mono, fontSize: 12 }}>▶ Run tests ({tests.length})</button>}
        </div>
      </div>
      {/* 编辑区：行号 + 文本 */}
      <div style={{ flex: 1, display: 'flex', minHeight: 300, position: 'relative' }}>
        <div ref={gutter} style={{ width: 46, background: '#1a1b26', color: '#4d5068', textAlign: 'right', padding: '12px 8px 12px 0', fontFamily: mono, fontSize: 13, lineHeight: '20px', overflow: 'hidden', userSelect: 'none', borderRight: '1px solid #2b2d3e' }}>
          {Array.from({ length: lines }, (_, i) => <div key={i}>{i + 1}</div>)}
        </div>
        {tab === 'tests' ? (
          <pre style={{ flex: 1, margin: 0, padding: '12px 14px', fontFamily: mono, fontSize: 13, lineHeight: '20px', color: '#b8bdd6', overflow: 'auto', whiteSpace: 'pre' }}>{testsSrc(tests)}</pre>
        ) : (
          <textarea value={tab === 'main' ? code : notes} onChange={e => (tab === 'main' ? onCode : onNotes)(e.target.value)} onPaste={onPaste} onScroll={e => { if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop; }} spellCheck={false}
            placeholder={tab === 'main' ? `// 在这里写代码；导出 solution 函数\nfunction solution(...) {\n\n}` : '# 说明\n思路、假设、没做完的……'}
            style={{ flex: 1, border: 0, outline: 'none', resize: 'none', background: '#1e1f2b', color: '#e6e8f0', padding: '12px 14px', fontFamily: mono, fontSize: 13, lineHeight: '20px', whiteSpace: 'pre', overflow: 'auto', tabSize: 2 }} />
        )}
      </div>
      {/* 终端 */}
      <div style={{ height: 150, background: '#0f1017', borderTop: '1px solid #2b2d3e', fontFamily: mono, fontSize: 12.5, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', gap: 14, padding: '6px 12px', borderBottom: '1px solid #22232f', color: '#8b8fa8', fontSize: 11.5 }}><span style={{ color: '#fff' }}>TERMINAL</span><span>PROBLEMS</span><span>OUTPUT</span>{passed && <span style={{ marginLeft: 'auto', color: passed[1] === passed[2] ? '#3ddc97' : '#ffd166' }}>● {passed[1]}/{passed[2]} passed</span>}</div>
        <pre style={{ flex: 1, margin: 0, padding: '8px 12px', overflow: 'auto', whiteSpace: 'pre-wrap', color: '#cfd3e6' }}><span style={{ color: '#3ddc97' }}>$</span> npm test{'\n'}{testOut ? testOut.replace(/^✓/gm, '\u001b').split('\u001b').join('✓') : (tests.length ? '（还没跑。点右上 Run tests）' : '（这道题没有自测用例）')}</pre>
      </div>
    </div>
  );
}

function testsSrc(tests: { name: string; code: string }[]) {
  return tests.length ? `// 自测用例（只读）：每个用例拿到 solution 后返回 true / false\n${tests.map((t, i) => `test(${JSON.stringify(t.name)}, (solution) => {\n  ${t.code.includes('return') ? t.code.replace(/\n/g, '\n  ') : 'return ' + t.code}\n});${i < tests.length - 1 ? '\n' : ''}`).join('\n')}` : '// 这道题没有自测用例';
}
