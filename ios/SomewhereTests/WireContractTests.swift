import XCTest
@testable import Somewhere

final class WireContractTests: XCTestCase {
    func testCanonicalProjectionExamplesDecodeAndValidate() throws {
        let fixture = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "Fixtures/projection-examples-v1.json")
        let data = try Data(contentsOf: fixture)
        let projections = try JSONDecoder().decode([JourneyProjection].self, from: data)
        XCTAssertEqual(projections.count, 21)
        XCTAssertEqual(projections.first?.phase, .finding)
        XCTAssertEqual(projections.last?.phase, .expired)
    }

    func testUnrevealedArrivalProjectionIsRejected() throws {
        let json = #"{"contractVersion":1,"journeyId":"j_v1.AAAAAAAAAAAAAAAAAAAAAA","sequence":1,"disclosure":{"routeDistanceM":700,"routeDurationMinutes":10,"representativeCategories":["한식 국물 요리"],"priceBand":"medium","policyVersion":"policy-v1"},"phase":"arrived","revealed":false,"feedbackDueAt":1000,"actions":["reveal"]}"#
        XCTAssertThrowsError(try JSONDecoder().decode(JourneyProjection.self, from: Data(json.utf8)))
    }

    func testEndpointCatalogIsCompleteAndUniqueByMethodAndPath() {
        XCTAssertEqual(WireContractV1.endpoints.count, 17)
        XCTAssertEqual(Set(WireContractV1.endpoints.map { "\($0.method) \($0.path)" }).count, 17)
    }
}
