"""导出给 GitLab 的数据工厂代码打补丁：去掉指向不推部分（百业 / 真活 / 学院）的入口和引用。参数：导出目录。"""
import io, re, sys, os
OUT = sys.argv[1]
def edit(rel, fn):
    p = os.path.join(OUT, rel)
    if not os.path.exists(p): return
    s = io.open(p, encoding='utf-8').read(); t = fn(s)
    io.open(p, 'w', encoding='utf-8').write(t)

# 后台导航：去掉实验室那组和真活相关的数据资产入口
def nav(s):
    s = '\n'.join(l for l in s.split('\n') if not re.search(r"path: '/(lab|work|workspace|research|college)|key: '(db-question|db-external-sim)'", l))
    s = s.replace("{ key: 'college-admin', icon: <TrophyOutlined />, label: '百业学院教务', path: '/college/admin', group: '实验室', newWindow: true, badge: '新' }, ", '')
    return s
edit('src/app/admin/layout.tsx', nav)

# 登录浮层：真活的 logo 换成纯文字
edit('src/components/auth/OverlayLogin.tsx', lambda s: s.replace("import { WorkLogo } from '@/components/work/WorkLogo';\n", "const WorkLogo = (_: { size?: string; href?: string | null }) => <b>真活</b>;\n"))
