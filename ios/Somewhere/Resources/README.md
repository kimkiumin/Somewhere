# Native resource provenance and release boundary

- `RollCompassShell` and `RollCompassNeedle` are the owner-approved vNext
  collaborator artwork supplied on 2026-08-24. They are stored separately so
  the needle can rotate without moving the shell. The delivered needle had an
  opaque black outer canvas; the packaged PNG changes only that connected
  background to transparency so the supplied artwork can be composited.
  - Needle source filename: `codex-clipboard-5da33900-5f7d-448d-bbc9-4471843f57f5.png`
  - Needle source SHA-256: `27d8294a81dc7246ddfc4472cda4fb139e779f4265d35d8a06276ac5ec159723`
  - Packaged needle SHA-256: `d142c46c99ab16f4d2193f98aec3cfd703612582d1d92decd7212cc47f8d4cc2`
  - Shell source and packaged SHA-256: `34952ae4263e07dca72df4a982d49a6d2d3f9ecee1b14fc6af8082656fb17362`
  - Transformation: on the unchanged 1254 × 1254 RGBA canvas, set alpha to
    zero for the exact-black four-connected component seeded at the top-left
    background and for three isolated non-art border marker pixels outside the
    artwork bounds. RGB values remain byte-identical for every pixel; 1,322,924
    alpha values change from opaque to transparent.
- `RollCompassAppIcon` is the project-local generated app-icon source prepared
  for the current native design.
- `SeongsuGamjatangHero` is a project-local generated representative menu image
  for the current curated `소문난성수감자탕` reveal. It is shown only after the
  destination identity has been lawfully revealed; hidden-selection and active
  guidance surfaces continue to use the approved compass without place imagery.
  The image depicts a generic gamjatang bowl and must not be described as an
  exact photograph supplied by, or taken at, the restaurant.
  - Generated: 2026-08-28 with the built-in OpenAI image-generation tool
  - Intended crop: 3:2 source, wide rounded-rectangle destination hero
  - Generated source: 1536 × 1024 PNG; packaged as a 90-quality JPEG to
    reduce the app resource from 2.4 MB to about 521 KB without changing its
    dimensions or crop
  - Packaged SHA-256: `95dd689f7aab377a3b2d6546a171189956f6c142c1dad3e990d08575ded82cee`
  - Generation brief: realistic Korean gamjatang editorial food photo; warm
    parchment, oxblood, and gold palette; no text, logos, people, compass, or
    maps; representative menu imagery rather than an asserted restaurant photo
  - Accessibility copy: `소문난성수감자탕 대표 메뉴 감자탕`
- `SomewhereLogo` and the legacy `AppIcon` set are retained for internal and
  regression compatibility; the project currently selects `RollCompassAppIcon`.
- `UnifrakturCook-Bold.ttf` is distributed under the SIL Open Font License. The
  corresponding `OFL-UnifrakturCook.txt` license file must remain with it.

Do not replace these files with artwork copied from a mood board or prototype
capture. A future visual sync must use an owner-approved source asset and keep
the shell/needle split. If a verified provider photo is added later, keep its
source, usage terms, crop, and attribution receipt beside this generated
representative fallback. Before commercial distribution, the owner must
complete the separate asset/provider/legal review; repository presence alone is
not a rights decision.
