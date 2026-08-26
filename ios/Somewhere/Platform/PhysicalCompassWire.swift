import Foundation

enum PhysicalCompassBLE {
    static let contractVersion = 1
    static let maxFrameBytes = 512
    static let maxDisplayBytes = 40
    static let serviceUUID = "C1F8A100-35D1-4C53-9A03-7A1B3E620001"
    static let stateCharacteristicUUID = "C1F8A101-35D1-4C53-9A03-7A1B3E620001"
    static let eventCharacteristicUUID = "C1F8A102-35D1-4C53-9A03-7A1B3E620001"
    static let advertisedName = "Roll Compass"
}

enum PhysicalCompassHostPersistence {
    private static let enabledKey = "somewhere.physical-compass.host-enabled.v1"

    static func load(defaults: UserDefaults = .standard) -> Bool {
        defaults.bool(forKey: enabledKey)
    }

    static func save(_ enabled: Bool, defaults: UserDefaults = .standard) {
        defaults.set(enabled, forKey: enabledKey)
    }
}

enum PhysicalCompassConnectionState: Equatable, Sendable {
    case disabled
    case unavailable
    case disconnected
    case scanning
    case connecting
    case stale
    case connected
}

enum PhysicalCompassAction: String, Codable, CaseIterable, Hashable, Sendable {
    case stop
    case `continue`
    case confirmStop = "confirm-stop"
    case reveal
}

enum PhysicalCompassEvent: Equatable, Sendable {
    case action(PhysicalCompassAction, sequence: Int)
}

@MainActor
protocol PhysicalCompassClient: AnyObject {
    var onConnectionState: ((PhysicalCompassConnectionState) -> Void)? { get set }
    var onEvent: ((PhysicalCompassEvent) -> Void)? { get set }
    var onSnapshotSent: ((Int) -> Void)? { get set }

    func start()
    func stop()
    func send(_ snapshot: PhysicalCompassSnapshot)
}

struct PhysicalCompassSnapshot: Equatable, Sendable {
    let sequence: Int
    let phase: String
    let remainingDistanceM: Double?
    let bearingDegrees: Double?
    let confidence: String
    let menus: [String]
    let priceBand: String?
    let actions: [PhysicalCompassAction]
    let revealed: Bool
    let timestampMs: Int64

    init(
        sequence: Int,
        phase: String,
        remainingDistanceM: Double?,
        bearingDegrees: Double?,
        confidence: String,
        menus: [String],
        priceBand: String?,
        actions: [PhysicalCompassAction],
        revealed: Bool,
        timestampMs: Int64
    ) throws {
        guard sequence > 0 else { throw PhysicalCompassWireError.invalidSequence }
        guard PhysicalCompassWire.isValidDisplayText(phase) else {
            throw PhysicalCompassWireError.invalidPayload
        }
        guard PhysicalCompassWire.isValidDisplayText(confidence) else {
            throw PhysicalCompassWireError.invalidPayload
        }
        if let remainingDistanceM,
           (!remainingDistanceM.isFinite || remainingDistanceM < 0) {
            throw PhysicalCompassWireError.invalidNumber
        }
        if let bearingDegrees,
           (!bearingDegrees.isFinite || !(0..<360).contains(bearingDegrees)) {
            throw PhysicalCompassWireError.invalidNumber
        }
        guard menus.count <= 2,
              menus.allSatisfy(PhysicalCompassWire.isValidDisplayText) else {
            throw PhysicalCompassWireError.invalidPayload
        }
        guard Set(actions).count == actions.count else {
            throw PhysicalCompassWireError.invalidPayload
        }
        if let priceBand, !PhysicalCompassWire.isValidDisplayText(priceBand) {
            throw PhysicalCompassWireError.invalidPayload
        }
        guard timestampMs >= 0 else { throw PhysicalCompassWireError.invalidNumber }

        self.sequence = sequence
        self.phase = phase
        self.remainingDistanceM = remainingDistanceM
        self.bearingDegrees = bearingDegrees
        self.confidence = confidence
        self.menus = menus
        self.priceBand = priceBand
        self.actions = actions
        self.revealed = revealed
        self.timestampMs = timestampMs
    }
}

enum PhysicalCompassWireError: Error, Equatable {
    case invalidVersion
    case invalidType
    case invalidAction
    case invalidSequence
    case invalidNumber
    case invalidPayload
    case frameTooLarge
}

enum PhysicalCompassWire {
    static func encodeState(_ snapshot: PhysicalCompassSnapshot) throws -> Data {
        let envelope = StateEnvelope(snapshot: snapshot)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let payload = try encoder.encode(envelope)
        return try frame(payload)
    }

    static func encodeEvent(_ action: PhysicalCompassAction, sequence: Int) throws -> Data {
        guard sequence > 0 else { throw PhysicalCompassWireError.invalidSequence }
        let envelope = EventEnvelope(
            version: PhysicalCompassBLE.contractVersion,
            type: "event",
            action: action.rawValue,
            sequence: sequence
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return try frame(encoder.encode(envelope))
    }

    static func decodeEvent(_ framedData: Data) throws -> PhysicalCompassEvent {
        let payload = try unframe(framedData)
        let envelope: EventEnvelope
        do {
            envelope = try JSONDecoder().decode(EventEnvelope.self, from: payload)
        } catch {
            throw PhysicalCompassWireError.invalidPayload
        }
        guard envelope.version == PhysicalCompassBLE.contractVersion else {
            throw PhysicalCompassWireError.invalidVersion
        }
        guard envelope.type == "event" else { throw PhysicalCompassWireError.invalidType }
        guard envelope.sequence > 0 else { throw PhysicalCompassWireError.invalidSequence }
        guard let action = PhysicalCompassAction(rawValue: envelope.action) else {
            throw PhysicalCompassWireError.invalidAction
        }
        return .action(action, sequence: envelope.sequence)
    }

    static func appendChunk(_ chunk: Data, to buffer: inout Data) -> [Data] {
        guard !chunk.isEmpty, chunk.count <= maxReassemblyBytes else {
            buffer.removeAll(keepingCapacity: false)
            return []
        }
        buffer.append(chunk)
        guard buffer.count <= maxReassemblyBytes else {
            buffer.removeAll(keepingCapacity: false)
            return []
        }

        var frames: [Data] = []
        while let newline = buffer.firstIndex(of: 0x0A) {
            let frame = Data(buffer[..<newline]) + Data([0x0A])
            buffer.removeSubrange(...newline)
            if frame.count <= PhysicalCompassBLE.maxFrameBytes {
                frames.append(frame)
            }
        }
        return frames
    }

    static func isValidDisplayText(_ value: String) -> Bool {
        !value.isEmpty && value.utf8.count <= PhysicalCompassBLE.maxDisplayBytes
    }

    static func truncateDisplayText(_ value: String) -> String {
        var result = ""
        result.reserveCapacity(min(value.count, PhysicalCompassBLE.maxDisplayBytes))
        for character in value {
            let candidate = result + String(character)
            guard candidate.utf8.count <= PhysicalCompassBLE.maxDisplayBytes else { break }
            result = candidate
        }
        return result
    }

    private static let maxReassemblyBytes = PhysicalCompassBLE.maxFrameBytes * 2

    private static func frame(_ payload: Data) throws -> Data {
        guard payload.count + 1 <= PhysicalCompassBLE.maxFrameBytes else {
            throw PhysicalCompassWireError.frameTooLarge
        }
        return payload + Data([0x0A])
    }

    private static func unframe(_ framedData: Data) throws -> Data {
        guard framedData.count <= PhysicalCompassBLE.maxFrameBytes,
              framedData.last == 0x0A,
              framedData.dropLast().firstIndex(of: 0x0A) == nil else {
            throw PhysicalCompassWireError.invalidPayload
        }
        return framedData.dropLast()
    }
}

private struct StateEnvelope: Encodable {
    let version: Int
    let type: String
    let sequence: Int
    let phase: String
    let distance: Double?
    let bearing: Double?
    let confidence: String
    let menus: [String]
    let priceBand: String?
    let actions: [String]
    let revealed: Bool
    let timestampMs: Int64

    init(snapshot: PhysicalCompassSnapshot) {
        version = PhysicalCompassBLE.contractVersion
        type = "state"
        sequence = snapshot.sequence
        phase = snapshot.phase
        distance = snapshot.remainingDistanceM
        bearing = snapshot.bearingDegrees
        confidence = snapshot.confidence
        menus = snapshot.menus
        priceBand = snapshot.priceBand
        actions = snapshot.actions.map(\.rawValue)
        revealed = snapshot.revealed
        timestampMs = snapshot.timestampMs
    }

    enum CodingKeys: String, CodingKey {
        case version = "v"
        case type
        case sequence = "seq"
        case phase
        case distance = "d"
        case bearing = "b"
        case confidence = "c"
        case menus = "m"
        case priceBand = "p"
        case actions = "a"
        case revealed = "r"
        case timestampMs = "ts"
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(version, forKey: .version)
        try values.encode(type, forKey: .type)
        try values.encode(sequence, forKey: .sequence)
        try values.encode(phase, forKey: .phase)
        try values.encodeIfPresent(distance, forKey: .distance)
        try values.encodeIfPresent(bearing, forKey: .bearing)
        try values.encode(confidence, forKey: .confidence)
        try values.encode(menus, forKey: .menus)
        try values.encodeIfPresent(priceBand, forKey: .priceBand)
        try values.encode(actions, forKey: .actions)
        try values.encode(revealed, forKey: .revealed)
        try values.encode(timestampMs, forKey: .timestampMs)
    }
}

private struct EventEnvelope: Codable {
    let version: Int
    let type: String
    let action: String
    let sequence: Int

    init(version: Int, type: String, action: String, sequence: Int) {
        self.version = version
        self.type = type
        self.action = action
        self.sequence = sequence
    }

    enum CodingKeys: String, CodingKey {
        case version = "v"
        case type
        case action
        case sequence = "seq"
    }
}
