import type { Metadata } from "next";
import { AsciiLive } from "./AsciiLive";

export const metadata: Metadata = {
  title: "ASCII Live — GRAD '26",
  description: "Turn your camera into live ASCII art in your browser.",
};

export default function AsciiLivePage() {
  return <AsciiLive />;
}
