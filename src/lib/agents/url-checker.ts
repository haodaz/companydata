/**
 * URL Health Checker — Zero AI cost, pure HTTP verification
 * 
 * 检查信息源库里的 URL（企业官网 / 招聘门户 / 岗位页）是否仍可访问。
 * URL 中带年份时（如校招 /2026/）失效会自动尝试 +1 年。
 */

export interface UrlCheckResult {
  url: string;
  status: 'alive' | 'redirect' | 'dead';
  httpCode: number;
  redirectUrl?: string;
  latencyMs: number;
  yearAutoFixed?: string; // If we auto-incremented year in URL
  error?: string;
}

/**
 * Check a single URL with HEAD request, fallback to GET
 */
async function checkSingleUrl(url: string, timeoutMs: number = 8000): Promise<UrlCheckResult> {
  const start = Date.now();
  
  try {
    // Try HEAD first (faster, less bandwidth)
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'manual', // Don't auto-follow redirects, we want to detect them
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CompanyData/1.0)',
      },
    });
    
    const latencyMs = Date.now() - start;
    const httpCode = response.status;
    
    // 2xx → alive
    if (httpCode >= 200 && httpCode < 300) {
      return { url, status: 'alive', httpCode, latencyMs };
    }
    
    // 3xx → redirect
    if (httpCode >= 300 && httpCode < 400) {
      const redirectUrl = response.headers.get('location') || undefined;
      return { url, status: 'redirect', httpCode, latencyMs, redirectUrl };
    }
    
    // 405 Method Not Allowed → try GET
    if (httpCode === 405) {
      const getResponse = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CompanyData/1.0)',
        },
      });
      
      const getLatency = Date.now() - start;
      const getCode = getResponse.status;
      
      if (getCode >= 200 && getCode < 300) {
        return { url, status: 'alive', httpCode: getCode, latencyMs: getLatency };
      }
      if (getCode >= 300 && getCode < 400) {
        const redirectUrl = getResponse.headers.get('location') || undefined;
        return { url, status: 'redirect', httpCode: getCode, latencyMs: getLatency, redirectUrl };
      }
      return { url, status: 'dead', httpCode: getCode, latencyMs: getLatency };
    }
    
    // 4xx/5xx → dead
    return { url, status: 'dead', httpCode, latencyMs };
  } catch (error: any) {
    return {
      url,
      status: 'dead',
      httpCode: 0,
      latencyMs: Date.now() - start,
      error: error.message || 'Network error',
    };
  }
}

/**
 * Try incrementing year in URL
 * e.g., /2021/ → /2022/, ?edition=2021 → ?edition=2022
 */
function tryIncrementYear(url: string): string | null {
  // Common patterns: /2020/, /2021/, /2022/, ?edition=2021, etc.
  const yearRegex = /\b(20[12]\d)\b/g;
  const matches = url.match(yearRegex);
  
  if (!matches || matches.length === 0) return null;
  
  // Find the most recent year in the URL and increment it
  const maxYear = Math.max(...matches.map(Number));
  const newYear = maxYear + 1;
  
  // Replace all occurrences of that year
  return url.replace(new RegExp(String(maxYear), 'g'), String(newYear));
}

/**
 * Check a URL with auto-year-increment fallback
 */
export async function checkUrl(url: string): Promise<UrlCheckResult> {
  // First try the original URL
  const result = await checkSingleUrl(url);
  
  if (result.status === 'alive' || result.status === 'redirect') {
    return result;
  }
  
  // If dead, try incrementing the year
  const yearFixedUrl = tryIncrementYear(url);
  if (yearFixedUrl && yearFixedUrl !== url) {
    const fixedResult = await checkSingleUrl(yearFixedUrl);
    if (fixedResult.status === 'alive' || fixedResult.status === 'redirect') {
      return {
        ...fixedResult,
        url: yearFixedUrl,
        yearAutoFixed: yearFixedUrl,
      };
    }
  }
  
  return result;
}

