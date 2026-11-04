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
  falls:'M2.5 5.5h8.5c1.7 0 2.6 1 2.6 2.7V20.5 M17 9.5v11 M20.8 12.5v8 M2.5 5.5v15 M1.5 20.5h21',
  stacks:'M4.5 18.5V9.5l2-2 2 2v9 M11 18.5V5.5l2-1.6 2.1 2v12.6 M17.6 18.5v-6.2l1.6-1.6 1.7 1.7v6.1 M2.5 21.5c1.6-1 3.4-1 5 0s3.4 1 5 0 3.4-1 5 0 2.4.8 4 .2',
  cape:'M2.5 19.5c4-.6 6.4-3.6 8.2-7.6S15.6 5 21.5 5 M3 13.5c1.5-.9 3-.9 4.5 0 M14 19.5c1.5-.9 3-.9 4.5 0 M16.5 15c1.2-.7 2.4-.7 3.6 0',
  glacier:'M2.5 19.5 9.5 5.5l3.6 6.3 2.4-3.4 6 11.1Z M6.6 11.4l2.6 1.8 2.4-1.7 2 1.7 1.6-1.5 1.6 1.4',
  spire:'M10.2 20.5 11.4 3.5l1.8 2.6.9 14.4 M6.5 20.5h11 M9.3 14.5l2.2-.8 M10 9.5l2.6-.9',
  gorge:'M3.5 3.5c3.2 4.5 3.2 12.5 0 17 M20.5 3.5c-3.2 4.5-3.2 12.5 0 17 M12 6.5v11 M9.4 14.9 12 17.5l2.6-2.6',
  lighthouse:'M9.5 21.5 10.6 9h2.8l1.1 12.5 M10 9V6.5h4V9 M12 6.5V4.5 M10.3 14.5h3.4 M5 6.5l3-.8 M19 6.5l-3-.8 M7 21.5h10',
  wreck:'M2.5 15.5 9 13l7 1.5 5-3.5 M9 13l-2.5-5 M13 14.2l2.6 4.3 M4.5 19.5h15 M16 11l1.5-3.5',
  arch:'M3 20.5V12c0-4.5 4-8 9-8s9 3.5 9 8v8.5 M7.5 20.5V13c0-2.6 2-4.5 4.5-4.5s4.5 1.9 4.5 4.5v7.5 M1.5 20.5h21',
  strip:'M7 2.5h10v19H7Z M12 5v2.2 M12 10.9v2.2 M12 16.8v2.2',
  home:'M3.5 11 12 4l8.5 7 M6 9.5V20h12V9.5 M10 20v-5.5h4V20',
};
export const TYPE_LABEL={peak:'Summit',lake:'Lake',island:'Island',forest:'Forest',river:'River',pass:'Mountain pass',gorge:'Gorge',falls:'Waterfall',stacks:'Sea stacks',cape:'Cape',glacier:'Glacier',spire:'Rock spire',lighthouse:'Lighthouse',wreck:'Plane wreck',arch:'Stone arch'};
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
