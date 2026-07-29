# Approved V2 blueprint source receipt

This receipt records the byte-for-byte import of the approved Somewhere V2
blueprint. It is provenance metadata, not part of the approved blueprint prose.

- Source commit: `1cd08b3853c00ee42952b103d82892ceb05784b1`
- Approved conversation date recorded by the source: `2026-07-21`
- Import baseline: `27525e508df26aa5c3f9bd4c36cd5b90ab0001f4`
- Lineage: the source commit is not an ancestor of the import baseline and has
  no merge base with it.
- Import method: copy only the nine listed Git blobs; do not merge the sibling
  history.

| Path | Mode | Bytes | Source blob | SHA-256 |
| --- | --- | ---: | --- | --- |
| `BLUEPRINT.md` | `100644` | 6437 | `b5fb9e3018f54b770398050cb195b3ceacd5343e` | `d53272ae59f5cf6f5a3d4658949fe2015f8ef2a9457150cc9d6482b066079b45` |
| `docs/blueprint/navigation_and_ios.md` | `100644` | 7091 | `aa0964a735ca75a7795dd8bd278ef6086e7759f3` | `b74d400336f02b02b13e5c25a9492c75478aa09ad31182b98c7ec523b5eeaf63` |
| `docs/blueprint/physical_product.md` | `100644` | 5819 | `0171b08544e574d34c4eb6e0ddc2097d9762adef` | `a7f88af024de5f352532ee8dc5fee5c6b9ced78b64e03722599a5e2272cb3ee1` |
| `docs/blueprint/product_contract.md` | `100644` | 5303 | `30233688b1621c2cbff91cf5f3db9c7d76c0d4f8` | `f36f3d67c2c4c8cd1f5af92fafddd30d4bef0c7c9bf2c6f1da806f4b5b3b6032` |
| `docs/blueprint/recommendation_and_data.md` | `100644` | 10902 | `cb70f45616619fd270c23cae051a0bbc75ce6752` | `fad4ef56743b87643dedc10ce0b8bf2daf333c93575eebe77cbe990e0542dfb0` |
| `docs/blueprint/risk_and_evidence_ledger.md` | `100644` | 11054 | `b214746b7d16f5a400be949b5b175f0399084255` | `0ec8036beaa5907ed5ca1281e35fd0979ffe2f5f38b243f22387dd278c49f294` |
| `docs/blueprint/roadmap.md` | `100644` | 5994 | `95358b3582ce94219416a6ae5d71298507477a3f` | `f6261ae8077444f00b8e1adf881f9f80826797b985f6a8caf19695fe886bae3d` |
| `docs/blueprint/ux_state_model.md` | `100644` | 7490 | `860709893082d6468a467f1fdb6f7946586d4adf` | `30e9c446569486e3667669802884e081cd5ae99757089d93da59d837c7e74405` |
| `docs/blueprint/validation_plan.md` | `100644` | 8498 | `790baf3784298c073864b44965f1b2369e46448d` | `386140c213667cc7ddb1d91dac328c7b7be2a70b528317442c143c2ed2824bd2` |

For every listed path, both of these checks must match the table:

```bash
git hash-object <path>
sha256sum <path>
```
