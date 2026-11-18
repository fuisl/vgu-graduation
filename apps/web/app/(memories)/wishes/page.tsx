import {redirect} from "next/navigation";

/**
 * Wishes now live on the Wall (ADR-019), whose composer opens on "Write a wish". This URL stays
 * so shared links and the display's older QR codes keep working.
 */
export default function WishesPage(): never {
  redirect("/wall?show=wishes");
}
