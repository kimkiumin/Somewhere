import SwiftUI

struct PhysicalCompassSettingsView: View {
    @ObservedObject var store: JourneyStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack(alignment: .top, spacing: 14) {
                VStack(alignment: .leading, spacing: 5) {
                    Text("물리 나침반")
                        .font(RollCompassBrand.wordmarkFont(size: 31))
                        .foregroundStyle(SomewherePalette.ink)
                    Text("Waveshare ESP32-S3 보드와 안내를 주고받아요.")
                        .font(.subheadline)
                        .foregroundStyle(SomewherePalette.mutedInk)
                }
                Spacer()
                Button("완료") { dismiss() }
                    .font(.subheadline.weight(.bold))
                    .frame(minWidth: 52, minHeight: 44)
                    .accessibilityIdentifier("somewhere.physical-compass-done")
            }

            SomewhereCard(padding: 16) {
                VStack(alignment: .leading, spacing: 14) {
                    Toggle(
                        "이 기기를 나침반 호스트로 사용",
                        isOn: Binding(
                            get: { store.isPhysicalCompassHostEnabled },
                            set: { store.setPhysicalCompassHostEnabled($0) }
                        )
                    )
                    .font(.headline)
                    .tint(SomewherePalette.accent)
                    .accessibilityIdentifier("somewhere.physical-compass-host-toggle")

                    Divider()

                    HStack(spacing: 10) {
                        Circle()
                            .fill(statusColor)
                            .frame(width: 11, height: 11)
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(statusTitle)
                                .font(.subheadline.weight(.bold))
                                .accessibilityIdentifier("somewhere.physical-compass-status-title")
                            Text(statusDetail)
                                .font(.caption)
                                .foregroundStyle(SomewherePalette.mutedInk)
                        }
                    }
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("somewhere.physical-compass-status")
                }
            }

            Label {
                Text("주변 iPad 또는 iPhone 한 대에서만 연결을 켜세요.")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(SomewherePalette.ink)
            } icon: {
                Image(systemName: "iphone.and.arrow.forward")
                    .foregroundStyle(SomewherePalette.accent)
            }

            Text("전시 기기를 바꿀 때는 기존 기기에서 먼저 끈 뒤 새 기기에서 켜면 연결 충돌을 피할 수 있어요.")
                .font(.caption)
                .foregroundStyle(SomewherePalette.mutedInk)

            Spacer(minLength: 0)
        }
        .padding(24)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("somewhere.physical-compass-settings")
    }

    private var statusTitle: String {
        switch store.physicalCompassConnectionState {
        case .disabled: "꺼짐"
        case .unavailable: "Bluetooth 사용 불가"
        case .disconnected: "연결 끊김"
        case .scanning: "나침반 찾는 중"
        case .connecting: "연결 중"
        case .stale: "새 안내 동기화 중"
        case .connected: "연결됨"
        }
    }

    private var statusDetail: String {
        switch store.physicalCompassConnectionState {
        case .disabled: "필요할 때만 이 기기의 연결을 켜세요."
        case .unavailable: "Bluetooth 설정과 기기 지원 상태를 확인하세요."
        case .disconnected: "보드 전원과 거리를 확인하면 다시 검색해요."
        case .scanning: "Roll Compass 보드를 검색하고 있어요."
        case .connecting: "서비스와 버튼 채널을 확인하고 있어요."
        case .stale: "이전 안내는 버리고 현재 여정을 다시 보내고 있어요."
        case .connected: "현재 여정의 방향·거리·허용 버튼만 전송해요."
        }
    }

    private var statusColor: Color {
        switch store.physicalCompassConnectionState {
        case .connected: SomewherePalette.success
        case .scanning, .connecting, .stale: SomewherePalette.gold
        case .disabled, .unavailable, .disconnected: SomewherePalette.mutedInk
        }
    }
}
