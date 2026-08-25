import SwiftUI

struct ProfileSettingsView: View {
    let initialProfile: SomewhereProfile
    let onSave: ([String], [String]) -> Void
    let onCancel: (() -> Void)?

    @Environment(\.dismiss) private var dismiss
    @Environment(\.somewhereLayout) private var layout
    @State private var dietary: [String]
    @State private var allergies: [String]
    @State private var dietarySearch = ""
    @State private var allergySearch = ""

    init(
        profile: SomewhereProfile,
        onSave: @escaping ([String], [String]) -> Void,
        onCancel: (() -> Void)? = nil
    ) {
        self.initialProfile = profile
        self.onSave = onSave
        self.onCancel = onCancel
        _dietary = State(initialValue: profile.dietary)
        _allergies = State(initialValue: profile.allergies)
    }

    var body: some View {
        NavigationStack {
            Group {
                if layout.isExhibition {
                    adaptiveContent
                        .padding(20)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                } else {
                    ScrollView {
                        adaptiveContent
                            .padding(20)
                    }
                }
            }
            .background(SomewherePalette.canvas.opacity(0.35))
            .navigationTitle("프로필 조건")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("취소") {
                        onCancel?()
                        dismiss()
                    }
                    .accessibilityIdentifier("somewhere.profile-cancel")
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("저장") {
                        onSave(dietary, allergies)
                        dismiss()
                    }
                    .fontWeight(.bold)
                    .accessibilityIdentifier("somewhere.profile-save")
                }
            }
        }
        .tint(SomewherePalette.accent)
    }

    @ViewBuilder
    private var adaptiveContent: some View {
        if layout.isExhibition {
            VStack(alignment: .leading, spacing: 18) {
                intro
                HStack(alignment: .top, spacing: layout.columnSpacing) {
                    dietarySection
                        .frame(maxWidth: .infinity, alignment: .topLeading)
                    allergySection
                        .frame(maxWidth: .infinity, alignment: .topLeading)
                }
            }
        } else {
            VStack(alignment: .leading, spacing: 18) {
                intro
                dietarySection
                allergySection
            }
        }
    }

    private var dietarySection: some View {
        optionSection(
            title: "식이 조건",
            subtitle: "식이 조건은 하나를 기본으로, 필요한 기준은 추가로 선택해요.",
            search: $dietarySearch,
            options: SomewherePreferences.dietaryOptions,
            selection: $dietary,
            identifier: "dietary"
        )
    }

    private var allergySection: some View {
        optionSection(
            title: "알레르기",
            subtitle: "조리시설의 교차오염 가능성은 장소에서 다시 확인해 주세요.",
            search: $allergySearch,
            options: SomewherePreferences.allergyOptions,
            selection: $allergies,
            identifier: "allergies"
        )
    }

    private var intro: some View {
        SomewhereCard(padding: 16) {
            VStack(alignment: .leading, spacing: 8) {
                Text("나에게 맞는 조건을 기억해둘게요")
                    .font(.headline.weight(.bold))
                    .foregroundStyle(SomewherePalette.ink)
                Text("다음 여정의 추천 조건에 사용할 수 있어요. 선택하지 않으면 ‘없음’으로 시작해요.")
                    .font(.subheadline)
                    .foregroundStyle(SomewherePalette.mutedInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func optionSection(
        title: String,
        subtitle: String,
        search: Binding<String>,
        options: [SomewhereOption],
        selection: Binding<[String]>,
        identifier: String
    ) -> some View {
        let query = search.wrappedValue.trimmingCharacters(in: .whitespacesAndNewlines)
        let visible = query.isEmpty
            ? options
            : options.filter { $0.title.localizedCaseInsensitiveContains(query) || $0.detail.localizedCaseInsensitiveContains(query) }

        return VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.headline.weight(.bold))
                .foregroundStyle(SomewherePalette.ink)
            Text(subtitle)
                .font(.caption)
                .foregroundStyle(SomewherePalette.mutedInk)
            TextField("\(title) 검색", text: search)
                .textFieldStyle(.roundedBorder)
                .accessibilityIdentifier("somewhere.profile-search-\(identifier)")
            SomewhereCard(padding: 8) {
                if layout.isExhibition {
                    ScrollView(.vertical, showsIndicators: true) {
                        optionRows(visible: visible, selection: selection, identifier: identifier)
                    }
                    .frame(height: 236)
                    .accessibilityIdentifier("somewhere.profile-list-\(identifier)")
                } else {
                    ScrollView(.vertical, showsIndicators: true) {
                        optionRows(visible: visible, selection: selection, identifier: identifier)
                    }
                    // The prototype deliberately exposed four choices at a time;
                    // keep the picker compact without making the option set feel
                    // like an endless form.
                    .frame(height: 236)
                    .accessibilityIdentifier("somewhere.profile-list-\(identifier)")
                }
            }
            .accessibilityLabel("\(title) 선택 목록. 네 항목씩 보입니다.")
        }
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private func optionRows(
        visible: [SomewhereOption],
        selection: Binding<[String]>,
        identifier: String
    ) -> some View {
        VStack(spacing: 0) {
            profileToggle(
                title: "없음",
                detail: "이 조건을 적용하지 않아요.",
                isOn: Binding(
                    get: { selection.wrappedValue.isEmpty },
                    set: { isOn in if isOn { selection.wrappedValue = [] } }
                ),
                identifier: "somewhere.profile-\(identifier)-none"
            )
            ForEach(visible) { option in
                profileToggle(
                    title: option.title,
                    detail: option.detail,
                    isOn: Binding(
                        get: { selection.wrappedValue.contains(option.id) },
                        set: { isOn in
                            if isOn {
                                selection.wrappedValue = Array(Set(selection.wrappedValue + [option.id])).sorted()
                            } else {
                                selection.wrappedValue.removeAll { $0 == option.id }
                            }
                        }
                    ),
                    identifier: "somewhere.profile-\(identifier)-\(option.id)"
                )
            }
        }
    }

    private func profileToggle(
        title: String,
        detail: String,
        isOn: Binding<Bool>,
        identifier: String
    ) -> some View {
        Toggle(isOn: isOn) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.semibold))
                Text(detail).font(.caption).foregroundStyle(SomewherePalette.mutedInk)
            }
        }
        .tint(SomewherePalette.accent)
        .padding(.horizontal, 8)
        .padding(.vertical, layout.isExhibition ? 4 : 7)
        .accessibilityLabel("\(title). \(detail)")
        .accessibilityIdentifier(identifier)
    }
}
