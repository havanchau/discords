const DEFAULT_TITLE = 'Discord Clone';
let originalFavicon: string | null = null;

export function updateFaviconBadge(count: number) {
  if (typeof document === 'undefined') return;
  const favicon = getFaviconElement();
  originalFavicon ??= favicon.href || '/favicon.svg';
  document.title = count > 0 ? `(${count}) ${DEFAULT_TITLE}` : DEFAULT_TITLE;

  if (count <= 0) {
    favicon.href = originalFavicon;
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext('2d');
  if (!context) return;

  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = originalFavicon;
  image.onload = () => {
    context.drawImage(image, 0, 0, 32, 32);
    context.beginPath();
    context.arc(24, 8, 8, 0, 2 * Math.PI);
    context.fillStyle = '#ff3355';
    context.fill();
    context.fillStyle = '#ffffff';
    context.font = 'bold 10px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(count > 9 ? '9+' : String(count), 24, 8);
    favicon.href = canvas.toDataURL('image/png');
  };
}

function getFaviconElement() {
  const existing = document.querySelector<HTMLLinkElement>("link[rel*='icon']");
  if (existing) return existing;
  const link = document.createElement('link');
  link.rel = 'shortcut icon';
  link.type = 'image/png';
  document.head.appendChild(link);
  return link;
}
