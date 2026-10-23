// 图片 → 文字（macOS Vision，中英文）：swift scripts/tools/ocr.swift a.png [b.png …]，每张图输出一段，按行
import Vision
import AppKit
for path in CommandLine.arguments.dropFirst() {
  guard let img = NSImage(contentsOfFile: path), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { print("### \(path)\n(读不出图)"); continue }
  let req = VNRecognizeTextRequest()
  req.recognitionLevel = .accurate
  req.recognitionLanguages = ["zh-Hans", "en-US"]
  req.usesLanguageCorrection = true
  try? VNImageRequestHandler(cgImage: cg, options: [:]).perform([req])
  let lines = (req.results ?? []).compactMap { $0.topCandidates(1).first?.string }
  print("### \(path)\n" + lines.joined(separator: "\n"))
}
