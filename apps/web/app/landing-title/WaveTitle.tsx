import { DecodeText } from "./DecodeText";

const TITLE = "Coming soon in November.";

export function WaveTitle() {
  return <h2 aria-label={TITLE}><DecodeText text={TITLE} delay={780} duration={1050} repeatDelay={4200} variant="sweep" sweepWidth={5} ariaHidden /></h2>;
}
