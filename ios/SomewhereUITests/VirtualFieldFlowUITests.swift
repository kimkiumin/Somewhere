import CoreLocation
import XCTest

@MainActor
final class VirtualFieldFlowUITests: XCTestCase {
    private let origin = CLLocationCoordinate2D(latitude: 37.54385, longitude: 127.03695)
    private let routeMidpoint = CLLocationCoordinate2D(latitude: 37.54292, longitude: 127.046)
    private let routeEndpoint = CLLocationCoordinate2D(latitude: 37.542915, longitude: 127.05467)

    func testRestaurantRouteReplayArrivesAndRevealsAutomatically() throws {
        let environment = ProcessInfo.processInfo.environment
        guard environment["SOMEWHERE_RUN_LOCAL_E2E"] == "1" ||
            environment["TEST_RUNNER_SOMEWHERE_RUN_LOCAL_E2E"] == "1" else {
            throw XCTSkip("requires the local Worker/proxy and SOMEWHERE_RUN_LOCAL_E2E=1")
        }

        setSimulatedLocation(origin)
        let app = XCUIApplication()
        app.launchArguments = [
            "--simulator-heading-from-course",
            "--ui-test-no-notifications",
            "--ui-test-reset-preferences"
        ]
        app.launch()

        XCTAssertTrue(app.buttons["somewhere.start-journey"].waitForExistence(timeout: 10))
        app.buttons["somewhere.start-journey"].tap()

        XCTAssertTrue(app.buttons["somewhere.stop"].waitForExistence(timeout: 20))
        XCTAssertFalse(app.staticTexts["somewhere.revealed-name"].exists)

        // Keep each location jump below the production 100 m progress-jump gate.
        for point in routeSamples(stepM: 55) {
            setSimulatedLocation(point)
            Thread.sleep(forTimeInterval: 1)
        }

        // The production arrival gate needs four credible samples over at least 12 s.
        for distanceFromEndpoint in [24.0, 15.0, 7.0, 2.0] {
            setSimulatedLocation(pointOnFinalSegment(distanceFromEndpoint: distanceFromEndpoint))
            Thread.sleep(forTimeInterval: 4)
        }

        XCTAssertTrue(app.staticTexts["somewhere.revealed-name"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["somewhere.arrival-reveal"].exists)
        XCTAssertFalse(app.staticTexts["somewhere.revealed-address"].exists)
    }

    func testOffRouteSuppressesGuidanceThenRecovers() throws {
        let environment = ProcessInfo.processInfo.environment
        guard environment["SOMEWHERE_RUN_LOCAL_E2E"] == "1" ||
            environment["TEST_RUNNER_SOMEWHERE_RUN_LOCAL_E2E"] == "1" else {
            throw XCTSkip("requires the local Worker/proxy and SOMEWHERE_RUN_LOCAL_E2E=1")
        }

        setSimulatedLocation(origin)
        let app = XCUIApplication()
        app.launchArguments = [
            "--simulator-heading-from-course",
            "--ui-test-no-notifications",
            "--ui-test-reset-preferences"
        ]
        app.launch()

        XCTAssertTrue(app.buttons["somewhere.start-journey"].waitForExistence(timeout: 10))
        app.buttons["somewhere.start-journey"].tap()
        XCTAssertTrue(app.buttons["somewhere.stop"].waitForExistence(timeout: 20))

        for point in segmentSamples(from: origin, to: routeMidpoint, stepM: 55) {
            setSimulatedLocation(point)
            Thread.sleep(forTimeInterval: 1)
        }
        setSimulatedLocation(offRoutePoint)
        Thread.sleep(forTimeInterval: 2)
        let offRouteTitle = app.staticTexts.matching(
            NSPredicate(format: "label == %@", "경로에서 벗어났어요")
        ).firstMatch
        let recoveringTitle = app.staticTexts.matching(
            NSPredicate(format: "label == %@", "경로를 다시 맞추는 중")
        ).firstMatch
        XCTAssertTrue(offRouteTitle.waitForExistence(timeout: 5) || recoveringTitle.exists)

        // Re-entering the corridor first arms recovery; the next fresh sample restores precision.
        setSimulatedLocation(routeMidpoint)
        Thread.sleep(forTimeInterval: 2)
        setSimulatedLocation(pointAlongFinalSegment(distanceFromStart: 55))
        Thread.sleep(forTimeInterval: 2)
        let guidanceCompass = app.otherElements["somewhere.guidance-compass"]
        XCTAssertTrue(guidanceCompass.waitForExistence(timeout: 5))
        XCTAssertTrue(guidanceCompass.label.hasPrefix("진행 방향"))
    }

    private func setSimulatedLocation(_ coordinate: CLLocationCoordinate2D) {
        XCUIDevice.shared.location = XCUILocation(
            location: CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
        )
    }

    private func routeSamples(stepM: Double) -> [CLLocationCoordinate2D] {
        let segments = [(origin, routeMidpoint), (routeMidpoint, routeEndpoint)]
        var samples: [CLLocationCoordinate2D] = []
        for (segmentIndex, segment) in segments.enumerated() {
            samples.append(contentsOf: segmentSamples(
                from: segment.0,
                to: segment.1,
                stepM: stepM,
                includeEndpoint: segmentIndex != segments.count - 1
            ))
        }
        return samples
    }

    private func segmentSamples(
        from start: CLLocationCoordinate2D,
        to end: CLLocationCoordinate2D,
        stepM: Double,
        includeEndpoint: Bool = true
    ) -> [CLLocationCoordinate2D] {
        let startLocation = CLLocation(latitude: start.latitude, longitude: start.longitude)
        let endLocation = CLLocation(latitude: end.latitude, longitude: end.longitude)
        let count = max(1, Int(ceil(startLocation.distance(from: endLocation) / stepM)))
        return (1...count).compactMap { index in
            if !includeEndpoint, index == count { return nil }
            let fraction = min(1, Double(index) / Double(count))
            return CLLocationCoordinate2D(
                latitude: start.latitude + (end.latitude - start.latitude) * fraction,
                longitude: start.longitude + (end.longitude - start.longitude) * fraction
            )
        }
    }

    private func pointOnFinalSegment(distanceFromEndpoint: Double) -> CLLocationCoordinate2D {
        let start = CLLocation(latitude: routeMidpoint.latitude, longitude: routeMidpoint.longitude)
        let end = CLLocation(latitude: routeEndpoint.latitude, longitude: routeEndpoint.longitude)
        let segmentDistance = start.distance(from: end)
        let fraction = max(0, min(1, 1 - distanceFromEndpoint / segmentDistance))
        return CLLocationCoordinate2D(
            latitude: routeMidpoint.latitude + (routeEndpoint.latitude - routeMidpoint.latitude) * fraction,
            longitude: routeMidpoint.longitude + (routeEndpoint.longitude - routeMidpoint.longitude) * fraction
        )
    }

    private func pointAlongFinalSegment(distanceFromStart: Double) -> CLLocationCoordinate2D {
        let start = CLLocation(latitude: routeMidpoint.latitude, longitude: routeMidpoint.longitude)
        let end = CLLocation(latitude: routeEndpoint.latitude, longitude: routeEndpoint.longitude)
        return pointOnFinalSegment(distanceFromEndpoint: start.distance(from: end) - distanceFromStart)
    }

    private var offRoutePoint: CLLocationCoordinate2D {
        CLLocationCoordinate2D(
            latitude: routeMidpoint.latitude + 0.0011,
            longitude: routeMidpoint.longitude
        )
    }
}
