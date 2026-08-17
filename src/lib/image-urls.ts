/** Strip whitespace and stray line breaks from stored image URLs. */
export function sanitizeImageUrl(url: string): string {
  return url.replace(/[\r\n]+/g, "").trim();
}

export function sanitizeImageUrls(urls: string[]): string[] {
  return urls.map(sanitizeImageUrl).filter(Boolean);
}
