// PDF → 文本（macOS PDFKit，不装依赖）：第一行输出页数，之后是全文。用法：swift scripts/tools/pdf2txt.swift file.pdf [maxPages]
import PDFKit
guard CommandLine.arguments.count > 1, let d = PDFDocument(url: URL(fileURLWithPath: CommandLine.arguments[1])) else { print("0"); exit(0) }
let maxPages = CommandLine.arguments.count > 2 ? Int(CommandLine.arguments[2]) ?? 200 : 200
print(d.pageCount)
var s = ""
for i in 0..<min(d.pageCount, maxPages) { s += (d.page(at: i)?.string ?? "") + "\n" }
print(s)
