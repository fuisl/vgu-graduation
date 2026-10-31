import {
  COLORS,
  FIGURE_BOX,
  STORY_HEIGHT,
  STORY_WIDTH,
  dotsAt,
  figureLabels,
  figureSvg,
  figureTransform,
  type StoryContent,
} from "./story";

/*
 * Canvas drawing for the story card (browser only). The static parts are drawn once into two
 * layers; each frame is the back layer, the moving dots, then the front layer, so recording a
 * 30 fps loop stays cheap on a phone.
 */

export interface StoryFonts {
  /** CSS font-family lists, e.g. read from `--font-inter-tight` and `--font-geist-mono`. */
  sans: string;
  mono: string;
}

export interface StoryLayers {
  back: HTMLCanvasElement;
  front: HTMLCanvasElement;
}

const PAD = 80;
const MUTED = COLORS.mutedOnBlue;
const LINE = "rgba(255, 255, 255, 0.22)";

function layer(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = STORY_WIDTH;
  canvas.height = STORY_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas is not available");
  return [canvas, ctx];
}

function loadSvg(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("figure image failed to load"));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/** Spaced mono capitals, where the browser supports canvas letter spacing. */
function setSpacing(ctx: CanvasRenderingContext2D, value: string) {
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = value;
}

/** Breaks `text` into lines no wider than `width` in the current font. A single long word stays whole. */
export function wrapLines(measure: (text: string) => number, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  // Breaks only at ordinary spaces, so a no-break space (GRAD\u00a0'26) keeps words together.
  for (const word of text.split(/[ \t\n]+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && measure(candidate) > width) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** `text` cut with an ellipsis to fit `width` in the current font. */
export function fitLine(measure: (text: string) => number, text: string, width: number): string {
  if (measure(text) <= width) return text;
  let cut = text;
  while (cut.length > 1 && measure(`${cut}…`) > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

/** The largest title size from 116px down to 76px that fits one line; 64px (two lines) if none does. */
export function fitTitleSize(widthAt: (size: number) => number, width: number): number {
  for (let size = 116; size >= 76; size -= 4) if (widthAt(size) <= width) return size;
  return 64;
}

function drawDotGrid(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
  for (let y = 12; y < STORY_HEIGHT; y += 24) {
    for (let x = 12; x < STORY_WIDTH; x += 24) {
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawText(ctx: CanvasRenderingContext2D, content: StoryContent, fonts: StoryFonts) {
  const width = STORY_WIDTH - PAD * 2;
  ctx.textBaseline = "alphabetic";

  // Top bar: the mark and the figure number, as on the figure's own frame.
  ctx.font = `400 28px ${fonts.mono}`;
  setSpacing(ctx, "0.12em");
  ctx.fillStyle = COLORS.white;
  ctx.textAlign = "left";
  ctx.fillText(content.mark, PAD, 116);
  ctx.fillStyle = MUTED;
  ctx.textAlign = "right";
  ctx.fillText("FIG_001", STORY_WIDTH - PAD, 116);
  ctx.textAlign = "left";

  // Eyebrow and title. The title shrinks to fit one line; past the floor it takes two smaller lines.
  ctx.font = `400 28px ${fonts.mono}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(fitLine((t) => ctx.measureText(t).width, content.eyebrow.toUpperCase(), width), PAD, 244);
  setSpacing(ctx, "-0.02em");
  const titleSize = fitTitleSize((size) => {
    ctx.font = `500 ${size}px ${fonts.sans}`;
    return ctx.measureText(content.title).width;
  }, width);
  ctx.font = `500 ${titleSize}px ${fonts.sans}`;
  const lines = wrapLines((t) => ctx.measureText(t).width, content.title, width).slice(0, 2);
  ctx.fillStyle = COLORS.white;
  lines.forEach((line, i) => ctx.fillText(line, PAD, 244 + 34 + titleSize * (i + 1) * 0.98));

  // Facts: a rule, a mono label, the value and an optional muted detail.
  let y = FIGURE_BOX.y + FIGURE_BOX.height + 56;
  for (const fact of content.facts) {
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(PAD, y);
    ctx.lineTo(STORY_WIDTH - PAD, y);
    ctx.stroke();
    ctx.font = `400 24px ${fonts.mono}`;
    setSpacing(ctx, "0.12em");
    ctx.fillStyle = MUTED;
    ctx.fillText(fact.label.toUpperCase(), PAD, y + 44);
    setSpacing(ctx, "-0.01em");
    ctx.font = `500 44px ${fonts.sans}`;
    ctx.fillStyle = COLORS.white;
    ctx.fillText(fitLine((t) => ctx.measureText(t).width, fact.value, width), PAD, y + 98);
    if (fact.detail) {
      ctx.font = `400 34px ${fonts.sans}`;
      ctx.fillStyle = MUTED;
      ctx.fillText(fitLine((t) => ctx.measureText(t).width, fact.detail, width), PAD, y + 142);
    }
    y += fact.detail ? 170 : 128;
  }

  // Footer: the public site, never a personal link.
  ctx.font = `400 26px ${fonts.mono}`;
  setSpacing(ctx, "0.08em");
  ctx.fillStyle = MUTED;
  ctx.fillText(content.site, PAD, STORY_HEIGHT - 72);
  ctx.textAlign = "right";
  ctx.fillText("(C) 2026", STORY_WIDTH - PAD, STORY_HEIGHT - 72);
  ctx.textAlign = "left";
  setSpacing(ctx, "0px");
}

function drawLabels(ctx: CanvasRenderingContext2D, fonts: StoryFonts, translate: (label: string) => string) {
  const labels = figureLabels(figureTransform(), translate);
  ctx.font = `400 20px ${fonts.mono}`;
  setSpacing(ctx, "0.06em");
  ctx.textBaseline = "middle";
  for (const label of labels.leaders) {
    const [x, y] = label.at;
    const width = ctx.measureText(label.text).width;
    const left = label.align === "left" ? x + 8 : x - 8 - width;
    if (label.highlight) {
      ctx.fillStyle = COLORS.white;
      ctx.fillRect(left - 8, y - 18, width + 16, 36);
      ctx.fillStyle = COLORS.blue;
    } else {
      ctx.fillStyle = COLORS.white;
    }
    ctx.fillText(label.text, left, y + 1);
  }
  for (const label of labels.inline) {
    ctx.save();
    ctx.translate(label.at[0], label.at[1]);
    ctx.rotate(label.angle);
    const width = ctx.measureText(label.text).width;
    ctx.fillStyle = COLORS.blue;
    ctx.fillRect(-width / 2 - 6, -14, width + 12, 28);
    ctx.fillStyle = COLORS.white;
    ctx.fillText(label.text, -width / 2, 1);
    ctx.restore();
  }
  ctx.textBaseline = "alphabetic";
  setSpacing(ctx, "0px");
}

/** Builds the two static layers. Wait for the fonts first, or the canvas draws in a fallback face. */
export async function buildLayers(content: StoryContent, fonts: StoryFonts, translate: (label: string) => string = (l) => l): Promise<StoryLayers> {
  const transform = figureTransform();
  const svg = figureSvg(transform.scale);
  const [base, top] = await Promise.all([loadSvg(svg.base), loadSvg(svg.top)]);

  const [back, b] = layer();
  b.fillStyle = COLORS.blue;
  b.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);
  drawDotGrid(b);
  drawText(b, content, fonts);
  b.drawImage(base, transform.left, transform.top, transform.width, transform.height);

  const [front, f] = layer();
  f.drawImage(top, transform.left, transform.top, transform.width, transform.height);
  drawLabels(f, fonts, translate);
  return { back, front };
}

/** One frame at `seconds` into the loop. */
export function drawFrame(ctx: CanvasRenderingContext2D, layers: StoryLayers, seconds: number) {
  const transform = figureTransform();
  const { walkers, current } = dotsAt(seconds);
  ctx.drawImage(layers.back, 0, 0);
  ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
  for (const point of current) {
    const [x, y] = transform.toCard(point);
    ctx.beginPath();
    ctx.arc(x, y, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = COLORS.white;
  for (const point of walkers) {
    const [x, y] = transform.toCard(point);
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.drawImage(layers.front, 0, 0);
}
