import Foundation

enum APIClientError: Error, Equatable, Sendable {
    case invalidOrigin
    case invalidEndpoint
    case requestEncoding
    case transport
    case invalidResponse
    case contract(status: Int, code: String, requestId: String, retryable: Bool, retryAfterSeconds: Int?)
}

protocol APIClientProtocol: Sendable {
    func request<Response: Decodable & Sendable, Body: Encodable & Sendable>(
        endpoint: APIEndpoint,
        pathParameters: [String: String],
        body: Body?,
        expectedSequence: Int?,
        idempotencyKey: String?
    ) async throws -> Response
}

actor APIClient: APIClientProtocol {
    private let baseURL: URL
    private let canonicalOrigin: String
    private let session: URLSession
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    private var csrfToken: String?
    private var recoveryCapability: String?

    init(origin: URL) throws {
        guard let scheme = origin.scheme,
              let host = origin.host,
              (scheme == "https" || (scheme == "http" && host == "127.0.0.1")),
              origin.user == nil,
              origin.password == nil,
              origin.query == nil,
              origin.fragment == nil,
              origin.path.isEmpty || origin.path == "/" else {
            throw APIClientError.invalidOrigin
        }
        canonicalOrigin = origin.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        baseURL = origin.appending(path: "api/v1/")
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieAcceptPolicy = .always
        configuration.httpShouldSetCookies = true
        configuration.urlCredentialStorage = nil
        session = URLSession(configuration: configuration)
    }

    func setCSRFToken(_ value: String?) { csrfToken = value }
    func setRecoveryCapability(_ value: String?) { recoveryCapability = value }
    func takeRecoveryCapability() -> String? {
        defer { recoveryCapability = nil }
        return recoveryCapability
    }

    func request<Response: Decodable & Sendable, Body: Encodable & Sendable>(
        endpoint: APIEndpoint,
        pathParameters: [String: String] = [:],
        body: Body? = nil,
        expectedSequence: Int? = nil,
        idempotencyKey: String? = nil
    ) async throws -> Response {
        guard WireContractV1.endpoints.contains(endpoint) else { throw APIClientError.invalidEndpoint }
        var path = endpoint.path
        for (key, value) in pathParameters {
            guard value.range(of: #"^[A-Za-z0-9._-]+$"#, options: .regularExpression) != nil else {
                throw APIClientError.invalidEndpoint
            }
            path = path.replacingOccurrences(of: ":\(key)", with: value)
        }
        guard !path.contains(":"),
              let url = URL(string: path.dropFirst().description, relativeTo: baseURL)?.absoluteURL,
              url.scheme == baseURL.scheme,
              url.host == baseURL.host,
              url.port == baseURL.port else {
            throw APIClientError.invalidEndpoint
        }

        var request = URLRequest(url: url)
        request.httpMethod = endpoint.method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        request.setValue(canonicalOrigin, forHTTPHeaderField: "Origin")
        if let csrfToken { request.setValue(csrfToken, forHTTPHeaderField: "x-csrf-token") }
        if let expectedSequence { request.setValue(String(expectedSequence), forHTTPHeaderField: "x-expected-sequence") }
        if let idempotencyKey { request.setValue(idempotencyKey, forHTTPHeaderField: "Idempotency-Key") }
        if endpoint.method != "GET" {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if let body {
            guard let encoded = try? encoder.encode(body), encoded.count <= endpoint.bodyLimitBytes else {
                throw APIClientError.requestEncoding
            }
            request.httpBody = encoded
        }

        let data: Data
        let response: URLResponse
        do { (data, response) = try await session.data(for: request) }
        catch { throw APIClientError.transport }
        guard let http = response as? HTTPURLResponse,
              endpoint.statuses.contains(http.statusCode) else { throw APIClientError.invalidResponse }
        if (200..<300).contains(http.statusCode) {
            do { return try decoder.decode(Response.self, from: data) }
            catch { throw APIClientError.invalidResponse }
        }
        guard let envelope = try? decoder.decode(PublicErrorEnvelope.self, from: data),
              envelope.contractVersion == 1 else { throw APIClientError.invalidResponse }
        throw APIClientError.contract(
            status: http.statusCode,
            code: envelope.error.code,
            requestId: envelope.error.requestId,
            retryable: envelope.error.retryable,
            retryAfterSeconds: envelope.error.retryAfterSeconds
        )
    }
}
