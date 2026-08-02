import Foundation

enum NavigationPolicy {
    static let schemaVersion = 1
    static let policyVersion = "navigation-v2-calibration-1"
    static let status = "calibration-only"
    static let routeCorridorEnterM = 35
    static let routeCorridorExitM = 55
    static let finalCorridorMaxDeviationM = 25
    static let forwardTargetLookaheadM = 25
    static let maxGuidanceAccuracyM = 35
    static let maxMeasuredHeadingAccuracyDeg = 25
    static let nearEnterM = 120
    static let nearExitM = 150
    static let arrivalEndpointM = 30
    static let maxArrivalAccuracyM = 25
    static let arrivalConsecutiveSamples = 4
    static let arrivalMinimumDwellMs = 12000
    static let arrivalSampleWindowMs = 20000
    static let locationMaxAgeMs = 10000
    static let headingMaxAgeMs = 10000
    static let routeRevalidateAfterMs = 300000
    static let routeAbsoluteMaxAgeMs = 1800000
    static let maxBackwardProgressJumpM = 25
    static let maxForwardProgressJumpM = 100
    static let postVisibilityRequiresNewLocation = true
    static let postVisibilityRequiresNewHeading = true
    static let arrivedIsLatched = true
}
