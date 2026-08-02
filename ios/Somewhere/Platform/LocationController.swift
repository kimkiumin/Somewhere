import Combine
import CoreLocation
import Foundation

@MainActor
final class LocationController: NSObject, ObservableObject, @preconcurrency CLLocationManagerDelegate {
    @Published private(set) var location: LocationSample?
    @Published private(set) var heading: HeadingSample?
    @Published private(set) var authorizationDenied = false
    @Published private(set) var requiresFreshSamples = true

    private let manager = CLLocationManager()

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.headingFilter = 2
    }

    func requestPermissionInContext() {
        if manager.authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
        } else if manager.authorizationStatus == .authorizedWhenInUse || manager.authorizationStatus == .authorizedAlways {
            manager.startUpdatingLocation()
        }
    }

    func apply(phase: JourneyPhase) {
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
        default:
            break
        }
    }

    func applicationDidEnterBackground() {
        manager.stopUpdatingLocation()
        manager.stopUpdatingHeading()
        location = nil
        heading = nil
        requiresFreshSamples = true
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        authorizationDenied = manager.authorizationStatus == .denied || manager.authorizationStatus == .restricted
        if manager.authorizationStatus == .authorizedWhenInUse || manager.authorizationStatus == .authorizedAlways {
            manager.startUpdatingLocation()
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let value = locations.last, value.horizontalAccuracy >= 0 else { return }
        location = LocationSample(
            coordinate: Coordinate(latitude: value.coordinate.latitude, longitude: value.coordinate.longitude),
            horizontalAccuracyM: value.horizontalAccuracy,
            capturedAt: value.timestamp
        )
        clearFreshRequirementIfReady()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateHeading value: CLHeading) {
        if value.headingAccuracy < 0 {
            heading = nil
            return
        }
        heading = HeadingSample(
            trueHeadingDegrees: value.trueHeading >= 0 ? value.trueHeading : nil,
            magneticHeadingDegrees: value.magneticHeading,
            magneticDeclinationDegreesEast: nil,
            accuracyDegrees: value.headingAccuracy,
            capturedAt: value.timestamp
        )
        clearFreshRequirementIfReady()
    }

    private func clearFreshRequirementIfReady() {
        if location != nil && heading != nil { requiresFreshSamples = false }
    }
}
