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

    func eligibleFeedback(capability: String) async throws -> FeedbackPromptResponse? {
        let endpoint = try feedbackEndpoint(method: "GET", path: "/feedback/eligible")
        let (data, status) = try await feedbackRequest(
            endpoint: endpoint,
            path: "feedback/eligible",
            capability: capability,
            body: nil,
            idempotencyKey: nil
        )
        if status == 204 { return nil }
        guard status == 200 else { throw decodeContractError(data: data, status: status) }
        guard let value = try? decoder.decode(FeedbackPromptResponse.self, from: data), value.contractVersion == 1 else {
            throw APIClientError.invalidResponse
        }
        return value
    }

    func recordReaction(capability: String, feedbackId: String, reaction: String, idempotencyKey: String) async throws {
        guard feedbackId.range(of: #"^fid_v1\.[A-Za-z0-9_-]{22}$"#, options: .regularExpression) != nil,
              ["dislike", "like", "love", "did_not_visit"].contains(reaction) else {
            throw APIClientError.invalidEndpoint
        }
        let endpoint = try feedbackEndpoint(method: "POST", path: "/feedback/:feedbackId/reaction")
        let body = try encoder.encode(ReactionRequest(contractVersion: 1, reaction: reaction))
        let (data, status) = try await feedbackRequest(
            endpoint: endpoint,
            path: "feedback/\(feedbackId)/reaction",
            capability: capability,
            body: body,
            idempotencyKey: idempotencyKey
        )
        guard status == 200 else { throw decodeContractError(data: data, status: status) }
        guard let value = try? decoder.decode(ReactionRecordedResponse.self, from: data),
              value.contractVersion == 1, value.feedbackId == feedbackId, value.recorded else {
            throw APIClientError.invalidResponse
        }
    }

    func deleteJourney(endpoint: APIEndpoint, journeyId: String, expectedSequence: Int, idempotencyKey: String) async throws {
        guard WireContractV1.endpoints.contains(endpoint), endpoint.method == "DELETE",
              journeyId.range(of: #"^[A-Za-z0-9._-]+$"#, options: .regularExpression) != nil else {
            throw APIClientError.invalidEndpoint
        }
        let path = endpoint.path.replacingOccurrences(of: ":journeyId", with: journeyId)
        guard let url = URL(string: path.dropFirst().description, relativeTo: baseURL)?.absoluteURL,
              url.scheme == baseURL.scheme, url.host == baseURL.host, url.port == baseURL.port else {
            throw APIClientError.invalidEndpoint
        }
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        request.setValue(canonicalOrigin, forHTTPHeaderField: "Origin")
        if let csrfToken { request.setValue(csrfToken, forHTTPHeaderField: "x-csrf-token") }
        request.setValue(String(expectedSequence), forHTTPHeaderField: "x-expected-sequence")
        request.setValue(idempotencyKey, forHTTPHeaderField: "Idempotency-Key")
        let result: (Data, URLResponse)
        do { result = try await session.data(for: request) }
        catch { throw APIClientError.transport }
        guard let response = result.1 as? HTTPURLResponse,
              endpoint.statuses.contains(response.statusCode) else { throw APIClientError.invalidResponse }
        if response.statusCode == 204 { return }
        throw decodeContractError(data: result.0, status: response.statusCode)
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

    private struct ReactionRequest: Encodable { let contractVersion: Int; let reaction: String }

    private func feedbackEndpoint(method: String, path: String) throws -> APIEndpoint {
        guard let value = WireContractV1.endpoints.first(where: { $0.method == method && $0.path == path }) else {
            throw APIClientError.invalidEndpoint
        }
        return value
    }

    private func feedbackRequest(
        endpoint: APIEndpoint,
        path: String,
        capability: String,
        body: Data?,
        idempotencyKey: String?
    ) async throws -> (Data, Int) {
        guard capability.range(of: #"^fb_v1\.[A-Za-z0-9_-]{43}$"#, options: .regularExpression) != nil,
              let url = URL(string: path, relativeTo: baseURL)?.absoluteURL,
              url.scheme == baseURL.scheme, url.host == baseURL.host, url.port == baseURL.port,
              (body?.count ?? 0) <= endpoint.bodyLimitBytes else { throw APIClientError.invalidEndpoint }
        var request = URLRequest(url: url)
        request.httpMethod = endpoint.method
        request.httpShouldHandleCookies = false
        request.setValue("Feedback \(capability)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        request.setValue(canonicalOrigin, forHTTPHeaderField: "Origin")
        if let idempotencyKey { request.setValue(idempotencyKey, forHTTPHeaderField: "Idempotency-Key") }
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let result: (Data, URLResponse)
        do { result = try await session.data(for: request) }
        catch { throw APIClientError.transport }
        guard let response = result.1 as? HTTPURLResponse,
              endpoint.statuses.contains(response.statusCode) else { throw APIClientError.invalidResponse }
        return (result.0, response.statusCode)
    }

    private func decodeContractError(data: Data, status: Int) -> APIClientError {
        guard let envelope = try? decoder.decode(PublicErrorEnvelope.self, from: data), envelope.contractVersion == 1 else {
            return .invalidResponse
        }
        return .contract(
            status: status,
            code: envelope.error.code,
            requestId: envelope.error.requestId,
            retryable: envelope.error.retryable,
            retryAfterSeconds: envelope.error.retryAfterSeconds
        )
    }
}
