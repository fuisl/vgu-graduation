#!/usr/bin/env node
/**
 * Dev-only mock of the live endpoints, so /display and /live can be exercised
 * without apps/api, Postgres or the translation service. Dependency-free
 * (node:http plus a minimal server-to-client WebSocket). Never deployed.
 *
 *   node apps/web/scripts/mock-live-api.mjs [--port=4100] [--display=busy|empty|signin]
 *                                         [--translation=live|unavailable|absent|full] [--fast]
 *
 * Then start the web app against it:
 *   API_ORIGIN=http://localhost:4100 PUBLIC_API_ORIGIN=http://localhost:4100 pnpm --filter @grad/web exec next dev -p 3100
 *
 * Serves GET /event, GET /live/display/feed, GET /live/translation/segments,
 * GET /media/{id}/display (generated SVG), and WS /live/display and
 * /live/translation with the shapes in packages/contract/src/live.ts.
 * `--translation=absent` refuses the socket and the endpoint (API without the
 * module); `unavailable` connects and says so (pod suspended); `full` answers
 * the socket with 503 like an API over LIVE_TRANSLATION_MAX_CLIENTS, so the page
 * falls back to polling; `--display=signin` answers 401 like a
 * kiosk without the invitation cookie. Kill the process to simulate the API
 * going away; restart it to watch clients reconnect and catch up.
 */
import { createHash } from "node:crypto";
import { createServer } from "node:http";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);
const PORT = Number(args.port ?? 4100);
const DISPLAY = args.display ?? "busy";
const TRANSLATION = args.translation ?? "live";
const SPEED = args.fast ? 4 : 1;

const displayClients = new Set();
const translationClients = new Set();

// --- Data -----------------------------------------------------------------

const now = () => new Date().toISOString();
let counter = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

const WISHES = [
  ["Linh", "Congratulations, class of 2026! Four years went by in a heartbeat."],
  ["Minh", "So proud of you. Go change the world, one line of code at a time."],
  ["Oma Gisela", "Herzlichen Glückwunsch! Wir sind so stolz auf dich."],
  ["Thảo", "Chúc mừng tốt nghiệp! Chúc bạn luôn thành công và hạnh phúc trên con đường phía trước."],
  ["Prof. Weber", "You arrived with questions and leave with better ones. That is the whole point. Keep asking, keep building, and come back to tell us what you found."],
  ["Anh", "To the late nights in the library, the instant noodles, the group projects that almost broke us: we made it."],
  ["Jonas", "Glückwunsch!"],
  [
    "Mai",
    "I still remember the first day on campus when we all got lost looking for the lecture hall. Now look at us. Thank you for every coffee, every shared note, every pep talk before an exam. Whatever comes next, I hope you keep the curiosity that made these four years so much fun. See you at the reunion, and don't forget to call your mother.",
  ],
];

const wishes = [];
const photos = [];
const changes = []; // { at, message }

function addWish(i) {
  const [authorName, body] = WISHES[i % WISHES.length];
  const wish = { id: uuid(), authorName, body, createdAt: now() };
  wishes.unshift(wish);
  record({ type: "wish", wish });
}
function addPhoto() {
  const photo = { publicId: `mock${String(++counter).padStart(4, "0")}`, width: 1600, height: 1200, createdAt: now() };
  photos.unshift(photo);
  record({ type: "photo", photo });
}
function record(message) {
  changes.push({ at: Date.now(), message });
  if (changes.length > 500) changes.shift();
  broadcast(displayClients, message);
}

if (DISPLAY === "busy") {
  for (let i = 0; i < 4; i += 1) addWish(i);
  for (let i = 0; i < 3; i += 1) addPhoto();
}

// --- Translation ---------------------------------------------------------

const LINES = [
  ["en", "Good morning, graduates, families and friends.", "Chào buổi sáng các tân cử nhân, gia đình và bạn bè.", "Guten Morgen, liebe Absolventinnen und Absolventen, Familien und Freunde."],
  ["en", "Welcome to the graduation ceremony of the class of 2026.", "Chào mừng đến với lễ tốt nghiệp khóa 2026.", "Willkommen zur Abschlussfeier des Jahrgangs 2026."],
  ["vi", "Hôm nay là một ngày rất đặc biệt đối với tất cả chúng ta.", "Today is a very special day for all of us.", "Heute ist ein ganz besonderer Tag für uns alle."],
  ["en", "Please welcome the president of the university to the stage.", "Xin mời hiệu trưởng nhà trường lên sân khấu.", "Bitte begrüßen Sie den Präsidenten der Universität auf der Bühne."],
  ["vi", "Xin cảm ơn các thầy cô đã đồng hành cùng chúng em.", "Thank you to the teachers who walked this road with us.", "Danke an die Lehrkräfte, die diesen Weg mit uns gegangen sind."],
];
const SESSION = "mock-session-1";
const segments = []; // index = sequence
const changedAt = []; // index = sequence, ms
let sequence = 0;

function store(segment) {
  segments[segment.sequence] = segment;
  changedAt[segment.sequence] = Date.now();
}

function segmentFor(seq, status) {
  const [source, sourceText, a, b] = LINES[seq % LINES.length];
  const other = source === "en" ? "vi" : "en";
  const translations = [
    { language: other, status, text: status === "draft" ? a.split(" ").slice(0, -2).join(" ") + " …" : a, provider: "mock" },
  ];
  // Every fourth line the German translation fails, to show the per-line state.
  translations.push(
    seq % 4 === 3 && status === "final"
      ? { language: "de", status: "failed", text: null, provider: "mock" }
      : { language: "de", status, text: status === "draft" ? b.split(" ").slice(0, -2).join(" ") + " …" : b, provider: "mock" },
  );
  return { sessionId: SESSION, sequence: seq, startMs: seq * 4000, endMs: seq * 4000 + 3500, sourceLanguage: source, sourceText, translations };
}

function speak() {
  if (TRANSLATION !== "live" && TRANSLATION !== "full") return;
  const seq = sequence++;
  const draft = segmentFor(seq, "draft");
  store(draft);
  broadcast(translationClients, { type: "segment", segment: draft, until: now() });
  broadcast(displayClients, { type: "segment", segment: draft });
  setTimeout(() => {
    const final = segmentFor(seq, "final");
    store(final);
    broadcast(translationClients, { type: "segment", segment: final, until: now() });
    broadcast(displayClients, { type: "segment", segment: final });
  }, 1500 / SPEED);
}
if (TRANSLATION !== "absent") for (let i = 0; i < 6; i += 1) store(segmentFor(sequence++, "final"));

// --- Minimal WebSocket (server to client only) ---------------------------

function frame(text) {
  const payload = Buffer.from(text);
  const n = payload.length;
  const head = n < 126 ? Buffer.from([0x81, n]) : n < 65536 ? Buffer.from([0x81, 126, n >> 8, n & 255]) : null;
  if (!head) {
    const big = Buffer.alloc(10);
    big[0] = 0x81;
    big[1] = 127;
    big.writeBigUInt64BE(BigInt(n), 2);
    return Buffer.concat([big, payload]);
  }
  return Buffer.concat([head, payload]);
}
function send(socket, message) {
  if (!socket.destroyed) socket.write(frame(JSON.stringify(message)));
}
function broadcast(set, message) {
  for (const socket of set) send(socket, message);
}

function upgrade(request, socket) {
  const path = new URL(request.url, "http://x").pathname;
  const refuse = (status) => {
    socket.end(`HTTP/1.1 ${status}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`);
  };
  let set;
  if (path === "/live/display") {
    if (DISPLAY === "signin") return refuse("401 Unauthorized");
    set = displayClients;
  } else if (path === "/live/translation") {
    if (TRANSLATION === "absent") return refuse("404 Not Found");
    if (TRANSLATION === "full") return refuse("503 Service Unavailable");
    set = translationClients;
  } else return refuse("404 Not Found");

  const key = request.headers["sec-websocket-key"];
  const accept = createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  set.add(socket);
  console.log(`ws open ${path} (${set.size})`);
  socket.on("data", (buf) => {
    if ((buf[0] & 0x0f) === 0x8) socket.end(Buffer.from([0x88, 0]));
  });
  const remove = () => {
    if (set.delete(socket)) console.log(`ws closed ${path} (${set.size})`);
  };
  socket.on("close", remove);
  socket.on("error", remove);
  if (set === translationClients) {
    // Like the API: status, then the recent segments, then live changes.
    send(socket, { type: "status", state: TRANSLATION === "live" ? "live" : "unavailable", until: now() });
    for (const segment of segments.filter(Boolean).slice(-50)) send(socket, { type: "segment", segment, until: now() });
  }
}

// --- HTTP ------------------------------------------------------------------

function json(response, request, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": request.headers.origin ?? "*",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  });
  response.end(JSON.stringify(body));
}

const PALETTE = ["#1f4bb0", "#16378a", "#0b1a3a", "#5b6784", "#b9c8ee"]; // brand tokens, mirrored for the generated placeholder photos

const server = createServer((request, response) => {
  const url = new URL(request.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  if (path === "/event") {
    return json(response, request, 200, {
      name: "VGU Graduation 2026",
      startsAt: "2026-10-24T01:00:00.000Z",
      endsAt: "2026-10-24T05:00:00.000Z",
      timeZone: "Asia/Ho_Chi_Minh",
      timeConfirmed: true,
      venue: { name: "VGU Campus, Main Hall", address: "Ring Road 4, Thu Dau Mot, Binh Duong", mapUrl: "https://maps.example.test/vgu" },
      contact: null,
      arrivalInfo: null,
    });
  }
  if (path === "/live/display/feed") {
    if (DISPLAY === "signin") return json(response, request, 401, { error: "Unauthorized", message: "Missing invitation bearer token or session cookie" });
    const since = url.searchParams.get("since");
    const messages = since
      ? changes.filter((c) => c.at > Date.parse(since)).map((c) => c.message)
      : [...wishes.slice(0, 50).map((wish) => ({ type: "wish", wish })), ...photos.slice(0, 50).map((photo) => ({ type: "photo", photo }))];
    return json(response, request, 200, { messages, until: now() });
  }
  if (path === "/live/translation/segments") {
    if (TRANSLATION === "absent") return json(response, request, 404, { error: "Not Found", message: "Route not found" });
    const since = url.searchParams.get("since");
    const limit = Math.min(200, Number(url.searchParams.get("limit") ?? 100));
    // 5 s look-back like the API, so nothing committed just before `since` is missed.
    const from = since ? Date.parse(since) - 5_000 : -Infinity;
    const changed = segments.filter((s) => s && changedAt[s.sequence] > from).sort((a, b) => changedAt[a.sequence] - changedAt[b.sequence]);
    const page = since ? changed.slice(0, limit) : changed.slice(-limit);
    return json(response, request, 200, {
      segments: page,
      until: now(),
      more: since ? changed.length > limit : false,
      state: TRANSLATION === "live" || TRANSLATION === "full" ? "live" : "unavailable",
    });
  }
  const media = path.match(/^\/media\/([^/]+)\/(display|thumb)$/);
  if (media) {
    const n = Number(media[1].replace(/\D/g, "")) || 0;
    const fill = PALETTE[n % PALETTE.length];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200"><rect width="1600" height="1200" fill="${fill}"/><rect x="80" y="80" width="1440" height="1040" fill="none" stroke="#ffffff" stroke-width="6"/><text x="800" y="640" font-family="sans-serif" font-size="120" fill="#ffffff" text-anchor="middle">Mock photo ${media[1]}</text></svg>`;
    response.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=31536000, immutable" });
    return response.end(svg);
  }
  if (path === "/invitations/me" || path === "/pass") return json(response, request, 401, { error: "Unauthorized", message: "No invitation" });
  if (path === "/gallery" || path === "/wishes") return json(response, request, 200, { items: [], nextCursor: null });
  json(response, request, 404, { error: "Not Found", message: "Mock has no such route" });
});
server.on("upgrade", upgrade);
server.listen(PORT, () => {
  console.log(`mock live API on http://localhost:${PORT} (display=${DISPLAY}, translation=${TRANSLATION})`);
});

let tick = 0;
setInterval(() => {
  tick += 1;
  if (DISPLAY === "busy") {
    if (tick % 4 === 0) addWish(tick);
    if (tick % 6 === 0) addPhoto();
    if (tick % 15 === 0 && wishes.length > 3) {
      const hidden = wishes.splice(2, 1)[0];
      record({ type: "hidden", kind: "wish", id: hidden.id });
    }
  }
  speak();
}, 3000 / SPEED);
setInterval(() => {
  broadcast(displayClients, { type: "keepalive", until: now() });
  broadcast(translationClients, { type: "keepalive", until: now() });
}, 25_000);
