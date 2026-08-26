import Combine
import Foundation
@preconcurrency import CoreBluetooth

struct PhysicalCompassWriteChunk: Equatable, Sendable {
    let data: Data
    let completesFrame: Bool
}

struct PhysicalCompassFrameQueue: Sendable {
    private var inFlight: Data?
    private var offset = 0
    private var queuedLatest: Data?

    var isEmpty: Bool { inFlight == nil && queuedLatest == nil }

    mutating func enqueue(_ frame: Data) {
        guard !frame.isEmpty else { return }
        if inFlight == nil {
            inFlight = frame
            offset = 0
        } else {
            queuedLatest = frame
        }
    }

    mutating func nextChunk(maxLength: Int) -> PhysicalCompassWriteChunk? {
        guard maxLength > 0, let frame = inFlight else { return nil }
        let end = min(offset + maxLength, frame.count)
        let data = Data(frame[offset..<end])
        let completesFrame = end == frame.count
        if completesFrame {
            inFlight = queuedLatest
            queuedLatest = nil
            offset = 0
        } else {
            offset = end
        }
        return PhysicalCompassWriteChunk(data: data, completesFrame: completesFrame)
    }

    mutating func removeAll() {
        inFlight = nil
        queuedLatest = nil
        offset = 0
    }
}

struct PhysicalCompassConnectionEpoch: Sendable {
    private var value: UInt64 = 0

    mutating func begin() -> UInt64 {
        value &+= 1
        return value
    }

    mutating func invalidate() {
        value &+= 1
    }

    func accepts(_ candidate: UInt64) -> Bool {
        candidate == value
    }
}

@MainActor
private final class PhysicalCompassPeripheralDelegateProxy: NSObject, @preconcurrency CBPeripheralDelegate {
    weak var owner: PhysicalCompassController?
    let epoch: UInt64

    init(owner: PhysicalCompassController, epoch: UInt64) {
        self.owner = owner
        self.epoch = epoch
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        owner?.handleDidDiscoverServices(peripheral, error: error, epoch: epoch)
    }

    func peripheral(
        _ peripheral: CBPeripheral,
        didDiscoverCharacteristicsFor service: CBService,
        error: Error?
    ) {
        owner?.handleDidDiscoverCharacteristics(peripheral, service: service, error: error, epoch: epoch)
    }

    func peripheral(
        _ peripheral: CBPeripheral,
        didUpdateNotificationStateFor characteristic: CBCharacteristic,
        error: Error?
    ) {
        owner?.handleDidUpdateNotificationState(peripheral, characteristic: characteristic, error: error, epoch: epoch)
    }

    func peripheral(
        _ peripheral: CBPeripheral,
        didUpdateValueFor characteristic: CBCharacteristic,
        error: Error?
    ) {
        owner?.handleDidUpdateValue(peripheral, characteristic: characteristic, error: error, epoch: epoch)
    }

    func peripheralIsReady(toSendWriteWithoutResponse peripheral: CBPeripheral) {
        owner?.handleReadyToWrite(peripheral, epoch: epoch)
    }
}

@MainActor
final class PhysicalCompassController: NSObject, PhysicalCompassClient, @preconcurrency CBCentralManagerDelegate {
    var onConnectionState: ((PhysicalCompassConnectionState) -> Void)?
    var onEvent: ((PhysicalCompassEvent) -> Void)?

    private var central: CBCentralManager?
    private var peripheral: CBPeripheral?
    private var peripheralDelegate: PhysicalCompassPeripheralDelegateProxy?
    private var connectionEpoch = PhysicalCompassConnectionEpoch()
    private var stateCharacteristic: CBCharacteristic?
    private var eventCharacteristic: CBCharacteristic?
    private var eventBuffer = Data()
    private var frameQueue = PhysicalCompassFrameQueue()
    private var transportReady = false
    private var running = false

    override init() {
        super.init()
    }

    deinit {
        central?.stopScan()
    }

    func start() {
        guard !running else { return }
        running = true
        activateCentralIfNeeded()
        guard let central else { return }
        guard central.state == .poweredOn else {
            if central.state != .unknown { publish(.unavailable) }
            return
        }
        scan()
    }

    func stop() {
        running = false
        central?.stopScan()
        if let peripheral {
            central?.cancelPeripheralConnection(peripheral)
        }
        clearConnection()
        central = nil
        publish(.disconnected)
    }

    func send(_ snapshot: PhysicalCompassSnapshot) {
        guard running, transportReady, let peripheral, let stateCharacteristic else { return }
        guard let frame = try? PhysicalCompassWire.encodeState(snapshot) else { return }
        frameQueue.enqueue(frame)
        flushWrites(to: peripheral, characteristic: stateCharacteristic)
    }

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        guard running else { return }
        if central.state == .poweredOn {
            scan()
        } else {
            clearConnection()
            publish(.unavailable)
        }
    }

    func centralManager(
        _ central: CBCentralManager,
        didDiscover peripheral: CBPeripheral,
        advertisementData: [String: Any],
        rssi RSSI: NSNumber
    ) {
        guard running, self.peripheral == nil else { return }
        self.peripheral = peripheral
        let epoch = connectionEpoch.begin()
        let delegate = PhysicalCompassPeripheralDelegateProxy(owner: self, epoch: epoch)
        peripheralDelegate = delegate
        central.stopScan()
        publish(.connecting)
        peripheral.delegate = delegate
        central.connect(peripheral, options: nil)
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        guard running, self.peripheral === peripheral else { return }
        peripheral.discoverServices([Self.serviceUUID])
    }

    func centralManager(
        _ central: CBCentralManager,
        didFailToConnect peripheral: CBPeripheral,
        error: Error?
    ) {
        guard self.peripheral === peripheral, peripheral.state == .disconnected else { return }
        handleConnectionLoss()
    }

    func centralManager(
        _ central: CBCentralManager,
        didDisconnectPeripheral peripheral: CBPeripheral,
        error: Error?
    ) {
        guard self.peripheral === peripheral, peripheral.state == .disconnected else { return }
        handleConnectionLoss()
    }

    fileprivate func handleDidDiscoverServices(_ peripheral: CBPeripheral, error: Error?, epoch: UInt64) {
        guard isCurrent(peripheral, epoch: epoch),
              error == nil,
              let service = peripheral.services?.first(where: { $0.uuid == Self.serviceUUID }) else {
            if isCurrent(peripheral, epoch: epoch) { disconnectAndRetry(peripheral) }
            return
        }
        peripheral.discoverCharacteristics([Self.stateUUID, Self.eventUUID], for: service)
    }

    fileprivate func handleDidDiscoverCharacteristics(
        _ peripheral: CBPeripheral,
        service: CBService,
        error: Error?,
        epoch: UInt64
    ) {
        guard isCurrent(peripheral, epoch: epoch) else { return }
        guard error == nil else {
            disconnectAndRetry(peripheral)
            return
        }
        stateCharacteristic = service.characteristics?.first(where: { $0.uuid == Self.stateUUID })
        eventCharacteristic = service.characteristics?.first(where: { $0.uuid == Self.eventUUID })
        guard let stateCharacteristic, let eventCharacteristic,
              stateCharacteristic.properties.contains(.writeWithoutResponse),
              eventCharacteristic.properties.contains(.notify) else {
            disconnectAndRetry(peripheral)
            return
        }
        peripheral.setNotifyValue(true, for: eventCharacteristic)
    }

    fileprivate func handleDidUpdateNotificationState(
        _ peripheral: CBPeripheral,
        characteristic: CBCharacteristic,
        error: Error?,
        epoch: UInt64
    ) {
        guard isCurrent(peripheral, epoch: epoch) else { return }
        guard error == nil, characteristic.uuid == Self.eventUUID,
              characteristic.isNotifying,
              let stateCharacteristic else {
            disconnectAndRetry(peripheral)
            return
        }
        transportReady = true
        frameQueue.removeAll()
        publish(.stale)
        flushWrites(to: peripheral, characteristic: stateCharacteristic)
    }

    fileprivate func handleDidUpdateValue(
        _ peripheral: CBPeripheral,
        characteristic: CBCharacteristic,
        error: Error?,
        epoch: UInt64
    ) {
        guard isCurrent(peripheral, epoch: epoch), transportReady, error == nil,
              characteristic.uuid == Self.eventUUID,
              let value = characteristic.value else { return }
        for frame in PhysicalCompassWire.appendChunk(value, to: &eventBuffer) {
            guard let event = try? PhysicalCompassWire.decodeEvent(frame) else { continue }
            onEvent?(event)
        }
    }

    fileprivate func handleReadyToWrite(_ peripheral: CBPeripheral, epoch: UInt64) {
        guard isCurrent(peripheral, epoch: epoch), let stateCharacteristic else { return }
        flushWrites(to: peripheral, characteristic: stateCharacteristic)
    }

    private func scan() {
        guard running, let central, central.state == .poweredOn else { return }
        central.stopScan()
        central.scanForPeripherals(
            withServices: [Self.serviceUUID],
            options: [CBCentralManagerScanOptionAllowDuplicatesKey: false]
        )
        publish(.scanning)
    }

    private func flushWrites(to peripheral: CBPeripheral, characteristic: CBCharacteristic) {
        guard transportReady, characteristic.properties.contains(.writeWithoutResponse) else { return }
        let chunkSize = max(1, peripheral.maximumWriteValueLength(for: .withoutResponse))
        while peripheral.canSendWriteWithoutResponse,
              let chunk = frameQueue.nextChunk(maxLength: chunkSize) {
            peripheral.writeValue(chunk.data, for: characteristic, type: .withoutResponse)
            if chunk.completesFrame {
                publish(.connected)
            }
        }
    }

    private func disconnectAndRetry(_ peripheral: CBPeripheral) {
        central?.cancelPeripheralConnection(peripheral)
        handleConnectionLoss()
    }

    private func activateCentralIfNeeded() {
        guard central == nil else { return }
        central = CBCentralManager(delegate: self, queue: .main)
    }

    private func handleConnectionLoss() {
        clearConnection()
        publish(.disconnected)
        guard running else { return }
        Task { @MainActor [weak self] in
            await Task.yield()
            guard let self, self.running, self.peripheral == nil else { return }
            self.scan()
        }
    }

    private func clearConnection() {
        peripheral?.delegate = nil
        peripheralDelegate?.owner = nil
        peripheralDelegate = nil
        connectionEpoch.invalidate()
        peripheral = nil
        stateCharacteristic = nil
        eventCharacteristic = nil
        eventBuffer.removeAll(keepingCapacity: false)
        frameQueue.removeAll()
        transportReady = false
    }

    private func isCurrent(_ candidate: CBPeripheral, epoch: UInt64) -> Bool {
        running && peripheral === candidate && connectionEpoch.accepts(epoch)
    }

    private func publish(_ value: PhysicalCompassConnectionState) {
        onConnectionState?(value)
    }

    private static let serviceUUID = CBUUID(string: PhysicalCompassBLE.serviceUUID)
    private static let stateUUID = CBUUID(string: PhysicalCompassBLE.stateCharacteristicUUID)
    private static let eventUUID = CBUUID(string: PhysicalCompassBLE.eventCharacteristicUUID)
}
