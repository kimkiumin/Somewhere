# Native iOS field and distribution authority

The native source gate, physical-device field gate, and Apple distribution gate are separate. A simulator or unsigned archive can prove source buildability only. It cannot prove an iPhone walk, TestFlight availability, production signing, or public release.

The checked-in product boundary is `foreground-only-no-locked-screen-guidance`. Entering the background stops location and heading updates, clears samples, and requires fresh foreground samples before precise pointing resumes. No receipt may reinterpret this as background navigation support.

## Private evidence directory

Keep these files outside the repository:

```text
expected.json
native-build.json
native-device.json
trusted-build-authorities.json
trusted-field-leads.json
```

`native-build.json` binds the exact commit/tree, Xcode project, result bundle, archive, navigation policy, route contract, provider configuration, privacy manifest, test outcomes, and sanitized signing metadata. An authorized native-build verifier signs that complete payload with Ed25519. CI emits sanitized unsigned metadata only; it is an input to the build authority and cannot independently open this gate.

`native-device.json` is an Ed25519-signed field-lead attestation for the exact iPhone 15 Pro Max hardware identifier `iPhone16,2`. Its signed payload includes the exact signed build-receipt digest, so a field result cannot be replayed against another build claim. It contains only sanitized summaries and digests. Raw coordinates, route traces, provider payloads, participant identity, credentials, and private signing material are forbidden.

The exact ordered scenarios are:

1. open-sky walk;
2. building-dense walk;
3. interrupted network followed by foreground recovery;
4. heading interference followed by recalibration.

Every scenario records Stop and Reveal observation plus false- and missed-arrival counts. A simulator cannot substitute for any scenario.

## Verification

```sh
bun test scripts/ios/verify-native-evidence.test.mjs
bun scripts/ios/verify-native-evidence.mjs \
  --evidence /private/native-evidence \
  --output /private/native-verdict.json
```

When private evidence is absent, the command writes `nativeIOS: BLOCK` without manufacturing a failure or a pass. `nativeDistribution: PASS` additionally requires distribution signing and an actual TestFlight distribution record; development or archive-only signing stays `BLOCK`.

The repository does not contain signing certificates, provisioning profiles, Apple credentials, device traces, or authority private keys.
