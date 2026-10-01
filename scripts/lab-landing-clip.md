# 首页 banner 里那段会动的工位

`public/lab-landing/rocket.{mp4,webm}` + `rocket-poster.jpg`，取自火箭发动机试车台的一次真实点火录屏
（12s 起 11 秒：预冷 → 点火 → 分台阶升推力）。重做的命令：

```bash
npm i --no-save ffmpeg-static
FF=$(node -e "console.log(require('ffmpeg-static'))")
V=~/Desktop/Untitled.mov   # 换成新的录屏
"$FF" -ss 12 -t 11 -i "$V" -an -vf "crop=955:1274:253:0,scale=620:-2,fps=24" \
  -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 27 -movflags +faststart -y public/lab-landing/rocket.mp4
"$FF" -ss 12 -t 11 -i "$V" -an -vf "crop=955:1274:253:0,scale=620:-2,fps=24" \
  -c:v libvpx-vp9 -b:v 0 -crf 38 -row-mt 1 -y public/lab-landing/rocket.webm
"$FF" -ss 19 -i "$V" -vf "crop=955:1274:253:0,scale=620:-2" -frames:v 1 -y public/lab-landing/rocket-poster.jpg
```

没做 GIF：同样画质的 GIF 要 10 MB 上下，这两个加起来 260 KB，
而且 `<video muted loop playsinline>` 自动播放、省电、还能给 reduced-motion 的人停住。
