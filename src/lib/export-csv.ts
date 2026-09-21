/**
 * 通用 CSV 导出工具
 * 支持中文字段名映射、BOM 头（Excel 兼容）、自动处理特殊字符
 */

interface CsvColumn {
  /** 数据中的 key */
  key: string;
  /** CSV 表头显示名称 */
  header: string;
  /** 可选：自定义格式化函数 */
  formatter?: (value: any, record: any) => string;
}

/**
 * 将数据导出为 CSV 文件并触发下载
 * @param data 数据数组
 * @param columns 列定义
 * @param filename 文件名（不含 .csv 后缀）
 */
export function exportToCsv(
  data: any[],
  columns: CsvColumn[],
  filename: string
) {
  if (!data || data.length === 0) {
    return;
  }

  // CSV 表头
  const headers = columns.map((col) => escapeCsvField(col.header));

  // CSV 行
  const rows = data.map((record) =>
    columns
      .map((col) => {
        const raw = getNestedValue(record, col.key);
        const value = col.formatter ? col.formatter(raw, record) : raw;
        return escapeCsvField(value);
      })
      .join(',')
  );

  // 加 BOM 头让 Excel 正确识别 UTF-8
  const BOM = '\uFEFF';
  const csvContent = BOM + [headers.join(','), ...rows].join('\n');

  // 创建并下载文件
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${formatDate(new Date())}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** 转义 CSV 字段中的特殊字符 */
function escapeCsvField(value: any): string {
  if (value == null) return '';
  const str = String(value);
  // 如果包含逗号、双引号、换行符，则用双引号包裹
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** 获取嵌套对象属性，支持 'a.b.c' 格式 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((acc, part) => acc?.[part], obj);
}

/** 格式化日期为 YYYYMMDD_HHmmss */
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}${m}${d}_${h}${min}${s}`;
}
