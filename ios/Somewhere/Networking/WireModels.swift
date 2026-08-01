import Foundation

struct APIEndpoint: Equatable, Sendable {
    let method: String
    let path: String
    let statuses: [Int]
    let bodyLimitBytes: Int
}

enum WireContractV1 {
    static let endpoints: [APIEndpoint] = [
        APIEndpoint(method: "GET", path: "/health", statuses: [200, 429, 503], bodyLimitBytes: 0),
        APIEndpoint(method: "GET", path: "/session", statuses: [200, 429, 503], bodyLimitBytes: 0),
        APIEndpoint(method: "POST", path: "/journeys", statuses: [201, 202, 400, 401, 403, 409, 413, 415, 422, 429, 503], bodyLimitBytes: 4096),
        APIEndpoint(method: "GET", path: "/journeys/:journeyId", statuses: [200, 401, 404, 410, 429, 503], bodyLimitBytes: 0),
        APIEndpoint(method: "DELETE", path: "/journeys/:journeyId", statuses: [204, 400, 401, 403, 404, 409, 410, 415, 503], bodyLimitBytes: 0),
        APIEndpoint(method: "POST", path: "/journeys/:journeyId/commit", statuses: [200, 400, 401, 403, 404, 409, 410, 413, 415, 422, 503], bodyLimitBytes: 1024),
        APIEndpoint(method: "POST", path: "/journeys/:journeyId/reveal", statuses: [200, 400, 401, 403, 404, 409, 410, 413, 415, 503], bodyLimitBytes: 1024),
        APIEndpoint(method: "POST", path: "/journeys/:journeyId/stop/request", statuses: [200, 400, 401, 403, 404, 409, 410, 413, 415, 503], bodyLimitBytes: 1024),
        APIEndpoint(method: "POST", path: "/journeys/:journeyId/stop/cancel", statuses: [200, 400, 401, 403, 404, 409, 410, 413, 415, 503], bodyLimitBytes: 1024),
        APIEndpoint(method: "POST", path: "/journeys/:journeyId/stop/confirm", statuses: [200, 400, 401, 403, 404, 409, 410, 413, 415, 503], bodyLimitBytes: 1024),
        APIEndpoint(method: "POST", path: "/journeys/:journeyId/stop/reason", statuses: [200, 400, 401, 403, 404, 409, 410, 413, 415, 422, 503], bodyLimitBytes: 1024),
        APIEndpoint(method: "POST", path: "/journeys/:journeyId/route/recover", statuses: [200, 400, 401, 403, 404, 409, 410, 413, 415, 429, 503], bodyLimitBytes: 2048),
        APIEndpoint(method: "POST", path: "/journeys/:journeyId/arrival", statuses: [200, 400, 401, 403, 404, 409, 410, 413, 415, 422, 429, 503], bodyLimitBytes: 2048),
        APIEndpoint(method: "POST", path: "/journeys/:journeyId/recovery", statuses: [201, 400, 401, 403, 404, 409, 410, 413, 415, 422, 429, 503], bodyLimitBytes: 1024),
        APIEndpoint(method: "POST", path: "/journeys/:journeyId/recovery/confirm", statuses: [201, 400, 401, 403, 404, 409, 410, 413, 415, 422, 429, 503], bodyLimitBytes: 1024),
        APIEndpoint(method: "GET", path: "/feedback/eligible", statuses: [200, 204, 404, 410, 429, 503], bodyLimitBytes: 0),
        APIEndpoint(method: "POST", path: "/feedback/:feedbackId/reaction", statuses: [200, 400, 403, 404, 409, 410, 413, 415, 429, 503], bodyLimitBytes: 1024),
    ]
}

struct PublicErrorEnvelope: Decodable, Sendable {
    struct Payload: Decodable, Sendable {
        let code: String
        let message: String
        let requestId: String
        let retryable: Bool
        let retryAfterSeconds: Int?
    }
    let contractVersion: Int
    let error: Payload
}

struct EmptyRequestBody: Encodable, Sendable {}
