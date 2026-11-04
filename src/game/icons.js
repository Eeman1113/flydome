// SKYBOUND · icons
// One small vector icon set (24×24 grid, stroked) shared by the HUD (SVG) and canvases (Path2D),
// so markers, cards and charts read as one family.
export const ICON_PATHS={
  peak:'M2.5 19.5 9.5 6.5l3.6 6.3 2.4-3.3 6 10Z M7.6 10l1.9 1.6 1.7-1.4',
  lake:'M3 9.5c1.6-1.4 3.4-1.4 5 0s3.4 1.4 5 0 3.4-1.4 5 0 2.2 1 3 .6 M3 14.5c1.6-1.4 3.4-1.4 5 0s3.4 1.4 5 0 3.4-1.4 5 0 2.2 1 3 .6',
  island:'M4 15.5c2-4.2 4.8-6.2 8-6.2s6 2 8 6.2Z M2.5 19c1.6-1.1 3.4-1.1 5 0s3.4 1.1 5 0 3.4-1.1 5 0 2.4.9 4 .2',
  forest:'M8 3.5 3.5 11h2.6L3 16h10l-3.1-5h2.6Z M8 16v4.5 M16.5 7l-3 5h1.9L13 16h7l-2.4-4h1.9Z M16.5 16v4.5',
  river:'M6.5 2.5c5 3.2-3.8 6.4 1 9.6s-3.6 6.4 1 9.4 M13.5 2.5c5 3.2-3.8 6.4 1 9.6s-3.6 6.4 1 9.4',
  pass:'M1.5 19 8 7l4 6.5L16 7l6.5 12 M5 15.5h14',
  strip:'M7 2.5h10v19H7Z M12 5v2.2 M12 10.9v2.2 M12 16.8v2.2',
  home:'M3.5 11 12 4l8.5 7 M6 9.5V20h12V9.5 M10 20v-5.5h4V20',
};
export const TYPE_LABEL={peak:'Summit',lake:'Lake',island:'Island',forest:'Forest',river:'River',pass:'Mountain pass'};
export function iconSvg(type,cls='ico'){
  const d=ICON_PATHS[type]||ICON_PATHS.peak;
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
}
const cache={};
export function iconPath(type){return cache[type]||(cache[type]=new Path2D(ICON_PATHS[type]||ICON_PATHS.peak));}
// Draw an icon centred at (x,y) at the given pixel size on a 2D canvas context.
export function drawIcon(ctx,type,x,y,size,color,width=1.7){
  ctx.save();ctx.translate(x-size/2,y-size/2);ctx.scale(size/24,size/24);
  ctx.strokeStyle=color;ctx.lineWidth=width*24/size;ctx.lineJoin='round';ctx.lineCap='round';
  ctx.stroke(iconPath(type));ctx.restore();
}
