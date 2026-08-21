import SwiftUI

struct RevealView: View {
    let projection: JourneyProjection

    var body: some View {
        SomewhereCard(padding: 18) {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    SomewhereSignalPill(icon: "sparkles", title: "목적지 발견", tint: SomewherePalette.accent)
                    Spacer()
                    Image(systemName: projection.phase == .arrived ? "checkmark.seal.fill" : "eye.fill")
                        .foregroundStyle(SomewherePalette.success)
                }
                destinationPhoto
                VStack(alignment: .leading, spacing: 7) {
                    Text(projection.phase == .arrived ? "도착했어요" : "목적지를 확인했어요")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(SomewherePalette.mutedInk)
                    Text(projection.reveal?.name ?? "목적지를 불러오는 중")
                        .font(.system(size: 27, weight: .bold, design: .serif))
                        .foregroundStyle(SomewherePalette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("somewhere.revealed-name")
                    if let address = projection.reveal?.address {
                        Label(address, systemImage: "mappin.and.ellipse")
                            .font(.subheadline)
                            .foregroundStyle(SomewherePalette.mutedInk)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("somewhere.revealed-address")
                    }
                    if let building = projection.reveal?.building, !building.isEmpty {
                        detailRow(icon: "building.2.fill", value: building)
                    }
                    if let floorUnit = projection.reveal?.floorUnit, !floorUnit.isEmpty {
                        detailRow(icon: "door.left.hand.open", value: floorUnit)
                    }
                }
                rationale
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("공개된 목적지 \(projection.reveal?.name ?? "")")
    }

    @ViewBuilder
    private var destinationPhoto: some View {
        if let raw = projection.reveal?.photoURL, let url = URL(string: raw) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image): image.resizable().scaledToFill()
                default: photoPlaceholder
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 144)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        } else {
            photoPlaceholder
        }
    }

    private var photoPlaceholder: some View {
        ZStack {
            SomewherePalette.cardStrong
            Image("RollCompassShell")
                .resizable()
                .interpolation(.high)
                .scaledToFit()
                .frame(width: 112, height: 112)
                .opacity(0.26)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 144)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .accessibilityHidden(true)
    }

    private var rationale: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("왜 이곳을 골랐나요?")
                .font(.caption.weight(.bold))
                .foregroundStyle(SomewherePalette.accent)
            Text(projection.reveal?.recommendationReason ?? fallbackReason)
                .font(.subheadline)
                .foregroundStyle(SomewherePalette.mutedInk)
                .fixedSize(horizontal: false, vertical: true)
            if let review = projection.reveal?.reviewSummary, !review.isEmpty {
                Divider().overlay(SomewherePalette.border)
                Label(review, systemImage: "quote.opening")
                    .font(.caption)
                    .foregroundStyle(SomewherePalette.mutedInk)
            }
        }
        .padding(13)
        .background(SomewherePalette.canvas.opacity(0.45), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var fallbackReason: String {
        guard let disclosure = projection.disclosure else { return "현재 조건 안에서 확인된 한 곳이에요." }
        let category = disclosure.representativeCategories.joined(separator: " · ")
        return "도보 약 \(Int(disclosure.routeDurationMinutes))분, \(category) 조건을 확인해 한 곳으로 안내했어요."
    }

    private func detailRow(icon: String, value: String) -> some View {
        Label(value, systemImage: icon)
            .font(.caption.weight(.semibold))
            .foregroundStyle(SomewherePalette.mutedInk)
    }
}
