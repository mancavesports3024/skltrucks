export function phoneToHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits ? `tel:${digits}` : "tel:";
}
