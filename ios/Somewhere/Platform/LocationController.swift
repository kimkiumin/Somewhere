import Combine
import CoreLocation
import Foundation

@MainActor
final class LocationController: NSObject, ObservableObject, @preconcurrency CLLocationManagerDelegate {
    @Published private(set) var location: LocationSample?
    @Published private(set) var heading: HeadingSample?
    @Published private(set) var authorizationStatus: CLAuthorizationStatus
    @Published private(set) var authorizationDenied = false
    @Published private(set) var requiresFreshSamples = true

    private let manager = CLLocationManager()

#if DEBUG
    private var previousSimulatedCoordinate: Coordinate?
    private var physicalFieldReplayTask: Task<Void, Never>?
#endif

    override init() {
        authorizationStatus = .notDetermined
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.headingFilter = 2
        authorizationStatus = manager.authorizationStatus
#if DEBUG
        if PhysicalFieldRouteReplay.enabled {
            location = PhysicalFieldRouteReplay.initialSample
            heading = PhysicalFieldRouteReplay.initialHeading
            requiresFreshSamples = false
        }
#endif
    }

    var authorizationGranted: Bool {
        authorizationStatus == .authorizedWhenInUse || authorizationStatus == .authorizedAlways
    }

    func requestPermissionInContext() {
        authorizationStatus = manager.authorizationStatus
#if DEBUG
        if PhysicalFieldRouteReplay.enabled {
            if location == nil {
                location = PhysicalFieldRouteReplay.initialSample
                heading = PhysicalFieldRouteReplay.initialHeading
                requiresFreshSamples = false
            }
            if manager.authorizationStatus == .notDetermined { manager.requestWhenInUseAuthorization() }
            return
        }
#endif
        if manager.authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
        } else if manager.authorizationStatus == .authorizedWhenInUse || manager.authorizationStatus == .authorizedAlways {
            manager.startUpdatingLocation()
        }
    }

    func apply(phase: JourneyPhase) {
#if DEBUG
        if PhysicalFieldRouteReplay.enabled {
            switch phase {
            case .following, .near:
                startPhysicalFieldReplay()
            case .arrived, .stopped, .completed, .expired:
                stopPhysicalFieldReplay()
                location = nil
                heading = nil
                requiresFreshSamples = true
                previousSimulatedCoordinate = nil
            default:
                break
            }
            return
        }
#endif
        switch phase {
        case .committed, .following, .routeRecovery, .near, .paused:
            if manager.authorizationStatus == .notDetermined { manager.requestWhenInUseAuthorization() }
            manager.startUpdatingLocation()
            if CLLocationManager.headingAvailable() { manager.startUpdatingHeading() }
        case .arrived, .stopped, .completed, .expired:
            manager.stopUpdatingLocation()
            manager.stopUpdatingHeading()
            location = nil
            heading = nil
            requiresFreshSamples = true
#if DEBUG
            previousSimulatedCoordinate = nil
#endif
        default:
            break
        }
    }

    func applicationDidEnterBackground() {
#if DEBUG
        stopPhysicalFieldReplay()
#endif
        manager.stopUpdatingLocation()
        manager.stopUpdatingHeading()
        location = nil
        heading = nil
        requiresFreshSamples = true
#if DEBUG
        previousSimulatedCoordinate = nil
#endif
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        authorizationStatus = manager.authorizationStatus
        authorizationDenied = manager.authorizationStatus == .denied || manager.authorizationStatus == .restricted
        if manager.authorizationStatus == .authorizedWhenInUse || manager.authorizationStatus == .authorizedAlways {
#if DEBUG
            if PhysicalFieldRouteReplay.enabled { return }
#endif
            manager.startUpdatingLocation()
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
#if DEBUG
        if PhysicalFieldRouteReplay.enabled { return }
#endif
        guard let value = locations.last, value.horizontalAccuracy >= 0 else { return }
        let coordinate = Coordinate(latitude: value.coordinate.latitude, longitude: value.coordinate.longitude)
        location = LocationSample(
            coordinate: coordinate,
            horizontalAccuracyM: value.horizontalAccuracy,
            capturedAt: value.timestamp
        )
#if DEBUG
        if SimulatorHeadingReplay.enabled,
           let previous = previousSimulatedCoordinate,
           let degrees = SimulatorHeadingReplay.bearing(from: previous, to: coordinate) {
            heading = HeadingSample(
                trueHeadingDegrees: degrees,
                magneticHeadingDegrees: degrees,
                magneticDeclinationDegreesEast: 0,
                accuracyDegrees: 0,
                capturedAt: value.timestamp
            )
        }
        previousSimulatedCoordinate = coordinate
#endif
        clearFreshRequirementIfReady()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateHeading value: CLHeading) {
#if DEBUG
        if PhysicalFieldRouteReplay.enabled { return }
#endif
        if value.headingAccuracy < 0 {
            heading = nil
            return
        }
        let trueHeading = value.trueHeading >= 0 ? value.trueHeading : nil
        let declination = trueHeading.map {
            CompassAngles.signedDelta(from: value.magneticHeading, to: $0)
        }
        heading = HeadingSample(
            trueHeadingDegrees: trueHeading,
            magneticHeadingDegrees: value.magneticHeading,
            magneticDeclinationDegreesEast: declination,
            accuracyDegrees: value.headingAccuracy,
            capturedAt: value.timestamp
        )
        clearFreshRequirementIfReady()
    }

#if DEBUG
    func injectForTesting(location: LocationSample, heading: HeadingSample? = nil) {
        self.location = location
        self.heading = heading
        requiresFreshSamples = heading == nil
    }
#endif

    private func clearFreshRequirementIfReady() {
        if location != nil && heading != nil { requiresFreshSamples = false }
    }

#if DEBUG
    private func startPhysicalFieldReplay() {
        guard physicalFieldReplayTask == nil else { return }
        physicalFieldReplayTask = Task { @MainActor [weak self] in
            guard let self else { return }
            var previous = PhysicalFieldRouteReplay.origin
            for coordinate in PhysicalFieldRouteReplay.coordinates {
                guard !Task.isCancelled else { return }
                let now = Date()
                let direction = SimulatorHeadingReplay.bearing(from: previous, to: coordinate)
                    ?? PhysicalFieldRouteReplay.initialHeading.magneticHeadingDegrees
                location = LocationSample(coordinate: coordinate, horizontalAccuracyM: 5, capturedAt: now)
                heading = HeadingSample(
                    trueHeadingDegrees: direction,
                    magneticHeadingDegrees: direction,
                    magneticDeclinationDegreesEast: 0,
                    accuracyDegrees: 0,
                    capturedAt: now
                )
                requiresFreshSamples = false
                previous = coordinate
                try? await Task.sleep(nanoseconds: 1_000_000_000)
            }
            while !Task.isCancelled {
                let now = Date()
                let direction = PhysicalFieldRouteReplay.initialHeading.magneticHeadingDegrees
                location = LocationSample(
                    coordinate: PhysicalFieldRouteReplay.coordinates.last ?? PhysicalFieldRouteReplay.origin,
                    horizontalAccuracyM: 5,
                    capturedAt: now
                )
                heading = HeadingSample(
                    trueHeadingDegrees: direction,
                    magneticHeadingDegrees: direction,
                    magneticDeclinationDegreesEast: 0,
                    accuracyDegrees: 0,
                    capturedAt: now
                )
                requiresFreshSamples = false
                try? await Task.sleep(nanoseconds: 1_000_000_000)
            }
        }
    }

    private func stopPhysicalFieldReplay() {
        physicalFieldReplayTask?.cancel()
        physicalFieldReplayTask = nil
    }
#endif
}
