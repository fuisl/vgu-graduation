// Generated from the VGU wordmark (vgu-logo.png): per-cell ink coverage blended with a
// small local-peak term and a mild gamma curve (the same average+peak shaping the sculpture's
// ASCII shader uses, retuned here — the shader's own coefficients are pitched for a sparse
// point cloud and blow this solid-stroke logo into flat blocks at full strength), then
// quantized against RAMP. The character alone encodes density; LogoMark derives color from
// its RAMP index at render time rather than storing a second per-cell data table.
export const RAMP = " .:-=+*#%@";

export const LOGO_ROWS = [
  "=%#        .#%+%%%%%%%%%#-#%-        *%+",
  "+@@        :@@*@@@@@@@@@@*@@+        @@#",
  "+@@        :@@=        #@*@@+        @@#",
  "+@@        :@@=   .------:@@+        @@#",
  "+@@:       -@@=   :@@@@@@*@@+        @@#",
  "-@@@=     +@@@:   .====@@*@@+        @@#",
  " :#@@%: -%@@%@-        @@*@@+        @@#",
  "   -@@@#@@%=@@%########@@*@@@########@@#",
  "    .+%%%+ .#%%%%%%%%%%%%=#@%%%%%%%%%%%=",
] as const;

export const LOGO_COLS = LOGO_ROWS[0].length;
export const LOGO_ROW_COUNT = LOGO_ROWS.length;
