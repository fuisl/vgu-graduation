import {redirect} from "next/navigation";

/**
 * The disposable camera now lives in the Wall's photo mode (ADR-019). This URL stays so links
 * already shared (printed QR codes, old messages) keep working.
 */
export default function PolaroidPage(): never {
  redirect("/wall?mode=photo");
}
