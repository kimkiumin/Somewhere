#if DEBUG
import Foundation
import CoreLocation

/// Simulator-only sensor bridge.
///
/// iOS Simulator has no magnetometer, so it cannot produce `CLHeading`.
/// This opt-in Debug bridge derives a temporary heading from consecutive
/// simulated location samples. It exists only to exercise the application
/// state machine and UI with a replayed route; production never uses GPS
/// course as a substitute for device-facing heading.
enum SimulatorHeadingReplay {
    static var enabled: Bool {
        ProcessInfo.processInfo.arguments.contains("--simulator-heading-from-course")
    }

    static func bearing(from previous: Coordinate, to current: Coordinate) -> Double? {
        guard previous.isValid, current.isValid, previous != current else { return nil }
        let previousLatitude = previous.latitude * .pi / 180
        let currentLatitude = current.latitude * .pi / 180
        let longitudeDelta = (current.longitude - previous.longitude) * .pi / 180
        let x = sin(longitudeDelta) * cos(currentLatitude)
        let y = cos(previousLatitude) * sin(currentLatitude) -
            sin(previousLatitude) * cos(currentLatitude) * cos(longitudeDelta)
        let degrees = atan2(x, y) * 180 / .pi
        let remainder = degrees.truncatingRemainder(dividingBy: 360)
        return remainder >= 0 ? remainder : remainder + 360
    }
}

/// Physical-device-only Debug route replay for supervised field QA.
///
/// This is deliberately opt-in through a launch argument and is compiled out
/// of Release builds. It lets a connected iPhone exercise the real SwiftUI,
/// Core Location-facing state machine, Worker, cookies, and API contracts
/// without pretending that production can synthesize GPS.
enum PhysicalFieldRouteReplay {
    static var enabled: Bool {
        ProcessInfo.processInfo.arguments.contains("--physical-field-route-replay")
    }

    static let origin = Coordinate(latitude: 37.54385, longitude: 127.03695)
    private static let midpoint = Coordinate(latitude: 37.54292, longitude: 127.046)
    private static let endpoint = Coordinate(latitude: 37.542915, longitude: 127.05467)

    static let coordinates: [Coordinate] = makeSamples(stepM: 55)

    static var initialSample: LocationSample {
        LocationSample(coordinate: origin, horizontalAccuracyM: 5, capturedAt: Date())
    }

    static var initialHeading: HeadingSample {
        let value = SimulatorHeadingReplay.bearing(from: origin, to: midpoint) ?? 0
        return HeadingSample(
            trueHeadingDegrees: value,
            magneticHeadingDegrees: value,
            magneticDeclinationDegreesEast: 0,
            accuracyDegrees: 0,
            capturedAt: Date()
        )
    }

    private static func makeSamples(stepM: Double) -> [Coordinate] {
        let segments = [(origin, midpoint), (midpoint, endpoint)]
        var samples = [origin]
        for (segmentIndex, segment) in segments.enumerated() {
            let start = CLLocation(latitude: segment.0.latitude, longitude: segment.0.longitude)
            let end = CLLocation(latitude: segment.1.latitude, longitude: segment.1.longitude)
            let count = max(1, Int(ceil(start.distance(from: end) / stepM)))
            for index in 1...count {
                // The endpoint is held separately so the arrival gate receives
                // fresh samples for its full dwell window.
                if segmentIndex == segments.count - 1 && index == count { continue }
                let fraction = min(1, Double(index) / Double(count))
                samples.append(Coordinate(
                    latitude: segment.0.latitude + (segment.1.latitude - segment.0.latitude) * fraction,
                    longitude: segment.0.longitude + (segment.1.longitude - segment.0.longitude) * fraction
                ))
            }
        }
        samples.append(endpoint)
        return samples
    }
}
#endif
