import {redirect} from "next/navigation";

/**
 * The disposable camera now lives in the Digital Locket at /gallery, where it opens on entry.
 * This URL stays so links already shared (the guest profile, printed QR codes) keep working.
 */
export default function PolaroidPage(): never {
  redirect("/gallery");
}
