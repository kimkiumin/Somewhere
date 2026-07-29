# Somewhere V2 navigation policy v1

The canonical machine-readable policy is [navigation-policy-v1.json](navigation-policy-v1.json). It is the immutable calibration-only starting profile, not physical-device release evidence.

Direction is route-relative: acquire the route corridor at 35 m and leave it at 55 m; aim 25 m forward along the polyline; never fall back to GPS course, a direct endpoint bearing, or a chord across an obstacle. Guidance requires location accuracy at most 35 m, measured heading accuracy at most 25 degrees, sample age at most 10 seconds, and new location plus heading after visibility recovery.

Near enters at 120 m remaining route distance and exits at 150 m. Arrival requires endpoint distance at most 30 m, accuracy at most 25 m, final-corridor deviation at most 25 m, and four consecutive samples spanning 12–20 seconds. Arrival is latched. Progress jumps beyond 25 m backward or 100 m forward suppress guidance.

Routes require revalidation by five minutes and are never trusted beyond 30 minutes or the provider expiry, whichever occurs first.
