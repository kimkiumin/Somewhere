# SVG Compass Display Demo

This standalone demo uses the supplied `아트보드 3_2.svg` artwork as the compass face.

## Run

From the repository root, serve the files over HTTP so the SVG can be fetched and inlined:

```powershell
python -m http.server 4173
```

Open `http://127.0.0.1:4173/prototype/compass-ui/index.html`.

To view only the screen that is currently rendered by the ROM firmware, open `http://127.0.0.1:4173/prototype/compass-ui/firmware-preview.html`. It shows the 480×480 snapshot without browser controls or the live-value form.

## Display contract

- Top center: remaining distance
- Bottom left: price band
- Bottom right: representative menu in English (`MENU`)
- Pink needle: relative bearing from the current heading to the destination bearing

Price input displays `-` for no preference and removes `원`, `₩`, and comma separators from numeric values, so `10000원` becomes `10000`.

The demo defines `Univers Next Pro Thin Condensed` with a local-face declaration that resolves the installed `UniversNextPro-ThinCond` font. If the font is unavailable on another machine, it falls back to a system sans-serif. The font file is not copied into the repository.

The matching ESP32-S3 firmware lives in `hardware/esp32-s3-touch-lcd-2.1/SomewhereDisplaySmokeTest`. It uses the same three-row contract and a generated bitmap version of the supplied Thin Condensed font so the board does not depend on a browser or a runtime TTF file.
