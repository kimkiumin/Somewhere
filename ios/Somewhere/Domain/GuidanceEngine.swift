import Foundation
import CryptoKit

struct Coordinate: Codable, Equatable, Sendable {
    let latitude: Double
    let longitude: Double

    var isValid: Bool {
        latitude.isFinite && longitude.isFinite && (-90...90).contains(latitude) && (-180...180).contains(longitude)
    }
}

struct LocationSample: Equatable, Sendable {
    let coordinate: Coordinate
    let horizontalAccuracyM: Double
    let capturedAt: Date
}

struct HeadingSample: Equatable, Sendable {
    let trueHeadingDegrees: Double?
    let magneticHeadingDegrees: Double
    let magneticDeclinationDegreesEast: Double?
    let accuracyDegrees: Double
    let capturedAt: Date
}

struct TrustedRoute: Equatable, Sendable {
    let geometry: [Coordinate]
    let routeDigest: String
    let routeVersion: String
    let expiresAt: Date
    let receivedAt: Date

    static func validate(guidance: RouteGuidance, receivedAt: Date, now: Date) throws -> TrustedRoute {
        guard guidance.kind == "route",
              let encoded = guidance.encodedPolyline,
              let digest = guidance.routeDigest,
              let version = guidance.routeVersion,
              let expiresAtMs = guidance.expiresAt,
              digest.range(of: #"^sha256:[a-f0-9]{64}$"#, options: .regularExpression) != nil,
              !version.isEmpty else { throw RouteValidationError.invalidEnvelope }
        let expiresAt = Date(timeIntervalSince1970: Double(expiresAtMs) / 1000)
        guard expiresAt > now else { throw RouteValidationError.expired }
        guard now >= receivedAt,
              now.timeIntervalSince(receivedAt) * 1000 <= Double(NavigationPolicy.routeAbsoluteMaxAgeMs) else {
            throw RouteValidationError.tooOld
        }
        guard encoded.utf8.count <= 256 * 1024,
              let data = decodeBase64URL(encoded),
              let vertices = try? JSONDecoder().decode([[Double]].self, from: data),
              (2...2_048).contains(vertices.count) else { throw RouteValidationError.invalidGeometry }
        var geometry: [Coordinate] = []
        for vertex in vertices {
            guard vertex.count == 2 else { throw RouteValidationError.invalidGeometry }
            let coordinate = Coordinate(latitude: vertex[1], longitude: vertex[0])
            guard coordinate.isValid, coordinate != geometry.last else { throw RouteValidationError.invalidGeometry }
            geometry.append(coordinate)
        }
        guard let endpoint = geometry.last else { throw RouteValidationError.invalidGeometry }
        let canonical = String(
            format: "%.6f,%.6f",
            locale: Locale(identifier: "en_US_POSIX"),
            endpoint.latitude,
            endpoint.longitude
        )
        let computed = SHA256.hash(data: Data(canonical.utf8)).map { String(format: "%02x", $0) }.joined()
        guard digest == "sha256:\(computed)" else { throw RouteValidationError.digestMismatch }
        return TrustedRoute(
            geometry: geometry,
            routeDigest: digest,
            routeVersion: version,
            expiresAt: expiresAt,
            receivedAt: receivedAt
        )
    }
}

enum RouteValidationError: Error, Equatable {
    case invalidEnvelope, invalidGeometry, digestMismatch, expired, tooOld
}

enum GuidanceSuppression: String, Equatable, Sendable {
    case invalidLocation, staleLocation, poorLocationAccuracy
    case invalidHeading, staleHeading, poorHeadingAccuracy
    case invalidRoute, staleRoute, offRoute, progressJump, routeRecovering
}

struct GuidanceReading: Equatable, Sendable {
    let arrowDegrees: Double
    let remainingM: Double
    let endpointDistanceM: Double
    let finalCorridorDeviationM: Double
    let routeProgressIsCredible: Bool
}

enum GuidanceResult: Equatable, Sendable {
    case suppressed(GuidanceSuppression)
    case credible(GuidanceReading)
}

struct GuidanceEngine: Sendable {
    private enum Corridor: Sendable { case outside, recovering, inside }
    private var corridor: Corridor = .outside
    private var acceptedProgressM: Double?
    private var previousArrowDegrees: Double?

    mutating func update(location: LocationSample, heading: HeadingSample, route: TrustedRoute, now: Date) -> GuidanceResult {
        guard location.coordinate.isValid,
              location.horizontalAccuracyM.isFinite,
              location.horizontalAccuracyM >= 0 else { return .suppressed(.invalidLocation) }
        guard now >= location.capturedAt,
              now.timeIntervalSince(location.capturedAt) * 1000 <= Double(NavigationPolicy.locationMaxAgeMs) else {
            return .suppressed(.staleLocation)
        }
        guard location.horizontalAccuracyM <= Double(NavigationPolicy.maxGuidanceAccuracyM) else {
            return .suppressed(.poorLocationAccuracy)
        }
        guard heading.accuracyDegrees.isFinite, heading.accuracyDegrees >= 0 else {
            return .suppressed(.invalidHeading)
        }
        guard now >= heading.capturedAt,
              now.timeIntervalSince(heading.capturedAt) * 1000 <= Double(NavigationPolicy.headingMaxAgeMs) else {
            return .suppressed(.staleHeading)
        }
        guard heading.accuracyDegrees <= Double(NavigationPolicy.maxMeasuredHeadingAccuracyDeg) else {
            return .suppressed(.poorHeadingAccuracy)
        }
        guard route.geometry.count >= 2, route.geometry.allSatisfy(\.isValid) else {
            resetProgress()
            return .suppressed(.invalidRoute)
        }
        guard route.expiresAt > now,
              now.timeIntervalSince(route.receivedAt) * 1000 <= Double(NavigationPolicy.routeAbsoluteMaxAgeMs) else {
            resetProgress()
            return .suppressed(.staleRoute)
        }
        guard let headingDegrees = resolvedTrueHeading(heading),
              let projection = closestProjection(of: location.coordinate, on: route.geometry) else {
            return .suppressed(.invalidRoute)
        }

        let insideCorridor = corridor == .inside
            ? projection.deviationM < Double(NavigationPolicy.routeCorridorExitM)
            : projection.deviationM <= Double(NavigationPolicy.routeCorridorEnterM)
        guard insideCorridor else {
            corridor = corridor == .outside ? .outside : .recovering
            acceptedProgressM = nil
            return .suppressed(.offRoute)
        }

        if let acceptedProgressM {
            let jumpM = projection.progressM - acceptedProgressM
            if jumpM < -Double(NavigationPolicy.maxBackwardProgressJumpM) ||
                jumpM > Double(NavigationPolicy.maxForwardProgressJumpM) {
                corridor = .recovering
                self.acceptedProgressM = nil
                return .suppressed(.progressJump)
            }
        }
        if corridor == .recovering && acceptedProgressM == nil {
            acceptedProgressM = projection.progressM
            return .suppressed(.routeRecovering)
        }

        let totalM = routeLength(route.geometry)
        let targetProgressM = min(totalM, projection.progressM + Double(NavigationPolicy.forwardTargetLookaheadM))
        guard let target = coordinate(at: targetProgressM, on: route.geometry),
              let endpoint = route.geometry.last,
              let finalStart = route.geometry.dropLast().last,
              let targetBearing = bearing(from: location.coordinate, to: target),
              let endpointDistanceM = distance(from: location.coordinate, to: endpoint),
              let finalProjection = project(location.coordinate, toSegmentFrom: finalStart, to: endpoint) else {
            resetProgress()
            return .suppressed(.invalidRoute)
        }

        corridor = .inside
        acceptedProgressM = projection.progressM
        let rawArrowDegrees = normalizedDegrees(targetBearing - headingDegrees)
        let arrowDegrees = smoothedArrow(previous: previousArrowDegrees, next: rawArrowDegrees, maximumStepDegrees: 45)
        previousArrowDegrees = arrowDegrees
        return .credible(GuidanceReading(
            arrowDegrees: arrowDegrees,
            remainingM: max(0, totalM - projection.progressM),
            endpointDistanceM: endpointDistanceM,
            finalCorridorDeviationM: finalProjection.deviationM,
            routeProgressIsCredible: true
        ))
    }

    private mutating func resetProgress() {
        corridor = .outside
        acceptedProgressM = nil
        previousArrowDegrees = nil
    }
}

private struct SegmentProjection {
    let deviationM: Double
    let progressM: Double
}

private let earthRadiusM = 6_371_000.0

private func decodeBase64URL(_ encoded: String) -> Data? {
    guard !encoded.isEmpty,
          encoded.range(of: #"^[A-Za-z0-9_-]+$"#, options: .regularExpression) != nil else { return nil }
    var standard = encoded.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
    standard += String(repeating: "=", count: (4 - standard.count % 4) % 4)
    return Data(base64Encoded: standard)
}

private func normalizedDegrees(_ degrees: Double) -> Double {
    let remainder = degrees.truncatingRemainder(dividingBy: 360)
    return remainder >= 0 ? remainder : remainder + 360
}

private func smoothedArrow(previous: Double?, next: Double, maximumStepDegrees: Double) -> Double {
    guard let previous else { return next }
    let delta = (next - previous + 540).truncatingRemainder(dividingBy: 360) - 180
    return normalizedDegrees(previous + max(-maximumStepDegrees, min(maximumStepDegrees, delta)))
}

private func resolvedTrueHeading(_ sample: HeadingSample) -> Double? {
    if let value = sample.trueHeadingDegrees, value.isFinite, value >= 0 { return normalizedDegrees(value) }
    guard sample.magneticHeadingDegrees.isFinite,
          let declination = sample.magneticDeclinationDegreesEast,
          declination.isFinite else { return nil }
    return normalizedDegrees(sample.magneticHeadingDegrees + declination)
}

private func distance(from: Coordinate, to: Coordinate) -> Double? {
    guard from.isValid, to.isValid else { return nil }
    let fromLatitude = from.latitude * .pi / 180
    let toLatitude = to.latitude * .pi / 180
    let latitudeDelta = toLatitude - fromLatitude
    let longitudeDelta = (to.longitude - from.longitude) * .pi / 180
    let haversine = pow(sin(latitudeDelta / 2), 2) +
        cos(fromLatitude) * cos(toLatitude) * pow(sin(longitudeDelta / 2), 2)
    return earthRadiusM * 2 * atan2(sqrt(haversine), sqrt(1 - haversine))
}

private func bearing(from: Coordinate, to: Coordinate) -> Double? {
    guard from.isValid, to.isValid else { return nil }
    let fromLatitude = from.latitude * .pi / 180
    let toLatitude = to.latitude * .pi / 180
    let longitudeDelta = (to.longitude - from.longitude) * .pi / 180
    let x = sin(longitudeDelta) * cos(toLatitude)
    let y = cos(fromLatitude) * sin(toLatitude) - sin(fromLatitude) * cos(toLatitude) * cos(longitudeDelta)
    return normalizedDegrees(atan2(x, y) * 180 / .pi)
}

private func project(_ point: Coordinate, toSegmentFrom start: Coordinate, to end: Coordinate) -> (fraction: Double, deviationM: Double)? {
    guard point.isValid, start.isValid, end.isValid else { return nil }
    let latitudeRadians = point.latitude * .pi / 180
    let scaleX = .pi / 180 * earthRadiusM * cos(latitudeRadians)
    let scaleY = .pi / 180 * earthRadiusM
    let ax = (start.longitude - point.longitude) * scaleX
    let ay = (start.latitude - point.latitude) * scaleY
    let bx = (end.longitude - point.longitude) * scaleX
    let by = (end.latitude - point.latitude) * scaleY
    let dx = bx - ax
    let dy = by - ay
    let lengthSquared = dx * dx + dy * dy
    guard lengthSquared.isFinite, lengthSquared > 0 else { return nil }
    let fraction = max(0, min(1, -(ax * dx + ay * dy) / lengthSquared))
    return (fraction, hypot(ax + fraction * dx, ay + fraction * dy))
}

private func routeLength(_ geometry: [Coordinate]) -> Double {
    zip(geometry, geometry.dropFirst()).compactMap { distance(from: $0.0, to: $0.1) }.reduce(0, +)
}

private func closestProjection(of point: Coordinate, on geometry: [Coordinate]) -> SegmentProjection? {
    var best: SegmentProjection?
    var precedingM = 0.0
    for (start, end) in zip(geometry, geometry.dropFirst()) {
        guard let segmentLength = distance(from: start, to: end), segmentLength > 0,
              let candidate = project(point, toSegmentFrom: start, to: end) else { return nil }
        let projection = SegmentProjection(
            deviationM: candidate.deviationM,
            progressM: precedingM + candidate.fraction * segmentLength
        )
        if let existing = best {
            if projection.deviationM < existing.deviationM ||
                (projection.deviationM == existing.deviationM && projection.progressM > existing.progressM) {
                best = projection
            }
        } else {
            best = projection
        }
        precedingM += segmentLength
    }
    return best
}

private func coordinate(at progressM: Double, on geometry: [Coordinate]) -> Coordinate? {
    var precedingM = 0.0
    let segments = Array(zip(geometry, geometry.dropFirst()))
    for (index, segment) in segments.enumerated() {
        guard let length = distance(from: segment.0, to: segment.1), length > 0 else { return nil }
        if progressM <= precedingM + length || index == segments.count - 1 {
            let fraction = max(0, min(1, (progressM - precedingM) / length))
            return Coordinate(
                latitude: segment.0.latitude + (segment.1.latitude - segment.0.latitude) * fraction,
                longitude: segment.0.longitude + (segment.1.longitude - segment.0.longitude) * fraction
            )
        }
        precedingM += length
    }
    return nil
}
