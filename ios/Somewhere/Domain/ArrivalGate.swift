import Foundation

struct ArrivalSample: Equatable, Sendable {
    let endpointDistanceM: Double
    let accuracyM: Double
    let finalCorridorDeviationM: Double
    let capturedAt: Date
    let routeIsFresh: Bool
    let progressIsCredible: Bool
}

struct ArrivalGate: Equatable, Sendable {
    private(set) var arrived = false
    private(set) var qualifyingTimes: [Date] = []

    mutating func advance(sample: ArrivalSample) -> Bool {
        if arrived { return true }
        guard qualifies(sample) else {
            qualifyingTimes = []
            return false
        }

        let earliest = sample.capturedAt.addingTimeInterval(-Double(NavigationPolicy.arrivalSampleWindowMs) / 1000)
        qualifyingTimes = qualifyingTimes.filter { $0 >= earliest && $0 <= sample.capturedAt }
        qualifyingTimes.append(sample.capturedAt)
        let evidence = Array(qualifyingTimes.suffix(NavigationPolicy.arrivalConsecutiveSamples))
        if let first = evidence.first,
           evidence.count == NavigationPolicy.arrivalConsecutiveSamples,
           sample.capturedAt.timeIntervalSince(first) * 1000 >= Double(NavigationPolicy.arrivalMinimumDwellMs) {
            arrived = true
        }
        return arrived
    }

    private func qualifies(_ sample: ArrivalSample) -> Bool {
        sample.endpointDistanceM.isFinite && sample.endpointDistanceM >= 0 &&
            sample.endpointDistanceM <= Double(NavigationPolicy.arrivalEndpointM) &&
            sample.accuracyM.isFinite && sample.accuracyM >= 0 &&
            sample.accuracyM <= Double(NavigationPolicy.maxArrivalAccuracyM) &&
            sample.finalCorridorDeviationM.isFinite && sample.finalCorridorDeviationM >= 0 &&
            sample.finalCorridorDeviationM <= Double(NavigationPolicy.finalCorridorMaxDeviationM) &&
            sample.routeIsFresh && sample.progressIsCredible
    }
}
