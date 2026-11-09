import { HttpErrorResponse } from '@angular/common/http';

/**
 * Downloads a generated file (Excel, PDF, JSON). Fetched rather than followed as a link,
 * so a failure becomes an error the app can report instead of a broken download.
 * Failures are thrown as HttpErrorResponse, like HttpClient's.
 */
export async function downloadFile(url: string, fallbackName: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: 'same-origin' });
  } catch {
    throw new HttpErrorResponse({ status: 0, url });
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new HttpErrorResponse({
      status: res.status,
      statusText: res.statusText,
      error: body,
      url,
    });
  }
  const blob = await res.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filenameFrom(res.headers.get('content-disposition')) ?? fallbackName;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before freeing the file.
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
}

/** `attachment; filename="report.pdf"` → report.pdf */
export function filenameFrom(disposition: string | null): string | null {
  const match = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  return match ? decodeURIComponent(match[1]) : null;
}
