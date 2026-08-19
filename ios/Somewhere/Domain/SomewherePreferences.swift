import Foundation

enum SomewhereDisclosure: String, Codable, CaseIterable, Sendable {
    case minimal
    case privateMode = "private"

    var title: String {
        switch self {
        case .minimal: "최소한만 보기"
        case .privateMode: "더 숨기기"
        }
    }

    var detail: String {
        switch self {
        case .minimal: "거리·메뉴·가격대만 보여줘요."
        case .privateMode: "거리와 방향만 보여줘요."
        }
    }
}

struct SomewhereOption: Identifiable, Equatable, Sendable {
    let id: String
    let title: String
    let detail: String
}

struct SomewhereConditionIssue: Identifiable, Equatable, Sendable {
    let id: String
    let title: String
}

struct SomewhereProfile: Codable, Equatable, Sendable {
    var dietary: [String]
    var allergies: [String]

    static let empty = SomewhereProfile(dietary: [], allergies: [])
}

struct SomewherePreferences: Codable, Equatable, Sendable {
    var category: String
    var partySize: Int
    var maxWalkMinutes: Int
    var budgetAmount: Int?
    var dietary: [String]
    var allergies: [String]
    var disclosure: SomewhereDisclosure

    static let defaults = SomewherePreferences(
        category: "restaurant",
        partySize: 2,
        maxWalkMinutes: 25,
        budgetAmount: nil,
        dietary: [],
        allergies: [],
        disclosure: .minimal
    )

    var normalized: SomewherePreferences {
        var value = self
        value.category = ["restaurant", "cafe"].contains(value.category) ? value.category : "restaurant"
        value.partySize = min(5, max(1, value.partySize))
        value.maxWalkMinutes = min(60, max(5, value.maxWalkMinutes.roundedDown(toMultipleOf: 5)))
        if let budgetAmount = value.budgetAmount, budgetAmount > 0 {
            let finiteStops = Self.budgetStops.compactMap { $0 }
            value.budgetAmount = finiteStops.min {
                let leftDistance = abs($0 - budgetAmount)
                let rightDistance = abs($1 - budgetAmount)
                return leftDistance == rightDistance ? $0 < $1 : leftDistance < rightDistance
            }
        } else {
            value.budgetAmount = nil
        }
        value.dietary = Array(Set(value.dietary.map { $0 == "lacto-ovo" ? "lacto_ovo" : $0 })).sorted()
        value.allergies = Array(Set(value.allergies)).sorted()
        return value
    }

    /// The server's current V1 contract still receives a coarse budget band.
    /// The native control keeps the exact prototype stop locally and derives
    /// this compatibility value only at the transport boundary.
    var budgetBand: String {
        guard let budgetAmount else { return "high" }
        if budgetAmount <= 8_000 { return "low" }
        if budgetAmount <= 20_000 { return "medium" }
        return "high"
    }

    var budgetTitle: String {
        guard let budgetAmount else { return "상관없음" }
        return "1인 \(Self.formattedBudget(budgetAmount))"
    }

    static let budgetStops: [Int?] = [
        4_000, 6_000, 8_000, 10_000, 12_000, 14_000, 16_000, 18_000, 20_000,
        30_000, 40_000, 50_000, nil,
    ]

    static let dietaryOptions: [SomewhereOption] = [
        SomewhereOption(id: "vegan", title: "비건", detail: "동물성 식품을 먹지 않아요."),
        SomewhereOption(id: "lacto", title: "락토 베지테리언", detail: "유제품은 먹어요."),
        SomewhereOption(id: "ovo", title: "오보 베지테리언", detail: "달걀은 먹어요."),
        SomewhereOption(id: "lacto_ovo", title: "락토·오보", detail: "유제품과 달걀은 먹어요."),
        SomewhereOption(id: "pesco", title: "페스코", detail: "생선·해산물은 먹어요."),
        SomewhereOption(id: "pollo_pesco", title: "폴로·페스코", detail: "생선·해산물·가금류는 먹어요."),
        SomewhereOption(id: "flexitarian", title: "플렉시테리언", detail: "상황에 따라 육류를 먹어요."),
        SomewhereOption(id: "halal", title: "할랄", detail: "할랄 기준을 확인해요."),
        SomewhereOption(id: "kosher", title: "코셔", detail: "코셔 기준을 확인해요."),
        SomewhereOption(id: "low_sodium", title: "저염", detail: "나트륨이 적은 메뉴를 선호해요."),
        SomewhereOption(id: "vegetarian", title: "채식(세부 유형 미선택)", detail: "기존 설정이에요. 세부 유형을 확인해 주세요."),
    ]

    static let allergyOptions: [SomewhereOption] = [
        SomewhereOption(id: "egg", title: "난류", detail: "달걀·가금류 알"),
        SomewhereOption(id: "milk", title: "우유", detail: "우유·유제품"),
        SomewhereOption(id: "buckwheat", title: "메밀", detail: "메밀 원재료"),
        SomewhereOption(id: "peanut", title: "땅콩", detail: "땅콩 원재료"),
        SomewhereOption(id: "soy", title: "대두", detail: "콩·대두 원재료"),
        SomewhereOption(id: "wheat", title: "밀", detail: "밀·밀가루"),
        SomewhereOption(id: "mackerel", title: "고등어", detail: "고등어 원재료"),
        SomewhereOption(id: "crab", title: "게", detail: "게 원재료"),
        SomewhereOption(id: "shrimp", title: "새우", detail: "새우 원재료"),
        SomewhereOption(id: "pork", title: "돼지고기", detail: "돼지고기 원재료"),
        SomewhereOption(id: "peach", title: "복숭아", detail: "복숭아 원재료"),
        SomewhereOption(id: "tomato", title: "토마토", detail: "토마토 원재료"),
        SomewhereOption(id: "sulfites", title: "아황산류", detail: "이산화황 포함 여부"),
        SomewhereOption(id: "walnut", title: "호두", detail: "호두 원재료"),
        SomewhereOption(id: "chicken", title: "닭고기", detail: "닭고기 원재료"),
        SomewhereOption(id: "beef", title: "쇠고기", detail: "쇠고기 원재료"),
        SomewhereOption(id: "squid", title: "오징어", detail: "오징어 원재료"),
        SomewhereOption(id: "shellfish", title: "조개류", detail: "굴·전복·홍합 포함"),
        SomewhereOption(id: "pine_nut", title: "잣", detail: "잣 원재료"),
        SomewhereOption(id: "tree_nut", title: "기존 견과류 설정", detail: "호두·잣을 각각 확인해 주세요."),
    ]

    static func formattedBudget(_ amount: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.locale = Locale(identifier: "ko_KR")
        return "\(formatter.string(from: NSNumber(value: amount)) ?? String(amount))원"
    }
}

private extension Int {
    func roundedDown(toMultipleOf multiple: Int) -> Int {
        guard multiple > 0 else { return self }
        return (self / multiple) * multiple
    }
}

enum SomewherePreferencesPersistence {
    private static let preferencesKey = "somewhere.preferences.v1"
    private static let profileKey = "somewhere.profile.v1"
    private static let profileCompletedKey = "somewhere.profile.completed.v1"
    private static let onboardingKey = "somewhere.onboarding.completed.v1"

    static func loadPreferences(defaults: UserDefaults = .standard) -> SomewherePreferences {
        guard let data = defaults.data(forKey: preferencesKey),
              let value = try? JSONDecoder().decode(SomewherePreferences.self, from: data) else {
            return .defaults
        }
        return value.normalized
    }

    static func savePreferences(_ value: SomewherePreferences, defaults: UserDefaults = .standard) {
        guard let data = try? JSONEncoder().encode(value.normalized) else { return }
        defaults.set(data, forKey: preferencesKey)
    }

    static func loadProfile(defaults: UserDefaults = .standard) -> SomewhereProfile {
        guard let data = defaults.data(forKey: profileKey),
              let value = try? JSONDecoder().decode(SomewhereProfile.self, from: data) else {
            return .empty
        }
        return value
    }

    static func saveProfile(_ value: SomewhereProfile, defaults: UserDefaults = .standard) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        defaults.set(data, forKey: profileKey)
        defaults.set(true, forKey: profileCompletedKey)
    }

    static func hasCompletedProfile(defaults: UserDefaults = .standard) -> Bool {
        defaults.bool(forKey: profileCompletedKey)
    }

    static func hasCompletedOnboarding(defaults: UserDefaults = .standard) -> Bool {
        defaults.bool(forKey: onboardingKey)
    }

    static func markOnboardingCompleted(defaults: UserDefaults = .standard) {
        defaults.set(true, forKey: onboardingKey)
    }

    #if DEBUG
    static func resetJourneyPreferencesForTesting(defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: preferencesKey)
        defaults.removeObject(forKey: profileKey)
        defaults.removeObject(forKey: profileCompletedKey)
    }
    #endif
}
