export interface GalleryItem {
  id: string;
  type: "POLAROID" | "WISH";
  sender: string;
  receivers: string[];
  content: string;
  timestamp: string;
}

export const INITIAL_MOCK_GALLERY: GalleryItem[] = [
  { id: "g1", type: "POLAROID", sender: "Alex & Sam", receivers: ["Nhien", "Xuan"], content: "https://picsum.photos/seed/grad1/800/800", timestamp: "2026-11-14T10:30:00Z" },
  { id: "g2", type: "WISH", sender: "Dr. Nguyen", receivers: ["Team"], content: "To the best team ever. We finally made it through all those sleepless nights debugging. I am incredibly proud of every single one of you. See you at the top!", timestamp: "2026-11-14T11:15:00Z" },
  { id: "g3", type: "POLAROID", sender: "Xuan", receivers: ["All"], content: "https://picsum.photos/seed/grad2/800/800", timestamp: "2026-11-14T12:05:00Z" },
  { id: "g4", type: "WISH", sender: "Sarah (VGU '25)", receivers: ["Nhien"], content: "Congratulations! I couldn't have survived the thesis defense without your help. Let's celebrate soon.", timestamp: "2026-11-14T13:45:00Z" },
  { id: "g5", type: "POLAROID", sender: "Nhien", receivers: ["An"], content: "https://picsum.photos/seed/grad3/800/800", timestamp: "2026-11-14T14:20:00Z" },
  { id: "g6", type: "WISH", sender: "Uncle Bob", receivers: ["An", "Tai"], content: "So proud of you guys. Can't wait to see what you build next. The future is bright!", timestamp: "2026-11-14T15:10:00Z" },
  { id: "g7", type: "POLAROID", sender: "Mia", receivers: ["Duong"], content: "https://picsum.photos/seed/grad4/800/800", timestamp: "2026-11-14T15:45:00Z" },
  { id: "g8", type: "WISH", sender: "Prof. Tran", receivers: ["Xuan"], content: "Your dedication to the hardware integration was exceptional. Keep that same energy for your masters degree.", timestamp: "2026-11-14T16:00:00Z" },
  { id: "g9", type: "POLAROID", sender: "Tai", receivers: ["The Boys"], content: "https://picsum.photos/seed/grad5/800/800", timestamp: "2026-11-14T16:20:00Z" },
  { id: "g10", type: "WISH", sender: "Emma", receivers: ["Duong", "An"], content: "We survived! Remember when the database wiped itself 2 days before the deadline? 😂 Here is to no more panic attacks.", timestamp: "2026-11-14T17:05:00Z" },
  { id: "g11", type: "POLAROID", sender: "Guest 042", receivers: ["Anyone"], content: "https://picsum.photos/seed/grad6/800/800", timestamp: "2026-11-14T18:30:00Z" },
  { id: "g12", type: "WISH", sender: "Mom & Dad", receivers: ["Tai"], content: "Words cannot describe how proud we are of you today. All your hard work has paid off.", timestamp: "2026-11-14T19:00:00Z" }
];

export const STORAGE_KEY = "memory_capsule_user_submissions";

export function getGalleryItems(): GalleryItem[] {
  if (typeof window === "undefined") return INITIAL_MOCK_GALLERY;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const userItems: GalleryItem[] = saved ? JSON.parse(saved) : [];
    return [...userItems, ...INITIAL_MOCK_GALLERY];
  } catch (e) {
    return INITIAL_MOCK_GALLERY;
  }
}

export function saveGalleryItem(newItem: Omit<GalleryItem, "id" | "timestamp">) {
  if (typeof window === "undefined") return;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const userItems: GalleryItem[] = saved ? JSON.parse(saved) : [];

    const fullItem: GalleryItem = {
      ...newItem,
      id: "user-" + Date.now(),
      timestamp: new Date().toISOString(),
    };

    userItems.unshift(fullItem);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userItems));
  } catch (e) {
    console.error("Failed to save submission", e);
  }
}