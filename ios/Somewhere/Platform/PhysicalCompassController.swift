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

@MainActor
final class PhysicalCompassController: NSObject, PhysicalCompassClient, @preconcurrency CBCentralManagerDelegate, @preconcurrency CBPeripheralDelegate {
    var onConnectionState: ((PhysicalCompassConnectionState) -> Void)?
    var onEvent: ((PhysicalCompassEvent) -> Void)?

    private var central: CBCentralManager!
    private var peripheral: CBPeripheral?
    private var stateCharacteristic: CBCharacteristic?
    private var eventCharacteristic: CBCharacteristic?
    private var eventBuffer = Data()
    private var frameQueue = PhysicalCompassFrameQueue()
    private var transportReady = false
    private var running = false

    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: .main)
    }

    deinit {
        central?.stopScan()
    }

    func start() {
        running = true
        guard central.state == .poweredOn else {
            publish(.unavailable)
            return
        }
        scan()
    }

    func stop() {
        running = false
        central.stopScan()
        if let peripheral {
            central.cancelPeripheralConnection(peripheral)
        }
        clearConnection()
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
        guard running else { return }
        self.peripheral = peripheral
        central.stopScan()
        publish(.connecting)
        peripheral.delegate = self
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
        guard self.peripheral === peripheral else { return }
        clearConnection()
        if running { scan() } else { publish(.disconnected) }
    }

    func centralManager(
        _ central: CBCentralManager,
        didDisconnectPeripheral peripheral: CBPeripheral,
        error: Error?
    ) {
        guard self.peripheral === peripheral else { return }
        clearConnection()
        if running { scan() } else { publish(.disconnected) }
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard running, self.peripheral === peripheral,
              error == nil,
              let service = peripheral.services?.first(where: { $0.uuid == Self.serviceUUID }) else {
            if self.peripheral === peripheral { disconnectAndRetry(peripheral) }
            return
        }
        peripheral.discoverCharacteristics([Self.stateUUID, Self.eventUUID], for: service)
    }

    func peripheral(
        _ peripheral: CBPeripheral,
        didDiscoverCharacteristicsFor service: CBService,
        error: Error?
    ) {
        guard running, self.peripheral === peripheral else { return }
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

    func peripheral(
        _ peripheral: CBPeripheral,
        didUpdateNotificationStateFor characteristic: CBCharacteristic,
        error: Error?
    ) {
        guard running, self.peripheral === peripheral else { return }
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

    func peripheral(
        _ peripheral: CBPeripheral,
        didUpdateValueFor characteristic: CBCharacteristic,
        error: Error?
    ) {
        guard running, self.peripheral === peripheral,
              transportReady, error == nil,
              characteristic.uuid == Self.eventUUID,
              let value = characteristic.value else { return }
        for frame in PhysicalCompassWire.appendChunk(value, to: &eventBuffer) {
            guard let event = try? PhysicalCompassWire.decodeEvent(frame) else { continue }
            onEvent?(event)
        }
    }

    func peripheralIsReady(toSendWriteWithoutResponse peripheral: CBPeripheral) {
        guard running, self.peripheral === peripheral, let stateCharacteristic else { return }
        flushWrites(to: peripheral, characteristic: stateCharacteristic)
    }

    private func scan() {
        guard running, central.state == .poweredOn else { return }
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
        central.cancelPeripheralConnection(peripheral)
        clearConnection()
        if running { scan() }
    }

    private func clearConnection() {
        peripheral = nil
        stateCharacteristic = nil
        eventCharacteristic = nil
        eventBuffer.removeAll(keepingCapacity: false)
        frameQueue.removeAll()
        transportReady = false
    }

    private func publish(_ value: PhysicalCompassConnectionState) {
        onConnectionState?(value)
    }

    private static let serviceUUID = CBUUID(string: PhysicalCompassBLE.serviceUUID)
    private static let stateUUID = CBUUID(string: PhysicalCompassBLE.stateCharacteristicUUID)
    private static let eventUUID = CBUUID(string: PhysicalCompassBLE.eventCharacteristicUUID)
}
