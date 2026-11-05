// 截屏打拍子（11-05）：侧边栏切到后台 / Chrome 被别的软件挡住时，页面里的定时器会被降频，Worker 里的不会
let iv; onmessage = e => { clearInterval(iv); if (e.data > 0) iv = setInterval(() => postMessage(1), e.data); };
