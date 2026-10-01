// Independently drawn neutral UI symbols; no remote icon bundle or wordmark.
const paths = {
  back: '<path d="m14 5-7 7 7 7"/>',
  heart: '<path d="M12 20 4 12C-1 6 6 1 12 7c6-6 13-1 8 5Z"/>',
  comment: '<path d="M20 12a8 8 0 0 1-11 7l-5 2 1-5A8 8 0 1 1 20 12Z"/>',
  send: '<path d="m3 10 18-7-7 18-4-7Zm7 4L21 3"/>',
  save: '<path d="M6 3h12v18l-6-4-6 4Z"/>',
  repost:
    '<path d="m17 3 4 4-4 4M21 7H8a4 4 0 0 0-4 4M7 21l-4-4 4-4M3 17h13a4 4 0 0 0 4-4"/>',
  share: '<path d="M5 12v8h14v-8M12 15V3m-5 5 5-5 5 5"/>',
  forward: '<path d="m14 4 7 6-7 7v-5c-5 0-8 2-11 6 1-6 5-9 11-10Z"/>',
  home: '<path d="m3 10 9-7 9 7v11h-6v-7H9v7H3Z"/>',
  search: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
  bell: '<path d="M4 17h16c-2-2-2-4-2-8a6 6 0 0 0-12 0c0 4 0 6-2 8m6 3h4"/>',
  inbox:
    '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  create:
    '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 8v8M8 12h8"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  people:
    '<circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m1 3c4 0 5 3 5 7"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  music:
    '<path d="M10 17V4l10-2v12M10 7l10-2"/><ellipse cx="7" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="15" rx="3" ry="2"/>',
  thumb: '<path d="M7 10 12 3l2 2-1 5h6l1 2-2 8H7Zm0 0H3v10h4"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  video:
    '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="m10 8 5 3-5 3Z"/>',
  store:
    '<path d="M3 9h18l-2-5H5Zm2 3v8h14v-8M9 20v-6h6v6M3 9c0 4 5 4 5 0 0 4 4 4 4 0 0 4 4 4 4 0 0 4 5 4 5 0"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  briefcase:
    '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M8 8V4h8v4"/>',
  orbit:
    '<circle cx="12" cy="12" r="7"/><ellipse cx="12" cy="12" rx="11" ry="4" transform="rotate(-20 12 12)"/>',
  up: '<path d="M12 20V4m-6 6 6-6 6 6"/>',
  down: '<path d="M12 4v16m-6-6 6 6 6-6"/>',
  kebab:
    '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
  cast: '<path d="M3 5h18v14h-7M3 5v4M3 13a8 8 0 0 1 8 8M3 17a4 4 0 0 1 4 4"/>',
  shorts:
    '<rect x="7" y="3" width="10" height="18" rx="4"/><path d="m10 9 5 3-5 3Z"/>',
  subscriptions:
    '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M7 4h10m-7 7 5 3-5 3Z"/>',
  createCircle: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
};
export function icon(name, size = 24, filled = false) {
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">${paths[name] || ""}</svg>`;
}
