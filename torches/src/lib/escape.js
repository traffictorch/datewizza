export const htmlEscape = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const xmlEscape = (s) =>
  String(s == null ? '' : s).replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

export const jsonEscape = (s) => JSON.stringify(String(s == null ? '' : s)).slice(1, -1);

export const stripTags = (s) => String(s == null ? '' : s).replace(/<[^>]*>/g, '');
