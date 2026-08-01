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
        XCTAssertEqual(projections.count, 22)
        XCTAssertEqual(projections.first?.phase, .finding)
        XCTAssertEqual(projections.last?.phase, .expired)
    }

    func testEndpointCatalogIsCompleteAndUniqueByMethodAndPath() {
        XCTAssertEqual(WireContractV1.endpoints.count, 17)
        XCTAssertEqual(Set(WireContractV1.endpoints.map { "\($0.method) \($0.path)" }).count, 17)
    }
}
