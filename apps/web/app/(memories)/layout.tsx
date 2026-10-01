import type {ReactNode} from "react";
import "./memories.css";

/** Route group for the gallery, guestbook and disposable camera (#149). Only shares the stylesheet; URLs are unchanged. */
export default function MemoriesLayout({children}: {children: ReactNode}) {
  return children;
}
