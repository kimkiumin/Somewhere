import SwiftUI

struct RevealView: View {
    let projection: JourneyProjection
    @Environment(\.somewhereLayout) private var layout

    var body: some View {
        SomewhereCard(padding: layout.isExhibition ? 22 : 18) {
            if layout.isExhibition {
                exhibitionContent
            } else {
                compactContent
            }
        }
        .overlay {
            Color.clear
                .contentShape(Rectangle())
                .allowsHitTesting(false)
                .accessibilityElement()
                .accessibilityLabel("공개된 목적지 \(projection.reveal?.name ?? "")")
                .accessibilityIdentifier("somewhere.reveal-card")
        }
    }

    @ViewBuilder
    private var exhibitionContent: some View {
        VStack(alignment: .leading, spacing: 18) {
            discoveryHeader
            destinationPhoto(height: 620)
            HStack(alignment: .top, spacing: layout.columnSpacing) {
                identity
                    .frame(maxWidth: .infinity, alignment: .topLeading)
                rationale
                    .frame(maxWidth: .infinity, alignment: .topLeading)
            }
        }
    }

    private var compactContent: some View {
        VStack(alignment: .leading, spacing: 14) {
            discoveryHeader
            destinationPhoto(height: 184)
            identity
            rationale
        }
    }

    private var discoveryHeader: some View {
        HStack {
            SomewhereSignalPill(icon: "sparkles", title: "목적지 발견", tint: SomewherePalette.accent)
            Spacer()
            Image(systemName: projection.phase == .arrived ? "checkmark.seal.fill" : "eye.fill")
                .font(.title3)
                .foregroundStyle(SomewherePalette.success)
                .accessibilityHidden(true)
        }
    }

    private var identity: some View {
        VStack(alignment: .leading, spacing: layout.isExhibition ? 9 : 7) {
            Text(projection.phase == .arrived ? "도착했어요" : "목적지를 확인했어요")
                .font(layout.isExhibition ? .headline.weight(.semibold) : .subheadline.weight(.semibold))
                .foregroundStyle(SomewherePalette.mutedInk)
            Text(projection.reveal?.name ?? "목적지를 불러오는 중")
                .font(.system(size: layout.isExhibition ? 34 : 27, weight: .bold, design: .serif))
                .foregroundStyle(SomewherePalette.ink)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("somewhere.revealed-name")
            if let address = projection.reveal?.address {
                Label(address, systemImage: "mappin.and.ellipse")
                    .font(layout.isExhibition ? .body : .subheadline)
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
    }

    @ViewBuilder
    private func destinationPhoto(height: CGFloat) -> some View {
        GeometryReader { proxy in
            ZStack {
                photoContent
                    .frame(width: proxy.size.width, height: proxy.size.height)
                    .clipped()
                    .accessibilityHidden(true)
                Color.clear
                    .contentShape(Rectangle())
                    .accessibilityElement()
                    .accessibilityLabel(destinationPhotoAccessibilityLabel)
                    .accessibilityIdentifier("somewhere.revealed-photo")
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: height)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(SomewherePalette.border, lineWidth: 1)
        }
        .overlay(alignment: .bottomTrailing) {
            if usesGeneratedRepresentativePhoto {
                Text("대표 메뉴 이미지 · 생성 예시")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(SomewherePalette.ink)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .background(SomewherePalette.cardStrong, in: Capsule())
                    .padding(12)
                    .accessibilityHidden(true)
            }
        }
    }

    @ViewBuilder
    private var photoContent: some View {
        if let raw = projection.reveal?.photoURL, let url = URL(string: raw) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFill()
                default:
                    localPhotoOrPlaceholder
                }
            }
        } else {
            localPhotoOrPlaceholder
        }
    }

    @ViewBuilder
    private var localPhotoOrPlaceholder: some View {
        if isSeongsuGamjatang {
            Image("SeongsuGamjatangHero")
                .resizable()
                .scaledToFill()
        } else {
            ZStack {
                LinearGradient(
                    colors: [SomewherePalette.cardStrong, SomewherePalette.canvasDeep.opacity(0.34)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                Image(systemName: "fork.knife")
                    .font(.system(size: 40, weight: .medium))
                    .foregroundStyle(SomewherePalette.gold)
            }
        }
    }

    private var destinationPhotoAccessibilityLabel: String {
        if isSeongsuGamjatang {
            return "소문난성수감자탕 대표 메뉴 감자탕"
        }
        return "\(projection.reveal?.name ?? "목적지") 대표 이미지"
    }

    private var isSeongsuGamjatang: Bool {
        projection.reveal?.name == "소문난성수감자탕"
    }

    private var usesGeneratedRepresentativePhoto: Bool {
        isSeongsuGamjatang && (projection.reveal?.photoURL?.isEmpty ?? true)
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
