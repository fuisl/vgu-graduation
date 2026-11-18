import {redirect} from "next/navigation";

/**
 * The Digital Locket's feed and camera are now part of the Wall (ADR-019): everyone's photos,
 * with the camera one tap away in its photo mode. This URL stays so shared links keep working.
 */
export default function GalleryPage(): never {
  redirect("/wall?show=photos");
}
